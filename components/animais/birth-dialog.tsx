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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { localDateISO } from "@/lib/utils";
import { createBirth } from "@/app/(app)/animais/actions";
import { SexPicker, categoryLabel } from "./animal-shared";
import type { AnimalSex, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Só fêmeas podem parir. */
  mothers: AnimalWithInfo[];
  /** Pré-seleciona a mãe (quando aberto pela ficha). */
  presetMotherId?: string | null;
}

/** Registra um parto — uma linha por bezerro nascido. */
export function BirthDialog({ open, onClose, mothers, presetMotherId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [motherId, setMotherId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [calfTag, setCalfTag] = useState("");
  const [calfSex, setCalfSex] = useState<AnimalSex>("femea");
  const [registerCalf, setRegisterCalf] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setMotherId(presetMotherId ?? "");
    setBirthDate(localDateISO());
    setCalfTag("");
    setCalfSex("femea");
    setRegisterCalf(true);
    setNotes("");
    setError(null);
  }, [open, presetMotherId]);

  const presetMother = presetMotherId
    ? mothers.find((a) => a.id === presetMotherId) ?? null
    : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!motherId) {
      setError("Selecione a mãe");
      return;
    }
    if (!birthDate) {
      setError("Informe a data de nascimento");
      return;
    }
    if (registerCalf && !calfTag.trim()) {
      setError("Informe o número do bezerro para cadastrá-lo");
      return;
    }

    startTransition(async () => {
      const r = await createBirth({
        mother_id: motherId,
        birth_date: birthDate,
        calf_tag: calfTag,
        calf_sex: calfSex,
        notes,
        register_calf: registerCalf,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao registrar o parto");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Registrar parto</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Mãe *</Label>
            {presetMother ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                {presetMother.tag}
              </div>
            ) : (
              <SearchableSelect
                items={mothers}
                value={motherId}
                onChange={setMotherId}
                getId={(a) => a.id}
                getLabel={(a) => a.tag}
                renderItem={(a) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{a.tag}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                      {categoryLabel(a.category, a.sex)}
                      {a.calves_count > 0 ? ` · ${a.calves_count} cria(s)` : ""}
                    </span>
                  </div>
                )}
                placeholder="Selecione a mãe..."
                searchPlaceholder="Buscar pelo número..."
                emptyMessage="Nenhuma fêmea cadastrada"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bt_date">Nascimento do bezerro *</Label>
            <Input
              id="bt_date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bt_calf_tag">Número do bezerro</Label>
            <Input
              id="bt_calf_tag"
              value={calfTag}
              onChange={(e) => setCalfTag(e.target.value.toUpperCase())}
              placeholder="ex: 1043"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Sexo do bezerro</Label>
            <SexPicker value={calfSex} onChange={setCalfSex} />
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={registerCalf}
              onChange={(e) => setRegisterCalf(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-produmar-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">
              Cadastrar o bezerro como animal
              <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                Cria a ficha do bezerro já com a data de nascimento e o tipo da mãe.
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="bt_notes">Observações</Label>
            <Textarea
              id="bt_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder="como foi o parto, peso ao nascer..."
              className="uppercase placeholder:normal-case placeholder:lowercase"
              rows={2}
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
              {isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
