"use client";

import { useMemo, useState } from "react";
import {
  Wrench,
  Plus,
  Search,
  ArrowRightLeft,
  Undo2,
  CheckCircle2,
  Hammer,
  History,
  AlertTriangle,
  Ban,
  TrendingUp,
  TrendingDown,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL, formatDate, daysUntil } from "@/lib/utils";
import { undoWriteoff } from "@/app/(app)/ferramentas/actions";
import { ToolDialog } from "./tool-dialog";
import { CheckoutDialog } from "./checkout-dialog";
import { ReturnDialog, type ReturnTarget } from "./return-dialog";
import { WriteoffDialog } from "./writeoff-dialog";
import {
  OpenMaintenanceDialog,
  FinishMaintenanceDialog,
  type FinishTarget,
} from "./maintenance-dialog";
import { ToolDetailDialog } from "./tool-detail-dialog";
import { CONDITION_LABELS, STATUS_META, fmtDateTime, lossValue } from "./tool-shared";
import type {
  Obra,
  ToolLoan,
  ToolMaintenance,
  ToolStatus,
  ToolUnit,
  ToolWithStatus,
  ToolWriteoff,
} from "@/lib/types";

// ── Tipos das linhas com joins ────────────────────────────────────────────────
export type LoanRow = ToolLoan & {
  tools: { name: string; code: string | null } | null;
};

export type MaintenanceRow = ToolMaintenance & {
  tools: { name: string; code: string | null } | null;
};

export type WriteoffRow = ToolWriteoff & {
  tools: {
    name: string;
    code: string | null;
    unit: string;
    unit_value: number;
    replacement_value: number;
  } | null;
};

interface Props {
  tools: ToolWithStatus[];
  loans: LoanRow[];
  maintenance: MaintenanceRow[];
  writeoffs: WriteoffRow[];
  units: ToolUnit[];
  obras?: Obra[];
}

type Tab = "ferramentas" | "em_uso" | "manutencao" | "historico";
type StatusFilter = "todas" | ToolStatus;

