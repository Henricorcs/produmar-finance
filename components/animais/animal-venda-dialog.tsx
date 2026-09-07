"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { HandCoins, Trash2 } from "lucide-react";
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
  createAnimalVenda,
  deleteAnimalVenda,
  updateAnimalVenda,
} from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  SPECIES_META,
  SPECIES_OPTIONS,
  STICKY_FOOTER,
  formatDecimalInput,
  localLabel,
  parseDecimal,
  speciesOf,
} from "./animal-shared";
import type {
  AnimalLoteResumo,
  AnimalSaleMode,
  AnimalSpecies,
  AnimalVenda,
} from "@/lib/types";

/** Número do banco no formato que a máscara de digitação usa (vírgula, sem milhar). */
function numeroNoCampo(v?: number | null): string {
  const n = Number(v ?? 0);
  return n > 0 ? formatDecimalInput(String(n).replace(".", ",")) : "";
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Venda em edição — null lança uma nova. */
  venda: AnimalVenda | null;
  /** Espécie já escolhida (veio do filtro da ficha). */
  presetSpecies?: AnimalSpecies | null;
  /** Ciclo já escolhido (a venda foi aberta de dentro do tanque). */
  presetLoteId?: string | null;
  /** Ciclos abertos, para amarrar a venda a um tanque. */
  lotes?: AnimalLoteResumo[];
}

/**
 * VENDA DE LOTE — o peixe e a ave, que não têm brinco.
 *
 * A venda do módulo só sabia nascer da baixa de um animal cadastrado, um a um.
 * Isso serve boi e cavalo. Quem cria peixe vende "320 kg de tilápia a R$ 18,00"
 * sem nunca ter cadastrado tilápia nenhuma — e esse dinheiro não tinha por onde
 * entrar.
 *
 * São duas contas, e quem digita escolhe qual:
 *   NO PESO     → quilos × valor do quilo
 *   NA UNIDADE  → quantas cabeças × valor de cada uma
 *
 * O total NÃO é um campo: é a conta, feita na hora e mostrada por extenso. O
 * servidor refaz a mesma conta ao gravar — o que a tela mostra é conferência
 * para quem está digitando.
 *
 * Como a venda do animal, esta TAMBÉM vira lançamento no módulo Contas.
 */
