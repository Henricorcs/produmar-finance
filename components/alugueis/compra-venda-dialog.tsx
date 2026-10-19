"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Building2, CheckCircle2, Landmark, Pencil, Plus, Printer, Trash2, User } from "lucide-react";
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
  ORGAOS_RG,
  juntarRg,
  separarRg,
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
import { CompradorDialog } from "./comprador-dialog";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import { gerarContratoPdf } from "@/lib/contrato-pdf";
import {
  MARCA_ASSINATURAS,
  RE_ROTULO_COMPRA_VENDA,
  assinaturasDaCompraEVenda,
  contratoEmBranco,
  nomeDoPdfDaCompraEVenda,
  paragrafosDaCompraEVenda,
} from "@/lib/compra-venda-contrato";
import type { PropertyBuyer, PropertySaleContract } from "@/lib/types";

/** O valor da pergunta "Quem compra?" quando é a PRODUMAR (no banco, buyer_id vazio). */
const COMPRADOR_PRODUMAR = "PRODUMAR";

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
  | "buyer_id"
  | "seller_name"
  | "seller_gender"
  | "seller_document"
  | "seller_rg"
  /** Só na tela: o órgão do RG é perguntado à parte e gravado junto do número. */
  | "seller_rg_orgao"
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
  | "spouse_gender"
  | "spouse_document"
  | "spouse_rg"
  | "spouse_rg_orgao"
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

