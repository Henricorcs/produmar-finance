"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, FileSignature, Printer, Search, Trash2 } from "lucide-react";
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
import { cn, localDateISO } from "@/lib/utils";
import { apagarProcuracao, salvarProcuracao } from "@/app/(app)/alugueis/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./alugueis-shared";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import { gerarContratoPdf } from "@/lib/contrato-pdf";
import {
  CIDADE_PADRAO,
  EMPRESA_PADRAO,
  MARCA_ASSINATURAS,
  RE_ROTULO_PROCURACAO,
  SERVICO_PADRAO,
  VALIDADE_PADRAO,
  assinaturasDaProcuracao,
  nomeDoPdfDaProcuracao,
  paragrafosDaProcuracao,
  procuracaoEmBranco,
} from "@/lib/procuracao";
import type { PowerOfAttorney, PropertySaleContract, RentalContractView } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// PROCURAÇÃO — preenchida UM CAMPO POR VEZ, como a compra e venda
// ─────────────────────────────────────────────────────────────────────────────
// Primeiro a conta (concessionária, serviço, conta contrato), depois quem dá a
// procuração (o titular), depois quem recebe. O procurador costuma ser sempre o
// mesmo: numa procuração nova, ele já vem preenchido com o da última — é só
// conferir e tocar em OK.
// ─────────────────────────────────────────────────────────────────────────────

const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "UNIÃO ESTÁVEL", "DIVORCIADO", "VIÚVO"];

type Quem = "grantor" | "attorney";

const CAMPOS_DA_PESSOA = [
  "name",
  "gender",
  "document",
  "rg",
  "nationality",
  "marital_status",
  "profession",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "zip",
] as const;

type Campo =
  | `${Quem}_${(typeof CAMPOS_DA_PESSOA)[number]}`
  /** Só na tela: o órgão do RG é perguntado à parte e gravado junto do número. */
  | `${Quem}_rg_orgao`
  | "grantor_birthplace"
  /** Só na tela: o contrato de onde vieram os dados ("aluguel:<id>", "venda:<id>" ou "nenhum"). */
  | "origem"
  | "company"
  | "service"
  | "account_number"
  | "validity"
  | "city"
  | "signed_at"
  | "notes";

type Dados = Record<Campo, string>;
type Passo = PassoDef<Campo>;

/** As perguntas de uma pessoa (outorgante ou outorgado) — as mesmas para os dois. */
function passosDaPessoa(quem: Quem, titulo: string, nome: string, enderecoTitulo: string): Passo[] {
  const c = (k: string) => `${quem}_${k}` as Campo;
  return [
    { campo: c("name"), secao: titulo, pergunta: `Nome completo ${nome}`, tipo: "texto", maiusculo: true },
    {
      campo: c("gender"),
      secao: titulo,
      pergunta: "Homem ou mulher?",
      tipo: "opcoes",
      opcoes: [
        { valor: "m", label: "Homem" },
        { valor: "f", label: "Mulher" },
      ],
      dica: "Decide, na procuração, entre \"portador\" e \"portadora\", \"procurador\" e \"procuradora\".",
    },
    { campo: c("document"), secao: titulo, pergunta: "CPF", tipo: "documento", placeholder: "000.000.000-00" },
    { campo: c("rg"), secao: titulo, pergunta: "Número do RG", tipo: "texto", teclado: "numerico", teclasExtras: ["-", "X"], placeholder: "ex: 123456789" },
    { campo: c("rg_orgao"), secao: titulo, pergunta: "Órgão expedidor do RG", tipo: "texto", maiusculo: true, atalhos: ORGAOS_RG, placeholder: "ex: SSP/MA" },
    { campo: c("nationality"), secao: titulo, pergunta: "Nacionalidade", tipo: "texto", maiusculo: true },
    { campo: c("marital_status"), secao: titulo, pergunta: "Estado civil", tipo: "opcoes", opcoes: ESTADOS_CIVIS },
    { campo: c("profession"), secao: titulo, pergunta: "Profissão", tipo: "texto", maiusculo: true, placeholder: "ex: mecânico, auxiliar administrativo" },
    ...(quem === "grantor"
      ? [
          {
            campo: "grantor_birthplace" as Campo,
            secao: titulo,
            pergunta: "Naturalidade (onde nasceu)",
            tipo: "texto" as const,
            maiusculo: true,
            placeholder: "ex: VARGEM GRANDE/MA",
          },
        ]
      : []),
    { campo: c("street"), secao: enderecoTitulo, pergunta: "Rua ou avenida", tipo: "texto", maiusculo: true, placeholder: "ex: RUA DA CAEMA" },
    { campo: c("number"), secao: enderecoTitulo, pergunta: "Número", tipo: "texto", teclado: "numerico", atalhos: ["S/N"], maiusculo: true, placeholder: "ex: 134" },
    { campo: c("complement"), secao: enderecoTitulo, pergunta: "Complemento", tipo: "texto", maiusculo: true, placeholder: "opcional — casa B, apto 3..." },
    { campo: c("district"), secao: enderecoTitulo, pergunta: "Bairro", tipo: "texto", maiusculo: true },
    { campo: c("city"), secao: enderecoTitulo, pergunta: "Cidade / UF", tipo: "texto", maiusculo: true, atalhos: ["SÃO MATEUS DO MARANHÃO/MA"], placeholder: "ex: SÃO MATEUS DO MARANHÃO/MA" },
    { campo: c("zip"), secao: enderecoTitulo, pergunta: "CEP", tipo: "cep", atalhos: ["65470-000"], placeholder: "00000-000" },
  ];
}

