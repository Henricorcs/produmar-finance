"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Calculator, Receipt, Split, Trash2 } from "lucide-react";
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
  createAnimalDespesa,
  createAnimalDespesaDividida,
  deleteAnimalDespesaDividida,
  deleteAnimalDespesa,
  updateAnimalDespesa,
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
import {
  DESPESAS_ANIMAIS_SUGERIDAS,
  UNIDADES_DESPESA_ANIMAIS,
  type AnimalDespesa,
  type AnimalLoteResumo,
  type AnimalSpecies,
  type AnimalWithInfo,
} from "@/lib/types";

/** Número do banco no formato que a máscara de digitação usa (vírgula). */
function numeroNoCampo(v?: number | null): string {
  const n = Number(v ?? 0);
  return n > 0 ? formatDecimalInput(String(n).replace(".", ",")) : "";
}

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
  /** Abre já no modo "dividir a nota entre os tanques". */
  presetDividir?: boolean;
}

type Criterio = "peixes" | "iguais";

/**
 * A parte de cada tanque na nota dividida. Pelo PEIXE VIVO, o tanque com o
 * dobro de peixe leva o dobro da ração; em partes IGUAIS, cada um leva o mesmo.
 * Os centavos que sobram do arredondamento vão para o último tanque — assim a
 * soma das partes fecha com a nota, sempre.
 */
function dividirNota(
  total: number,
  quantidade: number,
  lotes: AnimalLoteResumo[],
  criterio: Criterio
): { lote: AnimalLoteResumo; amount: number; quantity: number }[] {
  if (lotes.length === 0) return [];
  let pesos = lotes.map((l) => (criterio === "peixes" ? Math.max(0, Number(l.saldo)) : 1));
  let somaPesos = pesos.reduce((s, p) => s + p, 0);
  // nenhum peixe contado nos tanques escolhidos: divide igual
  if (somaPesos <= 0) {
    pesos = lotes.map(() => 1);
    somaPesos = lotes.length;
  }

  let restoValor = Math.round(total * 100);
  let restoQtd = Math.round(quantidade * 1000);
  return lotes.map((lote, i) => {
    const ultimo = i === lotes.length - 1;
    const centavos = ultimo
      ? restoValor
      : Math.floor((Math.round(total * 100) * pesos[i]) / somaPesos);
    const milesimos = ultimo
      ? restoQtd
      : Math.floor((Math.round(quantidade * 1000) * pesos[i]) / somaPesos);
    restoValor -= centavos;
    restoQtd -= milesimos;
    return { lote, amount: centavos / 100, quantity: milesimos / 1000 };
  });
}

