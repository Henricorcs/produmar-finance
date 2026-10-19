"use client";

import { useEffect, useState, useTransition } from "react";
import { Landmark, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  PerguntaDoPasso,
  RevisaoDosPassos,
  usePassoAPasso,
  type PassoDef,
} from "@/components/ui/passo-a-passo";
import { actionError } from "@/lib/action-result";
import {
  cn,
  formatBRLInput,
  localDateISO,
  parseMoney,
  primeiraMaiuscula,
  valorPorExtenso,
} from "@/lib/utils";
import {
  apagarContratoCompraVenda,
  salvarContratoCompraVenda,
} from "@/app/(app)/alugueis/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./alugueis-shared";
import type { PropertySaleContract } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE COMPRA E VENDA — preenchido UM CAMPO POR VEZ
// ─────────────────────────────────────────────────────────────────────────────
// No celular, o formulário inteiro numa tela só era uma parede de campos e o
// endereço num campo corrido sempre saía faltando pedaço. Agora a tela faz uma
// pergunta de cada vez: responde, toca em "seguinte" no teclado e aparece a
// próxima. O endereço é perguntado em partes (rua, número, bairro...). No fim,
// a REVISÃO mostra tudo junto e qualquer item se corrige com um toque.
// ─────────────────────────────────────────────────────────────────────────────

const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "UNIÃO ESTÁVEL", "DIVORCIADO", "VIÚVO"];

const REGIMES = [
  "COMUNHÃO PARCIAL DE BENS",
  "COMUNHÃO UNIVERSAL DE BENS",
  "SEPARAÇÃO TOTAL DE BENS",
  "PARTICIPAÇÃO FINAL NOS AQUESTOS",
];

const TIPOS = ["CASA", "TERRENO", "APARTAMENTO", "PONTO COMERCIAL", "GALPÃO", "SALA", "LOTE"];

/** Os campos da tela — os mesmos nomes das colunas do banco. */
type Campo =
  | "seller_name"
  | "seller_document"
  | "seller_rg"
  | "seller_nationality"
  | "seller_profession"
  | "seller_marital_status"
  | "seller_property_regime"
  | "seller_street"
  | "seller_number"
  | "seller_complement"
  | "seller_district"
  | "seller_city"
  | "seller_zip"
  | "seller_phone"
  | "seller_email"
  | "spouse_name"
  | "spouse_document"
  | "spouse_rg"
  | "spouse_nationality"
  | "spouse_profession"
  | "property_kind"
  | "property_street"
  | "property_number"
  | "property_complement"
  | "property_district"
  | "property_city"
  | "property_zip"
  | "property_area"
  | "property_registration"
  | "property_registry_office"
  | "property_iptu_code"
  | "property_front"
  | "property_back"
  | "property_right"
  | "property_left"
  | "property_front_with"
  | "property_back_with"
  | "property_right_with"
  | "property_left_with"
  | "property_improvements"
  | "property_description"
  | "price"
  | "payment_terms"
  | "possession_date"
  | "deed_days"
  | "penalty_percent"
  | "signed_at"
  | "forum_city"
  | "notes";

type Dados = Record<Campo, string>;

type Passo = PassoDef<Campo>;

/** Estados civis em que o cônjuge assina junto. */
/** Nenhuma parte do endereço preenchida — vale o endereço corrido de antes da 112. */
function semPartes(d: Dados, quem: "seller" | "property"): boolean {
  return (["street", "number", "complement", "district", "city", "zip"] as const).every(
    (k) => !d[`${quem}_${k}` as Campo].trim()
  );
}

function casado(d: Dados): boolean {
  return d.seller_marital_status === "CASADO" || d.seller_marital_status === "UNIÃO ESTÁVEL";
}