const PASSOS: Passo[] = [
  // ── A conta ─────────────────────────────────────────────────────────────
  {
    campo: "company",
    secao: "A conta",
    pergunta: "Qual a concessionária?",
    tipo: "texto",
    maiusculo: true,
    atalhos: ["EQUATORIAL", "CAEMA"],
  },
  {
    campo: "service",
    secao: "A conta",
    pergunta: "Qual o serviço?",
    tipo: "texto",
    maiusculo: true,
    atalhos: [SERVICO_PADRAO, "LIGAÇÃO NOVA", "DESLIGAMENTO"],
  },
  {
    campo: "account_number",
    secao: "A conta",
    pergunta: "Número da conta contrato",
    tipo: "texto",
    teclado: "numerico",
    teclasExtras: ["-", "."],
    placeholder: "ex: 695.517.016-52",
    dica: "Está na conta de energia, perto do nome do titular.",
  },

  // ── Quem dá a procuração ────────────────────────────────────────────────
  ...passosDaPessoa("grantor", "Outorgante (titular da conta)", "do outorgante", "Onde o outorgante mora"),

  // ── Quem recebe ─────────────────────────────────────────────────────────
  ...passosDaPessoa("attorney", "Outorgado (o procurador)", "do procurador", "Onde o procurador mora"),

  // ── Validade e assinatura ───────────────────────────────────────────────
  {
    campo: "validity",
    secao: "Validade e assinatura",
    pergunta: "Até quando a procuração vale?",
    tipo: "texto",
    atalhos: [VALIDADE_PADRAO, "por 90 (noventa) dias"],
  },
  { campo: "signed_at", secao: "Validade e assinatura", pergunta: "Data da assinatura", tipo: "data" },
  { campo: "city", secao: "Validade e assinatura", pergunta: "Cidade da assinatura", tipo: "texto", atalhos: [CIDADE_PADRAO] },
  {
    campo: "notes",
    secao: "Validade e assinatura",
    pergunta: "Algum poder a mais?",
    tipo: "longo",
    placeholder: "opcional",
    dica: "Entra como um parágrafo a mais, depois dos poderes.",
  },
];

