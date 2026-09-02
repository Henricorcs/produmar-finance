"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2, Truck } from "lucide-react";
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
import { actionError } from "@/lib/action-result";
import { cn, upperKeepingCaret } from "@/lib/utils";
import {
  createMachineParceiroVeiculo,
  deleteMachineParceiroVeiculo,
  updateMachineParceiroVeiculo,
} from "@/app/(app)/frota/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./frota-shared";
import {
  MACHINE_CATEGORIES,
  type MachineParceiro,
  type MachineParceiroVeiculo,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  parceiro: MachineParceiro;
  /** Veículo em edição — null cadastra um novo. */
  veiculo: MachineParceiroVeiculo | null;
  /** Tipo já escolhido na caixa do dia. */
  presetCategory?: string;
}

/**
 * O VEÍCULO DO PARCEIRO — placa, apelido e tipo.
 *
 * A placa é o que identifica na conversa do fim do mês: "a caçamba ABC-1234
 * trabalhou dia 12 e parou dia 13". O apelido é para quem chama de "caçamba
 * vermelha" — um dos dois basta.
 */
export function ParceiroVeiculoDialog({
  open,
  onClose,
  parceiro,
  veiculo,
  presetCategory,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [plate, setPlate] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("cacamba");

  useEffect(() => {
    if (!open) return;
    setPlate(veiculo?.plate ?? "");
    setName(veiculo?.name ?? "");
    setCategory(veiculo?.category ?? presetCategory ?? "cacamba");
    setErro(null);
  }, [open, veiculo, presetCategory]);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!plate.trim() && !name.trim()) {
      setErro("Informe a placa (ou pelo menos um apelido)");
      return;
    }
    startTransition(async () => {
      const input = { parceiro_id: parceiro.id, plate, name, category };
      const r = veiculo
        ? await updateMachineParceiroVeiculo(veiculo.id, input)
        : await createMachineParceiroVeiculo(input);
      const falha = actionError(r);
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  function apagar() {
    if (!veiculo) return;
    if (!confirm("Tirar este veículo do cadastro? Os dias já lançados continuam como estão."))
      return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await deleteMachineParceiroVeiculo(veiculo.id));
      if (falha) {
        setErro(falha);
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
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
              <Truck className="w-4 h-4" />
            </span>
            {veiculo ? "Editar veículo" : "Veículo do parceiro"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            De{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {parceiro.name}
            </span>
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="pv_placa">Placa</Label>
            <Input
              id="pv_placa"
              value={plate}
              onChange={(e) => setPlate(upperKeepingCaret(e))}
              placeholder="ABC-1234"
              className="h-11 uppercase text-base font-semibold tracking-wide placeholder:normal-case sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pv_apelido">Apelido</Label>
            <Input
              id="pv_apelido"
              value={name}
              onChange={(e) => setName(upperKeepingCaret(e))}
              placeholder="ex: caçamba vermelha"
              className="h-11 uppercase placeholder:normal-case placeholder:lowercase sm:h-10"
              autoComplete="off"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              A placa ou o apelido — um dos dois basta para reconhecer o veículo no
              dia.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de máquina</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {MACHINE_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    "min-h-[40px] rounded-lg border text-xs font-semibold transition-colors",
                    category === c.value
                      ? "bg-produmar-600 border-produmar-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            {veiculo && (
              <button
                type="button"
                onClick={apagar}
                disabled={isPending}
                aria-label="Apagar veículo"
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
              {isPending ? "Salvando..." : veiculo ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
