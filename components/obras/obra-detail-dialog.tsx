"use client";

import { useState, useTransition } from "react";
import {
  Pencil,
  Archive,
  ArchiveRestore,
  Wallet,
  Truck,
  Wrench,
  MapPin,
  Calendar,
  Package,
  Plus,
  Trash2,
  TrendingDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate } from "@/lib/utils";
import { setObraActive, deleteObraItem } from "@/app/(app)/obras/actions";
import { OBRA_STATUS_META } from "./obra-shared";
import { ObraItemDialog } from "./obra-item-dialog";
import type { ObraItem, ObraSummary } from "@/lib/types";
import type {
  ObraServiceOrderRow,
  ObraToolLoanRow,
  ObraTransactionRow,
} from "./obras-page-client";

function formatQtyDisplay(q: number): string {
  return q.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

const OS_TYPE_LABELS: Record<string, string> = {
  entrega_material: "Entrega de material",
  prestacao_servico: "Prestação de serviço",
  frete: "Frete",
  servico_rapido: "Serviço rápido",
};

const OS_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

interface Props {
  open: boolean;
  onClose: () => void;
  obra: ObraSummary | null;
  clientName: string | null;
  items: ObraItem[];
  transactions: ObraTransactionRow[];
  serviceOrders: ObraServiceOrderRow[];
  toolLoans: ObraToolLoanRow[];
  onEdit: (obra: ObraSummary) => void;
}

export function ObraDetailDialog({
  open,
  onClose,
  obra,
  clientName,
  items,
  transactions,
  serviceOrders,
  toolLoans,
  onEdit,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<ObraItem | null>(null);

  if (!obra) return null;

  const meta = OBRA_STATUS_META[obra.status];

  function handleToggleActive() {
    const o = obra!;
    const msg = o.active
      ? `Arquivar "${o.name}"? Ela sai da lista de obras ativas, mas o histórico permanece.`
      : `Reativar "${o.name}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      await setObraActive(o.id, !o.active);
      onClose();
    });
  }

  function handleDeleteItem(item: ObraItem) {
    if (!confirm(`Remover "${item.product}" da lista?`)) return;
    startTransition(async () => {
      await deleteObraItem(item.id);
    });
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 flex items-center gap-2 flex-wrap pr-6">
            {obra.name}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.chip}`}>
              {meta.label}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Informações */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <InfoRow label="Nº" value={`#${obra.obra_number}`} />
            {clientName && <InfoRow label="Cliente" value={clientName} />}
            {obra.location && (
              <InfoRow
                label="Local"
                value={obra.location}
                icon={<MapPin className="w-3.5 h-3.5" />}
              />
            )}
            {obra.start_date && (
              <InfoRow
                label="Início"
                value={formatDate(obra.start_date)}
                icon={<Calendar className="w-3.5 h-3.5" />}
              />
            )}
            {obra.planned_end_date && (
              <InfoRow label="Previsão de término" value={formatDate(obra.planned_end_date)} />
            )}
            {obra.budget != null && (
              <InfoRow label="Orçamento" value={formatBRL(Number(obra.budget))} />
            )}
            {obra.notes && <InfoRow label="Obs." value={obra.notes} />}
          </div>

          {/* Custo total + economia */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-produmar-100 dark:border-slate-700 bg-produmar-50/40 dark:bg-slate-800/40 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Wallet className="w-3.5 h-3.5 text-produmar-600 dark:text-produmar-400" />
                Custo total
              </div>
              <span className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {formatBRL(Number(obra.total_cost))}
              </span>
            </div>
            <div className="rounded-xl border border-emerald-100 dark:border-slate-700 bg-emerald-50/40 dark:bg-slate-800/40 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <TrendingDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Economia
              </div>
              <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {formatBRL(Number(obra.total_savings))}
              </span>
            </div>
          </div>

          {/* Lista de materiais / mão de obra */}
          <div>
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Package className="w-3.5 h-3.5" />
              Materiais e mão de obra ({items.length})
            </h3>
            <Button
              type="button"
              onClick={() => {
                setEditItem(null);
                setItemDialogOpen(true);
              }}
              className="w-full mb-2"
            >
              <Plus className="w-4 h-4" />
              Lançar item
            </Button>
            {items.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-1">
                Nenhum item lançado ainda.
              </p>
            ) : (
              <div className="space-y-1.5">
                {items.map((it) => {
                  const total = Number(it.quantity) * Number(it.unit_price);
                  const savings =
                    it.market_unit_price != null
                      ? Number(it.quantity) * (Number(it.market_unit_price) - Number(it.unit_price))
                      : null;
                  return (
                    <div
                      key={it.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                          {it.product}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {formatDate(it.item_date)} · {formatQtyDisplay(Number(it.quantity))} {it.unit} ×{" "}
                          {formatBRL(Number(it.unit_price))}
                        </p>
                        {savings != null && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                            Economia {formatBRL(savings)}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {formatBRL(total)}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditItem(it);
                              setItemDialogOpen(true);
                            }}
                            className="text-slate-400 hover:text-produmar-600 dark:hover:text-produmar-400"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(it)}
                            disabled={isPending}
                            className="text-slate-400 hover:text-red-500"
                            title="Remover"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* OS vinculadas */}
          <div>
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              Ordens de serviço ({serviceOrders.length})
            </h3>
            {serviceOrders.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-1">
                Nenhuma OS vinculada ainda.
              </p>
            ) : (
              <div className="space-y-1.5">
                {serviceOrders.map((so) => (
                  <div
                    key={so.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                        OS #{so.order_number} · {OS_TYPE_LABELS[so.type] ?? so.type}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {OS_STATUS_LABELS[so.status] ?? so.status}
                        {so.client_name ? ` · ${so.client_name}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex-shrink-0">
                      {formatBRL(Number(so.total_amount ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Patrimônio em uso */}
          <div>
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />
              Patrimônio ({toolLoans.length})
            </h3>
            {toolLoans.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-1">
                Nenhum patrimônio retirado para esta obra ainda.
              </p>
            ) : (
              <div className="space-y-1.5">
                {toolLoans.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                        {l.tools?.name ?? "—"}
                        {l.tools?.code ? (
                          <span className="text-[11px] text-slate-400 font-normal ml-1.5">
                            {l.tools.code}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        Com {l.borrower_name}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
                        l.returned_at
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                          : "bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-300"
                      }`}
                    >
                      {l.returned_at ? "devolvida" : "em uso"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lançamentos vinculados */}
          <div>
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              Lançamentos ({transactions.length})
            </h3>
            {transactions.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-1">
                Nenhum lançamento manual vinculado ainda.
              </p>
            ) : (
              <div className="space-y-1.5">
                {transactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                        {t.description}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {formatDate(t.due_date)}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold flex-shrink-0 ${
                        t.type === "saida"
                          ? "text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {t.type === "saida" ? "-" : "+"}
                      {formatBRL(Number(t.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ações secundárias */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onEdit(obra)}
              className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-produmar-600 dark:text-slate-400 dark:hover:text-produmar-400 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Editar
            </button>
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={isPending}
              className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 transition-colors"
            >
              {obra.active ? (
                <>
                  <Archive className="w-3.5 h-3.5" />
                  Arquivar
                </>
              ) : (
                <>
                  <ArchiveRestore className="w-3.5 h-3.5" />
                  Reativar
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <ObraItemDialog
      open={itemDialogOpen}
      onClose={() => setItemDialogOpen(false)}
      obraId={obra.id}
      item={editItem}
    />
    </>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <span className="text-slate-500 dark:text-slate-400 flex-shrink-0 flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className="font-medium text-slate-800 dark:text-slate-100 text-right">{value}</span>
    </div>
  );
}