function dadosIniciais(p: PowerOfAttorney | null, ultima: PowerOfAttorney | null): Dados {
  const s = (v?: string | null) => v ?? "";
  // procuração nova: o procurador vem da última (costuma ser sempre o mesmo)
  const procurador = p ?? ultima;
  const rgA = separarRg(p?.grantor_rg);
  const rgB = separarRg(procurador?.attorney_rg);
  return {
    origem: "",
    company: p ? s(p.company) : EMPRESA_PADRAO,
    service: p ? s(p.service) : SERVICO_PADRAO,
    account_number: s(p?.account_number),

    grantor_name: s(p?.grantor_name),
    grantor_gender: s(p?.grantor_gender),
    grantor_document: s(p?.grantor_document),
    grantor_rg: rgA.numero,
    grantor_rg_orgao: rgA.orgao,
    grantor_nationality: p ? s(p.grantor_nationality) : "BRASILEIRA",
    grantor_marital_status: s(p?.grantor_marital_status),
    grantor_profession: s(p?.grantor_profession),
    grantor_birthplace: s(p?.grantor_birthplace),
    grantor_street: s(p?.grantor_street),
    grantor_number: s(p?.grantor_number),
    grantor_complement: s(p?.grantor_complement),
    grantor_district: s(p?.grantor_district),
    grantor_city: s(p?.grantor_city),
    grantor_zip: s(p?.grantor_zip),

    attorney_name: s(procurador?.attorney_name),
    attorney_gender: s(procurador?.attorney_gender),
    attorney_document: s(procurador?.attorney_document),
    attorney_rg: rgB.numero,
    attorney_rg_orgao: rgB.orgao,
    attorney_nationality: procurador ? s(procurador.attorney_nationality) : "BRASILEIRA",
    attorney_marital_status: s(procurador?.attorney_marital_status),
    attorney_profession: s(procurador?.attorney_profession),
    attorney_street: s(procurador?.attorney_street),
    attorney_number: s(procurador?.attorney_number),
    attorney_complement: s(procurador?.attorney_complement),
    attorney_district: s(procurador?.attorney_district),
    attorney_city: s(procurador?.attorney_city),
    attorney_zip: s(procurador?.attorney_zip),

    validity: p ? s(p.validity) : VALIDADE_PADRAO,
    signed_at: p ? s(p.signed_at) : localDateISO(),
    city: p ? s(p.city) : CIDADE_PADRAO,
    notes: s(p?.notes),
  };
}

/**
 * DE UM CONTRATO JÁ CADASTRADO: o outorgante vem pronto — do aluguel, o
 * INQUILINO (e a conta contrato de energia do imóvel); da compra e venda, o
 * VENDEDOR. Só troca os dados do outorgante e a conta; o procurador fica.
 */
function outorganteDoAluguel(d: Dados, c: RentalContractView): Dados {
  const rg = separarRg(c.tenant_rg);
  const s = (v?: string | null) => v?.trim() ?? "";
  // contrato antigo, de antes do endereço em partes: o endereço corrido vai na rua
  const semPartes = ![c.tenant_street, c.tenant_number, c.tenant_district, c.tenant_city].some((v) => v?.trim());
  return {
    ...d,
    origem: `aluguel:${c.id}`,
    grantor_name: s(c.tenant_name),
    grantor_gender: "",
    grantor_document: s(c.tenant_document),
    grantor_rg: rg.numero,
    grantor_rg_orgao: rg.orgao,
    grantor_nationality: s(c.tenant_nationality) || "BRASILEIRA",
    grantor_marital_status: s(c.tenant_marital_status),
    grantor_profession: s(c.tenant_profession),
    grantor_birthplace: s(c.tenant_birthplace),
    grantor_street: semPartes ? s(c.tenant_address) : s(c.tenant_street),
    grantor_number: s(c.tenant_number),
    grantor_complement: s(c.tenant_complement),
    grantor_district: s(c.tenant_district),
    grantor_city: s(c.tenant_city),
    grantor_zip: s(c.tenant_zip),
    // a conta da CAEMA é a da água; a da Equatorial (padrão), a de energia
    account_number:
      (/CAEMA/i.test(d.company) ? s(c.property_water_code) : s(c.property_power_code)) || d.account_number,
  };
}

