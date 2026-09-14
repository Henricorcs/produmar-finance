"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Pencil, Plus, Syringe, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionError } from "@/lib/action-result";
import { cn, upperKeepingCaret } from "@/lib/utils";
import {
  addProtocoloItem,
  deleteProtocoloItem,
  updateProtocoloItem,
} from "@/app/(app)/animais/actions";
import { PARTO_SPECIES_OPTIONS, SPECIES_META } from "./animal-shared";
import type { AnimalSpecies, ProtocoloNascimentoItem } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  protocolo: ProtocoloNascimentoItem[];
}

/**
 * O PROTOCOLO DO NASCIMENTO — o que a cria toma na hora em que nasce.
 *
 * Quem decide é o dono, bicho por bicho: o bezerro toma uma coisa, o leitão
 * outra. O que entrar aqui aparece no celular do vaqueiro no ato de informar o
 * nascimento, e ele só consegue salvar depois de marcar cada item como
 * aplicado. Ao lançar a cria no rebanho, cada item vira um tratamento na ficha
 * dela.
 *
 * Mudar a lista vale para os próximos nascimentos — o que já foi enviado
 * guarda o que estava valendo na hora.
 */
export function ProtocoloNascimentoDialog({ open, onClose, protocolo }: Props) {
  const [species, setSpecies] = useState<AnimalSpecies>("bovino");
  const [medicine, setMedicine] = useState("");
  const [dose, setDose] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /** O item em correção, com o texto que está sendo digitado. */
  const [editando, setEditando] = useState<{ id: string; medicine: string; dose: string } | null>(
    null
  );

  useEffect(() => {
    if (!open) return;
    setMedicine("");
    setDose("");
    setErro(null);
    setEditando(null);
  }, [open]);

  const doBicho = protocolo.filter((i) => i.species === species);
  const nomes = SPECIES_META[species];

  function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!medicine.trim()) return setErro("Escreva o medicamento");
    startTransition(async () => {
      const falha = actionError(await addProtocoloItem({ species, medicine, dose }));
      if (falha) return setErro(falha);
      setMedicine("");
      setDose("");
    });
  }

  function salvarEdicao() {
    if (!editando) return;
    setErro(null);
    if (!editando.medicine.trim()) return setErro("Escreva o medicamento");
    startTransition(async () => {
      const falha = actionError(
        await updateProtocoloItem(editando.id, {
          medicine: editando.medicine,
          dose: editando.dose,
        })
      );
      if (falha) return setErro(falha);
      setEditando(null);
    });
  }

  function remover(item: ProtocoloNascimentoItem) {
    if (!confirm(`Tirar ${item.medicine} do protocolo do ${nomes.youngMale.toLowerCase()}?`)) return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await deleteProtocoloItem(item.id));
      if (falha) setErro(falha);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <Syringe className="w-4 h-4" />
            </span>
            Protocolo do nascimento
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
          O que a cria toma assim que nasce. Aparece no celular do vaqueiro e ele só salva o
          nascimento depois de marcar cada item como aplicado.
        </p>

        {/* De que bicho é o protocolo */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mt-3">
          {PARTO_SPECIES_OPTIONS.map((opt) => {
            const qtd = protocolo.filter((i) => i.species === opt.value).length;
            const ativo = species === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setSpecies(opt.value);
                  setEditando(null);
                  setErro(null);
                }}
                className={cn(
                  "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  ativo
                    ? "bg-produmar-600 border-produmar-600 text-white"
                    : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                )}
              >
                {SPECIES_META[opt.value].label}
                {qtd > 0 && <span className="ml-1 tabular-nums opacity-80">({qtd})</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            O {nomes.youngMale.toLowerCase()} toma ao nascer
          </p>

          {doBicho.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-3 py-4 text-center">
              Nada ainda — o vaqueiro informa o nascimento de{" "}
              {nomes.youngMale.toLowerCase()} sem protocolo.
            </p>
          ) : (
            <ol className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {doBicho.map((item, i) =>
                editando?.id === item.id ? (
                  <li key={item.id} className="p-2.5 space-y-2 bg-produmar-50/40 dark:bg-slate-800/40">
                    <Input
                      value={editando.medicine}
                      onChange={(e) =>
                        setEditando({ ...editando, medicine: upperKeepingCaret(e) })
                      }
                      autoCapitalize="characters"
                      placeholder="Medicamento"
                      autoComplete="off"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={editando.dose}
                        onChange={(e) => setEditando({ ...editando, dose: upperKeepingCaret(e) })}
                        autoCapitalize="characters"
                        placeholder="Dose (opcional)"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setEditando(null)}
                        disabled={isPending}
                        aria-label="Cancelar"
                        className="h-11 w-11 sm:h-10 sm:w-10 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        onClick={salvarEdicao}
                        disabled={isPending}
                        aria-label="Salvar"
                        className="h-11 w-11 sm:h-10 sm:w-10 flex-shrink-0"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    </div>
                  </li>
                ) : (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums w-4 flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 break-words">
                        {item.medicine}
                      </p>
                      {item.dose && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.dose}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEditando({ id: item.id, medicine: item.medicine, dose: item.dose ?? "" })
                      }
                      disabled={isPending}
                      aria-label={`Corrigir ${item.medicine}`}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-produmar-600 flex-shrink-0"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remover(item)}
                      disabled={isPending}
                      aria-label={`Tirar ${item.medicine}`}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                )
              )}
            </ol>
          )}
        </div>

        {/* O campo para indicar o que aplicar */}
        <form onSubmit={adicionar} className="mt-3 space-y-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="prot_medicine">Medicamento a aplicar *</Label>
            <Input
              id="prot_medicine"
              value={medicine}
              onChange={(e) => setMedicine(upperKeepingCaret(e))}
              placeholder="ex: IODO NO UMBIGO"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>
          <div className="flex gap-2 items-end">
            <div className="space-y-1.5 flex-1 min-w-0">
              <Label htmlFor="prot_dose">Dose</Label>
              <Input
                id="prot_dose"
                value={dose}
                onChange={(e) => setDose(upperKeepingCaret(e))}
                placeholder="ex: 2 ML (opcional)"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={isPending} className="h-11 sm:h-10 flex-shrink-0">
              <Plus className="w-4 h-4" />
              Adicionar
            </Button>
          </div>
        </form>

        {erro && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
            {erro}
          </p>
        )}

        <Button type="button" variant="outline" className="w-full mt-4" onClick={onClose}>
          Pronto
        </Button>
      </DialogContent>
    </Dialog>
  );
}
