"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Camera, ChevronDown, X, Settings2 } from "lucide-react";
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
import { cn, formatDate, upperKeepingCaret } from "@/lib/utils";
import { createAnimal, updateAnimal, uploadAnimalPhotos } from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  INLINE_LINK,
  SPECIES_META,
  STICKY_FOOTER,
  SexPicker,
  SpeciesPicker,
  parseDecimal,
  formatDecimalInput,
  speciesOf,
  ehNelorePO,
  ehRacaPO,
  useSoBovinos,
} from "./animal-shared";
import { AnimalBreedsDialog } from "./animal-breeds-dialog";
import type { Animal, AnimalBreed, AnimalSex, AnimalSpecies } from "@/lib/types";
import { comprimirImagens } from "@/lib/comprimir-imagem";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Animal em edição — null cria um novo. */
  animal: Animal | null;
  /** Raças cadastradas. */
  breeds: AnimalBreed[];
  /** Tipo que o cadastro novo já vem marcado (o filtro da tela). */
  defaultSpecies?: AnimalSpecies | null;
  /** Raça que o cadastro novo já vem marcado (a escolhida no menu de raças). */
  defaultBreedId?: string | null;
  /**
   * Todo o cadastro, inclusive quem saiu — para avisar, enquanto digita, que o
   * número já foi de um animal vendido/morto (vira um animal NOVO, a ficha do
   * antigo fica guardada) ou que já tem outro igual no rebanho.
   */
  todos?: Animal[];
}