function outorganteDaVenda(d: Dados, c: PropertySaleContract): Dados {
  const rg = separarRg(c.seller_rg);
  const s = (v?: string | null) => v?.trim() ?? "";
  const semPartes = ![c.seller_street, c.seller_number, c.seller_district, c.seller_city].some((v) => v?.trim());
  return {
    ...d,
    origem: `venda:${c.id}`,
    grantor_name: s(c.seller_name),
    grantor_gender: s(c.seller_gender),
    grantor_document: s(c.seller_document),
    grantor_rg: rg.numero,
    grantor_rg_orgao: rg.orgao,
    grantor_nationality: s(c.seller_nationality) || "BRASILEIRA",
    grantor_marital_status: s(c.seller_marital_status),
    grantor_profession: s(c.seller_profession),
    grantor_birthplace: "",
    grantor_street: semPartes ? s(c.seller_address) : s(c.seller_street),
    grantor_number: s(c.seller_number),
    grantor_complement: s(c.seller_complement),
    grantor_district: s(c.seller_district),
    grantor_city: s(c.seller_city),
    grantor_zip: s(c.seller_zip),
  };
}

/** O que vai para o servidor: o RG volta a ser um campo só ("123456 SSP/MA"). */
function paraSalvar(d: Dados) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { grantor_rg_orgao, attorney_rg_orgao, origem, ...resto } = d;
  return {
    ...resto,
    grantor_rg: juntarRg(d.grantor_rg, grantor_rg_orgao),
    attorney_rg: juntarRg(d.attorney_rg, attorney_rg_orgao),
  };
}

/** Campos que o servidor guarda como foram digitados; o resto sobe para caixa alta. */
const SEM_CAIXA_ALTA = new Set<string>([
  "grantor_gender",
  "attorney_gender",
  "grantor_document",
  "attorney_document",
  "grantor_zip",
  "attorney_zip",
  "account_number",
  "validity",
  "city",
  "signed_at",
  "notes",
]);

/** A procuração como acabou de ser salva — para o PDF na hora, sem recarregar a página. */
function procuracaoDosDados(d: Dados, id: string): PowerOfAttorney {
  const p = { ...procuracaoEmBranco(), id } as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(paraSalvar(d))) {
    const t = v.trim();
    p[k] = t ? (SEM_CAIXA_ALTA.has(k) ? t : t.toUpperCase()) : null;
  }
  return p as unknown as PowerOfAttorney;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Procuração em edição — null começa uma nova. */
  procuracao: PowerOfAttorney | null;
  /** A última salva: dela vem o procurador de uma procuração nova. */
  ultima: PowerOfAttorney | null;
  /** Contratos de aluguel: o inquilino vira o outorgante (e vem a conta de energia do imóvel). */
  contratos?: RentalContractView[];
  /** Contratos de compra e venda: o vendedor vira o outorgante. */
  compras?: PropertySaleContract[];
}

/** Uma linha da lista "puxar de um contrato". */
type OpcaoDeContrato = { chave: string; titulo: string; detalhe: string; busca: string };

