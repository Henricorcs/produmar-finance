"use client";

import { useEffect, useState, useTransition } from "react";
import { Layers } from "lucide-react";
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
import { cn, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { createAnimalLote, updateAnimalLote } from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  LOTE_SPECIES_OPTIONS,
  SPECIES_META,
  STICKY_FOOTER,
  criacaoPorLote,
  formatDecimalInput,
  localLabel,
  parseDecimal,
  speciesOf,
} from "./animal-shared";
import type { AnimalLoteResumo, AnimalSpecies, AnimalTanque } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ciclo em edição — null abre um novo. */
  lote: AnimalLoteResumo | null;
  tanques: AnimalTanque[];
  presetSpecies?: AnimalSpecies | null;
}

/**
 * ABRIR (ou corrigir) O CICLO de um tanque.
 *
 * A quantidade só aparece ao abrir: ela vira o primeiro movimento de entrada.
 * Depois disso, quem muda a quantidade é movimento — entrada nova, morte ou
 * correção de contagem —, para não haver dois lugares dizendo quanto tem.
 */
export function LoteDialog({ open, onClose, lote, tanques, presetSpecies }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [species, setSpecies] = useState<AnimalSpecies>("piscicultura");
  const [tanqueId, setTanqueId] = useState("");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(localDateISO());
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const bruta = speciesOf(lote?.species ?? presetSpecies ?? "piscicultura");
    setSpecies(criacaoPorLote(bruta) ? bruta : "piscicultura");
    setTanqueId(lote?.tanque_id ?? "");
    setName(lote?.name ?? "");
    setStartDate(lote?.start_date ?? localDateISO());
    setQuantity("");
    setNotes(lote?.notes ?? "");
    setError(null);
  }, [open, lote, presetSpecies]);

  const palavra = localLabel(species);
  /** Tanque desativado não recebe ciclo novo, mas continua no ciclo antigo. */
  const disponiveis = tanques.filter(
    (t) => speciesOf(t.species) === species && (t.active || t.id === lote?.tanque_id)
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!tanqueId) {
      setError(`Escolha o ${palavra.toLowerCase()}`);
      return;
    }
    const qtd = parseDecimal(quantity);
    if (!lote && qtd <= 0) {
      setError(`Informe quantos entraram no ${palavra.toLowerCase()}`);
      return;
    }

    startTransition(async () => {
      const input = {
        tanque_id: tanqueId,
        species,
        name,
        start_date: startDate,
        notes,
        quantity: qtd,
      };
      const r = lote
        ? await updateAnimalLote(lote.id, input)
        : await createAnimalLote(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar o ciclo");
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
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400">
              <Layers className="w-4 h-4" />
            </span>
            {lote ? "Editar ciclo" : "Novo ciclo"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Só peixe e ave têm tanque — a escolha some quando só há uma */}
          {LOTE_SPECIES_OPTIONS.length > 1 && (
            <div className="space-y-1.5">
              <Label>Tipo de animal *</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {LOTE_SPECIES_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      setSpecies(o.value);
                      setTanqueId("");
                    }}
                    className={cn(
                      "min-h-[44px] rounded-lg border text-sm font-semibold transition-colors",
                      species === o.value
                        ? "bg-produmar-600 border-produmar-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                    )}
                  >
                    {SPECIES_META[o.value].plural}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{palavra} *</Label>
            {disponiveis.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded-lg px-3 py-2">
                Nenhum {palavra.toLowerCase()} cadastrado nesta criação. Cadastre um
                primeiro, no botão {palavra.toLowerCase()}s da aba.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {disponiveis.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTanqueId(t.id)}
                    className={cn(
                      "min-h-[44px] rounded-lg border text-sm font-semibold transition-colors px-2",
                      tanqueId === t.id
                        ? "bg-cyan-600 border-cyan-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Só ao abrir: depois, quem manda na quantidade é o movimento */}
          {!lote && (
            <div className="space-y-1.5">
              <Label htmlFor="lo_qtd">Quantos entraram *</Label>
              <Input
                id="lo_qtd"
                value={quantity}
                onChange={(e) => setQuantity(formatDecimalInput(e.target.value))}
                placeholder="0"
                className="h-11 text-base tabular-nums font-semibold sm:h-10"
                inputMode="decimal"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Os alevinos (ou pintinhos) que foram para este {palavra.toLowerCase()}.
                Entra como o primeiro movimento do ciclo — dá para corrigir depois.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="lo_data">{lote ? "Início" : "Data de entrada"}</Label>
            <Input
              id="lo_data"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 tabular-nums sm:h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lo_nome">Nome do ciclo</Label>
            <Input
              id="lo_nome"
              value={name}
              onChange={(e) => setName(upperKeepingCaret(e))}
              placeholder="opcional — ex: tilápia 2026/1"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lo_notes">Observação</Label>
            <Textarea
              id="lo_notes"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              rows={2}
              autoCapitalize="characters"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
              className={FOOTER_CANCEL}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending || disponiveis.length === 0}
              className={FOOTER_SUBMIT}
            >
              {isPending ? "Salvando..." : lote ? "Salvar" : "Abrir ciclo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
