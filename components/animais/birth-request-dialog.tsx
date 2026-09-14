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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { resolveBirthRequest } from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  SPECIES_META,
  STICKY_FOOTER,
  SexPicker,
  categoryLabel,
  speciesOf,
} from "./animal-shared";
import type { AnimalBirthRequest, AnimalSex, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  request: AnimalBirthRequest | null;
  /** Só fêmeas — a mesma lista usada no lançamento manual de parto. */
  mothers: AnimalWithInfo[];
  photoUrl: string | null;
}

/**
 * Confere o que o vaqueiro enviou e lança de verdade no rebanho. O vaqueiro só
 * digitou a numeração da mãe (texto livre); aqui ela é casada com o cadastro
 * de verdade — bate sozinho quando o número existe entre as fêmeas, senão o
 * patrão busca na lista. O número do bezerro também é dado aqui: quem está no
 * curral não numera bicho (migration 053).
 */
export function BirthRequestDialog({ open, onClose, request, mothers, photoUrl }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [motherId, setMotherId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [calfSex, setCalfSex] = useState<AnimalSex>("femea");
  const [calfTag, setCalfTag] = useState("");

  useEffect(() => {
    if (!open || !request) return;
    const typed = request.mother_tag.trim().toUpperCase();
    const match = mothers.find((m) => m.tag.trim().toUpperCase() === typed);
    setMotherId(match?.id ?? "");
    setBirthDate(request.birth_date || localDateISO());
    setCalfSex(request.calf_sex ?? "femea");
    setCalfTag(request.calf_tag ?? "");
    setError(null);
  }, [open, request, mothers]);

  if (!request) return null;

  const selecionada = mothers.find((m) => m.id === motherId) ?? null;
  const matched = !!selecionada;

  /**
   * Como chamar a cria nesta tela. O vaqueiro marcou o bicho no celular
   * (migration 091), mas quem manda é a MÃE escolhida aqui: é dela que
   * `createBirth` puxa tipo e raça. Escolheu uma ovelha, é cordeiro — mesmo
   * que ele tenha marcado bovino sem prestar atenção.
   */
  const nomes = SPECIES_META[speciesOf(selecionada?.species ?? request.species)];
  const cria = nomes.youngMale.toLowerCase();
  const tipoDivergente =
    !!selecionada && speciesOf(selecionada.species) !== speciesOf(request.species);
  const tipoMarcado = SPECIES_META[speciesOf(request.species)];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!motherId) return setError("Selecione a mãe");
    if (!birthDate) return setError("Informe a data do nascimento");
    if (!calfTag.trim()) return setError(`Informe o número do ${cria}`);

    startTransition(async () => {
      const r = await resolveBirthRequest(request!.id, {
        mother_id: motherId,
        birth_date: birthDate,
        calf_sex: calfSex,
        calf_tag: calfTag,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao lançar o nascimento");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Conferir nascimento</DialogTitle>
        </DialogHeader>

        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={`${nomes.youngMale} da mãe ${request.mother_tag}`}
            className="w-full h-48 object-cover rounded-xl border border-slate-200 dark:border-slate-700 mb-4"
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Mãe *</Label>
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
                    {categoryLabel(a.category, a.sex, a.species)}
                    {a.breed_name ? ` · ${a.breed_name}` : ""}
                  </span>
                </div>
              )}
              placeholder="Selecione a mãe..."
              searchPlaceholder="Buscar pelo número..."
              emptyMessage="Nenhuma fêmea cadastrada"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {matched
                ? `O vaqueiro digitou ${request.mother_tag} — já casou com o cadastro.`
                : `O vaqueiro digitou "${request.mother_tag}", mas não achamos esse número entre as fêmeas — busque a mãe certa.`}
            </p>
            {/* A cria puxa tipo e raça da mãe: se a mãe escolhida é de outro
                bicho, o que vai entrar no rebanho não é o que ele marcou. */}
            {tipoDivergente && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2.5 py-2">
                O vaqueiro marcou {tipoMarcado.label.toLowerCase()}, mas esta mãe é{" "}
                {nomes.label.toLowerCase()} — a cria vai entrar como {nomes.label.toLowerCase()},
                com o tipo e a raça dela.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brq_date">Data do nascimento *</Label>
            <Input
              id="brq_date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="h-11 sm:h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Sexo do {cria} *</Label>
            <SexPicker value={calfSex} onChange={setCalfSex} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brq_calf_tag">Nº do {cria} *</Label>
            <Input
              id="brq_calf_tag"
              value={calfTag}
              onChange={(e) => setCalfTag(upperKeepingCaret(e))}
              placeholder="ex: 1046"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              O vaqueiro não numera o {cria} — o número é seu, agora.
            </p>
          </div>

          {request.protocolo_aplicado && request.protocolo_aplicado.length > 0 && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-2.5 py-2">
              O vaqueiro aplicou{" "}
              {request.protocolo_aplicado.map((i) => i.medicine).join(", ")} — entra como
              tratamento na ficha do {cria}.
            </p>
          )}

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
              {isPending ? "Lançando..." : "Lançar no rebanho"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