/**
 * DESPESA COM ANIMAIS — ração, sal, medicamento, frete, compra de animal.
 *
 * A ESPÉCIE é obrigatória porque é ela que a ficha separa: é assim que se
 * descobre quanto o caprino custa, e não só quanto "os bichos" custam. O animal
 * é opcional — só quando o gasto foi de um bicho, e não do lote.
 *
 * A COMPRA fica em pé (migration 092): o PRODUTO de um lado, e do outro a
 * conta — quantidade × valor unitário, na unidade que foi comprada. Antes só
 * havia "o que foi" e o total, então "20 SACOS DE RAÇÃO — R$ 1.900,00" não
 * dizia por quanto saiu o saco, e não dava para comparar com a compra do mês
 * passado. Quantidade e valor unitário são OPCIONAIS: frete e mão de obra não
 * têm quantidade nenhuma, e cobrar isso deles só atrapalharia.
 *
 * O TOTAL se preenche sozinho a partir da conta, e continua digitável: na nota
 * o desconto e o arredondamento existem, e quem manda é o que foi pago.
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
  presetDividir = false,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [species, setSpecies] = useState<AnimalSpecies>("bovino");
  const [animalId, setAnimalId] = useState("");
  const [date, setDate] = useState(localDateISO());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [amount, setAmount] = useState("");
  /**
   * O total foi digitado na mão? Enquanto não for, ele acompanha a conta.
   * Digitou, manda quem digitou: a nota vem com desconto e arredondamento, e
   * a tela corrigindo o valor pago por baixo do dedo seria pior que o erro.
   */
  const [totalNaMao, setTotalNaMao] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [loteId, setLoteId] = useState("");
  /** Nota dividida entre os tanques: os escolhidos e o jeito de dividir. */
  const [dividir, setDividir] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [criterio, setCriterio] = useState<Criterio>("peixes");

  useEffect(() => {
    if (!open) return;
    setSpecies(speciesOf(despesa?.species ?? presetSpecies));
    setAnimalId(despesa?.animal_id ?? "");
    setDate(despesa?.expense_date ?? localDateISO());
    setCategory(despesa?.category ?? "");
    setDescription(despesa?.description ?? "");
    setQuantity(numeroNoCampo(despesa?.quantity));
    setUnit(despesa?.unit ?? "");
    setUnitPrice(despesa?.unit_price ? formatBRLInput(Number(despesa.unit_price)) : "");
    setAmount(despesa ? formatBRLInput(Number(despesa.amount)) : "");
    // Corrigindo: o total só fica travado se ele NÃO for o resultado da conta —
    // aí veio digitado na mão (desconto na nota, ou lançamento antigo, sem
    // quantidade nenhuma) e ninguém pode mexer nele por baixo do dedo. Se bate
    // com a conta, corrigir a quantidade corrige o total junto, que é o que
    // quem abriu para consertar espera.
    const contaSalva =
      Number(despesa?.quantity ?? 0) * Number(despesa?.unit_price ?? 0);
    setTotalNaMao(
      !!despesa && Math.abs(contaSalva - Number(despesa.amount)) >= 0.01
    );
    setSupplier(despesa?.supplier ?? "");
    setNotes(despesa?.notes ?? "");
    setLoteId(despesa?.lote_id ?? presetLoteId ?? "");
    setCriterio("peixes");
    // Dividir é só para nota nova: abrindo já dividida, entram marcados os
    // tanques abertos que têm peixe vivo.
    const vaiDividir = !despesa && presetDividir;
    setDividir(vaiDividir);
    setEscolhidos(
      vaiDividir
        ? lotes
            .filter(
              (l) =>
                l.status === "aberto" &&
                Number(l.saldo) > 0 &&
                speciesOf(l.species) === speciesOf(presetSpecies)
            )
            .map((l) => l.id)
        : []
    );
    setError(null);
    // `lotes` muda a cada refresh do servidor; abrir o diálogo é o gatilho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, despesa, presetSpecies, presetLoteId, presetDividir]);

  /** Só os animais da espécie escolhida — o resto é ruído na hora de achar. */
  const doTipo = animals.filter((a) => speciesOf(a.species) === species);
  const palavraLocal = localLabel(species);
  /** Só os ciclos abertos daquele tipo — ciclo fechado não recebe gasto novo. */
  const lotesDoTipo = lotes.filter(
    (l) => speciesOf(l.species) === species && (l.status === "aberto" || l.id === loteId)
  );

  /** A conta da compra: quantidade × valor unitário. */
  const conta = useMemo(() => {
    const qtd = parseDecimal(quantity);
    const preco = parseMoney(unitPrice);
    return { qtd, preco, total: Math.round(qtd * preco * 100) / 100 };
  }, [quantity, unitPrice]);

  const total = parseMoney(amount);
  /** O total digitado não bate com a conta — a tela mostra e deixa ele escolher. */
  const contaDiverge = totalNaMao && conta.total > 0 && Math.abs(conta.total - total) >= 0.01;

  /** Dividir só faz sentido com dois ou mais ciclos abertos, e só em nota nova. */
  const abertosDoTipo = lotesDoTipo.filter((l) => l.status === "aberto");
  const podeDividir = !despesa && abertosDoTipo.length >= 2;

  /** A parte de cada tanque escolhido, já com os centavos acertados. */
  const partes = useMemo(
    () =>
      dividir
        ? dividirNota(
            total || conta.total,
            conta.qtd,
            abertosDoTipo.filter((l) => escolhidos.includes(l.id)),
            criterio
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dividir, total, conta.total, conta.qtd, escolhidos, criterio, lotesDoTipo.length]
  );

  function escolherDividir() {
    setDividir(true);
    setLoteId("");
    setAnimalId("");
    // marca os tanques com peixe vivo; se nenhum tiver, marca todos os abertos
    const comPeixe = abertosDoTipo.filter((l) => Number(l.saldo) > 0).map((l) => l.id);
    setEscolhidos(comPeixe.length > 0 ? comPeixe : abertosDoTipo.map((l) => l.id));
  }

  function alternarTanque(id: string) {
    setEscolhidos((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
    );
  }

  /**
   * Mexeu na quantidade ou no valor unitário: o total acompanha, enquanto
   * ninguém o tiver digitado na mão.
   */
  function recalcular(novaQtd: string, novoPreco: string) {
    if (totalNaMao) return;
    const t = parseDecimal(novaQtd) * parseMoney(novoPreco);
    setAmount(t > 0 ? formatBRLInput(t) : "");
  }

  /** Volta o total para o que a conta diz. */
  function usarAConta() {
    setAmount(formatBRLInput(conta.total));
    setTotalNaMao(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Escreva qual foi o produto");
      return;
    }
    // Sem total digitado, vale a conta — quem preencheu quantidade e valor
    // unitário não tem por que repetir o resultado embaixo.
    const valor = total || conta.total;
    if (valor <= 0) {
      setError("Informe o valor da despesa");
      return;
    }

    if (dividir && partes.length < 2) {
      setError(`Marque pelo menos dois ${palavraLocal.toLowerCase()}s para dividir a nota`);
      return;
    }

    startTransition(async () => {
      if (dividir) {
        const r = await createAnimalDespesaDividida(
          {
            species,
            expense_date: date,
            category,
            description,
            quantity: conta.qtd,
            unit,
            unit_price: conta.preco,
            amount: valor,
            supplier,
            notes,
          },
          partes.map((p) => ({
            lote_id: p.lote.id,
            amount: p.amount,
            quantity: conta.qtd > 0 ? p.quantity : null,
          }))
        );
        if (r && "error" in r) {
          setError(r.error ?? "Erro ao dividir a nota");
          return;
        }
        if (!r) {
          setError("O servidor não concluiu a ação. Tente de novo.");
          return;
        }
        onClose();
        return;
      }

      const input = {
        species,
        animal_id: animalId || null,
        lote_id: loteId || null,
        expense_date: date,
        category,
        description,
        quantity: conta.qtd,
        unit,
        unit_price: conta.preco,
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

  function apagarNotaInteira() {
    const rateioId = despesa?.rateio_id;
    if (!rateioId) return;
    if (
      !confirm(
        `Apagar a nota "${despesa.description}" inteira? Some a parte de todos os ${palavraLocal.toLowerCase()}s, e isso não tem volta.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteAnimalDespesaDividida(rateioId);
      if (!r || "error" in r) {
        setError((r && "error" in r && r.error) || "Erro ao apagar a nota");
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
            {despesa ? "Editar despesa" : dividir ? "Nota dividida" : "Nova despesa"}
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
                      // o animal e os tanques escolhidos eram de outro tipo
                      setAnimalId("");
                      setLoteId("");
                      setDividir(false);
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
                {/* A nota que serve a todos os tanques: vira uma parte em cada */}
                {podeDividir && (
                  <button
                    type="button"
                    onClick={escolherDividir}
                    className={cn(
                      "col-span-2 min-h-[40px] rounded-lg border text-xs font-semibold transition-colors px-2 flex items-center justify-center gap-1.5",
                      dividir
                        ? "bg-cyan-600 border-cyan-600 text-white"
                        : "bg-cyan-50 border-cyan-200 text-cyan-800 dark:bg-cyan-950/30 dark:border-cyan-900/50 dark:text-cyan-300"
                    )}
                  >
                    <Split className="w-3.5 h-3.5" />
                    Dividir entre os {palavraLocal.toLowerCase()}s
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDividir(false);
                    setLoteId("");
                  }}
                  className={cn(
                    "min-h-[40px] rounded-lg border text-xs font-semibold transition-colors px-2",
                    !dividir && loteId === ""
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
                    onClick={() => {
                      setDividir(false);
                      setLoteId(l.id);
                    }}
                    className={cn(
                      "min-h-[40px] rounded-lg border text-xs font-semibold transition-colors px-2",
                      !dividir && loteId === l.id
                        ? "bg-cyan-600 border-cyan-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                    )}
                  >
                    {l.tanque_name}
                  </button>
                ))}
              </div>
              {!dividir && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Sem {palavraLocal.toLowerCase()}, o gasto vale para a criação inteira e
                  não entra no custo de nenhum ciclo.
                  {podeDividir &&
                    ` Nota que serve a vários ${palavraLocal.toLowerCase()}s: use "Dividir".`}
                </p>
              )}
            </div>
          )}

          {/* ── A divisão: quais tanques entram e quanto cabe a cada um ── */}
          {dividir && (
            <div className="space-y-2 rounded-lg border border-cyan-200 bg-cyan-50/50 p-2.5 dark:border-cyan-900/50 dark:bg-cyan-950/20">
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { v: "peixes", label: `Pelo ${species === "aves" ? "nº de aves" : "peixe vivo"}` },
                    { v: "iguais", label: "Em partes iguais" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setCriterio(o.v)}
                    className={cn(
                      "min-h-[36px] rounded-lg border text-[11px] font-semibold transition-colors px-2",
                      criterio === o.v
                        ? "bg-slate-700 border-slate-700 text-white"
                        : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <div className="divide-y divide-cyan-100 dark:divide-cyan-900/40">
                {abertosDoTipo.map((l) => {
                  const marcado = escolhidos.includes(l.id);
                  const parte = partes.find((p) => p.lote.id === l.id);
                  return (
                    <label
                      key={l.id}
                      className="flex items-center gap-2 py-1.5 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternarTanque(l.id)}
                        className="h-4 w-4 accent-cyan-600"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                          {l.tanque_name}
                        </span>
                        <span className="block text-[10px] text-slate-400 tabular-nums">
                          {formatQty(Number(l.saldo))} vivos
                        </span>
                      </span>
                      <span className="text-right tabular-nums">
                        <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {parte && parte.amount > 0 ? formatBRL(parte.amount) : "—"}
                        </span>
                        {parte && conta.qtd > 0 && (
                          <span className="block text-[10px] text-slate-400">
                            {formatQty(parte.quantity)}
                            {unit.trim() ? ` ${unit.trim()}` : ""}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>

              <p className="text-[11px] text-cyan-800/80 dark:text-cyan-300/80">
                {criterio === "peixes"
                  ? `Quem tem mais ${species === "aves" ? "ave" : "peixe"} vivo leva a parte maior. `
                  : "Cada um leva a mesma parte. "}
                Vira uma despesa em cada {palavraLocal.toLowerCase()} marcado, e entra no
                custo do ciclo dele.
                {total + conta.total <= 0 && " Preencha o valor da nota para ver as partes."}
              </p>
            </div>
          )}

          {/* Parte de uma nota dividida: corrigir aqui mexe só neste tanque */}
          {despesa?.rateio_id && (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-2 dark:border-cyan-900/50 dark:bg-cyan-950/30 space-y-1.5">
              <p className="text-[11px] text-cyan-800 dark:text-cyan-300">
                Esta despesa é a parte deste {palavraLocal.toLowerCase()} numa nota dividida.
                Corrigir aqui muda só esta parte.
              </p>
              <button
                type="button"
                onClick={apagarNotaInteira}
                disabled={isPending}
                className="text-[11px] font-semibold text-red-600 dark:text-red-400 underline underline-offset-2 disabled:opacity-40"
              >
                Apagar a nota inteira (todos os {palavraLocal.toLowerCase()}s)
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ad_desc">Produto *</Label>
            <Input
              id="ad_desc"
              value={description}
              onChange={(e) => setDescription(upperKeepingCaret(e))}
              placeholder="ex: ração engorda"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Só o produto — a quantidade e o preço vão nos campos de baixo.
            </p>
          </div>

          {/* A CONTA DA COMPRA: 20 SC × R$ 95,00. É o que responde "por quanto
              saiu o saco?" um mês depois — e o que deixa comparar com a compra
              anterior. Fica em branco no frete e na mão de obra, que não têm
              quantidade nenhuma. */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ad_qtd">Quantidade</Label>
              <Input
                id="ad_qtd"
                value={quantity}
                onChange={(e) => {
                  const v = formatDecimalInput(e.target.value);
                  setQuantity(v);
                  recalcular(v, unitPrice);
                }}
                placeholder="0"
                className="h-11 text-base tabular-nums font-semibold sm:h-10"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad_unidade">Unidade</Label>
              <Input
                id="ad_unidade"
                value={unit}
                onChange={(e) => setUnit(upperKeepingCaret(e))}
                placeholder="saco, kg..."
                autoCapitalize="characters"
                className="h-11 text-base font-semibold sm:h-10"
                autoComplete="off"
              />
            </div>
          </div>

          {/* As unidades da nota do dia a dia, a um toque. O campo continua
              livre: quem compra em "balde" escreve balde. */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mt-2">
            {UNIDADES_DESPESA_ANIMAIS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(unit === u ? "" : u)}
                className={cn(
                  "flex-shrink-0 min-h-[34px] px-3 rounded-lg border text-[11px] font-semibold transition-colors",
                  unit === u
                    ? "bg-slate-700 border-slate-700 text-white"
                    : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                )}
              >
                {u}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              {/* O nome do campo carrega a unidade escolhida: "Valor de cada SC"
                  não se confunde com "Valor final", e era essa confusão que
                  fazia o preço de um saco virar o total da compra. */}
              <Label htmlFor="ad_unitario">
                Valor de cada {unit.trim() ? `${unit.trim()} ` : ""}(R$)
              </Label>
              <Input
                id="ad_unitario"
                value={unitPrice}
                onChange={(e) => {
                  const v = formatBRLInput(e.target.value);
                  setUnitPrice(v);
                  recalcular(quantity, v);
                }}
                placeholder="0,00"
                className="h-11 text-base tabular-nums font-semibold sm:h-10"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad_valor">Valor final (R$) *</Label>
              <Input
                id="ad_valor"
                value={amount}
                onChange={(e) => {
                  setAmount(formatBRLInput(e.target.value));
                  setTotalNaMao(true);
                }}
                placeholder="0,00"
                className="h-11 text-base tabular-nums font-semibold sm:h-10"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
          </div>

          {/* A pegadinha do lançamento: marcou a quantidade, digitou o total e
              deixou o valor de cada um em branco. Aí o preço de UM saco entra
              como a compra inteira, e a ficha soma errado sem avisar. */}
          {conta.qtd > 0 && conta.preco <= 0 && total > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-2 -mt-2">
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Você marcou {formatQty(conta.qtd)}
                {unit.trim() ? ` ${unit.trim()}` : ""} mas deixou o valor de cada um em
                branco: vai entrar {formatBRL(total)} pela compra toda. Se{" "}
                {formatBRL(total)} é o preço de UM, ponha no campo do lado — a conta se
                faz sozinha.
              </p>
            </div>
          )}

          {/* A conta por extenso, para conferir o que está sendo lançado */}
          {conta.total > 0 && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/20 px-2.5 py-2 space-y-1 -mt-2">
              <p className="text-[11px] text-rose-800 dark:text-rose-300 tabular-nums flex items-center gap-1.5">
                <Calculator className="w-3 h-3 flex-shrink-0" />
                {formatQty(conta.qtd)}
                {unit.trim() ? ` ${unit.trim()}` : ""} × {formatBRL(conta.preco)} ={" "}
                {formatBRL(conta.total)}
              </p>
              {contaDiverge && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-rose-700/80 dark:text-rose-400/80">
                    Você digitou {formatBRL(total)} — vale o que você digitou.
                  </span>
                  <button
                    type="button"
                    onClick={usarAConta}
                    className="flex-shrink-0 text-[11px] font-semibold text-rose-700 dark:text-rose-300 underline underline-offset-2"
                  >
                    usar a conta
                  </button>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-2">
            O VALOR FINAL é o que entra na ficha — é a compra toda, não o preço de um.
            Ele se preenche sozinho pela conta acima; mude na mão quando a nota vier com
            desconto ou acréscimo. Quantidade e unidade podem ficar em branco no frete e
            na diária.
          </p>

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
          {doTipo.length > 0 && !dividir && (
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
              {isPending
                ? "Salvando..."
                : despesa
                  ? "Salvar"
                  : dividir
                    ? `Dividir em ${partes.length}`
                    : "Lançar despesa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