export function AnimalDialog({
  open,
  onClose,
  animal,
  breeds,
  defaultSpecies,
  defaultBreedId = null,
  todos = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tag, setTag] = useState("");
  const [sex, setSex] = useState<AnimalSex>("femea");
  const [species, setSpecies] = useState<AnimalSpecies>("bovino");
  const [birthDate, setBirthDate] = useState("");
  const [breedId, setBreedId] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [abcz, setAbcz] = useState("");
  const [mae, setMae] = useState("");
  const [pai, setPai] = useState("");
  /** O tipo fica num botão só; as opções só abrem quando ele toca. */
  const [tipoAberto, setTipoAberto] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [breedsOpen, setBreedsOpen] = useState(false);
  const soBovinos = useSoBovinos();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTag(animal?.tag ?? "");
    setSex(animal?.sex ?? "femea");
    setSpecies(speciesOf(animal ? animal.species : defaultSpecies));
    setBirthDate(animal?.birth_date ?? "");
    setBreedId(animal ? animal.breed_id ?? "" : defaultBreedId ?? "");
    setWeight(animal && animal.weight ? String(animal.weight).replace(".", ",") : "");
    setNotes(animal?.notes ?? "");
    setAbcz(animal?.abcz_code ?? "");
    setMae(animal?.mae ?? "");
    setPai(animal?.pai ?? "");
    setTipoAberto(false);
    setPhotos([]);
    setError(null);
  }, [open, animal, defaultSpecies, defaultBreedId]);

  /** Quem mais tem este número, no mesmo tipo (fora o próprio, na edição). */
  const doNumero = useMemo(() => {
    const n = tag.trim().toUpperCase();
    if (!n) return [];
    return todos.filter(
      (a) =>
        a.id !== animal?.id &&
        speciesOf(a.species) === species &&
        a.tag.trim().toUpperCase() === n
    );
  }, [tag, species, todos, animal?.id]);
  const numeroNoRebanho = doNumero.some((a) => a.active !== false);
  const numeroSaiu = doNumero
    .filter((a) => a.active === false)
    .sort((a, b) => (b.exit_date ?? "").localeCompare(a.exit_date ?? ""))[0];

  /** Cada raça é de um tipo — a lista segue o tipo escolhido. */
  const speciesBreeds = useMemo(
    () => breeds.filter((b) => speciesOf(b.species) === species),
    [breeds, species]
  );

  /** O registro da ABCZ só existe para o Nelore PO. */
  const nelorePO = ehNelorePO(breeds.find((b) => b.id === breedId)?.name);
  /** Mãe e pai só no gado PO — é ele que tem genealogia para guardar. */
  const racaPO = ehRacaPO(breeds.find((b) => b.id === breedId)?.name);

  /** Trocou o tipo: a raça de antes é de outro bicho, sai da frente. */
  function pickSpecies(v: AnimalSpecies) {
    setSpecies(v);
    setTipoAberto(false);
    if (breedId && !breeds.some((b) => b.id === breedId && speciesOf(b.species) === v)) {
      setBreedId("");
    }
  }

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
        species,
        birth_date: birthDate || null,
        breed_id: breedId || null,
        weight: parseDecimal(weight),
        notes,
        // outra raça: o registro da ABCZ não vale e sai (se tinha); sem ele, nem vai
        abcz_code: nelorePO ? abcz : animal?.abcz_code ? null : undefined,
        // mãe e pai: só o PO manda; o que não é PO e não tinha, nem vai
        // (assim o cadastro não depende da migration 137 para quem não é PO)
        mae: racaPO ? mae : animal?.mae ? null : undefined,
        pai: racaPO ? pai : animal?.pai ? null : undefined,
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
              onChange={(e) => setTag(upperKeepingCaret(e))}
              placeholder="ex: 1042, brinco a-15"
              autoCapitalize="characters"
              autoComplete="off"
            />
            {numeroNoRebanho ? (
              <p className="text-xs text-red-600 dark:text-red-400">
                Já tem um {SPECIES_META[species].label.toLowerCase()} nº {tag.trim()} no rebanho.
              </p>
            ) : numeroSaiu ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                O nº {tag.trim()} já foi de um {SPECIES_META[species].label.toLowerCase()} que{" "}
                {numeroSaiu.exit_reason === "morte" ? "morreu" : "foi vendido"}
                {numeroSaiu.exit_date ? ` em ${formatDate(numeroSaiu.exit_date)}` : ""}. Este
                {animal ? " fica" : " entra"} como outro animal — a ficha do antigo continua
                guardada em Saídas.
              </p>
            ) : null}
          </div>

          {/* TIPO num botão só: as 7 opções na tela poluíam o cadastro, e
              quase nunca se troca. Toca e as opções abrem; escolheu, fecha. */}
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            {tipoAberto ? (
              <SpeciesPicker value={species} onChange={pickSpecies} />
            ) : (
              <button
                type="button"
                onClick={() => setTipoAberto(true)}
                aria-expanded={false}
                className="w-full h-11 sm:h-10 flex items-center justify-between gap-2 rounded-lg border border-produmar-300 bg-produmar-50 px-3 text-sm font-medium text-produmar-700 dark:border-produmar-700 dark:bg-produmar-950/40 dark:text-produmar-300 active:scale-[0.99] transition-transform"
              >
                {SPECIES_META[species].label}
                <span className="flex items-center gap-1 text-xs font-normal text-produmar-600/80 dark:text-produmar-400/80">
                  trocar
                  <ChevronDown className="w-4 h-4" />
                </span>
              </button>
            )}
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
                className="h-11 sm:h-10"
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
              <Label htmlFor="animal_breed">Raça</Label>
              {/* o cadastro de raças é do patrão — o vaqueiro nível 01 só escolhe (146) */}
              {!soBovinos && (
                <button type="button" onClick={() => setBreedsOpen(true)} className={INLINE_LINK}>
                  <Settings2 className="w-3.5 h-3.5" />
                  Gerenciar
                </button>
              )}
            </div>
            <select
              id="animal_breed"
              value={breedId}
              onChange={(e) => setBreedId(e.target.value)}
              className="w-full h-11 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-800 dark:text-slate-100 sm:h-10"
            >
              <option value="">Sem raça</option>
              {speciesBreeds.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {speciesBreeds.length === 0 && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Nenhuma raça de {SPECIES_META[species].label.toLowerCase()} cadastrada —
                use &quot;Gerenciar&quot; para adicionar.
              </p>
            )}
          </div>

          {nelorePO && (
            <div className="space-y-1.5">
              <Label htmlFor="animal_abcz">Registro ABCZ</Label>
              <Input
                id="animal_abcz"
                value={abcz}
                onChange={(e) => setAbcz(upperKeepingCaret(e))}
                placeholder="RGN / RGD do animal"
                autoCapitalize="characters"
                autoComplete="off"
                className="h-11 sm:h-10"
              />
            </div>
          )}

          {/* GENEALOGIA — só do gado PO */}
          {racaPO && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="animal_mae">Mãe</Label>
                <Input
                  id="animal_mae"
                  value={mae}
                  onChange={(e) => setMae(upperKeepingCaret(e))}
                  placeholder="nome ou registro"
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="h-11 sm:h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="animal_pai">Pai</Label>
                <Input
                  id="animal_pai"
                  value={pai}
                  onChange={(e) => setPai(upperKeepingCaret(e))}
                  placeholder="nome ou registro"
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="h-11 sm:h-10"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Fotos</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={async (e) => {
                const picked = Array.from(e.target.files ?? []);
                if (fileRef.current) fileRef.current.value = "";
                if (!picked.length) return;
                // Encolhe no próprio celular antes de subir.
                const fotos = await comprimirImagens(picked);
                setPhotos((prev) => [...prev, ...fotos]);
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
                      className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
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
              className="w-full h-11 sm:h-10"
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
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="marcas, procedência, pasto..."
              autoCapitalize="characters"
              rows={2}
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
              className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}>
              {isPending ? "Salvando..." : animal ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>

        <AnimalBreedsDialog
          open={breedsOpen}
          onClose={() => setBreedsOpen(false)}
          breeds={breeds}
          species={species}
        />
      </DialogContent>
    </Dialog>
  );
}
