"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { trocarMaeDoParto } from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  SPECIES_META,
  STICKY_FOOTER,
  ItemDeAnimal,
  categoryLabel,
  speciesOf,
} from "./animal-shared";
import type { AnimalBirth, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** O bezerro que foi lançado na mãe errada. */
  cria: AnimalWithInfo;
  /** O parto que liga o bezerro à mãe de agora. */
  parto: AnimalBirth;
  /** Número da mãe de agora (a errada). */
  maeAtualTag: string | null;
  /** Fêmeas do cadastro — a lista mostra só as do mesmo tipo do bezerro. */
  maes: AnimalWithInfo[];
}

/**
 * Bezerro lançado na mãe errada: escolhe a mãe certa e o parto passa para ela.
 * O bezerro continua o mesmo, só muda de quem ele é.
 */
export function TrocarMaeDialog({ open, onClose, cria, parto, maeAtualTag, maes }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [novaMaeId, setNovaMaeId] = useState("");

  useEffect(() => {
    if (!open) return;
    setNovaMaeId("");
    setError(null);
  }, [open, parto.id]);

  const names = SPECIES_META[speciesOf(cria.species)];
  const young = (cria.sex === "macho" ? names.youngMale : names.youngFemale).toLowerCase();

  /** Fêmeas do mesmo tipo, no rebanho, tirando a mãe de agora e o próprio bezerro. */
  const opcoes = maes.filter(
    (a) =>
      a.id !== parto.mother_id &&
      a.id !== cria.id &&
      a.active !== false &&
      speciesOf(a.species) === speciesOf(cria.species)
  );
  const novaMae = opcoes.find((a) => a.id === novaMaeId) ?? null;
  const mudaRaca =
    !!novaMae?.breed_id && novaMae.breed_id !== cria.breed_id &&
    // só troca a raça quando ela veio da mãe errada (é a mesma dela)
    maes.find((a) => a.id === parto.mother_id)?.breed_id === cria.breed_id;

  function handleSubmit() {
    setError(null);
    if (!novaMaeId) {
      setError("Escolha a mãe certa");
      return;
    }
    startTransition(async () => {
      const r = await trocarMaeDoParto(parto.id, novaMaeId);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao trocar a mãe");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            Trocar a mãe do {young} {cria.tag}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Mãe lançada agora</Label>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 line-through">
              {maeAtualTag ? `Nº ${maeAtualTag}` : "—"}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Mãe certa *</Label>
            <SearchableSelect
              items={opcoes}
              value={novaMaeId}
              onChange={setNovaMaeId}
              getId={(a) => a.id}
              getLabel={(a) => a.tag}
              renderItem={(a) => (
                <ItemDeAnimal
                  numero={a.tag}
                  detalhe={`${categoryLabel(a.category, a.sex, a.species)}${
                    a.breed_name ? ` · ${a.breed_name}` : ""
                  }`}
                />
              )}
              placeholder="Selecione a mãe certa..."
              searchPlaceholder="Buscar pelo número..."
              emptyMessage={`Nenhuma fêmea de ${names.plural.toLowerCase()} cadastrada`}
            />
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            O {young} continua o mesmo — número, peso, vacinas e histórico. Só o
            parto sai da {maeAtualTag ? `nº ${maeAtualTag}` : "mãe de agora"} e vai
            para a mãe certa.
            {mudaRaca && novaMae?.breed_name
              ? ` A raça dele passa a ser ${novaMae.breed_name}, a da mãe certa.`
              : ""}
          </p>

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
              className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !novaMaeId}
              className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
            >
              {isPending ? "Salvando..." : "Trocar a mãe"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
