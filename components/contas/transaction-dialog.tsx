"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { QuickCreateCategoryDialog } from "./quick-create-category-dialog";
import { QuickCreateCostCenterDialog } from "./quick-create-cost-center-dialog";
import { createTransaction, updateTransaction } from "@/app/(app)/contas/actions";
import type {
  Category,
  CostCenter,
  Transaction,
  TransactionStatus,
  TransactionType,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  transaction?: Transaction | null;
  categories: Category[];
  costCenters: CostCenter[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBRLInput(raw: string | number): string {
  let digits: string;
  if (typeof raw === "number") {
    digits = String(Math.round(raw * 100));
  } else {
    digits = raw.replace(/\D/g, "");
  }
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function TransactionDialog({
  open,
  onClose,
  transaction,
  categories,
  costCenters,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TransactionType>(transaction?.type ?? "saida");
  const [status, setStatus] = useState<TransactionStatus>(transaction?.status ?? "pendente");
  const [categoryId, setCategoryId] = useState<string>(transaction?.category_id ?? "");
  const [costCenterId, setCostCenterId] = useState<string>(transaction?.cost_center_id ?? "");
  const [amount, setAmount] = useState<string>(
    transaction?.amount ? formatBRLInput(transaction.amount) : ""
  );

  // Local lists so we can insert newly-created entities optimistically
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);
  const [localCostCenters, setLocalCostCenters] = useState<CostCenter[]>(costCenters);

  // Quick-create dialogs
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [ccDialogOpen, setCCDialogOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setType(transaction?.type ?? "saida");
      setStatus(transaction?.status ?? "pendente");
      setCategoryId(transaction?.category_id ?? "");
      setCostCenterId(transaction?.cost_center_id ?? "");
      setAmount(transaction?.amount ? formatBRLInput(transaction.amount) : "");
      setError(null);
    }
  }, [open, transaction]);

  // Sync local lists when the parent reloads data
  useEffect(() => setLocalCategories(categories), [categories]);
  useEffect(() => setLocalCostCenters(costCenters), [costCenters]);

  // Reset category when type changes
  useEffect(() => {
    setCategoryId("");
  }, [type]);

  const filteredCategories = useMemo(
    () => localCategories.filter((c) => c.type === type),
    [localCategories, type]
  );
  const isPaid = status === "pago" || status === "recebido";

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAmount(formatBRLInput(e.target.value));
  }

  function handleCategoryCreated(cat: Category) {
    setLocalCategories((prev) =>
      [...prev.filter((c) => c.id !== cat.id), cat].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    setCategoryId(cat.id);
  }

  function handleCostCenterCreated(cc: CostCenter) {
    setLocalCostCenters((prev) =>
      [...prev.filter((c) => c.id !== cc.id), cc].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    setCostCenterId(cc.id);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    formData.set(
      "description",
      String(formData.get("description") ?? "").trim().toUpperCase()
    );
    formData.set(
      "notes",
      String(formData.get("notes") ?? "").trim().toUpperCase()
    );

    formData.set("type", type);
    formData.set("status", status);
    formData.set("category_id", categoryId);
    formData.set("cost_center_id", costCenterId);
    formData.set("amount", amount);

    startTransition(async () => {
      const result = transaction
        ? await updateTransaction(transaction.id, formData)
        : await createTransaction(formData);

      if (result && "error" in result) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">
              {transaction ? "Editar lançamento" : "Novo lançamento"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["saida", "entrada"] as TransactionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`py-2.5 text-sm rounded-lg border font-medium transition-colors ${
                      type === t
                        ? t === "saida"
                          ? "bg-red-50 border-red-200 text-red-700"
                          : "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {t === "saida" ? "💸 Despesa" : "💰 Receita"}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="description">Descrição *</Label>
              <Input
                id="description"
                name="description"
                defaultValue={transaction?.description ?? ""}
                placeholder="ex: conta de energia"
                className="uppercase placeholder:normal-case placeholder:lowercase"
                autoCapitalize="characters"
                required
              />
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor (R$) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                  R$
                </span>
                <Input
                  id="amount"
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0,00"
                  className="pl-9 tabular-nums"
                  required
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="due_date">Vencimento *</Label>
                <Input
                  id="due_date"
                  name="due_date"
                  type="date"
                  defaultValue={transaction?.due_date ?? ""}
                  required
                />
              </div>
              {isPaid && (
                <div className="space-y-1.5">
                  <Label htmlFor="paid_date">Data de pagamento</Label>
                  <Input
                    id="paid_date"
                    name="paid_date"
                    type="date"
                    defaultValue={transaction?.paid_date ?? ""}
                  />
                </div>
              )}
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TransactionStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  {type === "entrada" ? (
                    <SelectItem value="recebido">Recebido</SelectItem>
                  ) : (
                    <SelectItem value="pago">Pago</SelectItem>
                  )}
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category — searchable + create new */}
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <SearchableSelect
                items={filteredCategories}
                value={categoryId}
                onChange={setCategoryId}
                getId={(c) => c.id}
                getLabel={(c) => c.name}
                renderItem={(c) => (
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="truncate">{c.name}</span>
                  </div>
                )}
                placeholder="Selecione uma categoria..."
                searchPlaceholder="Buscar categoria..."
                emptyMessage="Nenhuma categoria encontrada"
                onCreateNew={() => setCatDialogOpen(true)}
                createNewLabel="Criar nova categoria"
              />
            </div>

            {/* Cost Center — searchable + create new */}
            <div className="space-y-1.5">
              <Label>Centro de custo</Label>
              <SearchableSelect
                items={localCostCenters}
                value={costCenterId}
                onChange={setCostCenterId}
                getId={(cc) => cc.id}
                getLabel={(cc) => cc.name}
                placeholder="Selecione um centro de custo..."
                searchPlaceholder="Buscar centro de custo..."
                emptyMessage="Nenhum centro de custo encontrado"
                onCreateNew={() => setCCDialogOpen(true)}
                createNewLabel="Criar novo centro de custo"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                name="notes"
                defaultValue={transaction?.notes ?? ""}
                placeholder="observações opcionais..."
                rows={2}
                className="uppercase placeholder:normal-case placeholder:lowercase"
                autoCapitalize="characters"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : transaction ? "Salvar alterações" : "Lançar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nested dialogs for inline creation */}
      <QuickCreateCategoryDialog
        open={catDialogOpen}
        onClose={() => setCatDialogOpen(false)}
        defaultType={type}
        onCreated={handleCategoryCreated}
      />
      <QuickCreateCostCenterDialog
        open={ccDialogOpen}
        onClose={() => setCCDialogOpen(false)}
        onCreated={handleCostCenterCreated}
      />
    </>
  );
}
