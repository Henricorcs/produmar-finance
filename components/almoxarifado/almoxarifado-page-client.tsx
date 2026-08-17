"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  PackageOpen,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Settings2,
  Tag,
  AlertTriangle,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL, formatQty } from "@/lib/utils";
import { ItemDialog } from "./item-dialog";
import { MovementDialog } from "./movement-dialog";
import { AdjustDialog } from "./adjust-dialog";
import { ItemDetailDialog } from "./item-detail-dialog";
import { CategoriesDialog } from "./categories-dialog";
import { MOVEMENT_META, STATUS_META, fmtDateTime, num } from "./supply-shared";
import type {
  SupplyCategory,
  SupplyItemWithStock,
  SupplyMovement,
  SupplyStatus,
} from "@/lib/types";

/** Movimento com o nome do item (join da consulta da página). */
export type MovementRow = SupplyMovement & {
  supply_items: { name: string; unit: string } | null;
};

interface Props {
  items: SupplyItemWithStock[];
  movements: MovementRow[];
  categories: SupplyCategory[];
}

type Tab = "estoque" | "movimentos";
/** Categoria escolhida: todas, um id, ou os itens sem categoria. */
type CategoryFilter = "todas" | "sem" | (string & {});
type StatusFilter = "todos" | SupplyStatus;

