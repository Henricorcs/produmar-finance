"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, X, Settings2 } from "lucide-react";
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
import { createAnimal, updateAnimal, uploadAnimalPhotos } from "@/app/(app)/animais/actions";
import { SexPicker, parseDecimal, formatDecimalInput } from "./animal-shared";
import { AnimalTypesDialog } from "./animal-types-dialog";
import type { Animal, AnimalSex, AnimalType } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Animal em edição — null cria um novo. */
  animal: Animal | null;
  /** Tipos de animal cadastrados. */
  types: AnimalType[];
}

export function AnimalDialog({ open, onClose, animal, types }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tag, setTag] = useState("");
  const [sex, setSex] = useState<AnimalSex>("femea");
  const [birthDate, setBirthDate] = useState("");
  const [typeId, setTypeId] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [typesOpen, setTypesOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTag(animal?.tag ?? "");
    setSex(animal?.sex ?? "femea");
    setBirthDate(animal?.birth_date ?? "");
    setTypeId(animal?.type_id ?? "");
    setWeight(animal && animal.weight ? String(animal.weight).replace(".", ",") : "");
    setNotes(animal?.notes ?? "");
    setPhotos([]);
    setError(null);
  }, [open, animal]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!tag.trim()) {
      setError("Informe o número do animal");
      return;
    }

    startTransition(async () => {
      const input = {
        tag,
        sex,
        birth_date: birthDate || null,
        type_id: typeId || null,
        weight: parseDecimal(weight),
        notes,
      };
      const r = animal ? await updateAnimal(animal.id, input) : await createAnimal(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }

      // fotos são opcionais — sobem depois do cadastro
      const animalId = animal?.id ?? (r as { animalId?: string }).animalId;
      if (photos.length > 0 && animalId) {
        const fd = new FormData();
        photos.forEach((p) => fd.append("files", p));
        const up = await uploadAnimalPhotos(animalId, fd);
        if (up && "error" in up) {
          setError(`Animal salvo, mas as fotos falharam: ${up.error}`);
          return;
        }
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {animal ? "Editar animal" : "Novo animal"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="animal_tag">Número do animal *</Label>
            <Input
              id="animal_tag"
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase())}
              placeholder="ex: 1042, brinco a-15"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Sexo *</Label>
            <SexPicker value={sex} onChange={setSex} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="animal_birth">Nascimento</Label>
              <Input
                id="animal_birth"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="animal_weight">Peso (kg)</Label>
              <Input
                id="animal_weight"
                value={weight}
                onChange={(e) => setWeight(formatDecimalInput(e.target.value))}
                placeholder="0"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="animal_type">Tipo de animal</Label>
              <button
                type="button"
                onClick={() => setTypesOpen(true)}
                className="flex items-center gap-1 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
              >
                <Settings2 className="w-3 h-3" />
                Gerenciar
              </button>
            </div>
            <select
              id="animal_type"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="w-full h-10 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-800 dark:text-slate-100"
            >
              <option value="">Sem tipo</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Fotos</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                if (picked.length) setPhotos((prev) => [...prev, ...picked]);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            {photos.length > 0 && (
              <ul className="space-y-1.5">
                {photos.map((p, i) => (
                  <li
                    key={`${p.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2"
                  >
                    <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                      {p.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                      aria-label="Remover foto"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="w-4 h-4" />
              {photos.length > 0 ? "Adicionar mais fotos" : "Adicionar fotos"}
            </Button>
            {animal && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                As fotos atuais ficam salvas. Aqui você adiciona novas — para
                remover, use a galeria na ficha do animal.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="animal_notes">Observações</Label>
            <Textarea
              id="animal_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder="marcas, procedência, pasto..."
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
              {isPending ? "Salvando..." : animal ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>

        <AnimalTypesDialog open={typesOpen} onClose={() => setTypesOpen(false)} types={types} />
      </DialogContent>
    </Dialog>
  );
}
