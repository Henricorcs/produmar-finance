"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Landmark, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { actionError } from "@/lib/action-result";
import {
  cn,
  formatBRLInput,
  formatDate,
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

type Tipo =
  | "texto"
  | "documento"
  | "numero"
  | "telefone"
  | "email"
  | "cep"
  | "dinheiro"
  | "percentual"
  | "data"
  | "longo"
  | "opcoes";

interface Passo {
  campo: Campo;
  secao: string;
  pergunta: string;
  tipo: Tipo;
  placeholder?: string;
  dica?: string;
  opcoes?: string[];
  /** Sai em CAIXA ALTA (só na tela — o servidor grava em caixa alta). */
  maiusculo?: boolean;
  /** O passo só aparece quando faz sentido (o cônjuge, o regime de bens). */
  quando?: (d: Dados) => boolean;
}

/** Estados civis em que o cônjuge assina junto. */
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
  {
    campo: "property_description",
    secao: "O imóvel",
    pergunta: "Medidas, divisas e benfeitorias",
    tipo: "longo",
    placeholder: "ex: medindo 12 m de frente por 30 m de fundos, limitando-se ao norte com...",
    dica: "Como está na matrícula: frente, fundos, laterais, com quem faz divisa e o que tem construído.",
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
  { campo: "deed_days", secao: "Prazos e assinatura", pergunta: "Prazo para passar a escritura (em dias)", tipo: "numero", dica: "Contado depois de pago o preço." },
  { campo: "penalty_percent", secao: "Prazos e assinatura", pergunta: "Multa para quem descumprir (% do preço)", tipo: "percentual" },
  { campo: "signed_at", secao: "Prazos e assinatura", pergunta: "Data da assinatura", tipo: "data" },
  { campo: "forum_city", secao: "Prazos e assinatura", pergunta: "Cidade do foro e da assinatura", tipo: "texto" },
  { campo: "notes", secao: "Prazos e assinatura", pergunta: "Alguma cláusula a mais?", tipo: "longo", placeholder: "opcional", dica: "Entra como uma cláusula a mais, antes do foro." },
];

/** "65470000" → "65470-000". */
function mascaraCep(s: string): string {
  const d = s.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** O que a revisão mostra no lugar de cada resposta. */
function valorNaRevisao(p: Passo, valor: string): string {
  if (!valor.trim()) return "";
  if (p.tipo === "data") return formatDate(valor);
  if (p.tipo === "dinheiro") return `R$ ${valor}`;
  if (p.tipo === "percentual") return `${valor}%`;
  if (p.tipo === "numero" && p.campo === "deed_days") return `${valor} dias`;
  return valor;
}

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
    // contrato salvo antes da 112: o endereço corrido entra na rua, para não sumir
    seller_street: s(c?.seller_street) || s(c?.seller_address),
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
    property_street: s(c?.property_street) || s(c?.property_address),
    property_number: s(c?.property_number),
    property_complement: s(c?.property_complement),
    property_district: s(c?.property_district),
    property_city: s(c?.property_city),
    property_zip: s(c?.property_zip),
    property_area: s(c?.property_area),
    property_registration: s(c?.property_registration),
    property_registry_office: s(c?.property_registry_office),
    property_iptu_code: s(c?.property_iptu_code),
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
  /** Índice do passo na lista VISÍVEL; -1 = a revisão. */
  const [idx, setIdx] = useState(0);
  /** Abriu o passo a partir da revisão: o "OK" volta para lá. */
  const [daRevisao, setDaRevisao] = useState(false);
  const campoRef = useRef<HTMLInputElement | null>(null);
  const textoRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDados(dadosIniciais(contrato));
    setIdx(contrato ? -1 : 0);
    setDaRevisao(false);
    setErro(null);
  }, [open, contrato]);

  /** Os passos que valem para estas respostas (o cônjuge só se for casado). */
  const passos = useMemo(() => PASSOS.filter((p) => !p.quando || p.quando(dados)), [dados]);
  const naRevisao = idx < 0 || idx >= passos.length;
  const passo = naRevisao ? null : passos[idx];

  // Foco no campo a cada pergunta: no computador o cursor já está lá; no
  // iPhone o MESMO campo é reaproveitado entre as perguntas de texto, então o
  // teclado não fecha ao tocar em "seguinte".
  useEffect(() => {
    if (!open || !passo) return;
    const t = setTimeout(() => {
      if (passo.tipo === "longo") textoRef.current?.focus();
      else if (passo.tipo !== "opcoes" && passo.tipo !== "data") campoRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [open, idx, passo]);

  function mudar(campo: Campo, valor: string) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  function avancar() {
    if (daRevisao) {
      setDaRevisao(false);
      setIdx(-1);
      return;
    }
    setIdx((i) => (i + 1 >= passos.length ? -1 : i + 1));
  }

  function voltar() {
    if (daRevisao) {
      setDaRevisao(false);
      setIdx(-1);
      return;
    }
    if (naRevisao) setIdx(passos.length - 1);
    else setIdx((i) => Math.max(0, i - 1));
  }

  function escolherOpcao(campo: Campo, opcao: string) {
    const novo = dados[campo] === opcao ? "" : opcao;
    setDados((d) => ({ ...d, [campo]: novo }));
    // escolheu: segue sozinho para a próxima pergunta
    if (novo) setTimeout(avancar, 150);
  }

  function editarNaRevisao(campo: Campo) {
    const i = passos.findIndex((p) => p.campo === campo);
    if (i < 0) return;
    setDaRevisao(true);
    setIdx(i);
  }

  function salvar() {
    setErro(null);
    const ehCasado = casado(dados);
    startTransition(async () => {
      const r = await salvarContratoCompraVenda(contrato?.id ?? null, {
        ...dados,
        // endereço corrido antigo: as partes passam a valer
        seller_address: null,
        property_address: null,
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

  const ultimo = !naRevisao && idx === passos.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <Landmark className="w-4 h-4" />
            </span>
            {naRevisao ? "Revisar o contrato" : "Compra e venda"}
          </DialogTitle>
        </DialogHeader>

        {passo ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              avancar();
            }}
          >
            {/* Onde está: a seção e a barra de quanto falta */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                <span className="font-semibold tracking-wide">{passo.secao.toUpperCase()}</span>
                <span className="tabular-nums">
                  {idx + 1} de {passos.length}
                </span>
              </div>
              <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-produmar-500 transition-all"
                  style={{ width: `${((idx + 1) / passos.length) * 100}%` }}
                />
              </div>
            </div>

            <label
              htmlFor="cv_campo"
              className="block text-lg font-semibold leading-snug text-slate-800 dark:text-slate-100"
            >
              {passo.pergunta}
            </label>

            <CampoDoPasso
              passo={passo}
              valor={dados[passo.campo]}
              onMudar={(v) => mudar(passo.campo, v)}
              onEscolher={(o) => escolherOpcao(passo.campo, o)}
              campoRef={campoRef}
              textoRef={textoRef}
              ultimo={ultimo}
            />

            {passo.campo === "price" && parseMoney(dados.price) > 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {primeiraMaiuscula(valorPorExtenso(parseMoney(dados.price)))} — é assim que sai no
                contrato.
              </p>
            )}
            {passo.dica && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">{passo.dica}</p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={voltar}
                disabled={!daRevisao && idx === 0}
                className="h-11 px-3"
                aria-label="Voltar"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button type="submit" className="h-11 flex-1">
                {daRevisao
                  ? "OK"
                  : ultimo
                    ? "Revisar"
                    : dados[passo.campo].trim()
                      ? "Próximo"
                      : "Pular"}
                {!daRevisao && <ChevronRight className="w-4 h-4" />}
              </Button>
            </div>

            {!daRevisao && (
              <button
                type="button"
                onClick={() => setIdx(-1)}
                className="w-full text-center text-[11px] font-medium text-produmar-600 dark:text-produmar-400 underline underline-offset-2"
              >
                Ir para a revisão e salvar
              </button>
            )}

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Nada é obrigatório: o que ficar em branco sai no papel como linha para completar à
              caneta. A compradora é sempre a PRODUMAR, com os dados do contrato de aluguel.
            </p>
          </form>
        ) : (
          <div className="space-y-4">
            <Revisao passos={passos} dados={dados} onEditar={editarNaRevisao} />

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
                onClick={voltar}
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

/**
 * O campo da pergunta da vez. As perguntas de texto usam SEMPRE o mesmo campo
 * (mesmo lugar na árvore): trocar de pergunta não derruba o foco, e o teclado
 * do iPhone continua aberto de uma resposta para a outra.
 */
function CampoDoPasso({
  passo,
  valor,
  onMudar,
  onEscolher,
  campoRef,
  textoRef,
  ultimo,
}: {
  passo: Passo;
  valor: string;
  onMudar: (v: string) => void;
  onEscolher: (opcao: string) => void;
  campoRef: React.MutableRefObject<HTMLInputElement | null>;
  textoRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  ultimo: boolean;
}) {
  if (passo.tipo === "opcoes") {
    return (
      <div className="flex flex-wrap gap-2">
        {passo.opcoes?.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onEscolher(o)}
            className={cn(
              "min-h-[44px] px-4 rounded-xl border text-sm font-semibold transition-colors",
              valor === o
                ? "bg-produmar-600 border-produmar-600 text-white"
                : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
            )}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }

  if (passo.tipo === "longo") {
    return (
      <Textarea
        id="cv_campo"
        ref={textoRef}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        placeholder={passo.placeholder}
        rows={4}
      />
    );
  }

  if (passo.tipo === "data") {
    return (
      <Input
        id="cv_campo"
        type="date"
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        className="h-12 text-base"
      />
    );
  }

  const inputMode =
    passo.tipo === "documento" || passo.tipo === "numero" || passo.tipo === "cep"
      ? "numeric"
      : passo.tipo === "telefone"
        ? "tel"
        : passo.tipo === "dinheiro" || passo.tipo === "percentual"
          ? "decimal"
          : passo.tipo === "email"
            ? "email"
            : "text";

  function formatar(bruto: string): string {
    switch (passo.tipo) {
      case "dinheiro":
        return formatBRLInput(bruto);
      case "cep":
        return mascaraCep(bruto);
      case "numero":
        return bruto.replace(/\D/g, "").slice(0, 4);
      case "percentual":
        return bruto.replace(/[^\d,]/g, "").slice(0, 5);
      default:
        return bruto;
    }
  }

  return (
    <Input
      id="cv_campo"
      ref={campoRef}
      value={valor}
      onChange={(e) => onMudar(formatar(e.target.value))}
      placeholder={passo.placeholder}
      inputMode={inputMode}
      enterKeyHint={ultimo ? "done" : "next"}
      autoComplete="off"
      autoCapitalize={passo.maiusculo ? "characters" : "off"}
      className={cn(
        "h-12 text-base",
        passo.maiusculo && "uppercase placeholder:normal-case",
        (passo.tipo === "dinheiro" || passo.tipo === "documento" || passo.tipo === "cep") &&
          "tabular-nums font-semibold"
      )}
    />
  );
}

/** Tudo o que foi respondido, por seção, com um toque para corrigir. */
function Revisao({
  passos,
  dados,
  onEditar,
}: {
  passos: Passo[];
  dados: Dados;
  onEditar: (campo: Campo) => void;
}) {
  const secoes: { titulo: string; itens: Passo[] }[] = [];
  for (const p of passos) {
    const ultima = secoes[secoes.length - 1];
    if (ultima && ultima.titulo === p.secao) ultima.itens.push(p);
    else secoes.push({ titulo: p.secao, itens: [p] });
  }
  const emBranco = passos.filter((p) => !dados[p.campo].trim()).length;

  return (
    <div className="space-y-3">
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

      {emBranco > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {emBranco} {emBranco === 1 ? "campo ficou" : "campos ficaram"} em branco — saem no papel
          como linha para a caneta. Toque em qualquer item para corrigir.
        </p>
      )}

      {secoes.map((s) => (
        <div key={s.titulo} className="space-y-1">
          <p className="text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
            {s.titulo.toUpperCase()}
          </p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {s.itens.map((p) => {
              const valor = valorNaRevisao(p, dados[p.campo]);
              return (
                <button
                  key={p.campo}
                  type="button"
                  onClick={() => onEditar(p.campo)}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                      {p.pergunta}
                    </span>
                    <span
                      className={cn(
                        "block text-sm break-words",
                        valor
                          ? "text-slate-800 dark:text-slate-100"
                          : "text-slate-300 dark:text-slate-600 italic"
                      )}
                    >
                      {valor || "em branco"}
                    </span>
                  </span>
                  <Pencil className="w-3.5 h-3.5 mt-1 flex-shrink-0 text-slate-300 dark:text-slate-600" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
