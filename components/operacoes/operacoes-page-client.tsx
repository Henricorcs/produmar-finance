"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Printer,
  Trash2,
  Truck,
  Wrench,
  User,
  Building2,
  FileText,
  Receipt,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ServiceOrderDialog } from "./service-order-dialog";
import {
  deleteServiceOrder,
  generateTransactionFromOrder,
  updateServiceOrderStatus,
} from "@/app/(app)/operacoes/actions";
import { formatBRL, formatBRLCompact, formatDate, osStatusLabel } from "@/lib/utils";
import type {
  Category,
  CostCenter,
  Machine,
  PickupLocation,
  Product,
  ServiceOrder,
  ServiceOrderItem,
  ServiceOrderStatus,
} from "@/lib/types";

type ServiceOrderWithDetails = ServiceOrder & {
  machines: { name: string; plate: string | null } | null;
  pickup_locations: { name: string } | null;
  service_order_items: ServiceOrderItem[];
};

interface Props {
  orders: ServiceOrderWithDetails[];
  machines: Machine[];
  products: Product[];
  pickupLocations: PickupLocation[];
  categories: Category[];
  costCenters: CostCenter[];
  month: string;
  initialFilter?: string;
}

const FILTER_TABS = [
  { label: "Todas",        value: "" },
  { label: "Pendentes",    value: "pendente" },
  { label: "Em andamento", value: "em_andamento" },
  { label: "Entregues",    value: "entregue" },
  { label: "Cliente",      value: "cliente" },
  { label: "Interno",      value: "interno" },
] as const;

type FilterValue = (typeof FILTER_TABS)[number]["value"];

const STATUS_STYLE: Record<ServiceOrderStatus, string> = {
  pendente:     "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
  em_andamento: "bg-produmar-100 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-400",
  entregue:     "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  cancelado:    "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
};

// ── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(orders: ServiceOrderWithDetails[], fileLabel: string) {
  const headers = [
    "OS",
    "Lançado",
    "Entrega",
    "Tipo",
    "Para",
    "Cliente",
    "Máquina",
    "Local Retirada",
    "Endereço Entrega",
    "Itens",
    "Total (R$)",
    "Status",
  ];

  const rows = orders.map((o) => [
    `#${o.order_number}`,
    o.issue_date,
    o.delivery_date ?? "",
    o.type === "entrega_material" ? "Entrega de material" : "Prestação de serviço",
    o.freight_type === "cliente" ? "Cliente" : "Interno",
    o.client_name ?? "",
    o.machines?.name ?? "",
    o.pickup_locations?.name ?? "",
    o.delivery_address ?? "",
    o.service_order_items
      .map((it) => `${it.quantity} ${it.unit ?? ""} ${it.description ?? ""}`.trim())
      .join(" | "),
    o.total_amount.toFixed(2).replace(".", ","),
    osStatusLabel(o.status, o.type),
  ]);

  const csv =
    "﻿" +
    [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ordens-servico-${fileLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ────────────────────────────────────────────────────────────────

export function OperacoesPageClient({
  orders,
  machines,
  products,
  pickupLocations,
  categories,
  costCenters,
  month,
  initialFilter = "",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceOrderWithDetails | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterValue>(
    (FILTER_TABS.some((f) => f.value === initialFilter) ? initialFilter : "") as FilterValue
  );
  const [search, setSearch] = useState("");

  const [year, monthNum] = month.split("-").map(Number);
  const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const fileLabel = `${String(monthNum).padStart(2, "0")}-${year}`;

  // ── Filtering ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = orders;
    if (activeFilter) {
      if (activeFilter === "cliente" || activeFilter === "interno") {
        result = result.filter((o) => o.freight_type === activeFilter);
      } else {
        result = result.filter((o) => o.status === activeFilter);
      }
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((o) =>
        [
          `#${o.order_number}`,
          o.client_name,
          o.machines?.name,
          o.machines?.plate,
          o.pickup_locations?.name,
          o.delivery_address,
          o.service_description,
          ...o.service_order_items.map((it) => it.description),
        ]
          .filter(Boolean)
          .some((field) => field!.toString().toLowerCase().includes(q))
      );
    }
    return result;
  }, [orders, activeFilter, search]);

  // ── Summary ──────────────────────────────────────────────────────────────

  const totalCliente = orders
    .filter((o) => o.freight_type === "cliente" && o.status !== "cancelado")
    .reduce((s, o) => s + o.total_amount, 0);
  const totalInterno = orders
    .filter((o) => o.freight_type === "interno" && o.status !== "cancelado")
    .reduce((s, o) => s + o.total_amount, 0);
  const totalCount = orders.filter((o) => o.status !== "cancelado").length;

  // ── Actions ──────────────────────────────────────────────────────────────

  function navigateMonth(dir: -1 | 1) {
    const d = new Date(year, monthNum - 1 + dir, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    startTransition(() => router.push(`${pathname}?m=${m}`));
  }

  function openCreate() { setEditing(null); setDialogOpen(true); }
  function openEdit(o: ServiceOrderWithDetails) { setEditing(o); setDialogOpen(true); }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta ordem de serviço? Essa ação não pode ser desfeita.")) return;
    await deleteServiceOrder(id);
  }

  async function handleStatusChange(o: ServiceOrderWithDetails, next: ServiceOrderStatus) {
    await updateServiceOrderStatus(o.id, next);
  }

  async function handleGenerateTransaction(o: ServiceOrderWithDetails) {
    if (o.transaction_id) {
      alert("Esta OS já possui um lançamento financeiro vinculado.");
      return;
    }
    if (!o.total_amount) {
      alert("O valor total da OS é zero. Adicione itens antes.");
      return;
    }
    const confirmMsg =
      o.freight_type === "cliente"
        ? `Gerar uma receita a receber de ${formatBRL(o.total_amount)} (OS #${o.order_number})?`
        : `Gerar uma despesa de ${formatBRL(o.total_amount)} (OS #${o.order_number}, consumo interno)?`;
    if (!confirm(confirmMsg)) return;

    const result = await generateTransactionFromOrder(o.id);
    if ("error" in result) {
      alert(result.error);
    } else {
      alert("Lançamento criado com sucesso!");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Operações</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ordens de serviço — entregas e prestação de serviço
          </p>
        </div>
        <div className="flex items-center gap-2">
          {orders.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => exportCSV(filtered, fileLabel)}>
              <Download className="w-4 h-4" />
              CSV
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Nova OS
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-3 sm:p-4 border border-emerald-100 dark:border-emerald-900/50 min-w-0">
          <div className="flex items-center gap-1 sm:gap-1.5 mb-1">
            <User className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <p className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-medium truncate">Cliente</p>
          </div>
          <p className="text-xs sm:text-base font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums truncate">
            <span className="sm:hidden">{formatBRLCompact(totalCliente)}</span>
            <span className="hidden sm:inline">{formatBRL(totalCliente)}</span>
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-3 sm:p-4 border border-amber-100 dark:border-amber-900/50 min-w-0">
          <div className="flex items-center gap-1 sm:gap-1.5 mb-1">
            <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 font-medium truncate">Interno</p>
          </div>
          <p className="text-xs sm:text-base font-semibold text-amber-700 dark:text-amber-400 tabular-nums truncate">
            <span className="sm:hidden">{formatBRLCompact(totalInterno)}</span>
            <span className="hidden sm:inline">{formatBRL(totalInterno)}</span>
          </p>
        </div>
        <div className="bg-produmar-50 dark:bg-produmar-950/40 rounded-xl p-3 sm:p-4 border border-produmar-100 dark:border-produmar-900/50 min-w-0">
          <div className="flex items-center gap-1 sm:gap-1.5 mb-1">
            <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />
            <p className="text-[10px] sm:text-xs text-produmar-600 dark:text-produmar-400 font-medium truncate">Total OS</p>
          </div>
          <p className="text-xs sm:text-base font-semibold text-produmar-700 dark:text-produmar-400 tabular-nums">
            {totalCount}
          </p>
        </div>
      </div>

      {/* Month nav + filter + search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-2.5 sm:p-1.5 rounded-lg hover:bg-produmar-50 dark:hover:bg-slate-800 text-produmar-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-produmar-800 dark:text-slate-100 capitalize min-w-[150px] sm:min-w-[160px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={() => navigateMonth(1)}
            className="p-2.5 sm:p-1.5 rounded-lg hover:bg-produmar-50 dark:hover:bg-slate-800 text-produmar-600 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 overflow-x-auto scrollbar-hide">
          {FILTER_TABS.map((f) => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              className={`px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeFilter === f.value
                  ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por OS, cliente, máquina, local..."
          className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-produmar-500"
        />
      </div>

      {/* List */}
      <Card>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <Truck className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">Nenhuma ordem de serviço encontrada</p>
            <button
              onClick={openCreate}
              className="mt-3 text-xs text-produmar-600 hover:underline"
            >
              + Lançar primeira OS deste período
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                onEdit={openEdit}
                onDelete={handleDelete}
                onStatus={handleStatusChange}
                onGenerateTransaction={handleGenerateTransaction}
              />
            ))}
          </div>
        )}
      </Card>

      <ServiceOrderDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        order={editing}
        machines={machines}
        products={products}
        pickupLocations={pickupLocations}
      />
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function OrderRow({
  order: o,
  onEdit,
  onDelete,
  onStatus,
  onGenerateTransaction,
}: {
  order: ServiceOrderWithDetails;
  onEdit: (o: ServiceOrderWithDetails) => void;
  onDelete: (id: string) => void;
  onStatus: (o: ServiceOrderWithDetails, next: ServiceOrderStatus) => void;
  onGenerateTransaction: (o: ServiceOrderWithDetails) => void;
}) {
  const isClient = o.freight_type === "cliente";
  const isMaterial = o.type === "entrega_material";

  // Counterpart label — só "Interno" para serviço; "Consumo interno" só faz
  // sentido em entrega (está consumindo material). Ícone já indica o tipo.
  const counterpart = isClient
    ? (o.client_name ?? "Cliente")
    : isMaterial ? "Consumo interno" : "Interno";

  // ── Linha primária (O QUE foi feito) ──────────────────────────────────────
  // Serviço: só a descrição do serviço (o item sintético "1 ud × R$ X" é lixo
  // visual). Entrega: lista de materiais com qty + unidade.
  let primaryInfo: string | null = null;
  if (isMaterial) {
    const itemsStr = o.service_order_items
      .slice(0, 2)
      .map((it) => {
        const qty = it.quantity.toString().replace(".", ",");
        const desc = it.description ?? "";
        return `${qty} ${it.unit ?? ""} ${desc}`.trim();
      })
      .filter(Boolean)
      .join(" · ");
    const more = o.service_order_items.length > 2
      ? ` +${o.service_order_items.length - 2}`
      : "";
    primaryInfo = itemsStr ? itemsStr + more : null;
  } else {
    primaryInfo = o.service_description?.trim() || null;
  }

  // ── Linha secundária (ONDE + máquina + data) ──────────────────────────────
  const parts: string[] = [];
  if (o.delivery_address?.trim()) parts.push(`📍 ${o.delivery_address}`);
  if (o.machines) {
    parts.push(`🚛 ${o.machines.name}${o.machines.plate ? ` (${o.machines.plate})` : ""}`);
  }
  if (o.delivery_date) parts.push(`📅 ${formatDate(o.delivery_date)}`);
  const secondaryInfo = parts.join(" · ");

  const canAdvance = o.status === "pendente" || o.status === "em_andamento";
  const nextStatus: ServiceOrderStatus =
    o.status === "pendente" ? "em_andamento" : "entregue";

  return (
    <div className="relative px-3 sm:px-4 py-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors group">
      <div className="flex items-start gap-3 min-w-0">
        {/* Type icon */}
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isClient
              ? "bg-emerald-50 dark:bg-emerald-950/40"
              : "bg-amber-50 dark:bg-amber-950/40"
          }`}
        >
          {isMaterial ? (
            <Truck
              className={`w-4 h-4 ${
                isClient ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              }`}
            />
          ) : (
            <Wrench
              className={`w-4 h-4 ${
                isClient ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              }`}
            />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-0.5">
          {/* counterpart + #N */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">
              #{o.order_number}
            </span>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate flex-1 min-w-0">
              {counterpart}
            </p>
            {o.transaction_id && (
              <span
                title="Lançamento financeiro gerado"
                className="text-emerald-500 dark:text-emerald-400 flex-shrink-0"
              >
                <Receipt className="w-3 h-3" />
              </span>
            )}
          </div>

          {/* Primary: o que foi feito (descrição do serviço OU itens) */}
          {primaryInfo && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
              {primaryInfo}
            </p>
          )}

          {/* Secondary: local + máquina + data, separados por · */}
          {secondaryInfo && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
              {secondaryInfo}
            </p>
          )}
        </div>

        {/* Amount + status (always visible on right) */}
        <div className="text-right flex-shrink-0 space-y-1">
          <p
            className={`text-sm font-semibold tabular-nums whitespace-nowrap ${
              isClient ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
            }`}
          >
            {formatBRL(o.total_amount)}
          </p>
          <span
            className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[o.status]}`}
          >
            {osStatusLabel(o.status, o.type)}
          </span>
        </div>
      </div>

      {/* Actions row — full width, separate line on mobile; hover only on desktop */}
      <div className="flex items-center justify-end gap-0.5 mt-1.5 sm:mt-0 sm:absolute sm:top-2.5 sm:right-3 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity">
        {canAdvance && (
          <button
            onClick={() => onStatus(o, nextStatus)}
            title={
              nextStatus === "em_andamento"
                ? "Marcar em andamento"
                : o.type === "prestacao_servico"
                  ? "Marcar como finalizado"
                  : "Marcar como entregue"
            }
            className="p-1.5 rounded-lg text-slate-400 hover:text-produmar-600 hover:bg-produmar-50 dark:hover:bg-produmar-950/40 transition-colors"
          >
            {nextStatus === "em_andamento" ? (
              <Loader2 className="w-4 h-4" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
          </button>
        )}
        {!o.transaction_id && o.total_amount > 0 && o.status !== "cancelado" && (
          <button
            onClick={() => onGenerateTransaction(o)}
            title="Gerar lançamento financeiro"
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
          >
            <Receipt className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => window.open(`/imprimir/os/${o.id}`, "_blank")}
          title="Imprimir orçamento / comprovante"
          className="p-1.5 rounded-lg text-slate-400 hover:text-produmar-600 hover:bg-produmar-50 dark:hover:bg-produmar-950/40 transition-colors"
        >
          <Printer className="w-4 h-4" />
        </button>
        <button
          onClick={() => onEdit(o)}
          title="Editar"
          className="p-1.5 rounded-lg text-slate-400 hover:text-produmar-600 hover:bg-produmar-50 dark:hover:bg-produmar-950/40 transition-colors"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(o.id)}
          title="Excluir"
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
