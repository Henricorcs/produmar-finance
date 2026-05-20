"use client";

import { useState, useTransition, useEffect } from "react";
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

  useEffect(() => {
    if (open) {
      setType(transaction?.type ?? "saida");
      setStatus(transaction?.status ?? "pendente");
      setCategoryId(transaction?.category_id ?? "");
      setCostCenterId(transaction?.cost_center_id ?? "");
      setError(null);
    }
  }, [open, transaction]);

  // Reset category when type changes
  useEffect(() => {
    setCategoryId("");
  }, [type]);

  const filteredCategories = categories.filter((c) => c.type === type);
  const isPaid = status === "pago" || status === "recebido";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("type", type);
    formData.set("status", status);
    formData.set("category_id", categoryId);
    formData.set("cost_center_id", costCenterId);

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
              placeholder="Ex: Conta de energia"
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
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={transaction?.amount ?? ""}
                placeholder="0,00"
                className="pl-9"
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

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria..." />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cost Center */}
          <div className="space-y-1.5">
            <Label>Centro de custo</Label>
            <Select value={costCenterId} onValueChange={setCostCenterId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um centro de custo..." />
              </SelectTrigger>
              <SelectContent>
                {costCenters.map((cc) => (
                  <SelectItem key={cc.id} value={cc.id}>
                    {cc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={transaction?.notes ?? ""}
              placeholder="Observações opcionais..."
              rows={2}
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
              {isPending ? "Salvando..." : transaction ? "Salvar alterações" : "Criar lançamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
