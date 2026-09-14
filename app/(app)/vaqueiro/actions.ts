"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AnimalSex, AnimalSpecies, ProtocoloItemAplicado } from "@/lib/types";
import { removerArquivos, uploadArquivo } from "@/lib/storage";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Os bichos que o vaqueiro pode marcar, e como se chama o filhote de cada um —
 * é esse nome que entra nos recados desta tela. Peixe e ave ficam fora: a
 * criação deles é por lote, no tanque e no galpão, e não tem parto para anotar
 * aqui.
 */
const FILHOTE_DE = {
  bovino: "bezerro",
  equino: "potro",
  caprino: "cabrito",
  ovino: "cordeiro",
  suino: "leitão",
} as const;

type TipoQuePare = keyof typeof FILHOTE_DE;

/** O que vier de fora da lista vale como bovino — é o que todo envio feito
 *  antes da migration 091 sempre foi. */
function normTipo(v: string): TipoQuePare {
  return Object.keys(FILHOTE_DE).includes(v) ? (v as TipoQuePare) : "bovino";
}

/** As colunas novas da tabela, na ordem em que podem faltar no banco. */
const COLUNAS_NOVAS = ["client_id", "species", "protocolo_aplicado"] as const;

/**
 * Lê o que o celular mandou como aplicado. Chega como texto (FormData só leva
 * texto), e o que vier torto é ignorado item a item — o nascimento importa
 * mais que um item mal escrito.
 */
function lerProtocoloAplicado(bruto: string): ProtocoloItemAplicado[] {
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista
      .map((i) => ({
        medicine: String(i?.medicine ?? "").trim().toUpperCase(),
        dose: String(i?.dose ?? "").trim().toUpperCase() || null,
      }))
      .filter((i) => i.medicine)
      .slice(0, 30);
  } catch {
    return [];
  }
}

/**
 * Traduz o erro do Postgres em um recado que diz O QUE FALTA rodar. Cada caso
 * é reconhecido pelo código do erro, nunca pelo nome da tabela: quase toda
 * falha aqui cita "animal_birth_requests" na mensagem, então checar por nome
 * fazia o calf_tag ainda NOT NULL (053 pendente) ser anunciado como "rode a
 * 048" — mandando rodar de novo o que já tinha rodado.
 */
function birthRequestError(error: { code?: string; message: string }): string {
  // tabela não existe: a 048 não rodou — ou a PARTE 2 dela caiu junto com a
  // PARTE 1, que é o que acontece quando o arquivo inteiro é rodado de uma vez
  if (error.code === "42P01")
    return "Rode a migration 048 no Supabase — a PARTE 1 e a PARTE 2 em execuções separadas";

  // a tabela existe, mas o PostgREST ainda não a enxerga (cache velho)
  if (error.code === "PGRST205" || error.message.includes("schema cache"))
    return "Tabela ainda não visível: recarregue o schema no Supabase (NOTIFY pgrst, 'reload schema')";

  // calf_tag ainda NOT NULL: a 053 é que solta o número da cria
  if (error.code === "23502" && error.message.includes("calf_tag"))
    return "Rode a migration 053 no Supabase para enviar sem o número da cria";

  // RLS barrou o INSERT: perfil não é vaqueiro/admin, ou as policies da 048 não subiram
  if (error.code === "42501")
    return "Sem permissão para enviar: confirme que seu perfil é vaqueiro e que a PARTE 2 da 048 rodou";

  // qualquer outra coisa vai crua, com o código — chutar migration cega o diagnóstico
  return error.code ? `${error.message} (${error.code})` : error.message;
}

/**
 * Sobe a foto da cria e grava a SOLICITAÇÃO em animal_birth_requests
 * (migrations 048, 053 e 091). O vaqueiro marca QUE BICHO nasceu e digita o
 * número da MÃE — não escolhe da lista, e não numera a cria: o número é do
 * patrão, que confere e lança de verdade na aba "Nascimentos" de Animais. Nada
 * entra no rebanho aqui.
 */
