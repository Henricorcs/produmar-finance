"use client";

import { useEffect, useState, useTransition } from "react";
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
import { cn, formatBRLInput, localDateISO, parseMoney, upperKeepingCaret } from "@/lib/utils";
import {
  createAnimalDespesa,
  deleteAnimalDespesa,
  updateAnimalDespesa,
} from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  SPECIES_META,
  SPECIES_OPTIONS,
  STICKY_FOOTER,
  localLabel,
  speciesOf,
} from "./animal-shared";
import {
  DESPESAS_ANIMAIS_SUGERIDAS,
  type AnimalDespesa,
  type AnimalLoteResumo,
  type AnimalSpecies,
  type AnimalWithInfo,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Despesa em edição — null lança uma nova. */
  despesa: AnimalDespesa | null;
  /** Espécie já escolhida (veio do filtro da ficha). */
  presetSpecies?: AnimalSpecies | null;
  /** Rebanho, para amarrar o gasto a um animal quando for de um só. */
  animals: AnimalWithInfo[];
  /** Ciclo já escolhido (a despesa foi aberta de dentro do tanque). */
  presetLoteId?: string | null;
  /** Ciclos abertos, para amarrar o gasto a um tanque. */
  lotes?: AnimalLoteResumo[];
}

/**
 * DESPESA COM ANIMAIS — ração, sal, medicamento, frete, compra de animal.
 *
 * A ESPÉCIE é obrigatória porque é ela que a ficha separa: é assim que se
 * descobre quanto o caprino custa, e não só quanto "os bichos" custam. O animal
 * é opcional — só quando o gasto foi de um bicho, e não do lote.
 *
 * Isto NÃO cria lançamento no módulo Contas: é registro e relatório dentro de
 * Animais, do mesmo jeito que a despesa da obra.
 */