export function AlmoxarifadoPageClient({ items, movements, categories }: Props) {
  const [tab, setTab] = useState<Tab>("estoque");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("todas");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");

  // dialogs
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<SupplyItemWithStock | null>(null);
  const [movementType, setMovementType] = useState<"entrada" | "saida">("entrada");
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementPresetId, setMovementPresetId] = useState<string | null>(null);
  const [adjustItemId, setAdjustItemId] = useState<string | null>(null);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  // ── Categoria escolhida: tudo na tela passa a ser só dela ──────────────────
  const scopedItems = useMemo(() => {
    if (categoryFilter === "todas") return items;
    if (categoryFilter === "sem") return items.filter((i) => !i.category_id);
    return items.filter((i) => i.category_id === categoryFilter);
  }, [items, categoryFilter]);

  const scopedIds = useMemo(() => new Set(scopedItems.map((i) => i.id)), [scopedItems]);
  const scopedMovements = useMemo(
    () => movements.filter((m) => scopedIds.has(m.item_id)),
    [movements, scopedIds]
  );

  const countByCategory = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) if (i.category_id) c[i.category_id] = (c[i.category_id] ?? 0) + 1;
    return c;
  }, [items]);

  const orphanCount = useMemo(() => items.filter((i) => !i.category_id).length, [items]);

  // Os diálogos derivam do id para refletirem os dados recarregados do servidor
  const detailItem = useMemo(
    () => (detailItemId ? items.find((i) => i.id === detailItemId) ?? null : null),
    [detailItemId, items]
  );
  const detailMovements = useMemo(
    () => (detailItemId ? movements.filter((m) => m.item_id === detailItemId) : []),
    [detailItemId, movements]
  );
  const adjustItem = useMemo(
    () => (adjustItemId ? items.find((i) => i.id === adjustItemId) ?? null : null),
    [adjustItemId, items]
  );

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const countBy = useMemo(() => {
    const c: Record<SupplyStatus, number> = { ok: 0, baixo: 0, zerado: 0 };
    for (const i of scopedItems) c[i.status]++;
    return c;
  }, [scopedItems]);

  const stockValue = useMemo(
    () => scopedItems.reduce((sum, i) => sum + num(i.stock_value), 0),
    [scopedItems]
  );

  /** Precisa comprar: zerado primeiro, depois o que está acabando. */
  const needsRestock = useMemo(
    () =>
      scopedItems
        .filter((i) => i.status !== "ok")
        .sort((a, b) => (a.status === b.status ? 0 : a.status === "zerado" ? -1 : 1)),
    [scopedItems]
  );

  // ── Filtro da lista ─────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = search.trim().toUpperCase();
    return scopedItems.filter((i) => {
      if (statusFilter !== "todos" && i.status !== statusFilter) return false;
      if (!q) return true;
      return (
        i.name.includes(q) ||
        (i.code ?? "").includes(q) ||
        (i.location ?? "").includes(q) ||
        (i.category_name ?? "").includes(q)
      );
    });
  }, [scopedItems, search, statusFilter]);

  // ── Ações auxiliares ────────────────────────────────────────────────────────
  function openMovement(type: "entrada" | "saida", item?: SupplyItemWithStock) {
    setMovementType(type);
    setMovementPresetId(item?.id ?? null);
    setMovementOpen(true);
  }
  function openNewItem() {
    setEditItem(null);
    setItemDialogOpen(true);
  }

  const categoryTabs: { value: CategoryFilter; label: string; count: number }[] = [
    { value: "todas", label: "Todos", count: items.length },
    ...categories.map((c) => ({
      value: c.id as CategoryFilter,
      label: c.name,
      count: countByCategory[c.id] ?? 0,
    })),
    ...(orphanCount > 0 && categories.length > 0
      ? [{ value: "sem" as CategoryFilter, label: "Sem categoria", count: orphanCount }]
      : []),
  ];

  const currentCategoryName =
    categoryFilter === "todas"
      ? null
      : categoryFilter === "sem"
        ? "Sem categoria"
        : categories.find((c) => c.id === categoryFilter)?.name ?? null;

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: "todos", label: "Todos" },
    { value: "ok", label: "Em estoque" },
    { value: "baixo", label: "Acabando" },
    { value: "zerado", label: "Zerados" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Estoque</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            {currentCategoryName ?? "Material de consumo"}
          </p>
        </div>
        <Button onClick={openNewItem} className="flex-shrink-0">
          <Plus className="w-4 h-4" />
          Novo
        </Button>
      </div>

      {/* Entrada / Saída — o que mais se faz na tela, sempre à mão */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => openMovement("entrada")}
          className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-semibold shadow-sm transition-all"
        >
          <ArrowDownToLine className="w-4 h-4" />
          Entrada
        </button>
        <button
          onClick={() => openMovement("saida")}
          className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white text-sm font-semibold shadow-sm transition-all"
        >
          <ArrowUpFromLine className="w-4 h-4" />
          Saída
        </button>
      </div>

      {/* Categorias */}
      {(categories.length > 0 || items.length > 0) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Tag className="w-3.5 h-3.5" />
              Categoria
            </span>
            <button
              type="button"
              onClick={() => setCategoriesOpen(true)}
              className="flex items-center gap-1 min-h-[44px] px-2 -my-2 text-xs font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Gerenciar
            </button>
          </div>
          {categories.length === 0 ? (
            <button
              type="button"
              onClick={() => setCategoriesOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400"
            >
              <Plus className="w-4 h-4" />
              Agrupar por categoria
            </button>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              {categoryTabs.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategoryFilter(c.value)}
                  className={`flex-shrink-0 flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-medium border transition-colors ${
                    categoryFilter === c.value
                      ? "bg-produmar-600 border-produmar-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  {c.label}
                  <span className="opacity-60 tabular-nums">{c.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard
          icon={Wallet}
          label="Valor parado"
          value={formatBRL(stockValue)}
          tone="emerald"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Precisa comprar"
          value={String(countBy.baixo + countBy.zerado)}
          tone={countBy.baixo + countBy.zerado > 0 ? "amber" : "slate"}
        />
      </div>

      {/* Alerta de reposição — só aparece quando há o que comprar */}
      {needsRestock.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Repor {needsRestock.length === 1 ? "1 item" : `${needsRestock.length} itens`}
          </p>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {needsRestock.slice(0, 12).map((i) => (
              <button
                key={i.id}
                onClick={() => openMovement("entrada", i)}
                className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 text-xs"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[i.status].dot}`} />
                <span className="font-medium text-slate-700 dark:text-slate-200 max-w-[9rem] truncate">
                  {i.name}
                </span>
                <span className="text-slate-400 tabular-nums">
                  {formatQty(i.current_quantity)} {i.unit}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {(
          [
            { value: "estoque", label: "Estoque", icon: PackageOpen, count: scopedItems.length },
            {
              value: "movimentos",
              label: "Movimentos",
              icon: History,
              count: scopedMovements.length,
            },
          ] as const
        ).map((t) => {
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

      {tab === "estoque" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar item..."
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
                {f.value !== "todos" && (
                  <span className="opacity-60 ml-1">{countBy[f.value]}</span>
                )}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            scopedItems.length === 0 ? (
              <EmptyState
                icon={PackageOpen}
                text={
                  currentCategoryName
                    ? `Nada em ${currentCategoryName} ainda.`
                    : "Nenhum item cadastrado ainda."
                }
                hint="Cadastre cano, emenda, cola — o que você usa e acaba."
                action={
                  <Button size="sm" onClick={openNewItem}>
                    <Plus className="w-4 h-4" /> Novo item
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={Search} text="Nada encontrado com esse filtro." />
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredItems.map((i) => (
                <ItemCard
                  key={i.id}
                  item={i}
                  onOpen={() => setDetailItemId(i.id)}
                  onEntrada={() => openMovement("entrada", i)}
                  onSaida={() => openMovement("saida", i)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "movimentos" && <MovimentosTab movements={scopedMovements} />}

      {/* Dialogs */}
      <ItemDialog
        open={itemDialogOpen}
        onClose={() => setItemDialogOpen(false)}
        item={editItem}
        categories={categories}
        defaultCategoryId={
          categoryFilter === "todas" || categoryFilter === "sem" ? null : categoryFilter
        }
        onManageCategories={() => setCategoriesOpen(true)}
      />
      <MovementDialog
        open={movementOpen}
        onClose={() => setMovementOpen(false)}
        type={movementType}
        items={items}
        presetItemId={movementPresetId}
      />
      <AdjustDialog
        open={!!adjustItem}
        onClose={() => setAdjustItemId(null)}
        item={adjustItem}
      />
      <CategoriesDialog
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        categories={categories}
        countByCategory={countByCategory}
      />
      <ItemDetailDialog
        open={!!detailItem}
        onClose={() => setDetailItemId(null)}
        item={detailItem}
        movements={detailMovements}
        onEntrada={(i) => {
          setDetailItemId(null);
          openMovement("entrada", i);
        }}
        onSaida={(i) => {
          setDetailItemId(null);
          openMovement("saida", i);
        }}
        onAdjust={(i) => {
          setDetailItemId(null);
          setAdjustItemId(i.id);
        }}
        onEdit={(i) => {
          setDetailItemId(null);
          setEditItem(i);
          setItemDialogOpen(true);
        }}
      />
    </div>
  );
}

// ── Card do item ─────────────────────────────────────────────────────────────
function ItemCard({
  item,
  onOpen,
  onEntrada,
  onSaida,
}: {
  item: SupplyItemWithStock;
  onOpen: () => void;
  onEntrada: () => void;
  onSaida: () => void;
}) {
  const meta = STATUS_META[item.status];

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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {item.name}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            {item.category_name ?? "sem categoria"}
            {item.location ? ` · ${item.location}` : ""}
            {item.code ? ` · ${item.code}` : ""}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
            {formatQty(item.current_quantity)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">{item.unit}</p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.chip}`}>
          {meta.label}
        </span>
        {item.min_quantity > 0 && (
          <span className="text-[10px] text-slate-400 tabular-nums">
            mín. {formatQty(num(item.min_quantity))}
          </span>
        )}
        {num(item.stock_value) > 0 && (
          <span className="text-[10px] text-slate-400 tabular-nums ml-auto">
            {formatBRL(num(item.stock_value))}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEntrada();
          }}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 transition-colors"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
          Entrada
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSaida();
          }}
          disabled={item.current_quantity <= 0}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <ArrowUpFromLine className="w-3.5 h-3.5" />
          Saída
        </button>
      </div>
    </div>
  );
}

// ── Aba: Movimentos ──────────────────────────────────────────────────────────
function MovimentosTab({ movements }: { movements: MovementRow[] }) {
  if (movements.length === 0) {
    return (
      <EmptyState
        icon={History}
        text="Nenhum movimento ainda."
        hint="Entradas, saídas e conferências aparecem aqui."
      />
    );
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {movements.map((m) => {
        const meta = MOVEMENT_META[m.type];
        const qty = num(m.quantity);
        const unit = m.supply_items?.unit ?? "";
        return (
          <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}
            >
              {m.type === "entrada" ? (
                <ArrowDownToLine className={`w-4 h-4 ${meta.text}`} />
              ) : m.type === "saida" ? (
                <ArrowUpFromLine className={`w-4 h-4 ${meta.text}`} />
              ) : (
                <Settings2 className={`w-4 h-4 ${meta.text}`} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                {m.supply_items?.name ?? "—"}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {fmtDateTime(m.created_at)}
                {m.person ? ` · ${m.person}` : ""}
                {m.destination ? ` → ${m.destination}` : ""}
                {m.notes ? ` · ${m.notes}` : ""}
              </p>
            </div>
            <p className={`text-sm font-bold tabular-nums flex-shrink-0 ${meta.text}`}>
              {m.type === "ajuste" ? (qty >= 0 ? "+" : "−") : meta.sign}
              {formatQty(Math.abs(qty))}
              <span className="text-[10px] font-medium opacity-70 ml-0.5">{unit}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Resumo card ──────────────────────────────────────────────────────────────
function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "emerald" | "amber" | "slate";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    slate: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
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

// ── Empty state ──────────────────────────────────────────────────────────────
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
