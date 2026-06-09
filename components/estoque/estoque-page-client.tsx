"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Boxes,
  Package,
  ShoppingCart,
  ArrowDownUp,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  SlidersHorizontal,
  Mountain,
  Wallet,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL, formatBRLCompact, formatDate } from "@/lib/utils";
import { PurchaseDialog } from "./purchase-dialog";
import { AdjustmentDialog } from "./adjustment-dialog";
import { PaymentDialog } from "./payment-dialog";
import { MaterialDetailDialog } from "./material-detail-dialog";
import {
  deleteMaterialPurchase,
  deleteStockMovement,
  getPurchaseAttachmentUrl,
} from "@/app/(app)/estoque/actions";
import type {
  MaterialPurchase,
  MaterialPurchaseItem,
  PickupLocation,
  Product,
  ProductStockBalance,
  StockMovement,
} from "@/lib/types";

// ── Tipos das linhas com joins ────────────────────────────────────────────────
export type PurchaseRow = MaterialPurchase & {
  pickup_locations: { name: string } | null;
  material_purchase_items: (MaterialPurchaseItem & {
    products: { name: string } | null;
  })[];
  transactions: { id: string; status: string } | null;
};

export type MovementRow = StockMovement & {
  products: { name: string; unit: string } | null;
  pickup_locations: { name: string } | null;
};

export type PurchaseItemRow = {
  quantity: number;
  unit: string | null;
  total: number;
  products: { id: string; name: string; unit: string } | null;
  material_purchases: {
    id: string;
    location_id: string | null;
    total_amount: number;
    amount_paid: number;
    pickup_locations: { name: string } | null;
  } | null;
};

/** Quanto de cada material veio de cada jazida (com saldo devedor da jazida). */
export type MaterialByJazida = {
  name: string;
  qty: number;
  value: number;
  debt: number;
};

/** Agregação de uma jazida: materiais comprados, valor total e saldo devedor. */
type JazidaAgg = {
  name: string;
  materials: { name: string; unit: string; qty: number; value: number }[];
  totalValue: number;
  debt: number;
};

interface Props {
  balance: ProductStockBalance[];
  products: Product[];
  jazidas: PickupLocation[];
  purchases: PurchaseRow[];
  movements: MovementRow[];
  purchaseItems: PurchaseItemRow[];
}

type Tab = "saldo" | "jazidas" | "compras" | "movimentacoes";