export async function requestCalfBirth(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const motherTag = String(formData.get("mother_tag") ?? "").trim().toUpperCase();
  const birthDate = String(formData.get("birth_date") ?? "");
  const calfSex = String(formData.get("calf_sex") ?? "") as AnimalSex;
  const photo = formData.get("photo");

  // Que bicho nasceu. Serve para a fila do patrão chamar o cordeiro de cordeiro
  // e o potro de potro — o tipo que ENTRA no cadastro é o da mãe que ele
  // escolher na conferência (createBirth puxa tipo e raça de quem pariu).
  const species = normTipo(String(formData.get("species") ?? ""));
  const filhote = FILHOTE_DE[species];

  // O carimbo que o CELULAR deu a este nascimento antes de tentar enviar. É ele
  // que impede o mesmo bezerro de entrar duas vezes quando a rede cai depois de
  // o banco já ter gravado (migration 081). Carimbo torto é ignorado, não
  // recusado: o nascimento é mais importante que a proteção contra repetido.
  const carimbo = String(formData.get("client_id") ?? "").trim();
  const clientId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(carimbo)
    ? carimbo
    : null;

  // O protocolo do nascimento que ele marcou (migration 095). A exigência de
  // marcar tudo mora na TELA, e não aqui: um nascimento guardado offline de
  // manhã não pode ser recusado à tarde só porque o dono mudou a lista nesse
  // meio-tempo. Aqui só se grava o que ele disse que aplicou.
  const protocoloAplicado = lerProtocoloAplicado(String(formData.get("protocolo") ?? ""));

  if (!motherTag) return { error: "Informe o número da mãe" };
  if (!birthDate) return { error: "Informe a data do nascimento" };
  if (calfSex !== "macho" && calfSex !== "femea")
    return { error: `Informe o sexo do ${filhote}` };
  if (!(photo instanceof File) || photo.size === 0)
    return { error: `Coloque uma foto do ${filhote}` };
  if (photo.size > MAX_FILE_SIZE) return { error: "A foto deve ter no máximo 10 MB" };

  const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "foto.jpg";
  const photoPath = `animals/vaqueiro/${randomUUID()}_${safeName}`;

  const { error: upErr } = await uploadArquivo(photoPath, photo);
  if (upErr) return { error: upErr.message };

  const solicitacao: {
    mother_tag: string;
    calf_tag: null;
    calf_sex: AnimalSex;
    birth_date: string;
    photo_path: string;
    created_by: string;
    client_id?: string;
    species?: AnimalSpecies;
    protocolo_aplicado?: ProtocoloItemAplicado[];
  } = {
    mother_tag: motherTag,
    // o número do bezerro nasce na conferência do patrão (migration 053)
    calf_tag: null,
    calf_sex: calfSex,
    birth_date: birthDate,
    photo_path: photoPath,
    created_by: user.id,
    species,
  };
  if (clientId) solicitacao.client_id = clientId;
  if (protocoloAplicado.length > 0) solicitacao.protocolo_aplicado = protocoloAplicado;

  let { error } = await supabase.from("animal_birth_requests").insert(solicitacao);

  // Banco ainda sem alguma coluna nova (a 081 ou a 091 não rodaram): tira só a
  // que ele não conhece — o erro diz o nome dela — e manda de novo. Perde o
  // carimbo contra repetido, ou o nome do bicho, e isso é bem melhor que o
  // vaqueiro travado no curral porque a publicação chegou antes da migration.
  while (error && (error.code === "42703" || error.code === "PGRST204")) {
    const faltando = COLUNAS_NOVAS.find((c) => c in solicitacao && error!.message.includes(c));
    if (!faltando) break;
    delete solicitacao[faltando];
    ({ error } = await supabase.from("animal_birth_requests").insert(solicitacao));
  }

  // Este carimbo já está gravado: é o MESMO envio batendo na porta de novo,
  // porque a resposta da primeira vez se perdeu na volta. Não é erro — está
  // feito, e o celular pode tirar da fila. Só a foto que acabou de subir vira
  // lixo, já que a boa está lá desde a primeira vez.
  if (clientId && error?.code === "23505") {
    await removerArquivos([photoPath]);
    revalidatePath("/vaqueiro");
    revalidatePath("/animais");
    return { ok: true };
  }

  if (error) {
    await removerArquivos([photoPath]);
    return { error: birthRequestError(error) };
  }

  revalidatePath("/vaqueiro");
  revalidatePath("/animais");
  return { ok: true };
}