const PASSOS: Passo[] = [
  // ── O vendedor ──────────────────────────────────────────────────────────
  { campo: "seller_name", secao: "O vendedor", pergunta: "Nome completo do vendedor", tipo: "texto", maiusculo: true },
  { campo: "seller_document", secao: "O vendedor", pergunta: "CPF ou CNPJ do vendedor", tipo: "documento", placeholder: "000.000.000-00" },
  { campo: "seller_rg", secao: "O vendedor", pergunta: "RG do vendedor", tipo: "texto", placeholder: "número e órgão (ex: 123456 SSP/MA)", maiusculo: true },
  { campo: "seller_nationality", secao: "O vendedor", pergunta: "Nacionalidade", tipo: "texto", maiusculo: true },
  { campo: "seller_profession", secao: "O vendedor", pergunta: "Profissão do vendedor", tipo: "texto", placeholder: "ex: lavrador, comerciante", maiusculo: true },
  { campo: "seller_marital_status", secao: "O vendedor", pergunta: "Estado civil", tipo: "opcoes", opcoes: ESTADOS_CIVIS },
  {
    campo: "seller_property_regime",
    secao: "O vendedor",
    pergunta: "Regime de bens do casamento",
    tipo: "opcoes",
    opcoes: REGIMES,
    dica: "Está na certidão de casamento.",
    quando: casado,
  },

  // ── Onde o vendedor mora ────────────────────────────────────────────────
  { campo: "seller_street", secao: "Onde o vendedor mora", pergunta: "Rua ou avenida", tipo: "texto", placeholder: "ex: RUA DAS FLORES", maiusculo: true },
  { campo: "seller_number", secao: "Onde o vendedor mora", pergunta: "Número", tipo: "texto", placeholder: "ex: 120 ou S/N", maiusculo: true },
  { campo: "seller_complement", secao: "Onde o vendedor mora", pergunta: "Complemento", tipo: "texto", placeholder: "opcional — casa B, apto 3...", maiusculo: true },
  { campo: "seller_district", secao: "Onde o vendedor mora", pergunta: "Bairro", tipo: "texto", maiusculo: true },
  { campo: "seller_city", secao: "Onde o vendedor mora", pergunta: "Cidade / UF", tipo: "texto", placeholder: "ex: SÃO MATEUS DO MARANHÃO/MA", maiusculo: true },
  { campo: "seller_zip", secao: "Onde o vendedor mora", pergunta: "CEP", tipo: "cep", placeholder: "00000-000" },
  { campo: "seller_phone", secao: "Onde o vendedor mora", pergunta: "Telefone do vendedor", tipo: "telefone", placeholder: "opcional" },
  { campo: "seller_email", secao: "Onde o vendedor mora", pergunta: "E-mail do vendedor", tipo: "email", placeholder: "opcional" },

  // ── O cônjuge ───────────────────────────────────────────────────────────
  {
    campo: "spouse_name",
    secao: "O cônjuge do vendedor",
    pergunta: "Nome completo do cônjuge",
    tipo: "texto",
    maiusculo: true,
    dica: "Vendedor casado: o cônjuge assina junto. Sem essa assinatura a venda pode ser anulada (só a separação total de bens dispensa).",
    quando: casado,
  },
  { campo: "spouse_document", secao: "O cônjuge do vendedor", pergunta: "CPF do cônjuge", tipo: "documento", placeholder: "000.000.000-00", quando: casado },
  { campo: "spouse_rg", secao: "O cônjuge do vendedor", pergunta: "RG do cônjuge", tipo: "texto", placeholder: "número e órgão", maiusculo: true, quando: casado },
  { campo: "spouse_nationality", secao: "O cônjuge do vendedor", pergunta: "Nacionalidade do cônjuge", tipo: "texto", maiusculo: true, quando: casado },
  { campo: "spouse_profession", secao: "O cônjuge do vendedor", pergunta: "Profissão do cônjuge", tipo: "texto", maiusculo: true, quando: casado },

  // ── O imóvel ────────────────────────────────────────────────────────────
  { campo: "property_kind", secao: "O imóvel", pergunta: "Que tipo de imóvel é?", tipo: "opcoes", opcoes: TIPOS },
  { campo: "property_street", secao: "Endereço do imóvel", pergunta: "Rua ou avenida do imóvel", tipo: "texto", placeholder: "ex: AV. ANTÔNIA PORTELA", maiusculo: true },
  { campo: "property_number", secao: "Endereço do imóvel", pergunta: "Número", tipo: "texto", placeholder: "ex: 40 ou S/N", maiusculo: true },
  { campo: "property_complement", secao: "Endereço do imóvel", pergunta: "Complemento", tipo: "texto", placeholder: "opcional — quadra, lote, sala...", maiusculo: true },
  { campo: "property_district", secao: "Endereço do imóvel", pergunta: "Bairro", tipo: "texto", maiusculo: true },
  { campo: "property_city", secao: "Endereço do imóvel", pergunta: "Cidade / UF", tipo: "texto", placeholder: "ex: SÃO MATEUS DO MARANHÃO/MA", maiusculo: true },
  { campo: "property_zip", secao: "Endereço do imóvel", pergunta: "CEP", tipo: "cep", placeholder: "00000-000" },
  { campo: "property_area", secao: "O imóvel", pergunta: "Área do imóvel", tipo: "texto", placeholder: "ex: 360,00 m²" },
  { campo: "property_registration", secao: "O imóvel", pergunta: "Número da matrícula", tipo: "texto", maiusculo: true, dica: "Está na certidão do cartório de imóveis." },
  { campo: "property_registry_office", secao: "O imóvel", pergunta: "Cartório onde está registrado", tipo: "texto", placeholder: "Cartório de Registro de Imóveis de São Mateus do Maranhão/MA" },
  { campo: "property_iptu_code", secao: "O imóvel", pergunta: "Inscrição do IPTU", tipo: "texto", maiusculo: true, dica: "Está no carnê do IPTU." },

  // ── Medidas do terreno (em metros, como estão na matrícula) ─────────────
  { campo: "property_front", secao: "Medidas do terreno", pergunta: "Frente (metros)", tipo: "medida", placeholder: "ex: 12,00", dica: "Como está na matrícula." },
  { campo: "property_back", secao: "Medidas do terreno", pergunta: "Fundos (metros)", tipo: "medida", placeholder: "ex: 12,00" },
  { campo: "property_right", secao: "Medidas do terreno", pergunta: "Lado direito (metros)", tipo: "medida", placeholder: "ex: 30,00", dica: "Direito e esquerdo de quem está na rua olhando para o imóvel." },
  { campo: "property_left", secao: "Medidas do terreno", pergunta: "Lado esquerdo (metros)", tipo: "medida", placeholder: "ex: 30,00" },

  // ── Com quem o terreno faz divisa ───────────────────────────────────────
  { campo: "property_front_with", secao: "Divisas do terreno", pergunta: "Na frente faz divisa com", tipo: "texto", placeholder: "ex: RUA DO ESPORTE", maiusculo: true, dica: "Na frente, quase sempre é a própria rua." },
  { campo: "property_back_with", secao: "Divisas do terreno", pergunta: "Nos fundos faz divisa com", tipo: "texto", placeholder: "ex: TERRENO DE JOÃO DA SILVA", maiusculo: true },
  { campo: "property_right_with", secao: "Divisas do terreno", pergunta: "Do lado direito faz divisa com", tipo: "texto", placeholder: "ex: CASA DE MARIA SOUSA", maiusculo: true },
  { campo: "property_left_with", secao: "Divisas do terreno", pergunta: "Do lado esquerdo faz divisa com", tipo: "texto", placeholder: "ex: RUA SÃO JOSÉ", maiusculo: true },

  // ── O que tem construído ────────────────────────────────────────────────
  {
    campo: "property_improvements",
    secao: "Benfeitorias",
    pergunta: "O que tem construído no terreno?",
    tipo: "longo",
    placeholder: "ex: casa de alvenaria, coberta de telha, com 3 quartos, sala, cozinha, banheiro e área de serviço",
    dica: "Terreno vazio? Escreva \"terreno sem benfeitorias\" ou toque em Pular.",
  },
  {
    campo: "property_description",
    secao: "Benfeitorias",
    pergunta: "Mais alguma característica do imóvel?",
    tipo: "longo",
    placeholder: "opcional — poço, cerca, muro, árvores frutíferas...",
  },

  // ── Preço ───────────────────────────────────────────────────────────────
  { campo: "price", secao: "Preço e pagamento", pergunta: "Preço do imóvel (R$)", tipo: "dinheiro", placeholder: "0,00" },
  {
    campo: "payment_terms",
    secao: "Preço e pagamento",
    pergunta: "Como vai ser pago?",
    tipo: "longo",
    placeholder: "ex: à vista, por transferência bancária para a conta do vendedor, na assinatura deste contrato",
    dica: "À vista ou parcelado, banco e conta do vendedor, datas das parcelas...",
  },

  // ── Prazos e assinatura ─────────────────────────────────────────────────
  { campo: "possession_date", secao: "Prazos e assinatura", pergunta: "Quando o imóvel será entregue?", tipo: "data", dica: "A data da entrega das chaves (a posse)." },
  { campo: "deed_days", secao: "Prazos e assinatura", pergunta: "Prazo para passar a escritura (em dias)", tipo: "numero", maxDigitos: 3, dica: "Contado depois de pago o preço.", mostrar: (v) => `${v} dias` },
  { campo: "penalty_percent", secao: "Prazos e assinatura", pergunta: "Multa para quem descumprir (% do preço)", tipo: "percentual" },
  { campo: "signed_at", secao: "Prazos e assinatura", pergunta: "Data da assinatura", tipo: "data" },
  { campo: "forum_city", secao: "Prazos e assinatura", pergunta: "Cidade do foro e da assinatura", tipo: "texto" },
  { campo: "notes", secao: "Prazos e assinatura", pergunta: "Alguma cláusula a mais?", tipo: "longo", placeholder: "opcional", dica: "Entra como uma cláusula a mais, antes do foro." },
];


