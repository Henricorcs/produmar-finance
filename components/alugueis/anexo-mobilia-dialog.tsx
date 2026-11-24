"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, ChevronLeft, Plus, Printer, Search, Sofa, Trash2, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PerguntaDoPasso, RevisaoDosPassos, usePassoAPasso, type PassoDef } from "@/components/ui/passo-a-passo";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import { actionError } from "@/lib/action-result";
import { cn, formatBRL, formatBRLInput, localDateISO } from "@/lib/utils";
import { apagarAnexoMobilia, salvarAnexoMobilia } from "@/app/(app)/alugueis/actions";
import {
  CIDADE_DO_ANEXO,
  COMODOS_DO_MODELO,
  ESTADOS_DA_MOBILIA,
  MOBILIAS_DO_MODELO,
  OBSERVACOES_DO_MODELO,
  agruparPorComodo,
  itensValidos,
  lerReais,
  montarAnexo,
  reaisDoItem,
  rotuloDoImovel,
  totalDaMobilia,
} from "@/lib/anexo-mobilia";
import { gerarAnexoMobiliaPdf } from "@/lib/anexo-mobilia-pdf";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./alugueis-shared";
import type { ItemDeMobilia, RentalContractView, RentalFurnitureAnnex } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// ANEXO DE MOBÍLIA — o imóvel alugado mobiliado, UMA PERGUNTA POR VEZ
// ─────────────────────────────────────────────────────────────────────────────
// Primeiro o contrato de aluguel já cadastrado: dele vêm o locatário, o imóvel
// e o locador, sem digitar nada. Depois a mobília — começa com a lista do
// último anexo do mesmo imóvel (ou a do modelo) e dá para incluir item novo,
// retirar ou corrigir um. No fim, a revisão e "Salvar".
// ─────────────────────────────────────────────────────────────────────────────

type Campo = "contrato" | "property_label" | "mobilias" | "notes" | "signed_at" | "city";
type Dados = Record<Campo, string>;
type Passo = PassoDef<Campo>;

function lerItens(json: string): ItemDeMobilia[] {
  try {
    return itensValidos(JSON.parse(json));
  } catch {
    return [];
  }
}

function resumoDaMobilia(itens: ItemDeMobilia[]): string {
  if (itens.length === 0) return "";
  const total = totalDaMobilia(itens);
  return `${itens.length} ${itens.length === 1 ? "item" : "itens"}${total > 0 ? ` · ${formatBRL(total)}` : ""}`;
}