function fmtQty(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function EstoquePageClient({
  balance,
  products,
  jazidas,
  purchases,
  movements,
  purchaseItems,
}: Props) {
  const [tab, setTab] = useState<Tab>("saldo");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<PurchaseRow | null>(null);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);

  // ── Agregações por jazida e por material ────────────────────────────────────
  const { jazidaList, byMaterial, debtByJazida } = useMemo(() => {
    const seenPurchases = new Map<string, { loc: string; debt: number }>();
    const jazMap = new Map<
      string,
      Map<string, { name: string; unit: string; qty: number; value: number }>
    >();
    const matMap = new Map<string, Map<string, { qty: number; value: number }>>();

    for (const it of purchaseItems) {
      const prod = it.products;
      const mp = it.material_purchases;
      if (!prod || !mp) continue;
      const loc = mp.pickup_locations?.name ?? "Sem jazida";
      const qty = Number(it.quantity);
      const value = Number(it.total);

      if (!jazMap.has(loc)) jazMap.set(loc, new Map());
      const pm = jazMap.get(loc)!;
      const ex = pm.get(prod.id) ?? { name: prod.name, unit: prod.unit, qty: 0, value: 0 };
      ex.qty += qty;
      ex.value += value;
      pm.set(prod.id, ex);

      if (!matMap.has(prod.id)) matMap.set(prod.id, new Map());
      const jm = matMap.get(prod.id)!;
      const ex2 = jm.get(loc) ?? { qty: 0, value: 0 };
      ex2.qty += qty;
      ex2.value += value;
      jm.set(loc, ex2);

      if (!seenPurchases.has(mp.id)) {
        seenPurchases.set(mp.id, {
          loc,
          debt: Math.max(0, Number(mp.total_amount) - Number(mp.amount_paid)),
        });
      }
    }

    const debtByJazida = new Map<string, number>();
    for (const { loc, debt } of seenPurchases.values()) {
      debtByJazida.set(loc, (debtByJazida.get(loc) ?? 0) + debt);
    }

    const jazidaList = Array.from(jazMap.entries())
      .map(([loc, pm]) => {
        const materials = Array.from(pm.values()).sort((a, b) => a.name.localeCompare(b.name));
        return {
          name: loc,
          materials,
          totalValue: materials.reduce((s, m) => s + m.value, 0),
          debt: debtByJazida.get(loc) ?? 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { jazidaList, byMaterial: matMap, debtByJazida };
  }, [purchaseItems]);

  // Detalhe do material selecionado (qtd/valor/dívida por jazida)
  const detailMaterial = useMemo(() => {
    if (!detailProductId) return null;
    const bal = balance.find((b) => b.product_id === detailProductId) ?? null;
    const jm = byMaterial.get(detailProductId);
    const jazidasArr: MaterialByJazida[] = jm
      ? Array.from(jm.entries())
          .map(([name, v]) => ({
            name,
            qty: v.qty,
            value: v.value,
            debt: debtByJazida.get(name) ?? 0,
          }))
          .sort((a, b) => b.qty - a.qty)
      : [];
    return { balance: bal, jazidas: jazidasArr };
  }, [detailProductId, balance, byMaterial, debtByJazida]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const stockValue = useMemo(
    () =>
      balance.reduce(
        (s, b) => s + Number(b.current_quantity) * Number(b.avg_unit_cost ?? 0),
        0
      ),
    [balance]
  );
  const itemsInStock = useMemo(
    () => balance.filter((b) => Number(b.current_quantity) > 0).length,
    [balance]
  );
  const owedTotal = useMemo(
    () =>
      purchases.reduce((s, p) => {
        const owed = Number(p.total_amount) - Number(p.amount_paid);
        const settled = p.transactions?.status === "pago";
        return s + (owed > 0 && !settled ? owed : 0);
      }, 0),
    [purchases]
  );

  const tabs: {
    value: Tab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count: number;
  }[] = [
    { value: "saldo", label: "Saldo", icon: Boxes, count: itemsInStock },
    { value: "jazidas", label: "Jazidas", icon: Mountain, count: jazidaList.length },
    { value: "compras", label: "Compras", icon: ShoppingCart, count: purchases.length },
    { value: "movimentacoes", label: "Movim.", icon: ArrowDownUp, count: movements.length },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            Estoque
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Jazidas, compras de material e saldo
          </p>
        </div>
        <Button onClick={() => setPurchaseOpen(true)} className="flex-shrink-0">
          <Plus className="w-4 h-4" />
          Nova compra
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <KpiCard
          icon={Package}
          label="Materiais"
          value={String(itemsInStock)}
          tone="produmar"
        />
        <KpiCard
          icon={Boxes}
          label="Em estoque"
          value={formatBRLCompact(stockValue)}
          tone="emerald"
        />
        <KpiCard
          icon={Wallet}
          label="Devendo"
          value={formatBRLCompact(owedTotal)}
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

      {tab === "saldo" && (
        <SaldoTab
          balance={balance}
          onAdjust={() => setAdjustOpen(true)}
          onMaterialClick={(id) => setDetailProductId(id)}
        />
      )}
      {tab === "jazidas" && (
        <JazidasTab jazidas={jazidaList} onNew={() => setPurchaseOpen(true)} />
      )}
      {tab === "compras" && (
        <ComprasTab
          purchases={purchases}
          onNew={() => setPurchaseOpen(true)}
          onPay={setPayTarget}
        />
      )}
      {tab === "movimentacoes" && (
        <MovimentacoesTab movements={movements} onAdjust={() => setAdjustOpen(true)} />
      )}

      <PurchaseDialog
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        products={products}
        jazidas={jazidas}
      />
      <AdjustmentDialog
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        products={products}
      />
      {payTarget && (
        <PaymentDialog
          open={!!payTarget}
          onClose={() => setPayTarget(null)}
          purchaseId={payTarget.id}
          purchaseNumber={payTarget.purchase_number}
          jazidaName={payTarget.pickup_locations?.name ?? "Jazida"}
          remaining={Number(payTarget.total_amount) - Number(payTarget.amount_paid)}
        />
      )}
      <MaterialDetailDialog
        open={!!detailProductId}
        onClose={() => setDetailProductId(null)}
        material={detailMaterial?.balance ?? null}
        jazidas={detailMaterial?.jazidas ?? []}
      />
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

// ── Aba: Saldo ────────────────────────────────────────────────────────────────
function SaldoTab({
  balance,
  onAdjust,
  onMaterialClick,
}: {
  balance: ProductStockBalance[];
  onAdjust: () => void;
  onMaterialClick: (productId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onAdjust}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Ajuste manual
        </Button>
      </div>

      {balance.length === 0 ? (
        <EmptyState
          icon={Boxes}
          text="Nenhum material cadastrado ainda."
          hint="Cadastre produtos e lance uma compra para começar."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {balance.map((b) => {
            const low = Number(b.current_quantity) <= 0;
            return (
              <button
                key={b.product_id}
                type="button"
                onClick={() => onMaterialClick(b.product_id)}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-produmar-200 dark:hover:border-produmar-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {b.name}
                  </p>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      low
                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    }`}
                  >
                    {low ? "Sem saldo" : "Em estoque"}
                  </span>
                </div>
                <p
                  className={`mt-2 text-2xl font-black tabular-nums ${
                    low
                      ? "text-red-500"
                      : "text-produmar-700 dark:text-produmar-400"
                  }`}
                >
                  {fmtQty(b.current_quantity)}{" "}
                  <span className="text-sm font-medium text-slate-400">{b.unit}</span>
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                    {fmtQty(b.total_in)} entrou
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-400" />
                    {fmtQty(b.total_out)} saiu
                  </span>
                  {b.avg_unit_cost != null && (
                    <span className="col-span-2 mt-0.5">
                      Custo médio: {formatBRL(Number(b.avg_unit_cost))} / {b.unit}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-produmar-600 dark:text-produmar-400 font-medium">
                  Ver por jazida →
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Aba: Jazidas (materiais por jazida) ───────────────────────────────────────
function JazidasTab({ jazidas, onNew }: { jazidas: JazidaAgg[]; onNew: () => void }) {
  if (jazidas.length === 0) {
    return (
      <EmptyState
        icon={Mountain}
        text="Nenhuma compra por jazida ainda."
        hint="Lance uma compra para ver os materiais agrupados por jazida."
        action={
          <Button size="sm" onClick={onNew}>
            <Plus className="w-4 h-4" /> Nova compra
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      {jazidas.map((j) => (
        <div
          key={j.name}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Mountain className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {j.name}
                </p>
                {j.debt > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 flex-shrink-0">
                    devendo {formatBRL(j.debt)}
                  </span>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {j.materials.map((m) => (
                  <li
                    key={m.name}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-slate-700 dark:text-slate-200 truncate">
                      <span className="font-semibold tabular-nums">
                        {fmtQty(m.qty)} {m.unit}
                      </span>{" "}
                      · {m.name}
                    </span>
                    <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">
                      {formatBRL(m.value)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Total comprado</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                  {formatBRL(j.totalValue)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Aba: Compras ──────────────────────────────────────────────────────────────
function ComprasTab({
  purchases,
  onNew,
  onPay,
}: {
  purchases: PurchaseRow[];
  onNew: () => void;
  onPay: (p: PurchaseRow) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete(p: PurchaseRow) {
    if (
      !confirm(
        `Excluir a compra #${p.purchase_number}? Isso remove as entradas de estoque e a conta a pagar vinculada.`
      )
    )
      return;
    startTransition(async () => {
      await deleteMaterialPurchase(p.id);
    });
  }

  async function openNota(path: string) {
    const r = await getPurchaseAttachmentUrl(path);
    if ("url" in r) window.open(r.url, "_blank", "noopener,noreferrer");
    else alert(r.error ?? "Erro ao abrir a nota");
  }

  if (purchases.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        text="Nenhuma compra lançada."
        hint="Clique em “Nova compra” para registrar a primeira."
        action={
          <Button size="sm" onClick={onNew}>
            <Plus className="w-4 h-4" /> Nova compra
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {purchases.map((p) => {
        const owed = p.total_amount - p.amount_paid;
        const settled = p.transactions?.status === "pago";
        const itemsLabel = p.material_purchase_items
          .map(
            (it) =>
              `${fmtQty(it.quantity)} ${it.unit ?? ""} ${
                it.products?.name ?? ""
              }`.trim()
          )
          .filter(Boolean)
          .join(" · ");

        return (
          <div
            key={p.id}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                <Mountain className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {p.pickup_locations?.name ?? "Jazida não informada"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    #{p.purchase_number} · {formatDate(p.purchase_date)}
                  </span>
                </div>
                {itemsLabel && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {itemsLabel}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-xs tabular-nums">
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">
                    {formatBRL(p.total_amount)}
                  </span>
                  {p.amount_paid > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      pago {formatBRL(p.amount_paid)}
                    </span>
                  )}
                  {owed > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full ${
                        settled
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                      }`}
                    >
                      {settled ? "quitado" : `devendo ${formatBRL(owed)}`}
                    </span>
                  )}
                </div>
                {p.attachment_path && (
                  <button
                    type="button"
                    onClick={() => openNota(p.attachment_path!)}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-produmar-600 dark:text-produmar-400 font-medium"
                  >
                    <FileText className="w-3.5 h-3.5" /> Ver nota fiscal
                  </button>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {owed > 0 && !settled && (
                  <button
                    onClick={() => onPay(p)}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                    title="Registrar pagamento"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Pagar
                  </button>
                )}
                <button
                  onClick={() => handleDelete(p)}
                  disabled={isPending}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                  title="Excluir compra"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Aba: Movimentações ──────────────────────────────────────────────────────
function MovimentacoesTab({
  movements,
  onAdjust,
}: {
  movements: MovementRow[];
  onAdjust: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete(m: MovementRow) {
    if (!confirm("Remover este ajuste manual?")) return;
    startTransition(async () => {
      await deleteStockMovement(m.id);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onAdjust}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Ajuste manual
        </Button>
      </div>

      {movements.length === 0 ? (
        <EmptyState icon={ArrowDownUp} text="Nenhuma movimentação ainda." />
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          {movements.map((m) => {
            const isIn = m.type === "entrada";
            const isOut = m.type === "saida";
            const sign = isOut || m.quantity < 0 ? "−" : "+";
            const Icon = isIn ? TrendingUp : isOut ? TrendingDown : SlidersHorizontal;
            const color = isIn
              ? "text-emerald-600 dark:text-emerald-400"
              : isOut
              ? "text-red-500 dark:text-red-400"
              : "text-sky-600 dark:text-sky-400";
            const bg = isIn
              ? "bg-emerald-50 dark:bg-emerald-900/30"
              : isOut
              ? "bg-red-50 dark:bg-red-900/30"
              : "bg-sky-50 dark:bg-sky-900/30";
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {m.products?.name ?? "—"}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {formatDate(m.movement_date)}
                    {m.notes ? ` · ${m.notes}` : ""}
                  </p>
                </div>
                <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${color}`}>
                  {sign}
                  {fmtQty(Math.abs(m.quantity))} {m.unit ?? m.products?.unit ?? ""}
                </span>
                {m.type === "ajuste" && (
                  <button
                    onClick={() => handleDelete(m)}
                    disabled={isPending}
                    className="p-1 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Remover ajuste"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
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