/** "12,5" → 12.5; vazio ou inválido → 0. */
function numero(s: string): number {
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/**
 * A ÁREA PELAS MEDIDAS: a média da frente e dos fundos vezes a média dos dois
 * lados. No terreno retangular é a conta exata; no torto, é a aproximação que
 * se usa na prática — e o campo continua corrigível quando a matrícula disser
 * outro número. Sem pelo menos uma medida de cada direção, não há conta.
 */
const MEDIDAS: Campo[] = ["property_front", "property_back", "property_right", "property_left"];
function areaPelasMedidas(d: Dados): string {
  const media = (a: string, b: string) => {
    const v = [numero(a), numero(b)].filter((x) => x > 0);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
  };
  const largura = media(d.property_front, d.property_back);
  const comprimento = media(d.property_right, d.property_left);
  if (!largura || !comprimento) return "";
  return (largura * comprimento).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function casado(d: Dados): boolean {
  return d.seller_marital_status === "CASADO" || d.seller_marital_status === "UNIÃO ESTÁVEL";
}

/**
 * O cônjuge entra no contrato: vendedor casado E nome do cônjuge preenchido.
 * Pulou o nome, as outras perguntas dele somem — e ele não sai no papel.
 */
function comConjuge(d: Dados): boolean {
  return casado(d) && !!d.spouse_name.trim();
}

const PASSOS: Passo[] = [
  // ── O vendedor ──────────────────────────────────────────────────────────
  { campo: "seller_name", secao: "O vendedor", pergunta: "Nome completo do vendedor", tipo: "texto", maiusculo: true },
  {
    campo: "seller_gender",
    secao: "O vendedor",
    pergunta: "O vendedor é homem ou mulher?",
    tipo: "opcoes",
    opcoes: [
      { valor: "m", label: "Homem" },
      { valor: "f", label: "Mulher" },
    ],
    dica: "É o que decide, no contrato, entre \"portador\" e \"portadora\", \"VENDEDOR\" e \"VENDEDORA\".",
  },
  { campo: "seller_document", secao: "O vendedor", pergunta: "CPF ou CNPJ do vendedor", tipo: "documento", placeholder: "000.000.000-00" },
  { campo: "seller_rg", secao: "O vendedor", pergunta: "Número do RG do vendedor", tipo: "texto", teclado: "numerico", teclasExtras: ["-", "X"], placeholder: "ex: 123456789" },
  { campo: "seller_rg_orgao", secao: "O vendedor", pergunta: "Órgão expedidor do RG", tipo: "texto", maiusculo: true, atalhos: ORGAOS_RG, placeholder: "ex: SSP/MA" },
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
  { campo: "seller_number", secao: "Onde o vendedor mora", pergunta: "Número", tipo: "texto", teclado: "numerico", atalhos: ["S/N"], placeholder: "ex: 120", maiusculo: true },
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
  {
    campo: "spouse_gender",
    secao: "O cônjuge do vendedor",
    pergunta: "O cônjuge é homem ou mulher?",
    tipo: "opcoes",
    opcoes: [
      { valor: "m", label: "Homem" },
      { valor: "f", label: "Mulher" },
    ],
    quando: comConjuge,
  },
  { campo: "spouse_document", secao: "O cônjuge do vendedor", pergunta: "CPF do cônjuge", tipo: "documento", placeholder: "000.000.000-00", quando: comConjuge },
  { campo: "spouse_rg", secao: "O cônjuge do vendedor", pergunta: "Número do RG do cônjuge", tipo: "texto", teclado: "numerico", teclasExtras: ["-", "X"], placeholder: "ex: 123456789", quando: comConjuge },
  { campo: "spouse_rg_orgao", secao: "O cônjuge do vendedor", pergunta: "Órgão expedidor do RG do cônjuge", tipo: "texto", maiusculo: true, atalhos: ORGAOS_RG, placeholder: "ex: SSP/MA", quando: comConjuge },
  { campo: "spouse_nationality", secao: "O cônjuge do vendedor", pergunta: "Nacionalidade do cônjuge", tipo: "texto", maiusculo: true, quando: comConjuge },
  { campo: "spouse_profession", secao: "O cônjuge do vendedor", pergunta: "Profissão do cônjuge", tipo: "texto", maiusculo: true, quando: comConjuge },

  // ── O imóvel ────────────────────────────────────────────────────────────
  { campo: "property_kind", secao: "O imóvel", pergunta: "Que tipo de imóvel é?", tipo: "opcoes", opcoes: TIPOS },
  { campo: "property_street", secao: "Endereço do imóvel", pergunta: "Rua ou avenida do imóvel", tipo: "texto", placeholder: "ex: AV. ANTÔNIA PORTELA", maiusculo: true },
  { campo: "property_number", secao: "Endereço do imóvel", pergunta: "Número", tipo: "texto", teclado: "numerico", atalhos: ["S/N"], placeholder: "ex: 40", maiusculo: true },
  { campo: "property_complement", secao: "Endereço do imóvel", pergunta: "Complemento", tipo: "texto", placeholder: "opcional — quadra, lote, sala...", maiusculo: true },
  { campo: "property_district", secao: "Endereço do imóvel", pergunta: "Bairro", tipo: "texto", maiusculo: true },
  { campo: "property_city", secao: "Endereço do imóvel", pergunta: "Cidade / UF", tipo: "texto", placeholder: "ex: SÃO MATEUS DO MARANHÃO/MA", maiusculo: true },
  { campo: "property_zip", secao: "Endereço do imóvel", pergunta: "CEP", tipo: "cep", placeholder: "00000-000" },
  { campo: "property_registration", secao: "O imóvel", pergunta: "Número da matrícula", tipo: "texto", teclado: "numerico", maiusculo: true, dica: "Está na certidão do cartório de imóveis." },
  { campo: "property_registry_office", secao: "O imóvel", pergunta: "Cartório onde está registrado", tipo: "texto", placeholder: "Cartório de Registro de Imóveis de São Mateus do Maranhão/MA" },
  { campo: "property_iptu_code", secao: "O imóvel", pergunta: "Inscrição do IPTU", tipo: "texto", teclado: "numerico", maiusculo: true, dica: "Está no carnê do IPTU." },

  // ── Medidas do terreno (em metros, como estão na matrícula) ─────────────
  { campo: "property_front", secao: "Medidas do terreno", pergunta: "Frente (metros)", tipo: "medida", placeholder: "ex: 12,00", dica: "Como está na matrícula." },
  { campo: "property_back", secao: "Medidas do terreno", pergunta: "Fundos (metros)", tipo: "medida", placeholder: "ex: 12,00" },
  { campo: "property_right", secao: "Medidas do terreno", pergunta: "Lado direito (metros)", tipo: "medida", placeholder: "ex: 30,00", dica: "Direito e esquerdo de quem está na rua olhando para o imóvel." },
  { campo: "property_left", secao: "Medidas do terreno", pergunta: "Lado esquerdo (metros)", tipo: "medida", placeholder: "ex: 30,00" },
  {
    campo: "property_area",
    secao: "Medidas do terreno",
    pergunta: "Área do imóvel (m²)",
    tipo: "area",
    placeholder: "ex: 360,00",
    dica: "Calculada sozinha pelas medidas: a média da frente e dos fundos vezes a média dos lados. Se a matrícula disser outra área, corrija aqui.",
  },

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
    buyer_id: c?.buyer_id || COMPRADOR_PRODUMAR,
    seller_name: s(c?.seller_name),
    seller_gender: s(c?.seller_gender),
    seller_document: s(c?.seller_document),
    seller_rg: separarRg(c?.seller_rg).numero,
    seller_rg_orgao: separarRg(c?.seller_rg).orgao,
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
    spouse_gender: s(c?.spouse_gender),
    spouse_document: s(c?.spouse_document),
    spouse_rg: separarRg(c?.spouse_rg).numero,
    spouse_rg_orgao: separarRg(c?.spouse_rg).orgao,
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
  /** Compradores cadastrados (migration 115). */
  compradores?: PropertyBuyer[];
  /** O modelo do contrato de aluguel — dele sai a qualificação da PRODUMAR (para o PDF). */
  modeloAluguel?: string | null;
}

/**
 * CONTRATO DE COMPRA E VENDA DE IMÓVEL — um campo por vez.
 *
 * Quem compra é a primeira pergunta: a PRODUMAR (padrão), um comprador já
 * cadastrado ou um novo (empresa ou pessoa física). Contrato novo começa na
 * primeira pergunta; contrato salvo abre direto na revisão. Nada é
 * obrigatório: o que ficar em branco não sai no contrato. Salvo, a tela mostra
 * o botão de compartilhar o PDF.
 */
export function CompraVendaDialog({
  open,
  onClose,
  contrato,
  compradores = [],
  modeloAluguel = null,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<Dados>(() => dadosIniciais(null));
  /** A área foi digitada na mão? Aí as medidas não mexem mais nela. */
  const [areaNaMao, setAreaNaMao] = useState(false);
  /** Compradores da tela + os cadastrados agora (antes de a página recarregar). */
  const [lista, setLista] = useState<PropertyBuyer[]>(compradores);
  const [compradorAberto, setCompradorAberto] = useState<{ b: PropertyBuyer | null } | null>(null);
  /** Contrato salvo: a tela vira "pronto", com o PDF para compartilhar. */
  const [salvo, setSalvo] = useState<PropertySaleContract | null>(null);

  useEffect(() => {
    setLista((atual) => {
      const porId = new Map(atual.map((b) => [b.id, b]));
      for (const b of compradores) porId.set(b.id, b);
      return [...porId.values()].sort((a, b) => a.name.localeCompare(b.name));
    });
  }, [compradores]);

  useEffect(() => {
    if (!open) return;
    const d = dadosIniciais(contrato);
    setDados(d);
    // contrato salvo com área diferente da conta: veio da matrícula, fica
    setAreaNaMao(!!d.property_area.trim() && d.property_area.trim() !== areaPelasMedidas(d));
    setErro(null);
    setSalvo(null);
  }, [open, contrato]);

  const compradorEscolhido =
    dados.buyer_id && dados.buyer_id !== COMPRADOR_PRODUMAR
      ? lista.find((b) => b.id === dados.buyer_id) ?? null
      : null;

  /** A primeira pergunta: quem compra. Depende da lista, então nasce aqui dentro. */
  const todosOsPassos = useMemo<Passo[]>(
    () => [
      {
        campo: "buyer_id",
        secao: "Quem compra",
        pergunta: "Quem está comprando o imóvel?",
        tipo: "especial",
        mostrar: (v) =>
          v === COMPRADOR_PRODUMAR
            ? "PRODUMAR SERVIÇOS LTDA"
            : lista.find((b) => b.id === v)?.name ?? "Comprador não encontrado",
        especial: (valor, mudarValor, avancar) => (
          <div className="space-y-2">
            {[
              {
                id: COMPRADOR_PRODUMAR,
                nome: "PRODUMAR SERVIÇOS LTDA",
                tipo: "Empresa · padrão",
                b: null as PropertyBuyer | null,
              },
              ...lista.map((b) => ({
                id: b.id,
                nome: b.name,
                tipo: b.kind === "pj" ? "Empresa" : "Pessoa física",
                b,
              })),
            ].map((o) => (
              <div
                key={o.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                  valor === o.id
                    ? "border-produmar-600 bg-produmar-50 dark:bg-produmar-900/20"
                    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    mudarValor(o.id);
                    setTimeout(avancar, 150);
                  }}
                  className="flex flex-1 min-w-0 items-center gap-2 text-left"
                >
                  {o.b?.kind === "pf" ? (
                    <User className="w-4 h-4 flex-shrink-0 text-slate-400" />
                  ) : (
                    <Building2 className="w-4 h-4 flex-shrink-0 text-slate-400" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {o.nome}
                    </span>
                    <span className="block text-[11px] text-slate-400">{o.tipo}</span>
                  </span>
                </button>
                {o.b && (
                  <button
                    type="button"
                    onClick={() => setCompradorAberto({ b: o.b })}
                    aria-label={`Editar ${o.nome}`}
                    className="p-2 text-slate-400 hover:text-produmar-600"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setCompradorAberto({ b: null })}
              className="w-full flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-dashed border-produmar-300 text-sm font-semibold text-produmar-700 dark:border-slate-600 dark:text-produmar-300"
            >
              <Plus className="w-4 h-4" />
              Cadastrar novo comprador
            </button>
          </div>
        ),
      },
      ...PASSOS,
    ],
    [lista]
  );

  const fluxo = usePassoAPasso(todosOsPassos, dados, open, !!contrato);
  const { passo, passos, idx } = fluxo;

  function mudar(campo: Campo, valor: string) {
    if (campo === "property_area") setAreaNaMao(!!valor.trim());
    setDados((d) => {
      const novo = { ...d, [campo]: valor };
      // mexeu numa medida: a área acompanha, enquanto ninguém a digitou
      if (MEDIDAS.includes(campo) && !areaNaMao) novo.property_area = areaPelasMedidas(novo);
      return novo;
    });
  }

  function salvar() {
    setErro(null);
    const ehCasado = casado(dados);
    // sem o nome do cônjuge, nada dele é guardado (a nacionalidade já vem
    // preenchida e, sozinha, faria o cônjuge aparecer no papel)
    const conjuge = comConjuge(dados);
    startTransition(async () => {
      const r = await salvarContratoCompraVenda(contrato?.id ?? null, {
        ...dados,
        buyer_id: dados.buyer_id === COMPRADOR_PRODUMAR ? null : dados.buyer_id || null,
        // endereço corrido antigo vale até alguém preencher as partes
        seller_address: semPartes(dados, "seller") ? contrato?.seller_address ?? null : null,
        property_address: semPartes(dados, "property") ? contrato?.property_address ?? null : null,
        seller_property_regime: ehCasado ? dados.seller_property_regime : "",
        spouse_name: conjuge ? dados.spouse_name : "",
        spouse_gender: conjuge ? dados.spouse_gender : "",
        spouse_document: conjuge ? dados.spouse_document : "",
        // o RG volta a ser um campo só: "123456 SSP/MA"
        seller_rg: juntarRg(dados.seller_rg, dados.seller_rg_orgao),
        spouse_rg: conjuge ? juntarRg(dados.spouse_rg, dados.spouse_rg_orgao) : "",
        spouse_nationality: conjuge ? dados.spouse_nationality : "",
        spouse_profession: conjuge ? dados.spouse_profession : "",
        price: parseMoney(dados.price),
        deed_days: parseInt(dados.deed_days, 10) || null,
        penalty_percent: parseMoney(dados.penalty_percent) || null,
      });
      const falha = actionError(r);
      if (falha || !r || "error" in r) {
        setErro(falha ?? "Erro ao salvar o contrato");
        return;
      }
      setSalvo(contratoDosDados(dados, r.id, contrato));
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
            {salvo ? "Contrato salvo" : fluxo.naRevisao ? "Revisar o contrato" : "Compra e venda"}
          </DialogTitle>
        </DialogHeader>

        {salvo ? (
          <ContratoPronto
            contrato={salvo}
            comprador={compradorEscolhido}
            modeloAluguel={modeloAluguel}
            onFechar={onClose}
          />
        ) : passo ? (
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
              passo.campo === "property_area" &&
              areaPelasMedidas(dados) &&
              areaPelasMedidas(dados) !== dados.property_area.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    setAreaNaMao(false);
                    setDados((d) => ({ ...d, property_area: areaPelasMedidas(d) }));
                  }}
                  className="text-[11px] font-semibold text-produmar-600 dark:text-produmar-400 underline underline-offset-2"
                >
                  Pela conta das medidas: {areaPelasMedidas(dados)} m² — usar a conta
                </button>
              ) : passo.campo === "price" && parseMoney(dados.price) > 0 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {primeiraMaiuscula(valorPorExtenso(parseMoney(dados.price)))} — é assim que sai
                  no contrato.
                </p>
              ) : null
            }
            rodape="Nada é obrigatório: o que ficar em branco não sai no contrato."
          />
        ) : (
          <div className="space-y-4">
            <RevisaoDosPassos
              passos={passos}
              dados={dados}
              onEditar={fluxo.editar}
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

      <CompradorDialog
        open={!!compradorAberto}
        onClose={() => setCompradorAberto(null)}
        comprador={compradorAberto?.b ?? null}
        onSalvo={(b) => {
          setLista((atual) =>
            [...atual.filter((x) => x.id !== b.id), b].sort((x, y) => x.name.localeCompare(y.name))
          );
          // novo ou editado: já fica escolhido no contrato
          setDados((d) => ({ ...d, buyer_id: b.id }));
        }}
        onApagado={(id) => {
          setLista((atual) => atual.filter((x) => x.id !== id));
          setDados((d) => (d.buyer_id === id ? { ...d, buyer_id: COMPRADOR_PRODUMAR } : d));
        }}
      />
    </Dialog>
  );
}

/** Campos que o servidor guarda como foram digitados; o resto sobe para caixa alta. */
const SEM_CAIXA_ALTA = new Set<string>([
  "seller_gender",
  "spouse_gender",
  "seller_document",
  "seller_phone",
  "seller_email",
  "seller_zip",
  "spouse_document",
  "property_zip",
  "property_area",
  "property_front",
  "property_back",
  "property_right",
  "property_left",
  "property_improvements",
  "property_description",
  "property_registry_office",
  "payment_terms",
  "forum_city",
  "notes",
]);

/**
 * O contrato do jeito que acabou de ser salvo — para gerar o PDF na hora, sem
 * esperar a página recarregar. Segue as mesmas regras do servidor (caixa alta,
 * cônjuge só para casado).
 */
function contratoDosDados(
  d: Dados,
  id: string,
  antes: PropertySaleContract | null
): PropertySaleContract {
  const c: PropertySaleContract = { ...contratoEmBranco(), id };
  const alvo = c as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(d)) {
    if (k === "buyer_id" || k === "price" || k === "deed_days" || k === "penalty_percent") continue;
    const t = v.trim();
    alvo[k] = t ? (SEM_CAIXA_ALTA.has(k) ? t : t.toUpperCase()) : null;
  }
  // o RG perguntado em dois volta a ser um só, como o servidor grava
  alvo.seller_rg = juntarRg(d.seller_rg, d.seller_rg_orgao).toUpperCase() || null;
  alvo.spouse_rg = juntarRg(d.spouse_rg, d.spouse_rg_orgao).toUpperCase() || null;
  delete alvo.seller_rg_orgao;
  delete alvo.spouse_rg_orgao;
  if (!casado(d)) alvo.seller_property_regime = null;
  if (!comConjuge(d)) {
    for (const k of [
      "spouse_name",
      "spouse_gender",
      "spouse_document",
      "spouse_rg",
      "spouse_nationality",
      "spouse_profession",
    ])
      alvo[k] = null;
  }
  c.buyer_id = d.buyer_id === COMPRADOR_PRODUMAR ? null : d.buyer_id || null;
  c.price = parseMoney(d.price);
  c.deed_days = parseInt(d.deed_days, 10) || null;
  c.penalty_percent = parseMoney(d.penalty_percent) || null;
  c.seller_address = semPartes(d, "seller") ? antes?.seller_address ?? null : null;
  c.property_address = semPartes(d, "property") ? antes?.property_address ?? null : null;
  return c;
}

/** Salvo: o PDF pronto para compartilhar, e o contrato para abrir e imprimir. */
function ContratoPronto({
  contrato,
  comprador,
  modeloAluguel,
  onFechar,
}: {
  contrato: PropertySaleContract;
  comprador: PropertyBuyer | null;
  modeloAluguel: string | null;
  onFechar: () => void;
}) {
  const paragrafos = paragrafosDaCompraEVenda(contrato, modeloAluguel, comprador);
  const assinaturas = assinaturasDaCompraEVenda(contrato, comprador, modeloAluguel);

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Contrato de compra e venda salvo
          {contrato.seller_name ? ` com ${contrato.seller_name}` : ""}.
        </p>
      </div>

      <CompartilharPdf
        chave={contrato.id + JSON.stringify(paragrafos)}
        gerar={() =>
          gerarContratoPdf({
            titulo: paragrafos[0],
            paragrafos: paragrafos.slice(1),
            marcaAssinaturas: MARCA_ASSINATURAS,
            rotulo: RE_ROTULO_COMPRA_VENDA,
            assinaturas,
            nomeArquivo: nomeDoPdfDaCompraEVenda(contrato),
          })
        }
      />

      <a
        href={`/imprimir/compra-venda/${contrato.id}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 w-full h-12 rounded-md border border-produmar-200 dark:border-slate-700 text-base font-medium text-produmar-700 dark:text-produmar-300 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
      >
        <Printer className="w-4 h-4" />
        Abrir / imprimir o contrato
      </a>

      <Button type="button" variant="outline" onClick={onFechar} className="w-full h-11">
        Fechar
      </Button>
    </div>
  );
}
