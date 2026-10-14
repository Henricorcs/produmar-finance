"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAnimalWeight } from "./actions";

// ─────────────────────────────────────────────────────────────────────────────
// PESO PELA FOTO
// ─────────────────────────────────────────────────────────────────────────────
// O celular fotografa o animal e a IA (Claude) devolve um peso aproximado, com
// faixa e confiança. Foto não tem escala nem profundidade: é ESTIMATIVA. Por
// isso nada aqui grava em animal_weights nem mexe em animals.weight — o peso
// atual calcula a dose em ml dos protocolos e não pode vir de um chute.
//
// A estimativa fica em animal_pesos_foto (migration 109). Quando a foto é
// tirada no dia da balança, o peso real vai na mesma linha e a tela mostra
// quanto a foto erra no rebanho de verdade.
// ─────────────────────────────────────────────────────────────────────────────

const MODELO = "claude-opus-5-5";

/** A API aceita imagem de até 5 MB; a foto chega encolhida bem antes disso. */
const MAX_FOTO = 5 * 1024 * 1024;

const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type TipoAceito = (typeof TIPOS_ACEITOS)[number];

const ESPECIE: Record<string, string> = {
  bovino: "bovino",
  equino: "equino (cavalo/égua)",
  caprino: "caprino (bode/cabra)",
  ovino: "ovino (carneiro/ovelha)",
  suino: "suíno (porco)",
};

const SISTEMA = `Você estima o peso vivo de animais de fazenda (bovinos, equinos, caprinos, ovinos, suínos) a partir de uma foto tirada com o celular no curral ou no pasto, numa fazenda no Brasil. Quem usa é o dono da fazenda e o vaqueiro, que querem uma ideia do peso sem levar o animal à balança.

Como avaliar:
- Julgue pelo tamanho da estrutura (comprimento do corpo, altura, profundidade do tórax, largura da garupa) e pela condição corporal (costelas aparentes, cobertura de carne e gordura).
- Use o que houver na foto para dar escala: cerca, mourão, porteira, tronco, cocho, pessoa, outros animais.
- Use os dados do cadastro (tipo, raça, sexo, idade). A última pesagem é só referência: o animal pode ter ganhado ou perdido peso desde então — quem decide é a foto.
- Foto de lado, com o animal inteiro e parado, é a melhor. De frente, de trás, muito longe, cortada ou escura diminui a confiança.

Seja honesto com a incerteza: a faixa (mínimo e máximo) deve cobrir o peso real na grande maioria das vezes. Confiança "alta" só com foto de lado, nítida, animal inteiro e algo que dê escala.

Se a foto não serve (não aparece animal, aparecem vários e não dá para saber qual é, ou está escura/cortada demais), marque foto_serve como false e explique em motivo o que fazer para a próxima foto. Nesse caso, preencha os pesos com 0.

A observação vai aparecer no celular: escreva em português do Brasil, simples, no máximo duas frases curtas (ex.: "Garrote nelore de lado, em bom estado. A cerca ajudou a dar a escala.").`;

const Estimativa = z.object({
  foto_serve: z.boolean(),
  motivo: z.string(),
  peso_kg: z.number(),
  peso_min_kg: z.number(),
  peso_max_kg: z.number(),
  confianca: z.enum(["baixa", "media", "alta"]),
  observacao: z.string(),
});

export interface EstimativaPesoFoto {
  peso_kg: number;
  min_kg: number;
  max_kg: number;
  confianca: "baixa" | "media" | "alta";
  observacao: string;
  /** Última pesagem de balança na hora da foto (0 = nunca pesado). */
  ultimo_peso_kg: number;
  modelo: string;
}

function idadeTexto(meses: number | null): string {
  if (meses == null) return "não informada";
  if (meses < 1) return "menos de 1 mês";
  if (meses < 24) return `${meses} meses`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  return resto ? `${anos} anos e ${resto} meses` : `${anos} anos`;
}

