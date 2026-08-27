"use client";

import { useMemo, useState } from "react";
import { HardHat, Plus, Search, Wallet, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/utils";
import { ObraDialog } from "./obra-dialog";
import { ObraDetailDialog } from "./obra-detail-dialog";
import { ObrasEstoqueTab } from "./obras-estoque-tab";
import { EmptyState, OBRA_STATUS_META } from "./obra-shared";
import type {
  Contact,
  ObraItem,
  ObraStatus,
  ObraSummary,
  SupplyFenceRunView,
  SupplyLocal,
  SupplyObraSector,
  SupplyObraUsage,
} from "@/lib/types";

export type ObraTransactionRow = {
  id: string;
  type: "entrada" | "saida";
  description: string;
  amount: number;
  due_date: string;
  status: string;
  obra_id: string | null;
};

export type ObraServiceOrderRow = {
  id: string;
  order_number: number;
  type: string;
  status: string;
  total_amount: number | null;
  client_name: string | null;
  obra_id: string | null;
};

export type ObraToolLoanRow = {
  id: string;
  borrower_name: string;
  destination: string | null;
  checked_out_at: string;
  returned_at: string | null;
  obra_id: string | null;
  tools: { name: string; code: string | null } | null;
};

interface Props {
  obras: ObraSummary[];
  contacts: Contact[];
  items: ObraItem[];
  transactions: ObraTransactionRow[];
  serviceOrders: ObraServiceOrderRow[];
  toolLoans: ObraToolLoanRow[];
  /** Obras DO ESTOQUE (supply_obras) — a aba que veio do módulo Estoque. */
  supplyObras?: SupplyObraUsage[];
  /** Setores dessas obras — o "Setor aplicado" que o técnico escolhe. */
  supplySectors?: SupplyObraSector[];
  /** Locais onde as obras acontecem — Fazenda 01, Sítio... (migration 066). */
  supplyLocais?: SupplyLocal[];
  /** Metros de cerca — o detalhe da obra mostra o resumo por setor. */
  supplyFenceRuns?: SupplyFenceRunView[];
}

type StatusFilter = "todas" | ObraStatus;
/** As duas listas de obra do sistema — hoje a tela só mostra a do Estoque. */
type Tab = "obras" | "estoque";

export function ObrasPageClient({
  obras,
  contacts,
  items,
  transactions,
  serviceOrders,
  toolLoans,
  supplyObras = [],
  supplySectors = [],
  supplyLocais = [],
  supplyFenceRuns = [],
}: Props) {
  // Só existe uma lista de obra na tela: a que veio do Estoque.
  const [tab] = useState<Tab>("estoque");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todas");

  const [obraDialogOpen, setObraDialogOpen] = useState(false);
  const [editObra, setEditObra] = useState<ObraSummary | null>(null);
  const [detailObraId, setDetailObraId] = useState<string | null>(null);

  const contactsById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const detailObra = useMemo(
    () => (detailObraId ? obras.find((o) => o.id === detailObraId) ?? null : null),
    [detailObraId, obras]
  );
  const detailItems = useMemo(
    () => (detailObraId ? items.filter((i) => i.obra_id === detailObraId) : []),
    [detailObraId, items]
  );
  const detailTransactions = useMemo(
    () => (detailObraId ? transactions.filter((t) => t.obra_id === detailObraId) : []),
    [detailObraId, transactions]
  );
  const detailServiceOrders = useMemo(
    () => (detailObraId ? serviceOrders.filter((s) => s.obra_id === detailObraId) : []),
    [detailObraId, serviceOrders]
  );
  const detailToolLoans = useMemo(
    () => (detailObraId ? toolLoans.filter((l) => l.obra_id === detailObraId) : []),
    [detailObraId, toolLoans]
  );

  const countBy = useMemo(() => {
    const c: Record<ObraStatus, number> = {
      planejamento: 0,
      em_andamento: 0,
      concluida: 0,
      cancelada: 0,
    };
    for (const o of obras) if (o.active) c[o.status]++;
    return c;
  }, [obras]);

  const activeObras = useMemo(() => obras.filter((o) => o.active), [obras]);

  const totalCost = useMemo(
    () => activeObras.reduce((sum, o) => sum + Number(o.total_cost), 0),
    [activeObras]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return activeObras.filter((o) => {
      if (statusFilter !== "todas" && o.status !== statusFilter) return false;
      if (!q) return true;
      const client = o.contact_id ? contactsById.get(o.contact_id)?.name ?? "" : "";
      return (
        o.name.includes(q) ||
        (o.location ?? "").includes(q) ||
        client.toUpperCase().includes(q)
      );
    });
  }, [activeObras, search, statusFilter, contactsById]);

  function openEdit(o: ObraSummary) {
    setEditObra(o);
    setObraDialogOpen(true);
  }

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: "todas", label: "Todas" },
    { value: "planejamento", label: "Planejamento" },
    { value: "em_andamento", label: "Em andamento" },
    { value: "concluida", label: "Concluídas" },
    { value: "cancelada", label: "Canceladas" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Obras</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            Cadastro, setores e material aplicado
          </p>
        </div>
      </div>

      {/*
        Lista antiga do cadastro (public.obras): ficou sem porta de entrada, porque a
        tela agora mostra só as obras do Estoque. O código segue aqui porque o
        seletor de obra de Contas, Ferramentas e Operações ainda aponta pra essa
        tabela — é só devolver a aba se um dia precisar cadastrar de novo.
      */}
      {tab === "obras" && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2">
            <KpiCard
              icon={HardHat}
              label="Em andamento"
              value={String(countBy.em_andamento)}
              tone="produmar"
            />
            <KpiCard
              icon={ListChecks}
              label="Planejamento"
              value={String(countBy.planejamento)}
              tone="amber"
            />
            <KpiCard
              icon={Wallet}
              label="Total gasto"
              value={formatBRL(totalCost)}
              tone="emerald"
            />
          </div>

          {/* Busca + filtro por status */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, local ou cliente..."
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

            {filtered.length === 0 ? (
              activeObras.length === 0 ? (
                <EmptyState
                  icon={HardHat}
                  text="Nenhuma obra cadastrada ainda."
                  hint="Cadastre a primeira para acompanhar custos."
                  action={
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditObra(null);
                        setObraDialogOpen(true);
                      }}
                    >
                      <Plus className="w-4 h-4" /> Nova obra
                    </Button>
                  }
                />
              ) : (
                <EmptyState icon={Search} text="Nada encontrado com esse filtro." />
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((o) => (
                  <ObraCard
                    key={o.id}
                    obra={o}
                    clientName={
                      o.contact_id ? contactsById.get(o.contact_id)?.name ?? null : null
                    }
                    onOpen={() => setDetailObraId(o.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <ObrasEstoqueTab
        obras={supplyObras}
        sectors={supplySectors}
        locais={supplyLocais}
        fenceRuns={supplyFenceRuns}
      />

      {/* Dialogs */}
      <ObraDialog
        open={obraDialogOpen}
        onClose={() => setObraDialogOpen(false)}
        obra={editObra}
        contacts={contacts}
      />
      <ObraDetailDialog
        open={!!detailObra}
        onClose={() => setDetailObraId(null)}
        obra={detailObra}
        clientName={
          detailObra?.contact_id ? contactsById.get(detailObra.contact_id)?.name ?? null : null
        }
        items={detailItems}
        transactions={detailTransactions}
        serviceOrders={detailServiceOrders}
        toolLoans={detailToolLoans}
        onEdit={(o) => {
          setDetailObraId(null);
          openEdit(o);
        }}
      />
    </div>
  );
}

// ── Card de obra ─────────────────────────────────────────────────────────────
function ObraCard({
  obra,
  clientName,
  onOpen,
}: {
  obra: ObraSummary;
  clientName: string | null;
  onOpen: () => void;
}) {
  const meta = OBRA_STATUS_META[obra.status];
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
            {obra.name}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            #{obra.obra_number}
            {clientName ? ` · ${clientName}` : ""}
            {obra.location ? ` · ${obra.location}` : ""}
          </p>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${meta.chip}`}
        >
          {meta.label}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          {obra.os_count} OS · {obra.tools_in_use} ferram. em uso
        </span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          {formatBRL(Number(obra.total_cost))}
        </span>
      </div>
      {Number(obra.total_savings) > 0 && (
        <div className="mt-1 flex items-center justify-end text-[11px] text-emerald-600 dark:text-emerald-400">
          economia de {formatBRL(Number(obra.total_savings))}
        </div>
      )}
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