function dadosIniciais(a: RentalFurnitureAnnex | null): Dados {
  return {
    contrato: a?.contract_id ?? "",
    property_label: a?.property_label ?? "",
    mobilias: JSON.stringify(a ? itensValidos(a.items) : MOBILIAS_DO_MODELO),
    notes: a ? a.notes ?? "" : OBSERVACOES_DO_MODELO,
    signed_at: a?.signed_at ?? localDateISO(),
    city: a?.city ?? CIDADE_DO_ANEXO,
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Anexo em edição — null começa um novo. */
  anexo: RentalFurnitureAnnex | null;
  /** Todos os anexos: o novo começa com a mobília do último do mesmo imóvel. */
  anexos: RentalFurnitureAnnex[];
  contratos: RentalContractView[];
  /** O modelo do contrato de aluguel em uso: dele sai a qualificação do locador. */
  modeloAluguel: string | null;
}

export function AnexoMobiliaDialog({ open, onClose, anexo, anexos, contratos, modeloAluguel }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<Dados>(() => dadosIniciais(null));
  const [salvo, setSalvo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDados(dadosIniciais(anexo));
    setErro(null);
    setSalvo(null);
  }, [open, anexo]);

  const contrato = contratos.find((c) => c.id === dados.contrato) ?? null;

  /** Os contratos para escolher: os ativos primeiro, pelo nº do imóvel. */
  const ordenados = useMemo(
    () =>
      [...contratos].sort((a, b) =>
        a.status === b.status ? a.property_code - b.property_code : a.status === "ativo" ? -1 : 1
      ),
    [contratos]
  );

  /** A mobília do último anexo do imóvel deste contrato (de qualquer contrato dele). */
  function mobiliaDoImovel(c: RentalContractView): ItemDeMobilia[] | null {
    const doImovel = new Set(contratos.filter((x) => x.property_id === c.property_id).map((x) => x.id));
    const ultimo = [...anexos]
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .find((a) => doImovel.has(a.contract_id));
    const itens = ultimo ? itensValidos(ultimo.items) : [];
    return itens.length ? itens : null;
  }

  function escolherContrato(id: string) {
    const c = contratos.find((x) => x.id === id);
    if (!c) return;
    setDados((d) => ({
      ...d,
      contrato: id,
      // trocou de contrato num anexo novo: o tipo e a mobília vêm do imóvel dele
      property_label: anexo && d.property_label ? d.property_label : rotuloDoImovel(c),
      mobilias: anexo ? d.mobilias : JSON.stringify(mobiliaDoImovel(c) ?? MOBILIAS_DO_MODELO),
    }));
  }

  const passos = useMemo<Passo[]>(
    () => [
      {
        campo: "contrato",
        secao: "O contrato de aluguel",
        pergunta: "De qual contrato é o anexo?",
        tipo: "especial",
        obrigatorio: true,
        dica: "O locatário, o imóvel e o locador vêm do contrato — não precisa digitar nada.",
        mostrar: (v) => {
          const c = contratos.find((x) => x.id === v);
          return c ? `${c.tenant_name} · imóvel nº ${c.property_code}` : "—";
        },
        especial: (valor, _mudar, avancar) => (
          <EscolherContrato
            contratos={ordenados}
            valor={valor}
            onEscolher={(id) => {
              escolherContrato(id);
              setTimeout(avancar, 150);
            }}
          />
        ),
      },
      {
        campo: "property_label",
        secao: "O imóvel",
        pergunta: "Como o imóvel é chamado no anexo?",
        tipo: "texto",
        maiusculo: true,
        atalhos: ["KITNET", "CASA", "APARTAMENTO"],
        dica: 'Sai em "o imóvel, KITNET, situado na..." — o endereço vem do cadastro.',
      },
      {
        campo: "mobilias",
        secao: "A mobília",
        pergunta: "Os móveis e eletrodomésticos do imóvel",
        tipo: "especial",
        mostrar: (v) => resumoDaMobilia(lerItens(v)) || "nenhum item",
        especial: (valor, mudar) => <EditorDeMobilia valor={valor} onMudar={mudar} />,
      },
      {
        campo: "notes",
        secao: "Observações e assinatura",
        pergunta: "Observações gerais",
        tipo: "longo",
        dica: "Já vem o texto do modelo. Apagando tudo, a parte sai do anexo.",
      },
      { campo: "signed_at", secao: "Observações e assinatura", pergunta: "Data da entrega e assinatura", tipo: "data" },
      {
        campo: "city",
        secao: "Observações e assinatura",
        pergunta: "Cidade da assinatura",
        tipo: "texto",
        atalhos: [CIDADE_DO_ANEXO],
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordenados, anexo, anexos]
  );

  const fluxo = usePassoAPasso(passos, dados, open, !!anexo);
  const { passo, idx } = fluxo;

  const paraFolha = () => ({
    property_label: dados.property_label,
    items: lerItens(dados.mobilias),
    notes: dados.notes,
    city: dados.city,
    signed_at: dados.signed_at,
  });

  function salvar() {
    setErro(null);
    if (!contrato) {
      setErro("Escolha o contrato de aluguel.");
      return;
    }
    startTransition(async () => {
      const r = await salvarAnexoMobilia(anexo?.id ?? null, { contract_id: contrato.id, ...paraFolha() });
      const falha = actionError(r);
      if (falha || !r || "error" in r) {
        setErro(falha ?? "Erro ao salvar o anexo");
        return;
      }
      setSalvo(r.id);
    });
  }

  function apagar() {
    if (!anexo) return;
    if (!confirm("Apagar este anexo de mobília? Isso não tem volta.")) return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await apagarAnexoMobilia(anexo.id));
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
              <Sofa className="w-4 h-4" />
            </span>
            {salvo ? "Anexo salvo" : fluxo.naRevisao ? "Revisar o anexo" : "Anexo de mobília"}
          </DialogTitle>
        </DialogHeader>

        {salvo && contrato ? (
          <AnexoPronto
            id={salvo}
            montado={montarAnexo(paraFolha(), contrato, modeloAluguel)}
            inquilino={contrato.tenant_name}
            onFechar={onClose}
          />
        ) : passo ? (
          <PerguntaDoPasso
            passo={passo}
            idx={idx}
            total={fluxo.passos.length}
            valor={dados[passo.campo]}
            onMudar={(v) => setDados((d) => ({ ...d, [passo.campo]: v }))}
            onAvancar={fluxo.avancar}
            onVoltar={fluxo.voltar}
            onRevisao={fluxo.irParaRevisao}
            daRevisao={fluxo.daRevisao}
            rodape={
              passo.campo === "mobilias"
                ? "Toque num item para corrigir. A lista fica guardada: o próximo anexo deste imóvel começa com ela."
                : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            <RevisaoDosPassos
              passos={fluxo.passos}
              dados={dados}
              onEditar={fluxo.editar}
              topo={contrato ? <DoContrato c={contrato} /> : null}
            />

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
              </p>
            )}

            <DialogFooter className={STICKY_FOOTER}>
              {anexo && (
                <button
                  type="button"
                  onClick={apagar}
                  disabled={isPending}
                  aria-label="Apagar anexo"
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
                disabled={isPending || fluxo.faltando.length > 0}
                className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
              >
                {isPending ? "Salvando..." : "Salvar anexo"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Na revisão: o que veio do contrato, para conferir (corrige-se no contrato). */
function DoContrato({ c }: { c: RentalContractView }) {
  return (
    <div className="rounded-lg border border-produmar-100 bg-produmar-50/60 px-3 py-2 text-[12px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
      <p className="text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">VEM DO CONTRATO</p>
      <p>
        <span className="font-semibold text-slate-800 dark:text-slate-100">{c.tenant_name}</span>
        {c.tenant_document ? ` · CPF ${c.tenant_document}` : ""}
        {c.tenant_rg ? ` · RG ${c.tenant_rg}` : ""}
      </p>
      <p>
        Imóvel nº {c.property_code} · {[c.property_street, c.property_number, c.property_district].filter(Boolean).join(", ")}
      </p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
        Algum dado errado? Corrija no contrato (Imóveis → Contrato) e ele sai certo aqui.
      </p>
    </div>
  );
}

/** Salvo: o PDF pronto para compartilhar, e a folha para abrir e imprimir. */
function AnexoPronto({
  id,
  montado,
  inquilino,
  onFechar,
}: {
  id: string;
  montado: ReturnType<typeof montarAnexo>;
  inquilino: string;
  onFechar: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        <p className="text-sm text-slate-600 dark:text-slate-300">Anexo de mobília salvo — locatário {inquilino}.</p>
      </div>

      <CompartilharPdf chave={id + JSON.stringify(montado)} gerar={() => gerarAnexoMobiliaPdf(montado)} />

      <a
        href={`/imprimir/anexo-mobilia/${id}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 w-full h-12 rounded-md border border-produmar-200 dark:border-slate-700 text-base font-medium text-produmar-700 dark:text-produmar-300 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
      >
        <Printer className="w-4 h-4" />
        Abrir / imprimir o anexo
      </a>

      <Button type="button" variant="outline" onClick={onFechar} className="w-full h-11">
        Fechar
      </Button>
    </div>
  );
}

/** A lista dos contratos de aluguel, com busca pelo nome, rua ou nº do imóvel. */
function EscolherContrato({
  contratos,
  valor,
  onEscolher,
}: {
  contratos: RentalContractView[];
  valor: string;
  onEscolher: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const q = busca.trim().toUpperCase();
  const visiveis = q
    ? contratos.filter((c) =>
        `${c.tenant_name} ${c.property_code} ${c.property_name ?? ""} ${c.property_street ?? ""} ${c.property_district ?? ""}`
          .toUpperCase()
          .includes(q)
      )
    : contratos;

  if (contratos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700">
        Nenhum contrato de aluguel cadastrado. Cadastre o contrato do imóvel primeiro (aba Imóveis).
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          // Enter na busca não pode pular a pergunta sem escolher
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder="Buscar pelo nome, rua ou nº do imóvel..."
          className="w-full h-11 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-produmar-500"
        />
      </div>
      <div className="max-h-[45vh] overflow-y-auto space-y-1.5">
        {visiveis.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Nenhum contrato com essa busca.</p>
        ) : (
          visiveis.map((c) => (
            <button
              key={c.id}
              type="button"
              // no iPhone, com o teclado da busca aberto, o toque não pode se perder
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onEscolher(c.id)}
              className={cn(
                "w-full rounded-xl border px-3 py-2.5 text-left",
                valor === c.id
                  ? "border-produmar-600 bg-produmar-50 dark:bg-produmar-900/20"
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
              )}
            >
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                {c.tenant_name}
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {[
                  `Imóvel nº ${c.property_code}`,
                  c.property_name || [c.property_street, c.property_number].filter(Boolean).join(", "),
                  c.status === "encerrado" ? "encerrado" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A LISTA DE MOBÍLIA — por cômodo, com "Incluir mobília", retirar e corrigir.
// O item novo (ou corrigido) também é perguntado um campo por vez.
// ─────────────────────────────────────────────────────────────────────────────

const ETAPAS_DO_ITEM = ["comodo", "nome", "descricao", "estado", "valor"] as const;
type EtapaDoItem = (typeof ETAPAS_DO_ITEM)[number];

const PERGUNTA_DO_ITEM: Record<EtapaDoItem, { pergunta: string; placeholder: string }> = {
  comodo: { pergunta: "Em qual cômodo?", placeholder: "ex: VARANDA" },
  nome: { pergunta: "Qual o item?", placeholder: "ex: Micro-ondas" },
  descricao: { pergunta: "Como ele é? (marca, tamanho, cor)", placeholder: "ex: Electrolux 20 litros branco" },
  estado: { pergunta: "Em que estado?", placeholder: "ex: BOM" },
  valor: { pergunta: "Quanto vale? (R$)", placeholder: "0,00" },
};

type Rascunho = Record<EtapaDoItem, string>;

function EditorDeMobilia({ valor, onMudar }: { valor: string; onMudar: (v: string) => void }) {
  const itens = useMemo(() => lerItens(valor), [valor]);
  const grupos = useMemo(() => agruparPorComodo(itens), [itens]);
  /** null = só a lista; número = corrigindo esse item; -1 = item novo. */
  const [editando, setEditando] = useState<number | null>(null);
  const [retirado, setRetirado] = useState<{ item: ItemDeMobilia; indice: number } | null>(null);

  const comodos = useMemo(
    () => Array.from(new Set([...COMODOS_DO_MODELO, ...grupos.map((g) => g.comodo)])),
    [grupos]
  );

  function gravar(lista: ItemDeMobilia[]) {
    onMudar(JSON.stringify(lista));
  }

  function retirar(indice: number) {
    setRetirado({ item: itens[indice], indice });
    gravar(itens.filter((_, i) => i !== indice));
  }

  function desfazer() {
    if (!retirado) return;
    const lista = [...itens];
    lista.splice(Math.min(retirado.indice, lista.length), 0, retirado.item);
    gravar(lista);
    setRetirado(null);
  }

  if (editando !== null) {
    const atual = editando >= 0 ? itens[editando] : null;
    return (
      <ItemPassoAPasso
        comodos={comodos}
        inicial={
          atual
            ? {
                comodo: atual.comodo,
                nome: atual.nome,
                descricao: atual.descricao,
                estado: atual.estado,
                valor: atual.valor > 0 ? reaisDoItem(atual.valor) : "",
              }
            : { comodo: "", nome: "", descricao: "", estado: "BOM", valor: "" }
        }
        novo={!atual}
        onCancelar={() => setEditando(null)}
        onPronto={(r) => {
          const item: ItemDeMobilia = {
            comodo: r.comodo.trim().toUpperCase() || "OUTROS",
            nome: r.nome.trim(),
            descricao: r.descricao.trim(),
            estado: r.estado.trim().toUpperCase(),
            valor: lerReais(r.valor),
          };
          if (atual) gravar(itens.map((x, i) => (i === editando ? item : x)));
          else gravar([...itens, item]);
          setRetirado(null);
          setEditando(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {retirado && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <span className="truncate">Retirado: {retirado.item.nome || retirado.item.descricao}</span>
          <button
            type="button"
            onClick={desfazer}
            className="flex items-center gap-1 font-semibold text-produmar-600 dark:text-produmar-400"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Desfazer
          </button>
        </div>
      )}

      {grupos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700">
          Nenhum item na lista.
        </p>
      ) : (
        grupos.map((g, n) => (
          <div key={g.comodo} className="space-y-1">
            <p className="text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
              {n + 1}. {g.comodo}
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              {g.itens.map(({ item, indice }) => (
                <div key={indice} className="flex items-stretch bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setEditando(indice)}
                    className="flex-1 min-w-0 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span className="block text-sm text-slate-800 dark:text-slate-100 break-words">
                      <span className="font-semibold">{item.nome}</span>
                      {item.descricao ? `: ${item.descricao}` : ""}
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      {[item.estado && `Estado: ${item.estado}`, item.valor > 0 && formatBRL(item.valor)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => retirar(indice)}
                    aria-label={`Retirar ${item.nome}`}
                    className="px-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex flex-col items-center justify-center gap-0.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-[10px] font-medium">Retirar</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <button
        type="button"
        onClick={() => {
          setRetirado(null);
          setEditando(-1);
        }}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-dashed border-produmar-300 text-sm font-semibold text-produmar-700 dark:border-produmar-700 dark:text-produmar-300"
      >
        <Plus className="w-4 h-4" />
        Incluir mobília
      </button>

      {itens.length > 0 && (
        <p className="text-[12px] text-slate-500 dark:text-slate-400 text-right">
          {resumoDaMobilia(itens)} no total
        </p>
      )}
    </div>
  );
}

/** O item novo (ou corrigido), uma pergunta por vez, sempre no mesmo campo. */
function ItemPassoAPasso({
  comodos,
  inicial,
  novo,
  onCancelar,
  onPronto,
}: {
  comodos: string[];
  inicial: Rascunho;
  novo: boolean;
  onCancelar: () => void;
  onPronto: (r: Rascunho) => void;
}) {
  const [r, setR] = useState<Rascunho>(inicial);
  const [etapa, setEtapa] = useState(0);
  const campoRef = useRef<HTMLInputElement | null>(null);
  const chave = ETAPAS_DO_ITEM[etapa];
  const ultima = etapa === ETAPAS_DO_ITEM.length - 1;
  const atalhos = chave === "comodo" ? comodos : chave === "estado" ? ESTADOS_DA_MOBILIA : [];

  useEffect(() => {
    const t = setTimeout(() => campoRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [etapa]);

  function seguir(atual: Rascunho = r) {
    if (ultima) {
      if (!atual.nome.trim() && !atual.descricao.trim()) {
        setEtapa(ETAPAS_DO_ITEM.indexOf("nome"));
        return;
      }
      onPronto(atual);
    } else setEtapa((e) => e + 1);
  }

  function mudar(v: string) {
    setR((x) => ({ ...x, [chave]: chave === "valor" ? formatBRLInput(v) : v }));
  }

  return (
    <div className="space-y-3 rounded-xl border border-produmar-200 bg-produmar-50/40 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span className="font-semibold tracking-wide">{novo ? "INCLUIR MOBÍLIA" : "CORRIGIR ITEM"}</span>
        <span className="tabular-nums">
          {etapa + 1} de {ETAPAS_DO_ITEM.length}
        </span>
      </div>

      <label htmlFor="mobilia_campo" className="block text-base font-semibold text-slate-800 dark:text-slate-100">
        {PERGUNTA_DO_ITEM[chave].pergunta}
      </label>

      {/* sempre o mesmo campo: o teclado do iPhone fica aberto de uma pergunta para a outra */}
      <input
        id="mobilia_campo"
        ref={campoRef}
        type="text"
        value={r[chave]}
        onChange={(e) => mudar(e.target.value)}
        onKeyDown={(e) => {
          // o Enter daqui não pode enviar o formulário de fora (que pula a pergunta)
          if (e.key === "Enter") {
            e.preventDefault();
            seguir();
          }
        }}
        placeholder={PERGUNTA_DO_ITEM[chave].placeholder}
        inputMode={chave === "valor" ? "decimal" : "text"}
        enterKeyHint={ultima ? "done" : "next"}
        autoComplete="off"
        autoCapitalize={chave === "comodo" || chave === "estado" ? "characters" : "sentences"}
        className={cn(
          "w-full h-12 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-produmar-500",
          (chave === "comodo" || chave === "estado") && "uppercase placeholder:normal-case",
          chave === "valor" && "tabular-nums font-semibold"
        )}
      />

      {atalhos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {atalhos.map((a) => (
            <button
              key={a}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const novoR = { ...r, [chave]: a };
                setR(novoR);
                setTimeout(() => seguir(novoR), 120);
              }}
              className={cn(
                "min-h-[40px] px-3 rounded-xl border text-[13px] font-semibold transition-colors",
                r[chave] === a
                  ? "bg-produmar-600 border-produmar-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
              )}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => (etapa === 0 ? onCancelar() : setEtapa((e) => e - 1))}
          className="h-11 px-3"
          aria-label={etapa === 0 ? "Cancelar" : "Voltar"}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button type="button" onClick={() => seguir()} className="h-11 flex-1">
          {ultima ? (novo ? "Incluir na lista" : "Salvar item") : r[chave].trim() ? "Próximo" : "Pular"}
        </Button>
      </div>
      <button
        type="button"
        onClick={onCancelar}
        className="w-full text-center text-[11px] font-medium text-slate-500 underline underline-offset-2"
      >
        Cancelar e voltar à lista
      </button>
    </div>
  );
}