function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(`${iso}T12:00:00`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Arredonda o kg para o que faz sentido mostrar (a IA não acerta casa decimal). */
function kg(v: number): number {
  return Math.max(0, Math.round(Number(v) || 0));
}

/**
 * Manda a foto para a IA e devolve a estimativa. NÃO grava nada — quem decide
 * o que fazer com o número (comparar com a balança ou guardar só a estimativa)
 * é quem está com o celular na mão.
 */
export async function estimarPesoPelaFoto(
  formData: FormData
): Promise<{ estimativa: EstimativaPesoFoto } | { recusada: string } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "Falta configurar a chave da IA (ANTHROPIC_API_KEY) no servidor" };
  }

  const animalId = String(formData.get("animal_id") ?? "");
  const foto = formData.get("foto");
  if (!animalId) return { error: "Selecione o animal" };
  if (!(foto instanceof File) || foto.size === 0) return { error: "Tire a foto do animal" };
  if (foto.size > MAX_FOTO) return { error: "Foto grande demais — tire de novo" };
  if (!TIPOS_ACEITOS.includes(foto.type as TipoAceito)) {
    return { error: "Formato de foto não aceito — use a câmera do celular" };
  }

  const [{ data: animal }, { data: ultima }] = await Promise.all([
    supabase
      .from("v_animals")
      .select("tag, species, sex, category, breed_name, age_months")
      .eq("id", animalId)
      .maybeSingle(),
    supabase
      .from("animal_weights")
      .select("weight, weighed_at")
      .eq("animal_id", animalId)
      .order("weighed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!animal) return { error: "Animal não encontrado" };

  const sexo = animal.sex === "femea" ? "fêmea" : "macho";
  const categoria =
    animal.category === "bezerro" ? "filhote (bezerro/potro/cabrito...)" : "adulto";
  const ultimoPeso = Number(ultima?.weight ?? 0);
  const linhas = [
    `Tipo: ${ESPECIE[animal.species as string] ?? animal.species ?? "bovino"}`,
    `Sexo: ${sexo} · ${categoria}`,
    `Raça: ${animal.breed_name ?? "não informada"}`,
    `Idade: ${idadeTexto(animal.age_months as number | null)}`,
    ultimoPeso > 0 && ultima?.weighed_at
      ? `Última pesagem na balança: ${ultimoPeso} kg, há ${diasDesde(ultima.weighed_at as string)} dias`
      : "Última pesagem na balança: nunca foi pesado",
  ];

  const dados = Buffer.from(await foto.arrayBuffer()).toString("base64");
  const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });

  try {
    const resposta = await client.beta.messages.parse({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Estimativa) },
      system: SISTEMA,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: foto.type as TipoAceito, data: dados },
            },
            {
              type: "text",
              text: `Cadastro do animal:\n${linhas.join("\n")}\n\nEstime o peso vivo dele pela foto.`,
            },
          ],
        },
      ],
    });

    if (resposta.stop_reason === "refusal") {
      return { recusada: "A IA não quis avaliar esta foto. Tire outra, só do animal." };
    }
    const r = resposta.parsed_output;
    if (!r) return { error: "A IA não devolveu o peso — tente de novo" };
    if (!r.foto_serve || r.peso_kg <= 0) {
      return { recusada: r.motivo || "Não deu para avaliar o animal nesta foto." };
    }

    const peso = kg(r.peso_kg);
    return {
      estimativa: {
        peso_kg: peso,
        min_kg: Math.min(kg(r.peso_min_kg) || peso, peso),
        max_kg: Math.max(kg(r.peso_max_kg) || peso, peso),
        confianca: r.confianca,
        observacao: r.observacao.trim(),
        ultimo_peso_kg: ultimoPeso,
        modelo: resposta.model,
      },
    };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return { error: "A chave da IA (ANTHROPIC_API_KEY) não foi aceita" };
    }
    if (e instanceof Anthropic.RateLimitError) {
      return { error: "A IA está ocupada agora — tente de novo em instantes" };
    }
    if (e instanceof Anthropic.APIConnectionError) {
      return { error: "Sem conexão com a IA — confira a internet e tente de novo" };
    }
    if (e instanceof Anthropic.APIError) {
      return { error: `Erro da IA (${e.status ?? "?"}): ${e.message}` };
    }
    return { error: e instanceof Error ? e.message : "Erro ao estimar o peso" };
  }
}

/** A tabela vem da migration 109 — sem ela o erro do Postgres não diz nada. */
function tabelaError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.message.includes("animal_pesos_foto"))
    return "Rode a migration 109 no Supabase para guardar o peso pela foto";
  return error.message;
}

async function gravarEstimativa(
  supabase: ReturnType<typeof createClient>,
  input: {
    animal_id: string;
    taken_at: string;
    estimativa: EstimativaPesoFoto;
    real_kg: number | null;
  }
): Promise<{ error?: string }> {
  const e = input.estimativa;
  const { error } = await supabase.from("animal_pesos_foto").insert({
    animal_id: input.animal_id,
    taken_at: input.taken_at,
    estimado_kg: kg(e.peso_kg),
    min_kg: kg(e.min_kg) || null,
    max_kg: kg(e.max_kg) || null,
    confianca: e.confianca,
    observacao: e.observacao || null,
    modelo: e.modelo || null,
    ultimo_peso_kg: e.ultimo_peso_kg > 0 ? e.ultimo_peso_kg : null,
    real_kg: input.real_kg && input.real_kg > 0 ? input.real_kg : null,
  });
  return error ? { error: tabelaError(error) } : {};
}

/** Guarda só a estimativa (sem balança). Não vira pesagem, não mexe na dose. */
export async function guardarEstimativaFoto(input: {
  animal_id: string;
  taken_at: string;
  estimativa: EstimativaPesoFoto;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!input.animal_id) return { error: "Selecione o animal" };

  const r = await gravarEstimativa(supabase, { ...input, real_kg: null });
  if (r.error) return { error: r.error };

  revalidatePath("/animais");
  return { ok: true };
}

/**
 * Pesou na balança logo depois da foto: registra a pesagem de verdade (a que
 * vale para a dose) e guarda a foto ao lado do peso real, para medir o erro.
 */
export async function registrarPesagemComFoto(input: {
  animal_id: string;
  weight: number;
  weighed_at: string;
  estimativa: EstimativaPesoFoto;
}) {
  const r = await recordAnimalWeight({
    animal_id: input.animal_id,
    weight: input.weight,
    weighed_at: input.weighed_at,
  });
  if (r && "error" in r) return { error: r.error ?? "Erro ao registrar o peso" };

  const supabase = createClient();
  const g = await gravarEstimativa(supabase, {
    animal_id: input.animal_id,
    taken_at: input.weighed_at,
    estimativa: input.estimativa,
    real_kg: input.weight,
  });
  if (g.error) return { ok: true, warning: `Peso registrado, mas a comparação com a foto não: ${g.error}` };

  revalidatePath("/animais");
  return { ok: true };
}