export function ProcuracaoDialog({ open, onClose, procuracao, ultima, contratos = [], compras = [] }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<Dados>(() => dadosIniciais(null, null));
  const [salva, setSalva] = useState<PowerOfAttorney | null>(null);

  useEffect(() => {
    if (!open) return;
    setDados(dadosIniciais(procuracao, ultima));
    setErro(null);
    setSalva(null);
  }, [open, procuracao, ultima]);

  /** Os contratos para escolher: os aluguéis ativos primeiro, depois as compras e vendas. */
  const opcoes = useMemo<OpcaoDeContrato[]>(() => {
    const alugueis = [...contratos]
      .sort((a, b) => (a.status === b.status ? a.property_code - b.property_code : a.status === "ativo" ? -1 : 1))
      .map((c) => {
        const endereco = [c.property_street, c.property_number ? `nº ${c.property_number}` : null]
          .filter(Boolean)
          .join(", ");
        const detalhe = [
          `Aluguel · imóvel nº ${c.property_code}`,
          endereco || c.property_name,
          c.property_power_code ? `energia ${c.property_power_code}` : null,
          c.status === "encerrado" ? "encerrado" : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return { chave: `aluguel:${c.id}`, titulo: c.tenant_name, detalhe, busca: `${c.tenant_name} ${detalhe}` };
      });
    const vendas = compras.map((c) => {
      const detalhe = ["Compra e venda", c.property_kind, c.property_street].filter(Boolean).join(" · ");
      const titulo = c.seller_name || "Vendedor a preencher";
      return { chave: `venda:${c.id}`, titulo, detalhe, busca: `${titulo} ${detalhe}` };
    });
    return [...alugueis, ...vendas];
  }, [contratos, compras]);

  function puxarDoContrato(chave: string) {
    const [tipo, id] = chave.split(":");
    setDados((d) => {
      if (tipo === "aluguel") {
        const c = contratos.find((x) => x.id === id);
        return c ? outorganteDoAluguel(d, c) : d;
      }
      if (tipo === "venda") {
        const c = compras.find((x) => x.id === id);
        return c ? outorganteDaVenda(d, c) : d;
      }
      return { ...d, origem: "nenhum" };
    });
  }

  /** Procuração nova (e com contrato cadastrado): a 1ª pergunta é de onde puxar o outorgante. */
  const todosOsPassos = useMemo<Passo[]>(() => {
    if (procuracao || opcoes.length === 0) return PASSOS;
    const passoOrigem: Passo = {
      campo: "origem",
      secao: "Outorgante (titular da conta)",
      pergunta: "Puxar os dados de um contrato?",
      tipo: "especial",
      dica: "O outorgante já vem preenchido — do aluguel, o inquilino (e a conta de energia do imóvel); da compra e venda, o vendedor. Depois é só conferir.",
      mostrar: (v) =>
        v === "nenhum" || !v ? "Não — preenchido do zero" : opcoes.find((o) => o.chave === v)?.titulo ?? "—",
      especial: (valor, _mudar, avancar) => (
        <EscolherContrato
          opcoes={opcoes}
          valor={valor}
          onEscolher={(chave) => {
            puxarDoContrato(chave);
            setTimeout(avancar, 150);
          }}
        />
      ),
    };
    return [passoOrigem, ...PASSOS];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procuracao, opcoes]);

  const fluxo = usePassoAPasso(todosOsPassos, dados, open, !!procuracao);
  const { passo, passos, idx } = fluxo;

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const r = await salvarProcuracao(procuracao?.id ?? null, paraSalvar(dados));
      const falha = actionError(r);
      if (falha || !r || "error" in r) {
        setErro(falha ?? "Erro ao salvar a procuração");
        return;
      }
      setSalva(procuracaoDosDados(dados, r.id));
    });
  }

  function apagar() {
    if (!procuracao) return;
    if (
      !confirm(
        `Apagar a procuração${procuracao.grantor_name ? ` de ${procuracao.grantor_name}` : ""}? Isso não tem volta.`
      )
    )
      return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await apagarProcuracao(procuracao.id));
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
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <FileSignature className="w-4 h-4" />
            </span>
            {salva ? "Procuração salva" : fluxo.naRevisao ? "Revisar a procuração" : "Procuração"}
          </DialogTitle>
        </DialogHeader>

        {salva ? (
          <ProcuracaoPronta procuracao={salva} onFechar={onClose} />
        ) : passo ? (
          <PerguntaDoPasso
            passo={passo}
            idx={idx}
            total={passos.length}
            valor={dados[passo.campo]}
            onMudar={(v) => setDados((d) => ({ ...d, [passo.campo]: v }))}
            onAvancar={fluxo.avancar}
            onVoltar={fluxo.voltar}
            onRevisao={fluxo.irParaRevisao}
            daRevisao={fluxo.daRevisao}
            extra={
              !procuracao && ultima && passo.campo === "attorney_name" && dados.attorney_name.trim() ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Veio da última procuração — se for a mesma pessoa, é só tocar em OK nas próximas.
                </p>
              ) : null
            }
            rodape="Nada é obrigatório: o que ficar em branco não sai na procuração."
          />
        ) : (
          <div className="space-y-4">
            <RevisaoDosPassos passos={passos} dados={dados} onEditar={fluxo.editar} />

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
              </p>
            )}

            <DialogFooter className={STICKY_FOOTER}>
              {procuracao && (
                <button
                  type="button"
                  onClick={apagar}
                  disabled={isPending}
                  aria-label="Apagar procuração"
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
                {isPending ? "Salvando..." : "Salvar procuração"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Salva: o PDF pronto para compartilhar, e a procuração para abrir e imprimir. */
function ProcuracaoPronta({
  procuracao,
  onFechar,
}: {
  procuracao: PowerOfAttorney;
  onFechar: () => void;
}) {
  const paragrafos = paragrafosDaProcuracao(procuracao);
  const assinaturas = assinaturasDaProcuracao(procuracao);

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Procuração salva
          {procuracao.grantor_name ? ` — outorgante ${procuracao.grantor_name}` : ""}.
        </p>
      </div>

      <CompartilharPdf
        chave={procuracao.id + JSON.stringify(paragrafos)}
        gerar={() =>
          gerarContratoPdf({
            titulo: paragrafos[0],
            paragrafos: paragrafos.slice(1),
            marcaAssinaturas: MARCA_ASSINATURAS,
            rotulo: RE_ROTULO_PROCURACAO,
            assinaturas,
            nomeArquivo: nomeDoPdfDaProcuracao(procuracao),
            testemunhas: false,
          })
        }
      />

      <a
        href={`/imprimir/procuracao/${procuracao.id}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 w-full h-12 rounded-md border border-produmar-200 dark:border-slate-700 text-base font-medium text-produmar-700 dark:text-produmar-300 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
      >
        <Printer className="w-4 h-4" />
        Abrir / imprimir a procuração
      </a>

      <Button type="button" variant="outline" onClick={onFechar} className="w-full h-11">
        Fechar
      </Button>
    </div>
  );
}

/**
 * A lista "puxar de um contrato": busca pelo nome, endereço ou nº do imóvel,
 * e o botão de preencher do zero. Tocou num contrato, os dados entram e a
 * procuração segue para a próxima pergunta.
 */
function EscolherContrato({
  opcoes,
  valor,
  onEscolher,
}: {
  opcoes: OpcaoDeContrato[];
  valor: string;
  onEscolher: (chave: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const q = busca.trim().toUpperCase();
  const visiveis = q ? opcoes.filter((o) => o.busca.toUpperCase().includes(q)) : opcoes;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onEscolher("nenhum")}
        className={cn(
          "w-full rounded-xl border px-3 py-2.5 text-left text-sm font-semibold",
          valor === "nenhum"
            ? "border-produmar-600 bg-produmar-50 text-produmar-800 dark:bg-produmar-900/20"
            : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"
        )}
      >
        Não — preencher do zero
      </button>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nome, rua ou nº do imóvel..."
          className="w-full h-11 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-produmar-500"
        />
      </div>
      <div className="max-h-[45vh] overflow-y-auto space-y-1.5">
        {visiveis.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Nenhum contrato com essa busca.</p>
        ) : (
          visiveis.map((o) => (
            <button
              key={o.chave}
              type="button"
              onClick={() => onEscolher(o.chave)}
              className={cn(
                "w-full rounded-xl border px-3 py-2.5 text-left",
                valor === o.chave
                  ? "border-produmar-600 bg-produmar-50 dark:bg-produmar-900/20"
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
              )}
            >
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{o.titulo}</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">{o.detalhe}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
