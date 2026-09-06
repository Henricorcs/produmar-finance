"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Receipt, Trash2 } from "lucide-react";
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
import { actionError } from "@/lib/action-result";
import {
  cn,
  formatBRL,
  formatBRLInput,
  formatQty,
  localDateISO,
  parseMoney,
  upperKeepingCaret,
} from "@/lib/utils";
import {
  createMachineDespesa,
  deleteMachineDespesa,
  updateMachineDespesa,
} from "@/app/(app)/frota/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./frota-shared";
import {
  DESPESAS_MAQUINA_SUGERIDAS,
  type Machine,
  type MachineDespesa,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Despesa em edição — null lança uma nova. */
  despesa: MachineDespesa | null;
  /** Veículo já escolhido (veio da ficha) — trava o campo. */
  presetMachineId?: string | null;
  machines: Machine[];
}

/** O gasto é de combustível? É o que faz aparecer o campo de litros. */
function ehCombustivel(categoria: string): boolean {
  const c = categoria.toUpperCase();
  return c.includes("COMBUST") || c.includes("DIESEL") || c.includes("GASOLINA");
}

/**
 * A DESPESA DO VEÍCULO — diesel, mecânico, peça, pneu, motorista, imposto.
 *
 * O abastecimento guarda também os LITROS e a marcação do hodômetro/horímetro:
 * é o par que dá a média e o custo por km. Sem eles o diesel vira um valor
 * solto e ninguém descobre que o caminhão começou a beber demais.
 *
 * Isto NÃO cria lançamento no módulo Contas: é registro e relatório dentro da
 * Frota.
 */
export function DespesaDialog({
  open,
  onClose,
  despesa,
  presetMachineId,
  machines,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [machineId, setMachineId] = useState("");
  const [date, setDate] = useState(localDateISO());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [supplier, setSupplier] = useState("");
  const [liters, setLiters] = useState("");
  const [odometer, setOdometer] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setMachineId(despesa?.machine_id ?? presetMachineId ?? "");
    setDate(despesa?.expense_date ?? localDateISO());
    setCategory(despesa?.category ?? "");
    setDescription(despesa?.description ?? "");
    setAmount(despesa ? formatBRLInput(Number(despesa.amount)) : "");
    setSupplier(despesa?.supplier ?? "");
    setLiters(despesa?.liters ? formatQty(Number(despesa.liters)) : "");
    setOdometer(despesa?.odometer ? formatQty(Number(despesa.odometer)) : "");
    setNotes(despesa?.notes ?? "");
    setError(null);
  }, [open, despesa, presetMachineId]);

  const machine = useMemo(
    () => machines.find((m) => m.id === machineId) ?? null,
    [machines, machineId]
  );

  /** Máquina de horímetro conta HORA; veículo de hodômetro conta KM. */
  const marcacaoLabel =
    machine?.tracking_type === "km" ? "Km do hodômetro" : "Horímetro";

  const combustivel = ehCombustivel(category);
  const valor = parseMoney(amount);
  const litros = parseMoney(liters);
  /** O preço do litro, feito na frente de quem digita — é a conferência do posto. */
  const porLitro = combustivel && litros > 0 ? valor / litros : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!machineId) {
      setError("Escolha a máquina ou o veículo");
      return;
    }
    if (!description.trim()) {
      setError("Escreva o que foi a despesa");
      return;
    }
    if (valor <= 0) {
      setError("Informe o valor da despesa");
      return;
    }

    startTransition(async () => {
      const input = {
        machine_id: machineId,
        expense_date: date,
        category,
        description,
        amount: valor,
        supplier,
        liters: combustivel ? litros : null,
        odometer: parseMoney(odometer),
        notes,
      };
      const r = despesa
        ? await updateMachineDespesa(despesa.id, input)
        : await createMachineDespesa(input);
      const falha = actionError(r);
      if (falha) {
        setError(falha);
        return;
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!despesa) return;
    if (!confirm(`Apagar a despesa "${despesa.description}"? Isso não tem volta.`)) return;
    setError(null);
    startTransition(async () => {
      const falha = actionError(await deleteMachineDespesa(despesa.id));
      if (falha) {
        setError(falha);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
              <Receipt className="w-4 h-4" />
            </span>
            {despesa ? "Editar despesa" : "Nova despesa"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {presetMachineId ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Veículo:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {machine?.name ?? "—"}
              </span>
              {machine?.plate ? ` · ${machine.plate}` : ""}
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>Máquina / veículo *</Label>
              <SearchableSelect
                items={machines}
                value={machineId}
                onChange={setMachineId}
                getId={(m) => m.id}
                getLabel={(m) => m.name}
                renderItem={(m) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{m.name}</span>
                    {m.plate && (
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{m.plate}</span>
                    )}
                  </div>
                )}
                placeholder="Escolha o veículo"
                searchPlaceholder="Buscar pelo nome..."
                emptyMessage="Nenhum veículo cadastrado"
                suggestOnType
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="md_desc">O que foi *</Label>
            <Input
              id="md_desc"
              value={description}
              onChange={(e) => setDescription(upperKeepingCaret(e))}
              placeholder="ex: 100 litros de diesel"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="md_valor">Valor (R$) *</Label>
            <Input
              id="md_valor"
              value={amount}
              onChange={(e) => setAmount(formatBRLInput(e.target.value))}
              placeholder="0,00"
              className="h-11 text-base tabular-nums font-semibold sm:h-10"
              inputMode="decimal"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="md_data">Data</Label>
            <Input
              id="md_data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 tabular-nums sm:h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="md_cat">Categoria</Label>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {DESPESAS_MAQUINA_SUGERIDAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(category === c ? "" : c)}
                  className={cn(
                    "flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                    category === c
                      ? "bg-rose-600 border-rose-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            <Input
              id="md_cat"
              value={category}
              onChange={(e) => setCategory(upperKeepingCaret(e))}
              placeholder="opcional — é o que agrupa o relatório"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          {/* Litros e marcação: o par que dá a média do veículo */}
          <div className={cn("grid gap-3", combustivel ? "grid-cols-2" : "grid-cols-1")}>
            {combustivel && (
              <div className="space-y-1.5">
                <Label htmlFor="md_litros">Litros</Label>
                <Input
                  id="md_litros"
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                  placeholder="0"
                  className="h-11 tabular-nums sm:h-10"
                  inputMode="decimal"
                  autoComplete="off"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="md_marcacao">{marcacaoLabel}</Label>
              <Input
                id="md_marcacao"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder="opcional"
                className="h-11 tabular-nums sm:h-10"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
          </div>

          {porLitro > 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              Deu {formatBRL(porLitro)} o litro.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="md_forn">Fornecedor</Label>
            <Input
              id="md_forn"
              value={supplier}
              onChange={(e) => setSupplier(upperKeepingCaret(e))}
              placeholder="opcional, o posto, a oficina, a loja"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="md_notes">Observação</Label>
            <Textarea
              id="md_notes"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              rows={2}
              autoCapitalize="characters"
            />
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            A despesa fica aqui, na ficha do veículo — ela não vira lançamento no
            módulo Contas.
          </p>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            {despesa && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                aria-label="Apagar despesa"
                className="h-11 px-4 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 sm:h-10"
              >
                <Trash2 className="w-4 h-4 inline" />
              </button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
              className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
            >
              {isPending ? "Salvando..." : despesa ? "Salvar" : "Lançar despesa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
