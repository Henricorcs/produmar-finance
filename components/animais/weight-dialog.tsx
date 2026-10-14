"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Camera, Loader2, Scale } from "lucide-react";
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
import { cn, formatDate, localDateISO } from "@/lib/utils";
import { comprimirImagem } from "@/lib/comprimir-imagem";
import { recordAnimalWeight } from "@/app/(app)/animais/actions";
import {
  estimarPesoPelaFoto,
  guardarEstimativaFoto,
  registrarPesagemComFoto,
  type EstimativaPesoFoto,
} from "@/app/(app)/animais/peso-foto-actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  STICKY_FOOTER,
  categoryLabel,
  formatDecimalInput,
  formatWeight,
  parseDecimal,
  previousWeighing,
  weightGain,
} from "./animal-shared";
import type { AnimalPesoFoto, AnimalWeight, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  animals: AnimalWithInfo[];
  /** Pesagens do rebanho — daqui sai a última pesagem do animal. */
  weights?: AnimalWeight[];
  /** Pesos estimados pela foto (migration 109) — daqui sai a precisão da foto. */
  pesosFoto?: AnimalPesoFoto[];
  presetAnimalId?: string | null;
}

const CONFIANCA: Record<EstimativaPesoFoto["confianca"], string> = {
  baixa: "confiança baixa",
  media: "confiança média",
  alta: "confiança alta",
};

/** Erro em % arredondado, sem casa decimal ("8%"). */
function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/**
 * Pesagem avulsa: o animal subiu na balança fora do protocolo de vacinação.
 * Mostra na hora quanto ele ganhou desde a última pesagem e em quanto tempo.
 *
 * "Estimar pela foto": a IA olha a foto e devolve um peso aproximado. Isso NÃO
 * é pesagem — não calcula dose. Pesando na balança logo depois, a foto fica
 * guardada ao lado do peso real e o quadro de precisão mostra quanto ela erra.
 */