export function FerramentasPageClient({
  tools,
  loans,
  maintenance,
  writeoffs,
  units,
  obras = [],
}: Props) {
  const [tab, setTab] = useState<Tab>("ferramentas");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todas");

  // dialogs
  const [toolDialogOpen, setToolDialogOpen] = useState(false);
  const [editTool, setEditTool] = useState<ToolWithStatus | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPresetId, setCheckoutPresetId] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
  const [writeoffTool, setWriteoffTool] = useState<ToolWithStatus | null>(null);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenancePresetId, setMaintenancePresetId] = useState<string | null>(null);
  const [finishTarget, setFinishTarget] = useState<FinishTarget | null>(null);
  const [detailToolId, setDetailToolId] = useState<string | null>(null);

  // O detalhe deriva do id — assim a tela reflete os dados recarregados do servidor
  const detailTool = useMemo(
    () => (detailToolId ? tools.find((t) => t.id === detailToolId) ?? null : null),
    [detailToolId, tools]
  );
  const detailLoans = useMemo(
    () => (detailToolId ? loans.filter((l) => l.tool_id === detailToolId) : []),
    [detailToolId, loans]
  );
  const detailMaintenance = useMemo(
    () => (detailToolId ? maintenance.filter((m) => m.tool_id === detailToolId) : []),
    [detailToolId, maintenance]
  );
  const detailWriteoffs = useMemo(
    () => (detailToolId ? writeoffs.filter((w) => w.tool_id === detailToolId) : []),
    [detailToolId, writeoffs]
  );

  // itens com saldo disponível para baixar / inutilizar / manutenção
  const availableTools = useMemo(
    () => tools.filter((t) => t.status === "disponivel"),
    [tools]
  );

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const countBy = useMemo(() => {
    const c: Record<ToolStatus, number> = { disponivel: 0, em_uso: 0, manutencao: 0, baixada: 0 };
    for (const t of tools) c[t.status]++;
    return c;
  }, [tools]);

  // retiradas em aberto (uma linha por baixa)
  const openLoans = useMemo(() => loans.filter((l) => !l.returned_at), [loans]);
  const openMaintenanceRows = useMemo(
    () => maintenance.filter((m) => !m.finished_at),
    [maintenance]
  );

  // ── Resumo financeiro ─────────────────────────────────────────────────────────
  const invested = useMemo(
    () => tools.reduce((sum, t) => sum + t.quantity * t.unit_value, 0),
    [tools]
  );
  const losses = useMemo(
    () => writeoffs.reduce((sum, w) => sum + lossValue(w.quantity, w.tools), 0),
    [writeoffs]
  );

  // ── Filtro da lista de patrimônio ────────────────────────────────────────────
  const filteredTools = useMemo(() => {
    const q = search.trim().toUpperCase();
    return tools.filter((t) => {
      if (statusFilter === "todas" ? t.status === "baixada" : t.status !== statusFilter)
        return false;
      if (!q) return true;
      return (
        t.name.includes(q) ||
        (t.code ?? "").includes(q) ||
        (t.current_borrower ?? "").includes(q)
      );
    });
  }, [tools, search, statusFilter]);

  // ── Ações auxiliares ────────────────────────────────────────────────────────
  function openCheckout(tool?: ToolWithStatus) {
    setCheckoutPresetId(tool?.id ?? null);
    setCheckoutOpen(true);
  }
  function openReturn(tool: ToolWithStatus) {
    if (!tool.open_loan_id) return;
    setReturnTarget({
      loanId: tool.open_loan_id,
      toolName: tool.name,
      borrower: tool.current_borrower ?? "—",
      condition: tool.condition,
    });
  }
  function openReturnForLoan(loan: LoanRow) {
    const t = tools.find((x) => x.id === loan.tool_id);
    setReturnTarget({
      loanId: loan.id,
      toolName: loan.tools?.name ?? "—",
      borrower: loan.borrower_name,
      condition: t?.condition ?? "bom",
    });
  }
  function openMaintenanceFor(tool?: ToolWithStatus) {
    setMaintenancePresetId(tool?.id ?? null);
    setMaintenanceOpen(true);
  }
  function openFinish(tool: ToolWithStatus) {
    if (!tool.open_maintenance_id) return;
    setFinishTarget({
      maintenanceId: tool.open_maintenance_id,
      toolName: tool.name,
      description: tool.open_maintenance_description ?? "",
    });
  }
  function openEdit(tool: ToolWithStatus) {
    setEditTool(tool);
    setToolDialogOpen(true);
  }

  const tabs: {
    value: Tab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count: number;
  }[] = [
    {
      value: "ferramentas",
      label: "Patrim.",
      icon: Hammer,
      count: tools.filter((t) => t.status !== "baixada").length,
    },
    { value: "em_uso", label: "Em uso", icon: ArrowRightLeft, count: openLoans.length },
    { value: "manutencao", label: "Manut.", icon: Wrench, count: openMaintenanceRows.length },
    {
      value: "historico",
      label: "Histórico",
      icon: History,
      count: loans.length + maintenance.length + writeoffs.length,
    },
  ];

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: "todas", label: "Todos" },
    { value: "disponivel", label: "Disponíveis" },
    { value: "em_uso", label: "Em uso" },
    { value: "manutencao", label: "Manutenção" },
    { value: "baixada", label: "Inutilizados" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            Patrimônio
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Controle de saldo, valor e inutilizações
          </p>
        </div>
        <Button
          onClick={() => {
            setEditTool(null);
            setToolDialogOpen(true);
          }}
          className="flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo
        </Button>
      </div>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard
          icon={TrendingUp}
          label="Investido"
          value={formatBRL(invested)}
          tone="emerald"
        />
        <SummaryCard icon={TrendingDown} label="Perdas" value={formatBRL(losses)} tone="red" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <KpiCard
          icon={CheckCircle2}
          label="Disponíveis"
          value={String(countBy.disponivel)}
          tone="emerald"
        />
        <KpiCard
          icon={ArrowRightLeft}
          label="Em uso"
          value={String(countBy.em_uso)}
          tone="produmar"
        />
        <KpiCard
          icon={Wrench}
          label="Manutenção"
          value={String(countBy.manutencao)}
          tone="amber"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-md transition-colors ${
                tab === t.value
                  ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[11px] font-medium leading-none flex items-center gap-1">
                {t.label}
                <span className="opacity-50">{t.count}</span>
              </span>
            </button>
          );
        })}
      </div>

      {tab === "ferramentas" && (
        <div className="space-y-3">
          {/* Busca + filtro por status */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, código ou quem pegou..."
              className="pl-9"
              autoComplete="off"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  statusFilter === f.value
                    ? "bg-produmar-600 border-produmar-600 text-white"
                    : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                {f.label}
                {f.value !== "todas" && (
                  <span className="opacity-60 ml-1">{countBy[f.value]}</span>
                )}
              </button>
            ))}
          </div>

          {filteredTools.length === 0 ? (
            tools.length === 0 ? (
              <EmptyState
                icon={Hammer}
                text="Nenhum patrimônio cadastrado ainda."
                hint="Cadastre o primeiro para começar o controle."
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditTool(null);
                      setToolDialogOpen(true);
                    }}
                  >
                    <Plus className="w-4 h-4" /> Novo
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={Search} text="Nada encontrado com esse filtro." />
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTools.map((t) => (
                <ToolCard
                  key={t.id}
                  tool={t}
                  onOpen={() => setDetailToolId(t.id)}
                  onCheckout={() => openCheckout(t)}
                  onWriteoff={() => setWriteoffTool(t)}
                  onReturn={() => openReturn(t)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "em_uso" && (
        <EmUsoTab loans={openLoans} onCheckout={() => openCheckout()} onReturn={openReturnForLoan} />
      )}

      {tab === "manutencao" && (
        <ManutencaoTab
          rows={openMaintenanceRows}
          tools={tools}
          onNew={() => openMaintenanceFor()}
          onFinish={(row) =>
            setFinishTarget({
              maintenanceId: row.id,
              toolName: row.tools?.name ?? "—",
              description: row.description,
            })
          }
        />
      )}

      {tab === "historico" && (
        <HistoricoTab loans={loans} maintenance={maintenance} writeoffs={writeoffs} />
      )}

      {/* Dialogs */}
      <ToolDialog
        open={toolDialogOpen}
        onClose={() => setToolDialogOpen(false)}
        tool={editTool}
        units={units}
      />
      <CheckoutDialog
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        availableTools={availableTools}
        presetToolId={checkoutPresetId}
        obras={obras}
      />
      <ReturnDialog
        open={!!returnTarget}
        onClose={() => setReturnTarget(null)}
        target={returnTarget}
      />
      <WriteoffDialog
        open={!!writeoffTool}
        onClose={() => setWriteoffTool(null)}
        tool={writeoffTool}
      />
      <OpenMaintenanceDialog
        open={maintenanceOpen}
        onClose={() => setMaintenanceOpen(false)}
        availableTools={availableTools}
        presetToolId={maintenancePresetId}
      />
      <FinishMaintenanceDialog
        open={!!finishTarget}
        onClose={() => setFinishTarget(null)}
        target={finishTarget}
      />
      <ToolDetailDialog
        open={!!detailTool}
        onClose={() => setDetailToolId(null)}
        tool={detailTool}
        loans={detailLoans}
        maintenance={detailMaintenance}
        writeoffs={detailWriteoffs}
        obras={obras}
        onEdit={(t) => {
          setDetailToolId(null);
          openEdit(t);
        }}
        onCheckout={(t) => {
          setDetailToolId(null);
          openCheckout(t);
        }}
        onWriteoff={(t) => {
          setDetailToolId(null);
          setWriteoffTool(t);
        }}
        onReturn={(t) => {
          setDetailToolId(null);
          openReturn(t);
        }}
        onMaintenance={(t) => {
          setDetailToolId(null);
          openMaintenanceFor(t);
        }}
        onFinishMaintenance={(t) => {
          setDetailToolId(null);
          openFinish(t);
        }}
      />
    </div>
  );
}

// ── Card de patrimônio ───────────────────────────────────────────────────────
function ToolCard({
  tool,
  onOpen,
  onCheckout,
  onWriteoff,
  onReturn,
}: {
  tool: ToolWithStatus;
  onOpen: () => void;
  onCheckout: () => void;
  onWriteoff: () => void;
  onReturn: () => void;
}) {
  const meta = STATUS_META[tool.status];
  const late =
    tool.status === "em_uso" &&
    tool.current_expected_return_date &&
    daysUntil(tool.current_expected_return_date) < 0;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 cursor-pointer transition-all hover:shadow-md hover:border-produmar-200 dark:hover:border-produmar-800 active:bg-slate-50 dark:active:bg-slate-800/60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {tool.name}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            #{tool.tool_number}
            {tool.code ? ` · ${tool.code}` : ""} · {CONDITION_LABELS[tool.condition]}
          </p>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${meta.chip}`}
        >
          {meta.label}
        </span>
      </div>

      {/* Linha de saldo (só quando há mais de uma unidade) */}
      {tool.quantity > 1 && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {tool.available_qty} disp.
          </span>
          {tool.in_use_qty > 0 ? ` · ${tool.in_use_qty} em uso` : ""}
          {tool.written_off_qty > 0 ? ` · ${tool.written_off_qty} inutil.` : ""}
          {` de ${tool.quantity} ${tool.unit}`}
        </p>
      )}

      {tool.status === "em_uso" && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate">
          Com <span className="font-medium text-slate-700 dark:text-slate-200">{tool.current_borrower}</span>
          {tool.current_destination ? ` · ${tool.current_destination}` : ""}
          {tool.current_checked_out_at ? ` · desde ${formatDate(tool.current_checked_out_at)}` : ""}
        </p>
      )}
      {late && (
        <p className="mt-1 text-[11px] text-red-500 font-medium flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Devolução atrasada ({formatDate(tool.current_expected_return_date!)})
        </p>
      )}
      {tool.status === "manutencao" && tool.open_maintenance_description && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate">
          {tool.open_maintenance_description}
        </p>
      )}

      {tool.status === "disponivel" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCheckout();
            }}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-2 rounded-lg bg-produmar-600 hover:bg-produmar-700 text-white transition-colors"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Baixar
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onWriteoff();
            }}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
          >
            <Ban className="w-3.5 h-3.5" />
            Inutilizar
          </button>
        </div>
      )}
      {tool.status === "em_uso" && (
        <div className="mt-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReturn();
            }}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Devolver
          </button>
        </div>
      )}
    </div>
  );
}

// ── Aba: Em uso (cada retirada em aberto) ────────────────────────────────────
function EmUsoTab({
  loans,
  onCheckout,
  onReturn,
}: {
  loans: LoanRow[];
  onCheckout: () => void;
  onReturn: (loan: LoanRow) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onCheckout}>
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Nova baixa
        </Button>
      </div>

      {loans.length === 0 ? (
        <EmptyState
          icon={ArrowRightLeft}
          text="Nenhuma retirada em aberto."
          hint="Tudo devolvido — registre uma baixa quando alguém pegar algo."
        />
      ) : (
        <div className="space-y-2">
          {loans.map((l) => {
            const late =
              l.expected_return_date && daysUntil(l.expected_return_date) < 0;
            return (
              <div
                key={l.id}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Hammer className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {l.quantity > 1 ? `${l.quantity}× ` : ""}
                    {l.tools?.name ?? "—"}
                    {l.tools?.code ? (
                      <span className="text-[11px] text-slate-400 font-normal ml-1.5">{l.tools.code}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    Com <span className="font-medium">{l.borrower_name}</span>
                    {l.destination ? ` · ${l.destination}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {l.checked_out_at ? `Desde ${fmtDateTime(l.checked_out_at)}` : ""}
                    {l.expected_return_date && (
                      <span className={late ? "text-red-500 font-medium" : ""}>
                        {" "}
                        · devolução {formatDate(l.expected_return_date)}
                        {late ? " (atrasada)" : ""}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => onReturn(l)}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex-shrink-0"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Devolver
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Aba: Manutenção ──────────────────────────────────────────────────────────
function ManutencaoTab({
  rows,
  tools,
  onNew,
  onFinish,
}: {
  rows: MaintenanceRow[];
  tools: ToolWithStatus[];
  onNew: () => void;
  onFinish: (row: MaintenanceRow) => void;
}) {
  const hasAvailable = tools.some((t) => t.status === "disponivel");
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onNew} disabled={!hasAvailable}>
          <Wrench className="w-3.5 h-3.5" />
          Nova manutenção
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Wrench}
          text="Nenhum item em manutenção."
          hint="Envie um item para manutenção quando precisar de conserto."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {m.tools?.name ?? "—"}
                  {m.tools?.code ? (
                    <span className="text-[11px] text-slate-400 font-normal ml-1.5">
                      {m.tools.code}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {m.description}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Desde {formatDate(m.started_at)}
                  {m.notes ? ` · ${m.notes}` : ""}
                </p>
              </div>
              <button
                onClick={() => onFinish(m)}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-produmar-600 hover:bg-produmar-700 text-white flex-shrink-0"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Concluir
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Aba: Histórico (baixas + manutenções + inutilizações) ────────────────────
function HistoricoTab({
  loans,
  maintenance,
  writeoffs,
}: {
  loans: LoanRow[];
  maintenance: MaintenanceRow[];
  writeoffs: WriteoffRow[];
}) {
  const [pending, setPending] = useState<string | null>(null);

  async function handleUndo(id: string) {
    if (!confirm("Desfazer esta inutilização? O saldo é reposto.")) return;
    setPending(id);
    await undoWriteoff(id);
    setPending(null);
  }

  const events = useMemo(() => {
    const list: { key: string; date: string; node: React.ReactNode }[] = [
      ...loans.map((l) => ({
        key: `loan-${l.id}`,
        date: l.checked_out_at,
        node: (
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-produmar-50 dark:bg-produmar-900/30 flex items-center justify-center flex-shrink-0">
              <ArrowRightLeft className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                {l.quantity > 1 ? `${l.quantity}× ` : ""}
                {l.tools?.name ?? "—"} · {l.borrower_name}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {fmtDateTime(l.checked_out_at)}
                {l.destination ? ` · ${l.destination}` : ""}
              </p>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
                l.returned_at
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : "bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-300"
              }`}
            >
              {l.returned_at ? `devolvida ${formatDate(l.returned_at)}` : "em uso"}
            </span>
          </div>
        ),
      })),
      ...maintenance.map((m) => ({
        key: `mnt-${m.id}`,
        date: m.created_at,
        node: (
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                {m.tools?.name ?? "—"} · {m.description}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {formatDate(m.started_at)}
                {Number(m.cost) > 0 ? ` · ${formatBRL(Number(m.cost))}` : ""}
              </p>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
                m.finished_at
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
              }`}
            >
              {m.finished_at ? `concluída ${formatDate(m.finished_at)}` : "em andamento"}
            </span>
          </div>
        ),
      })),
      ...writeoffs.map((w) => ({
        key: `wo-${w.id}`,
        date: w.created_at,
        node: (
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <Ban className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                {w.quantity > 1 ? `${w.quantity}× ` : ""}
                {w.tools?.name ?? "—"}
                {w.reason ? ` · ${w.reason}` : ""}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {fmtDateTime(w.created_at)}
                {lossValue(w.quantity, w.tools) > 0
                  ? ` · perda ${formatBRL(lossValue(w.quantity, w.tools))}`
                  : ""}
              </p>
            </div>
            <button
              onClick={() => handleUndo(w.id)}
              disabled={pending === w.id}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-produmar-600 dark:text-slate-400 dark:hover:text-produmar-400 flex-shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Desfazer
            </button>
          </div>
        ),
      })),
    ];
    return list.sort((a, b) => (a.date < b.date ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, maintenance, writeoffs, pending]);

  if (events.length === 0) {
    return (
      <EmptyState
        icon={History}
        text="Nenhum registro ainda."
        hint="Baixas, devoluções, manutenções e inutilizações aparecem aqui."
      />
    );
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {events.map((e) => (
        <div key={e.key}>{e.node}</div>
      ))}
    </div>
  );
}

// ── Resumo card ───────────────────────────────────────────────────────────────
function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "emerald" | "red";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    red: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tones}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums truncate">
          {value}
        </p>
      </div>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "produmar" | "emerald" | "amber";
}) {
  const tones = {
    produmar: "bg-produmar-50 text-produmar-600 dark:bg-produmar-900/30 dark:text-produmar-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 flex flex-col items-center text-center gap-1">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tones}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-base font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
        {value}
      </p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({
  icon: Icon,
  text,
  hint,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
      <Icon className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>
      {hint && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