export function AnimalVendaDialog({
  open,
  onClose,
  venda,
  presetSpecies,
  presetLoteId,
  lotes = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [species, setSpecies] = useState<AnimalSpecies>("piscicultura");
  const [saleMode, setSaleMode] = useState<AnimalSaleMode>("peso");
  const [date, setDate] = useState(localDateISO());
  const [quantity, setQuantity] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [weight, setWeight] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [description, setDescription] = useState("");
  const [buyer, setBuyer] = useState("");
  const [notes, setNotes] = useState("");
  const [loteId, setLoteId] = useState("");
  const [received, setReceived] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSpecies(speciesOf(venda?.species ?? presetSpecies ?? "piscicultura"));
    setSaleMode(venda?.sale_mode ?? "peso");
    setDate(venda?.sale_date ?? localDateISO());
    setQuantity(numeroNoCampo(venda?.quantity));
    setPricePerUnit(venda ? formatBRLInput(Number(venda.price_per_unit)) : "");
    setWeight(numeroNoCampo(venda?.weight_kg));
    setPricePerKg(venda ? formatBRLInput(Number(venda.price_per_kg)) : "");
    setDescription(venda?.description ?? "");
    setBuyer(venda?.buyer ?? "");
    setNotes(venda?.notes ?? "");
    setLoteId(venda?.lote_id ?? presetLoteId ?? "");
    setReceived(true);
    setError(null);
  }, [open, venda, presetSpecies, presetLoteId]);

  const noPeso = saleMode === "peso";
  const palavraLocal = localLabel(species);
  /** Só os ciclos abertos daquele tipo — ciclo fechado não recebe venda nova. */
  const doTipo = lotes.filter(
    (l) => speciesOf(l.species) === species && (l.status === "aberto" || l.id === loteId)
  );

  /** A conta, do jeito que se fala. O servidor refaz a mesma ao gravar. */
  const conta = useMemo(() => {
    const kg = parseDecimal(weight);
    const precoKg = parseMoney(pricePerKg);
    const qtd = parseDecimal(quantity);
    const precoUn = parseMoney(pricePerUnit);
    return {
      kg,
      precoKg,
      qtd,
      precoUn,
      total: noPeso ? kg * precoKg : qtd * precoUn,
    };
  }, [noPeso, weight, pricePerKg, quantity, pricePerUnit]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Escreva o que foi vendido");
      return;
    }
    if (noPeso) {
      if (conta.kg <= 0) {
        setError("Informe quantos quilos foram vendidos");
        return;
      }
      if (conta.precoKg <= 0) {
        setError("Informe o valor do quilo");
        return;
      }
    } else {
      if (conta.qtd <= 0) {
        setError("Informe quantas unidades foram vendidas");
        return;
      }
      if (conta.precoUn <= 0) {
        setError("Informe o valor da unidade");
        return;
      }
    }

    startTransition(async () => {
      const input = {
        species,
        lote_id: loteId || null,
        received,
        sale_date: date,
        sale_mode: saleMode,
        // No peso a quantidade não entra na conta do dinheiro — ela existe
        // para baixar o saldo do tanque.
        quantity: conta.qtd,
        price_per_unit: noPeso ? 0 : conta.precoUn,
        weight_kg: noPeso ? conta.kg : 0,
        price_per_kg: noPeso ? conta.precoKg : 0,
        description,
        buyer,
        notes,
      };
      const r = venda
        ? await updateAnimalVenda(venda.id, input)
        : await createAnimalVenda(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar a venda");
        return;
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!venda) return;
    if (
      !confirm(
        `Apagar a venda "${venda.description}"?\n\nO lançamento dela no módulo Contas some junto. Isso não tem volta.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteAnimalVenda(venda.id);
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
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <HandCoins className="w-4 h-4" />
            </span>
            {venda ? "Editar venda" : "Nova venda"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* A espécie é o que a ficha separa: é ela que diz quanto rendeu.
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
                    onClick={() => setSpecies(s.value)}
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

          {/* De qual tanque saiu — é o que baixa o saldo daquele ciclo */}
          {doTipo.length > 0 && (
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
                {doTipo.map((l) => (
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
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="av_desc">O que foi vendido *</Label>
            <Input
              id="av_desc"
              value={description}
              onChange={(e) => setDescription(upperKeepingCaret(e))}
              placeholder="ex: tilápia"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          {/* Como foi vendido — é isso que decide quais campos aparecem */}
          <div className="space-y-1.5">
            <Label>Como foi vendido *</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { value: "peso", label: "No peso (kg)" },
                  { value: "unidade", label: "Na unidade" },
                ] as const
              ).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setSaleMode(m.value)}
                  className={cn(
                    "min-h-[44px] rounded-lg border text-sm font-semibold transition-colors",
                    saleMode === m.value
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* No peso, a quantidade é a do TANQUE, não a do dinheiro: o total
              sai do peso, e é ela que baixa o saldo do ciclo. */}
          {noPeso && (
            <div className="space-y-1.5">
              <Label htmlFor="av_cabecas">Quantidade vendida</Label>
              <Input
                id="av_cabecas"
                value={quantity}
                onChange={(e) => setQuantity(formatDecimalInput(e.target.value))}
                placeholder="0"
                className="h-11 text-base tabular-nums font-semibold sm:h-10"
                inputMode="decimal"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Quantos peixes saíram. Não entra na conta do dinheiro — é o que baixa
                o saldo do tanque. Em branco, o saldo não muda.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="av_qtd">{noPeso ? "Pesagem (kg) *" : "Quantidade *"}</Label>
              <Input
                id="av_qtd"
                value={noPeso ? weight : quantity}
                onChange={(e) =>
                  noPeso
                    ? setWeight(formatDecimalInput(e.target.value))
                    : setQuantity(formatDecimalInput(e.target.value))
                }
                placeholder="0"
                className="h-11 text-base tabular-nums font-semibold sm:h-10"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="av_preco">
                {noPeso ? "Valor do kg (R$) *" : "Valor da unidade (R$) *"}
              </Label>
              <Input
                id="av_preco"
                value={noPeso ? pricePerKg : pricePerUnit}
                onChange={(e) =>
                  noPeso
                    ? setPricePerKg(formatBRLInput(e.target.value))
                    : setPricePerUnit(formatBRLInput(e.target.value))
                }
                placeholder="0,00"
                className="h-11 text-base tabular-nums font-semibold sm:h-10"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
          </div>

          {/* O total não é campo: é a conta, escrita do jeito que se fala */}
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2.5 space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                {received ? "Valor da venda" : "Valor a receber"}
              </span>
              <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                {formatBRL(conta.total)}
              </span>
            </div>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 tabular-nums">
              {noPeso
                ? `${conta.qtd > 0 ? `${formatQty(conta.qtd)} un · ` : ""}${formatQty(conta.kg)} kg × ${formatBRL(conta.precoKg)} = ${formatBRL(conta.total)}`
                : `${formatQty(conta.qtd)} un × ${formatBRL(conta.precoUn)} = ${formatBRL(conta.total)}`}
            </p>
          </div>

          {/* Venda fiada existe: lançar tudo como recebido faz o caixa mentir */}
          <div className="space-y-1.5">
            <Label>O dinheiro já entrou?</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { value: true, label: "Já recebi" },
                  { value: false, label: "A receber" },
                ] as const
              ).map((o) => (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => setReceived(o.value)}
                  className={cn(
                    "min-h-[44px] rounded-lg border text-sm font-semibold transition-colors",
                    received === o.value
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="av_data">Data</Label>
            <Input
              id="av_data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 tabular-nums sm:h-10"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              O dia da venda — é por ele que a ficha se organiza.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="av_comprador">Comprador</Label>
            <Input
              id="av_comprador"
              value={buyer}
              onChange={(e) => setBuyer(upperKeepingCaret(e))}
              placeholder="opcional, para quem se vendeu"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="av_notes">Observação</Label>
            <Textarea
              id="av_notes"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              rows={2}
              autoCapitalize="characters"
            />
          </div>

          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            O valor entra no módulo Contas na hora, na categoria &quot;Venda de
            animais&quot; — como recebido, ou como pendente se ainda for a receber.
            Corrigir ou apagar aqui mexe no lançamento de lá junto.
          </p>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            {venda && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                aria-label="Apagar venda"
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
              className={FOOTER_CANCEL}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className={FOOTER_SUBMIT}>
              {isPending ? "Salvando..." : venda ? "Salvar" : "Lançar venda"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