function dadosIniciais(c: PropertySaleContract | null): Dados {
  const s = (v?: string | number | null) => (v === null || v === undefined ? "" : String(v));
  return {
    seller_name: s(c?.seller_name),
    seller_document: s(c?.seller_document),
    seller_rg: s(c?.seller_rg),
    seller_nationality: c ? s(c.seller_nationality) : "BRASILEIRA",
    seller_profession: s(c?.seller_profession),
    seller_marital_status: s(c?.seller_marital_status),
    seller_property_regime: s(c?.seller_property_regime),
    // contrato salvo antes da 112: o endereço corrido continua valendo (ver salvar)
    seller_street: s(c?.seller_street),
    seller_number: s(c?.seller_number),
    seller_complement: s(c?.seller_complement),
    seller_district: s(c?.seller_district),
    seller_city: s(c?.seller_city),
    seller_zip: s(c?.seller_zip),
    seller_phone: s(c?.seller_phone),
    seller_email: s(c?.seller_email),
    spouse_name: s(c?.spouse_name),
    spouse_document: s(c?.spouse_document),
    spouse_rg: s(c?.spouse_rg),
    spouse_nationality: c ? s(c.spouse_nationality) : "BRASILEIRA",
    spouse_profession: s(c?.spouse_profession),
    property_kind: s(c?.property_kind),
    property_street: s(c?.property_street),
    property_number: s(c?.property_number),
    property_complement: s(c?.property_complement),
    property_district: s(c?.property_district),
    property_city: s(c?.property_city),
    property_zip: s(c?.property_zip),
    property_area: s(c?.property_area),
    property_registration: s(c?.property_registration),
    property_registry_office: s(c?.property_registry_office),
    property_iptu_code: s(c?.property_iptu_code),
    property_front: s(c?.property_front),
    property_back: s(c?.property_back),
    property_right: s(c?.property_right),
    property_left: s(c?.property_left),
    property_front_with: s(c?.property_front_with),
    property_back_with: s(c?.property_back_with),
    property_right_with: s(c?.property_right_with),
    property_left_with: s(c?.property_left_with),
    property_improvements: s(c?.property_improvements),
    property_description: s(c?.property_description),
    price: c && Number(c.price) > 0 ? formatBRLInput(Number(c.price)) : "",
    payment_terms: s(c?.payment_terms),
    possession_date: s(c?.possession_date),
    deed_days: c ? s(c.deed_days) : "30",
    penalty_percent: c ? s(c.penalty_percent).replace(".", ",") : "10",
    signed_at: c ? s(c.signed_at) : localDateISO(),
    forum_city: c ? s(c.forum_city) || "São Mateus do Maranhão/MA" : "São Mateus do Maranhão/MA",
    notes: s(c?.notes),
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Contrato em edição — null começa um novo. */
  contrato: PropertySaleContract | null;
}

/**
 * CONTRATO DE COMPRA E VENDA DE IMÓVEL — um campo por vez.
 *
 * A PRODUMAR é sempre a compradora (os dados dela saem do contrato de aluguel).
 * Contrato novo começa na primeira pergunta; contrato salvo abre direto na
 * revisão. Nada é obrigatório: o que ficar em branco sai no papel como linha
 * para completar à caneta.
 */
export function CompraVendaDialog({ open, onClose, contrato }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<Dados>(() => dadosIniciais(null));

  useEffect(() => {
    if (!open) return;
    setDados(dadosIniciais(contrato));
    setErro(null);
  }, [open, contrato]);

  const fluxo = usePassoAPasso(PASSOS, dados, open, !!contrato);
  const { passo, passos, idx } = fluxo;

  function mudar(campo: Campo, valor: string) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  function salvar() {
    setErro(null);
    const ehCasado = casado(dados);
    startTransition(async () => {
      const r = await salvarContratoCompraVenda(contrato?.id ?? null, {
        ...dados,
        // endereço corrido antigo vale até alguém preencher as partes
        seller_address: semPartes(dados, "seller") ? contrato?.seller_address ?? null : null,
        property_address: semPartes(dados, "property") ? contrato?.property_address ?? null : null,
        seller_property_regime: ehCasado ? dados.seller_property_regime : "",
        spouse_name: ehCasado ? dados.spouse_name : "",
        spouse_document: ehCasado ? dados.spouse_document : "",
        spouse_rg: ehCasado ? dados.spouse_rg : "",
        spouse_nationality: ehCasado ? dados.spouse_nationality : "",
        spouse_profession: ehCasado ? dados.spouse_profession : "",
        price: parseMoney(dados.price),
        deed_days: parseInt(dados.deed_days, 10) || null,
        penalty_percent: parseMoney(dados.penalty_percent) || null,
      });
      const falha = actionError(r);
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  function apagar() {
    if (!contrato) return;
    if (
      !confirm(
        `Apagar o contrato de compra e venda${contrato.seller_name ? ` com ${contrato.seller_name}` : ""}? Isso não tem volta.`
      )
    )
      return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await apagarContratoCompraVenda(contrato.id));
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <Landmark className="w-4 h-4" />
            </span>
            {fluxo.naRevisao ? "Revisar o contrato" : "Compra e venda"}
          </DialogTitle>
        </DialogHeader>

        {passo ? (
          <PerguntaDoPasso
            passo={passo}
            idx={idx}
            total={passos.length}
            valor={dados[passo.campo]}
            onMudar={(v) => mudar(passo.campo, v)}
            onAvancar={fluxo.avancar}
            onVoltar={fluxo.voltar}
            onRevisao={fluxo.irParaRevisao}
            daRevisao={fluxo.daRevisao}
            extra={
              passo.campo === "price" && parseMoney(dados.price) > 0 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {primeiraMaiuscula(valorPorExtenso(parseMoney(dados.price)))} — é assim que sai
                  no contrato.
                </p>
              ) : null
            }
            rodape="Nada é obrigatório: o que ficar em branco sai no papel como linha para completar à caneta. A compradora é sempre a PRODUMAR, com os dados do contrato de aluguel."
          />
        ) : (
          <div className="space-y-4">
            <RevisaoDosPassos
              passos={passos}
              dados={dados}
              onEditar={fluxo.editar}
              topo={
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
                    COMPRADORA
                  </p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    PRODUMAR SERVIÇOS LTDA
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Os dados dela saem do contrato de aluguel (Modelo do contrato).
                  </p>
                </div>
              }
            />

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
              </p>
            )}

            <DialogFooter className={STICKY_FOOTER}>
              {contrato && (
                <button
                  type="button"
                  onClick={apagar}
                  disabled={isPending}
                  aria-label="Apagar contrato"
                  className="h-11 px-4 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 sm:h-10"
                >
                  <Trash2 className="w-4 h-4 inline" />
                </button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={fluxo.voltar}
                disabled={isPending}
                className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
              >
                Voltar
              </Button>
              <Button
                type="button"
                onClick={salvar}
                disabled={isPending}
                className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
              >
                {isPending ? "Salvando..." : "Salvar contrato"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
