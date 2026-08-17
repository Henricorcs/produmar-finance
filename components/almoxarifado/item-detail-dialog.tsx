"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  Pencil,
  Trash2,
  MapPin,
  Tag,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL, formatQty } from "@/lib/utils";
import {
  deleteSupplyItem,
  deleteSupplyMovement,
  getSupplyPhotoUrls,
} from "@/app/(app)/almoxarifado/actions";
import { MOVEMENT_META, STATUS_META, fmtDateTime, num } from "./supply-shared";
import type { SupplyItemWithStock } from "@/lib/types";
import type { MovementRow } from "./almoxarifado-page-client";

interface Props {
  open: boolean;
  onClose: () => void;
  item: SupplyItemWithStock | null;
  /** Movimentos deste item, do mais novo para o mais antigo. */
  movements: MovementRow[];
  onEntrada: (item: SupplyItemWithStock) => void;
  onSaida: (item: SupplyItemWithStock) => void;
  onAdjust: (item: SupplyItemWithStock) => void;
  onEdit: (item: SupplyItemWithStock) => void;
}

export function ItemDetailDialog({
  open,
  onClose,
  item,
  movements,
  onEntrada,
  onSaida,
  onAdjust,
  onEdit,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  // uma ida ao servidor resolve a foto do item e as dos lançamentos
  const itemPhotoPath = item?.photo_path ?? null;
  const movementPhotoPaths = movements
    .map((m) => m.photo_path)
    .filter((p): p is string => !!p)
    .join(",");

  useEffect(() => {
    setPhotoUrls({});
    if (!open) return;
    const paths = [
      ...(itemPhotoPath ? [itemPhotoPath] : []),
      ...(movementPhotoPaths ? movementPhotoPaths.split(",") : []),
    ];
    if (paths.length === 0) return;

    let cancelled = false;
    getSupplyPhotoUrls(paths).then((r) => {
      if (cancelled || !("urls" in r)) return;
      setPhotoUrls(r.urls);
    });
    return () => {
      cancelled = true;
    };
  }, [open, itemPhotoPath, movementPhotoPaths]);

  if (!item) return null;

  const meta = STATUS_META[item.status];
  const itemPhotoUrl = itemPhotoPath ? photoUrls[itemPhotoPath] ?? null : null;
  const avgCost = item.avg_unit_cost != null ? num(item.avg_unit_cost) : null;

  function handleDeleteItem() {
    if (
      !confirm(
        `Excluir "${item!.name}"? Todo o histórico de entradas e saídas deste item é apagado junto.`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteSupplyItem(item!.id);
      if (r && "error" in r) {
        alert(r.error);
        return;
      }
      onClose();
    });
  }

  function handleDeleteMovement(m: MovementRow) {
    if (!confirm("Excluir esta movimentação? O saldo volta ao que era antes.")) return;
    startTransition(async () => {
      const r = await deleteSupplyMovement(m.id);
      if (r && "error" in r) alert(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 pr-8">{item.name}</DialogTitle>
          <p className="text-[11px] text-slate-400">
            #{item.item_number}
            {item.code ? ` · ${item.code}` : ""}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {itemPhotoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={itemPhotoUrl}
              alt={item.name}
              className="w-full h-40 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
            />
          )}

          {/* Saldo */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <span
              className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.chip}`}
            >
              {meta.label}
            </span>
            <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
              {formatQty(item.current_quantity)}
              <span className="text-base font-medium text-slate-400 ml-1.5">{item.unit}</span>
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {avgCost != null
                ? `${formatBRL(avgCost)} / ${item.unit} · ${formatBRL(num(item.stock_value))} em estoque`
                : "Sem custo registrado"}
            </p>
          </div>

          {/* Ações principais */}
          <div className="grid grid-cols-3 gap-2">
            <ActionButton
              icon={ArrowDownToLine}
              label="Entrada"
              tone="emerald"
              onClick={() => onEntrada(item)}
            />
            <ActionButton
              icon={ArrowUpFromLine}
              label="Saída"
              tone="red"
              disabled={item.current_quantity <= 0}
              onClick={() => onSaida(item)}
            />
            <ActionButton
              icon={ClipboardCheck}
              label="Conferir"
              tone="slate"
              onClick={() => onAdjust(item)}
            />
          </div>

          {/* Ficha */}
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Fact label="Entradas" value={`${formatQty(num(item.total_in))} ${item.unit}`} />
            <Fact label="Saídas" value={`${formatQty(num(item.total_out))} ${item.unit}`} />
            <Fact
              label="Estoque mínimo"
              value={
                item.min_quantity > 0
                  ? `${formatQty(num(item.min_quantity))} ${item.unit}`
                  : "não definido"
              }
            />
            <Fact
              label="Categoria"
              icon={Tag}
              value={item.category_name ?? "sem categoria"}
            />
            {item.location && (
              <div className="col-span-2">
                <Fact label="Localização" icon={MapPin} value={item.location} />
              </div>
            )}
          </dl>

          {/* Histórico do item */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Últimas movimentações
            </p>
            {movements.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                Nenhuma movimentação registrada.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 max-h-56 overflow-y-auto">
                {movements.slice(0, 30).map((m) => {
                  const mm = MOVEMENT_META[m.type];
                  const qty = num(m.quantity);
                  const movPhoto = m.photo_path ? photoUrls[m.photo_path] ?? null : null;
                  return (
                    <div key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                      <span
                        className={`w-1.5 h-8 rounded-full flex-shrink-0 ${
                          m.type === "entrada"
                            ? "bg-emerald-400"
                            : m.type === "saida"
                              ? "bg-red-400"
                              : "bg-slate-300 dark:bg-slate-600"
                        }`}
                      />
                      {movPhoto && (
                        <a
                          href={movPhoto}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-shrink-0"
                          aria-label="Abrir foto do lançamento"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={movPhoto}
                            alt=""
                            className="w-9 h-9 rounded-md object-cover border border-slate-200 dark:border-slate-700"
                          />
                        </a>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold tabular-nums ${mm.text}`}>
                          {m.type === "ajuste" ? (qty >= 0 ? "+" : "−") : mm.sign}
                          {formatQty(Math.abs(qty))} {item.unit}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {fmtDateTime(m.created_at)}
                          {m.person ? ` · ${m.person}` : ""}
                          {m.destination ? ` → ${m.destination}` : ""}
                          {m.notes ? ` · ${m.notes}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteMovement(m)}
                        disabled={isPending}
                        aria-label="Apagar lançamento"
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 dark:text-slate-600 flex-shrink-0 -mr-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {item.notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
              {item.notes}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onEdit(item)}>
              <Pencil className="w-4 h-4" />
              Editar
            </Button>
            <button
              onClick={handleDeleteItem}
              disabled={isPending}
              className="h-10 px-4 rounded-md border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
            >
              <Trash2 className="w-4 h-4 inline" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActionButton({
  icon: Icon,
  label,
  tone,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "emerald" | "red" | "slate";
  disabled?: boolean;
  onClick: () => void;
}) {
  const tones = {
    emerald:
      "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400 dark:hover:bg-emerald-950/30",
    red: "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30",
    slate:
      "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 min-h-[60px] rounded-xl border text-xs font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none ${tones}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function Fact({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 min-w-0">
      <dt className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </dt>
      <dd className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate tabular-nums">
        {value}
      </dd>
    </div>
  );
}