export function WeightDialog({
  open,
  onClose,
  animals,
  weights = [],
  pesosFoto = [],
  presetAnimalId,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [animalId, setAnimalId] = useState("");
  const [weighedAt, setWeighedAt] = useState("");
  const [weight, setWeight] = useState("");

  const fotoInput = useRef<HTMLInputElement>(null);
  const [estimando, setEstimando] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [estimativa, setEstimativa] = useState<EstimativaPesoFoto | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [verComparacoes, setVerComparacoes] = useState(false);

  function limparFoto() {
    setEstimativa(null);
    setRecusa(null);
    setFotoUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }

  useEffect(() => {
    if (!open) return;
    const aid = presetAnimalId ?? "";
    const kg = Number(animals.find((a) => a.id === aid)?.weight ?? 0);
    setAnimalId(aid);
    setWeighedAt(localDateISO());
    setWeight(kg > 0 ? String(kg).replace(".", ",") : "");
    setError(null);
    setVerComparacoes(false);
    limparFoto();
    // `animals` muda a cada refresh do servidor; abrir o diálogo é o gatilho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetAnimalId]);

  const animal = animalId ? animals.find((a) => a.id === animalId) ?? null : null;
  const typed = parseDecimal(weight);

  const last = useMemo(() => {
    if (!animalId) return null;
    return previousWeighing(
      weights.filter((w) => w.animal_id === animalId),
      weighedAt || localDateISO()
    );
  }, [animalId, weights, weighedAt]);

  const gain = useMemo(() => {
    if (!last || typed <= 0) return null;
    return weightGain(
      { weighed_at: last.weighed_at, weight: Number(last.weight) },
      { weighed_at: weighedAt || localDateISO(), weight: typed }
    );
  }, [last, typed, weighedAt]);

  /** Última estimativa pela foto deste animal (a lista vem da mais nova). */
  const ultimaFoto = useMemo(
    () => (animalId ? pesosFoto.find((p) => p.animal_id === animalId) ?? null : null),
    [animalId, pesosFoto]
  );

  /**
   * Precisão da foto no rebanho: só as fotos que têm balança no mesmo dia.
   * A régua honesta é "repetir o último peso" — se a foto não erra menos do
   * que isso, ela não está ajudando.
   */
  const precisao = useMemo(() => {
    const comBalanca = pesosFoto.filter((p) => Number(p.real_kg) > 0);
    if (comBalanca.length === 0) return null;
    let somaPct = 0;
    let somaKg = 0;
    let naFaixa = 0;
    let basePct = 0;
    let baseN = 0;
    for (const p of comBalanca) {
      const real = Number(p.real_kg);
      const diff = Math.abs(Number(p.estimado_kg) - real);
      somaPct += diff / real;
      somaKg += diff;
      if (p.min_kg != null && p.max_kg != null && real >= Number(p.min_kg) && real <= Number(p.max_kg))
        naFaixa++;
      if (Number(p.ultimo_peso_kg) > 0) {
        basePct += Math.abs(Number(p.ultimo_peso_kg) - real) / real;
        baseN++;
      }
    }
    const n = comBalanca.length;
    return {
      n,
      erroPct: somaPct / n,
      erroKg: somaKg / n,
      naFaixa,
      basePct: baseN > 0 ? basePct / baseN : null,
      linhas: comBalanca.slice(0, 15),
    };
  }, [pesosFoto]);

  const tagDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of animals) m.set(a.id, a.tag);
    return m;
  }, [animals]);

  function chooseAnimal(id: string) {
    setAnimalId(id);
    const kg = Number(animals.find((a) => a.id === id)?.weight ?? 0);
    setWeight(kg > 0 ? String(kg).replace(".", ",") : "");
    // a foto era do animal anterior
    limparFoto();
  }

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    // permite tirar outra foto logo em seguida (mesmo arquivo não dispara change)
    e.target.value = "";
    if (!original || !animalId) return;

    limparFoto();
    setError(null);
    setEstimando(true);
    try {
      const foto = await comprimirImagem(original);
      setFotoUrl(URL.createObjectURL(foto));

      const fd = new FormData();
      fd.append("animal_id", animalId);
      fd.append("foto", foto);
      const r = await estimarPesoPelaFoto(fd);

      if ("error" in r) {
        setError(r.error);
      } else if ("recusada" in r) {
        setRecusa(r.recusada);
      } else {
        setEstimativa(r.estimativa);
        // o campo agora é o peso da BALANÇA: o peso antigo pré-preenchido
        // seria comparado com a foto como se fosse o real
        setWeight("");
      }
    } catch {
      setError("Não deu para enviar a foto — confira a internet e tente de novo");
    } finally {
      setEstimando(false);
    }
  }

  function guardarSoEstimativa() {
    if (!estimativa || !animalId) return;
    setError(null);
    startTransition(async () => {
      const r = await guardarEstimativaFoto({
        animal_id: animalId,
        taken_at: localDateISO(),
        estimativa,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao guardar a estimativa");
        return;
      }
      onClose();
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!animalId) {
      setError("Selecione o animal");
      return;
    }
    if (typed <= 0) {
      setError(estimativa ? "Informe o peso da balança em kg" : "Informe o peso em kg");
      return;
    }

    startTransition(async () => {
      const dia = weighedAt || localDateISO();
      const r = estimativa
        ? await registrarPesagemComFoto({
            animal_id: animalId,
            weight: typed,
            weighed_at: dia,
            estimativa,
          })
        : await recordAnimalWeight({ animal_id: animalId, weight: typed, weighed_at: dia });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao registrar o peso");
        return;
      }
      // o peso entrou, mas a comparação com a foto não: avisa em vez de fechar
      const aviso = r && "warning" in r ? (r.warning as string | undefined) : undefined;
      if (aviso) {
        setError(aviso);
        return;
      }
      onClose();
    });
  }

  const ocupado = isPending || estimando;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Pesagem</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Animal *</Label>
            {presetAnimalId ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                {animal?.tag ?? "—"}
              </div>
            ) : (
              <SearchableSelect
                items={animals}
                value={animalId}
                onChange={chooseAnimal}
                getId={(a) => a.id}
                getLabel={(a) => a.tag}
                renderItem={(a) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{a.tag}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                      {categoryLabel(a.category, a.sex, a.species)}
                      {Number(a.weight) > 0 ? ` · ${formatWeight(Number(a.weight))}` : ""}
                    </span>
                  </div>
                )}
                placeholder="Selecione o animal..."
                searchPlaceholder="Buscar pelo número..."
                emptyMessage="Nenhum animal cadastrado"
              />
            )}
          </div>

          {/* ── Estimar pela foto ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <input
              ref={fotoInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onFoto}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!animalId || ocupado}
              onClick={() => fotoInput.current?.click()}
              className="w-full h-11 sm:h-10"
            >
              {estimando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
              {estimando
                ? "Analisando a foto..."
                : estimativa || recusa
                  ? "Tirar outra foto"
                  : "Estimar pela foto"}
            </Button>
            {!animalId && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Escolha o animal para estimar o peso pela foto.
              </p>
            )}
            {animalId && !estimativa && !recusa && !estimando && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Foto de lado, com o animal inteiro e parado.
                {ultimaFoto &&
                  ` Última pela foto: ~${formatWeight(Number(ultimaFoto.estimado_kg))} em ${formatDate(ultimaFoto.taken_at)}.`}
              </p>
            )}

            {(estimativa || recusa) && (
              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                {fotoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fotoUrl}
                    alt="Foto do animal"
                    className="h-20 w-20 flex-shrink-0 rounded-md object-cover"
                  />
                )}
                <div className="min-w-0 space-y-1">
                  {estimativa ? (
                    <>
                      <p className="text-lg font-semibold tabular-nums text-amber-900 dark:text-amber-200">
                        ~{formatWeight(estimativa.peso_kg)}
                      </p>
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        entre {estimativa.min_kg} e {estimativa.max_kg} kg ·{" "}
                        {CONFIANCA[estimativa.confianca]}
                      </p>
                      {estimativa.observacao && (
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {estimativa.observacao}
                        </p>
                      )}
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        É estimativa: não vira pesagem e não calcula dose.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-amber-900 dark:text-amber-200">{recusa}</p>
                  )}
                </div>
              </div>
            )}

            {estimativa && (
              <Button
                type="button"
                variant="ghost"
                disabled={ocupado}
                onClick={guardarSoEstimativa}
                className="w-full h-10 text-sm text-slate-600 dark:text-slate-300"
              >
                Guardar só a estimativa (sem balança)
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wg_date">Data *</Label>
            <Input
              id="wg_date"
              type="date"
              value={weighedAt}
              onChange={(e) => setWeighedAt(e.target.value)}
              className="h-11 sm:h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wg_weight">
              {estimativa ? "Peso da balança (kg) *" : "Peso (kg) *"}
            </Label>
            <Input
              id="wg_weight"
              value={weight}
              onChange={(e) => setWeight(formatDecimalInput(e.target.value))}
              placeholder={estimativa ? "o que a balança marcou" : "ex: 320"}
              className="h-11 text-base tabular-nums sm:h-10 sm:text-sm"
              inputMode="decimal"
              autoComplete="off"
            />
            {estimativa && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pesou na balança agora? Registre: a foto fica comparada com o peso real.
              </p>
            )}
            {last ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Última pesagem {formatWeight(Number(last.weight))} em{" "}
                {formatDate(last.weighed_at)}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Primeira pesagem deste animal.
              </p>
            )}
            {gain && (
              <p
                className={cn(
                  "text-sm font-medium",
                  gain.diff > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : gain.diff < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-slate-500 dark:text-slate-400"
                )}
              >
                {gain.label}
              </p>
            )}
          </div>

          {/* ── Precisão da foto no rebanho ──────────────────────────────── */}
          {precisao && (
            <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Precisão da foto: erra {pct(precisao.erroPct)} em média (
                {Math.round(precisao.erroKg)} kg)
              </p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                {precisao.n} {precisao.n === 1 ? "comparação" : "comparações"} com a balança ·
                peso dentro da faixa em {precisao.naFaixa}
                {precisao.basePct != null &&
                  ` · repetir o último peso erraria ${pct(precisao.basePct)}`}
              </p>
              <button
                type="button"
                onClick={() => setVerComparacoes((v) => !v)}
                className="mt-1.5 text-produmar-600 underline-offset-2 hover:underline dark:text-produmar-400"
              >
                {verComparacoes ? "Esconder comparações" : "Ver comparações"}
              </button>
              {verComparacoes && (
                <table className="mt-2 w-full tabular-nums">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="font-normal">Nº</th>
                      <th className="font-normal">Dia</th>
                      <th className="text-right font-normal">Foto</th>
                      <th className="text-right font-normal">Balança</th>
                      <th className="text-right font-normal">Erro</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600 dark:text-slate-300">
                    {precisao.linhas.map((p) => {
                      const real = Number(p.real_kg);
                      const diff = Number(p.estimado_kg) - real;
                      return (
                        <tr key={p.id}>
                          <td className="truncate pr-1">{tagDe.get(p.animal_id) ?? "—"}</td>
                          <td>{formatDate(p.taken_at).slice(0, 5)}</td>
                          <td className="text-right">{Math.round(Number(p.estimado_kg))}</td>
                          <td className="text-right">{Math.round(real)}</td>
                          <td className="text-right">
                            {diff > 0 ? "+" : ""}
                            {Math.round(diff)} kg
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
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
            <Button
              type="submit"
              disabled={ocupado}
              className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
            >
              <Scale className="w-4 h-4" />
              {isPending ? "Salvando..." : "Registrar peso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