export function AnimalDespesaDialog({
  open,
  onClose,
  despesa,
  presetSpecies,
  animals,
  presetLoteId,
  lotes = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [species, setSpecies] = useState<AnimalSpecies>("bovino");
  const [animalId, setAnimalId] = useState("");
  const [date, setDate] = useState(localDateISO());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [loteId, setLoteId] = useState("");

  useEffect(() => {
    if (!open) return;
    setSpecies(speciesOf(despesa?.species ?? presetSpecies));
    setAnimalId(despesa?.animal_id ?? "");
    setDate(despesa?.expense_date ?? localDateISO());
    setCategory(despesa?.category ?? "");
    setDescription(despesa?.description ?? "");
    setAmount(despesa ? formatBRLInput(Number(despesa.amount)) : "");
    setSupplier(despesa?.supplier ?? "");
    setNotes(despesa?.notes ?? "");
    setLoteId(despesa?.lote_id ?? presetLoteId ?? "");
    setError(null);
  }, [open, despesa, presetSpecies, presetLoteId]);

  /** Só os animais da espécie escolhida — o resto é ruído na hora de achar. */
  const doTipo = animals.filter((a) => speciesOf(a.species) === species);
  const palavraLocal = localLabel(species);
  /** Só os ciclos abertos daquele tipo — ciclo fechado não recebe gasto novo. */
  const lotesDoTipo = lotes.filter(
    (l) => speciesOf(l.species) === species && (l.status === "aberto" || l.id === loteId)
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Escreva o que foi a despesa");
      return;
    }
    const valor = parseMoney(amount);
    if (valor <= 0) {
      setError("Informe o valor da despesa");
      return;
    }

    startTransition(async () => {
      const input = {
        species,
        animal_id: animalId || null,
        lote_id: loteId || null,
        expense_date: date,
        category,
        description,
        amount: valor,
        supplier,
        notes,
      };
      const r = despesa
        ? await updateAnimalDespesa(despesa.id, input)
        : await createAnimalDespesa(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar a despesa");
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
      const r = await deleteAnimalDespesa(despesa.id);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao apagar");
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
          {/* A espécie é o que a ficha separa: sem ela não há custo por bicho.
              Some quando o tipo já veio decidido de fora — o tanque, ou o recorte
              da ficha: escolher de novo o que já está escolhido só atrapalha. */}
          {!presetSpecies && (
            <div className="space-y-1.5">
              <Label>De qual tipo de animal *</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {SPECIES_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => {
                      setSpecies(s.value);
                      // o animal escolhido era de outro tipo: não faz mais sentido
                      setAnimalId("");
                    }}
                    className={cn(
                      "min-h-[40px] rounded-lg border text-xs font-semibold transition-colors",
                      species === s.value
                        ? "bg-produmar-600 border-produmar-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                    )}
                  >
                    {SPECIES_META[s.value].plural}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sem o seletor, a criação ficaria em segredo: fica dita aqui. */}
          {presetSpecies && (
            <p className="-mb-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
              {SPECIES_META[species].plural}
            </p>
          )}

          {/* De qual tanque é o gasto — é o que dá o custo daquele ciclo */}
          {lotesDoTipo.length > 0 && (
            <div className="space-y-1.5">
              <Label>{palavraLocal}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setLoteId("")}
                  className={cn(
                    "min-h-[40px] rounded-lg border text-xs font-semibold transition-colors px-2",
                    loteId === ""
                      ? "bg-slate-600 border-slate-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  Sem {palavraLocal.toLowerCase()}
                </button>
                {lotesDoTipo.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLoteId(l.id)}
                    className={cn(
                      "min-h-[40px] rounded-lg border text-xs font-semibold transition-colors px-2",
                      loteId === l.id
                        ? "bg-cyan-600 border-cyan-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                    )}
                  >
                    {l.tanque_name}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Sem {palavraLocal.toLowerCase()}, o gasto vale para a criação inteira e
                não entra no custo de nenhum ciclo.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ad_desc">O que foi *</Label>
            <Input
              id="ad_desc"
              value={description}
              onChange={(e) => setDescription(upperKeepingCaret(e))}
              placeholder="ex: 20 sacos de ração"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad_valor">Valor (R$) *</Label>
            <Input
              id="ad_valor"
              value={amount}
              onChange={(e) => setAmount(formatBRLInput(e.target.value))}
              placeholder="0,00"
              className="h-11 text-base tabular-nums font-semibold sm:h-10"
              inputMode="decimal"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad_data">Data</Label>
            <Input
              id="ad_data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 tabular-nums sm:h-10"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              O dia do gasto — é por ele que a ficha se organiza.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad_cat">Categoria</Label>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {DESPESAS_ANIMAIS_SUGERIDAS.map((c) => (
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
              id="ad_cat"
              value={category}
              onChange={(e) => setCategory(upperKeepingCaret(e))}
              placeholder="opcional — é o que agrupa o relatório"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          {/* O animal é opcional: só quando o gasto foi de um bicho só */}
          {doTipo.length > 0 && (
            <div className="space-y-1.5">
              <Label>Animal</Label>
              <SearchableSelect
                items={doTipo}
                value={animalId}
                onChange={setAnimalId}
                getId={(a) => a.id}
                getLabel={(a) => `nº ${a.tag}`}
                renderItem={(a) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">nº {a.tag}</span>
                    {a.breed_name && (
                      <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[7rem]">
                        {a.breed_name}
                      </span>
                    )}
                  </div>
                )}
                placeholder="Todo o lote"
                searchPlaceholder="Buscar pelo número..."
                emptyMessage="Nenhum animal deste tipo"
                suggestOnType
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Em branco, o gasto é do lote inteiro. Escolha um animal só quando
                foi dele mesmo — o remédio daquele boi, por exemplo.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ad_forn">Fornecedor</Label>
            <Input
              id="ad_forn"
              value={supplier}
              onChange={(e) => setSupplier(upperKeepingCaret(e))}
              placeholder="opcional, de quem se comprou"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad_notes">Observação</Label>
            <Textarea
              id="ad_notes"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              rows={2}
              autoCapitalize="characters"
            />
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            A despesa fica aqui, na ficha dos animais — ela não vira lançamento no
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
