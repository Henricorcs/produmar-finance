"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, X, Mountain, Package, Wallet, Camera, Paperclip } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { QuickCreateProductDialog } from "@/components/operacoes/quick-create-product-dialog";
import { QuickCreateLocationDialog } from "@/components/operacoes/quick-create-location-dialog";
import {
  createMaterialPurchase,
  uploadPurchaseAttachment,
} from "@/app/(app)/estoque/actions";
import { formatBRL } from "@/lib/utils";
import { PRODUCT_UNITS, type PickupLocation, type Product } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  products: Product[];
  jazidas: PickupLocation[];
}

// ── Helpers (espelham o diálogo de OS) ─────────────────────────────────────────
function parseBRLToNumber(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function formatBRLInput(raw: string | number): string {
  let digits: string;
  if (typeof raw === "number") digits = String(Math.round(raw * 100));
  else digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatQty(raw: string | number): string {
  if (typeof raw === "number") return raw.toString().replace(".", ",");
  const cleaned = raw.replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 3) return parts[0] + "," + parts[1].slice(0, 3);
  return cleaned;
}
function parseQty(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

interface ItemDraft {
  product_id: string;
  quantity: string;
  unit: string;
  unit_price: string;
}
function emptyItem(): ItemDraft {
  return { product_id: "", quantity: "1", unit: "m³", unit_price: "" };
}

export function PurchaseDialog({ open, onClose, products, jazidas }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [locationId, setLocationId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayStr());
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [amountPaid, setAmountPaid] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  // Nota fiscal (foto/arquivo)
  const [notaFile, setNotaFile] = useState<File | null>(null);
  const [notaPreview, setNotaPreview] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [localProducts, setLocalProducts] = useState<Product[]>(products);
  const [localJazidas, setLocalJazidas] = useState<PickupLocation[]>(jazidas);
  const [prdDialogOpen, setPrdDialogOpen] = useState(false);
  const [prdDialogIdx, setPrdDialogIdx] = useState<number | null>(null);
  const [jazDialogOpen, setJazDialogOpen] = useState(false);

  useEffect(() => setLocalProducts(products), [products]);
  useEffect(() => setLocalJazidas(jazidas), [jazidas]);

  useEffect(() => {
    if (!open) return;
    setLocationId("");
    setPurchaseDate(todayStr());
    setItems([emptyItem()]);
    setAmountPaid("");
    setDueDate(todayStr());
    setNotes("");
    setError(null);
    setNotaFile(null);
    setNotaPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [open]);

  function pickNota(file: File | null) {
    setNotaPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
    setNotaFile(file);
  }

  const total = useMemo(
    () =>
      items.reduce(
        (s, it) => s + parseQty(it.quantity) * parseBRLToNumber(it.unit_price),
        0
      ),
    [items]
  );
  const owed = Math.max(0, total - parseBRLToNumber(amountPaid));

  function setItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function pickProduct(idx: number, productId: string) {
    const product = localProducts.find((p) => p.id === productId);
    setItem(idx, {
      product_id: productId,
      unit: product?.unit ?? items[idx].unit,
      unit_price:
        product?.default_price != null && !items[idx].unit_price
          ? formatBRLInput(product.default_price)
          : items[idx].unit_price,
    });
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(idx: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  function handleProductCreated(p: Product) {
    setLocalProducts((prev) =>
      [...prev.filter((x) => x.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name))
    );
    if (prdDialogIdx !== null) pickProduct(prdDialogIdx, p.id);
    setPrdDialogIdx(null);
  }
  function handleJazidaCreated(loc: PickupLocation) {
    setLocalJazidas((prev) =>
      [...prev.filter((x) => x.id !== loc.id), loc].sort((a, b) => a.name.localeCompare(b.name))
    );
    setLocationId(loc.id);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payloadItems = items
      .filter((it) => it.product_id && parseQty(it.quantity) > 0)
      .map((it) => ({
        product_id: it.product_id,
        quantity: parseQty(it.quantity),
        unit: it.unit,
        unit_price: parseBRLToNumber(it.unit_price),
      }));

    if (payloadItems.length === 0) {
      setError("Adicione ao menos um material com produto e quantidade");
      return;
    }

    startTransition(async () => {
      const r = await createMaterialPurchase({
        location_id: locationId || null,
        purchase_date: purchaseDate || null,
        amount_paid: parseBRLToNumber(amountPaid),
        due_date: owed > 0 ? dueDate || null : null,
        notes,
        items: payloadItems,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      // Anexa a nota fiscal, se houver foto
      if (notaFile && "purchaseId" in r && r.purchaseId) {
        const fd = new FormData();
        fd.append("file", notaFile);
        const up = await uploadPurchaseAttachment(r.purchaseId, fd);
        if (up && "error" in up) {
          setError(`Compra salva, mas a nota não subiu: ${up.error}`);
          return;
        }
      }
      onClose();
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">Nova compra de material</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Jazida + data */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Mountain className="w-3.5 h-3.5" /> Jazida / fornecedor
                </Label>
                <SearchableSelect
                  items={localJazidas}
                  value={locationId}
                  onChange={setLocationId}
                  getId={(l) => l.id}
                  getLabel={(l) => l.name}
                  placeholder="De quem compramos..."
                  searchPlaceholder="Buscar jazida..."
                  emptyMessage="Nenhuma jazida cadastrada"
                  onCreateNew={() => setJazDialogOpen(true)}
                  createNewLabel="Cadastrar nova jazida"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase_date">Data da compra</Label>
                <Input
                  id="purchase_date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>
            </div>

            {/* Itens */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Materiais comprados
                </Label>
                <button
                  type="button"
                  onClick={addItem}
                  className="text-xs text-produmar-600 hover:text-produmar-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar item
                </button>
              </div>

              <datalist id="estoque-units">
                {PRODUCT_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>

              <div className="space-y-2">
                {items.map((it, idx) => {
                  const lineTotal = parseQty(it.quantity) * parseBRLToNumber(it.unit_price);
                  return (
                    <div
                      key={idx}
                      className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 bg-slate-50/40 dark:bg-slate-800/40"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <SearchableSelect
                            items={localProducts}
                            value={it.product_id}
                            onChange={(id) => pickProduct(idx, id)}
                            getId={(p) => p.id}
                            getLabel={(p) => p.name}
                            renderItem={(p) => (
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <span className="truncate">{p.name}</span>
                                <span className="text-[10px] text-slate-400 flex-shrink-0">
                                  {p.unit}
                                </span>
                              </div>
                            )}
                            placeholder="Selecione material..."
                            searchPlaceholder="Buscar material..."
                            emptyMessage="Nenhum material"
                            onCreateNew={() => {
                              setPrdDialogIdx(idx);
                              setPrdDialogOpen(true);
                            }}
                            createNewLabel="Cadastrar material"
                          />
                        </div>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                            title="Remover item"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4 sm:col-span-3 space-y-1">
                          <Label className="text-[10px] text-slate-500 dark:text-slate-400">
                            Quantidade
                          </Label>
                          <Input
                            value={it.quantity}
                            onChange={(e) => setItem(idx, { quantity: formatQty(e.target.value) })}
                            placeholder="0"
                            inputMode="decimal"
                            autoComplete="off"
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-2 space-y-1">
                          <Label className="text-[10px] text-slate-500 dark:text-slate-400">Un.</Label>
                          <Input
                            value={it.unit}
                            onChange={(e) => setItem(idx, { unit: e.target.value })}
                            placeholder="m³"
                            list="estoque-units"
                            autoComplete="off"
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="col-span-5 sm:col-span-4 space-y-1">
                          <Label className="text-[10px] text-slate-500 dark:text-slate-400">
                            Valor unit. (R$)
                          </Label>
                          <Input
                            value={it.unit_price}
                            onChange={(e) => setItem(idx, { unit_price: formatBRLInput(e.target.value) })}
                            placeholder="0,00"
                            inputMode="decimal"
                            autoComplete="off"
                            className="h-9 text-sm tabular-nums"
                          />
                        </div>
                        <div className="col-span-12 sm:col-span-3 space-y-1 sm:text-right">
                          <Label className="text-[10px] text-slate-500 dark:text-slate-400">Subtotal</Label>
                          <p className="h-9 flex items-center sm:justify-end text-sm font-semibold text-produmar-700 dark:text-produmar-400 tabular-nums">
                            {formatBRL(lineTotal)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Total da compra
              </span>
              <span className="text-lg font-bold tabular-nums text-produmar-700 dark:text-produmar-400">
                {formatBRL(total)}
              </span>
            </div>

            {/* Pagamento / dívida */}
            <div className="rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" /> Pagamento
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor pago agora</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                    <Input
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(formatBRLInput(e.target.value))}
                      placeholder="0,00"
                      inputMode="decimal"
                      autoComplete="off"
                      className="pl-9 tabular-nums"
                    />
                  </div>
                </div>
                {owed > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="due_date" className="text-xs">
                      Vencimento do saldo
                    </Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {owed > 0 ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 tabular-nums">
                  Saldo devedor de{" "}
                  <span className="font-bold">{formatBRL(owed)}</span> — será criada uma
                  conta a pagar no módulo Contas.
                </p>
              ) : (
                total > 0 && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    Compra paga integralmente — nenhuma conta a pagar será gerada.
                  </p>
                )
              )}
            </div>

            {/* Nota fiscal (foto/arquivo) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" /> Nota fiscal (opcional)
              </Label>
              {notaFile ? (
                <div className="flex items-center gap-3 p-2 rounded-lg border border-produmar-100 dark:border-produmar-900/30 bg-produmar-50/50 dark:bg-produmar-900/20">
                  <div className="w-12 h-12 rounded-md overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    {notaPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={notaPreview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Paperclip className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <span className="flex-1 min-w-0 text-xs text-slate-700 dark:text-slate-200 truncate">
                    {notaFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => pickNota(null)}
                    className="p-1 text-slate-400 hover:text-red-500"
                    title="Remover"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" /> Câmera
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Paperclip className="w-3.5 h-3.5" /> Arquivo
                  </button>
                </div>
              )}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  pickNota(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  pickNota(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label htmlFor="purchase_notes">Observações</Label>
              <Textarea
                id="purchase_notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.toUpperCase())}
                placeholder="observações opcionais..."
                rows={2}
                className="uppercase placeholder:normal-case placeholder:lowercase"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : "Lançar compra"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <QuickCreateProductDialog
        open={prdDialogOpen}
        onClose={() => {
          setPrdDialogOpen(false);
          setPrdDialogIdx(null);
        }}
        onCreated={handleProductCreated}
      />
      <QuickCreateLocationDialog
        open={jazDialogOpen}
        onClose={() => setJazDialogOpen(false)}
        onCreated={handleJazidaCreated}
      />
    </>
  );
}
