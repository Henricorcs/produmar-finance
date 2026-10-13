"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ClipboardList,
  Pencil,
  Pill,
  Plus,
  Printer,
  Search,
  Syringe,
  Trash2,
  Undo2,
} from "lucide-react";
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
import { cn, formatDate, localDateISO } from "@/lib/utils";
import {
  aplicarEtapaProtocolo,
  aplicarProtocoloNoAnimal,
  createProtocoloAplicacao,
  deleteProtocoloAplicacao,
  desfazerEtapaProtocolo,
  desfazerProtocoloNoAnimal,
} from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  ICON_BUTTON,
  SPECIES_META,
  STICKY_FOOTER,
  categoryLabel,
  categoryPlural,
  formatDecimalInput,
  formatMl,
  formatWeight,
  parseDecimal,
  suggestedDoseMl,
} from "./animal-shared";
import {
  Chip,
  MedicamentosDialog,
  ProtocoloModeloDialog,
  diaLabel,
} from "./protocolos-cadastro";
import type {
  AnimalBreed,
  AnimalCategory,
  AnimalMedicamento,
  AnimalProtocolo,
  AnimalProtocoloAplicacao,
  AnimalProtocoloAplicacaoAnimal,
  AnimalProtocoloItem,
  AnimalProtocoloItemFoto,
  AnimalSpecies,
  AnimalWithInfo,
} from "@/lib/types";

/** Uma dose de protocolo já registrada (tratamento com a etapa). */
export interface EtapaFeita {
  animal_id: string;
  medicine: string | null;
  dose: string | null;
  applied_at: string;
  protocolo_aplicacao_id: string;
  protocolo_dia: number;
}

interface Props {
  /** Todo mundo — inclusive quem saiu, para a programação antiga mostrar o nº. */
  animals: AnimalWithInfo[];
  breeds: AnimalBreed[];
  medicamentos: AnimalMedicamento[];
  protocolos: AnimalProtocolo[];
  protocoloItens: AnimalProtocoloItem[];
  aplicacoes: AnimalProtocoloAplicacao[];
  aplicacaoAnimais: AnimalProtocoloAplicacaoAnimal[];
  etapasFeitas: EtapaFeita[];
}

// ── Contas de data ───────────────────────────────────────────────────────────

function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Os dias do protocolo, em ordem, com os itens de cada um. */
function etapasDe(itens: { dia: number }[]): number[] {
  return Array.from(new Set(itens.map((i) => i.dia))).sort((a, b) => a - b);
}

/** ml com uma casa, como a dose sai da conta. */
function doseDe(item: AnimalProtocoloItemFoto, peso: number): number | null {
  return suggestedDoseMl(item, peso);
}

/**
 * PROTOCOLOS — a aba que organiza o tratamento em levas.
 *
 * Três passos: cadastrar os medicamentos com a dose da bula, montar o
 * protocolo (o que se dá e em que dia) e programar num grupo de animais. Daí
 * em diante a aba mostra cada etapa com a data dela, e cada etapa abre a lista
 * do curral: nº do animal, peso e quantos ml de cada remédio.
 */
export function ProtocolosTab({
  animals,
  breeds,
  medicamentos,
  protocolos,
  protocoloItens,
  aplicacoes,
  aplicacaoAnimais,
  etapasFeitas,
}: Props) {
  const [, startTransition] = useTransition();
  const [medsOpen, setMedsOpen] = useState(false);
  const [medsSpecies, setMedsSpecies] = useState<AnimalSpecies>("bovino");
  const [modeloOpen, setModeloOpen] = useState(false);
  const [modelo, setModelo] = useState<AnimalProtocolo | null>(null);
  const [programarOpen, setProgramarOpen] = useState(false);
  const [programarPreset, setProgramarPreset] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<{ aplicacaoId: string; dia: number } | null>(null);

  const hoje = localDateISO();

  /** Etapas já aplicadas: `aplicacaoId|dia` → doses. */
  const feitasPorEtapa = useMemo(() => {
    const m = new Map<string, EtapaFeita[]>();
    for (const f of etapasFeitas) {
      const k = `${f.protocolo_aplicacao_id}|${f.protocolo_dia}`;
      const arr = m.get(k);
      if (arr) arr.push(f);
      else m.set(k, [f]);
    }
    return m;
  }, [etapasFeitas]);

  const animaisPorAplicacao = useMemo(() => {
    const m = new Map<string, AnimalProtocoloAplicacaoAnimal[]>();
    for (const a of aplicacaoAnimais) {
      const arr = m.get(a.aplicacao_id);
      if (arr) arr.push(a);
      else m.set(a.aplicacao_id, [a]);
    }
    return m;
  }, [aplicacaoAnimais]);

  const animalById = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);

  /**
   * Programações com as etapas e a situação de cada uma. A etapa pode ser
   * aplicada aos poucos (um animal por vez no curral): só fica "aplicada"
   * quando todos os animais da leva que ainda estão no rebanho tomaram.
   */
  const programacoes = useMemo(() => {
    return aplicacoes
      .map((ap) => {
        const doGrupo = animaisPorAplicacao.get(ap.id) ?? [];
        const etapas = etapasDe(ap.itens ?? []).map((dia) => {
          const data = addDays(ap.start_date, dia);
          const feitas = feitasPorEtapa.get(`${ap.id}|${dia}`) ?? [];
          const tomaram = new Set(feitas.map((f) => f.animal_id));
          const faltam = doGrupo.filter((x) => {
            const a = animalById.get(x.animal_id);
            return !tomaram.has(x.animal_id) && !!a && a.active !== false;
          }).length;
          return {
            dia,
            data,
            feita: tomaram.size > 0 && faltam === 0,
            aplicados: tomaram.size,
            faltam,
            aplicadaEm: feitas[0]?.applied_at ?? null,
            itens: (ap.itens ?? []).filter((i) => i.dia === dia),
          };
        });
        const proxima = etapas.find((e) => !e.feita) ?? null;
        return {
          ap,
          etapas,
          proxima,
          animais: animaisPorAplicacao.get(ap.id)?.length ?? 0,
        };
      })
      .sort((a, b) => {
        // quem tem etapa pendente vem antes, pela data dela; concluídas no fim
        if (!!a.proxima !== !!b.proxima) return a.proxima ? -1 : 1;
        if (a.proxima && b.proxima) return a.proxima.data.localeCompare(b.proxima.data);
        return b.ap.start_date.localeCompare(a.ap.start_date);
      });
  }, [aplicacoes, feitasPorEtapa, animaisPorAplicacao, animalById]);

  const emAndamento = programacoes.filter((p) => p.proxima);
  const concluidas = programacoes.filter((p) => !p.proxima);

  const medById = useMemo(() => new Map(medicamentos.map((m) => [m.id, m])), [medicamentos]);

  function resumoModelo(p: AnimalProtocolo) {
    const itens = protocoloItens.filter((i) => i.protocolo_id === p.id);
    return etapasDe(itens).map((dia) => ({
      dia,
      nomes: itens
        .filter((i) => i.dia === dia)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => medById.get(i.medicamento_id)?.name ?? "?"),
    }));
  }

  function cancelarProgramacao(ap: AnimalProtocoloAplicacao) {
    if (
      !confirm(
        `Cancelar a programação "${ap.name}"? As doses já aplicadas continuam na ficha de cada animal.`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteProtocoloAplicacao(ap.id);
      if (r && "error" in r) alert(r.error);
    });
  }

  const etapaAberta = etapa ? aplicacoes.find((a) => a.id === etapa.aplicacaoId) ?? null : null;

  return (
    <div className="space-y-4">
      {/* Ações */}
      <div className="grid grid-cols-3 gap-1.5">
        <Button
          onClick={() => {
            setProgramarPreset(null);
            setProgramarOpen(true);
          }}
          className="h-11"
          disabled={protocolos.length === 0}
        >
          <Syringe className="w-4 h-4" />
          Aplicar
        </Button>
        <Button
          variant="outline"
          className="h-11"
          onClick={() => {
            setModelo(null);
            setModeloOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Protocolo
        </Button>
        <Button
          variant="outline"
          className="h-11"
          onClick={() => {
            setMedsSpecies("bovino");
            setMedsOpen(true);
          }}
        >
          <Pill className="w-4 h-4" />
          Remédios
        </Button>
      </div>

      {/* Primeiro uso: os três passos */}
      {protocolos.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <p className="font-semibold text-slate-800 dark:text-slate-100">Como funciona</p>
          <ol className="list-decimal pl-5 space-y-1 text-[13px]">
            <li>
              Em <strong>Remédios</strong>, cadastre cada medicamento com a dose da bula
              (ex.: 1 ml a cada 50 kg).
            </li>
            <li>
              Em <strong>Protocolo</strong>, monte a receita: o que se dá no início e o que
              se dá daqui a 30 dias.
            </li>
            <li>
              Em <strong>Aplicar</strong>, escolha o protocolo e toque no nº do animal: aparece o
              peso e os ml de cada remédio. Aplicou, volta para escolher o próximo — e o
              reforço já fica programado.
            </li>
          </ol>
        </div>
      )}

      {/* Etapas pendentes */}
      {emAndamento.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Em andamento
          </h2>
          {emAndamento.map((p) => (
            <ProgramacaoCard
              key={p.ap.id}
              prog={p}
              hoje={hoje}
              onEtapa={(dia) => setEtapa({ aplicacaoId: p.ap.id, dia })}
              onCancelar={() => cancelarProgramacao(p.ap)}
            />
          ))}
        </section>
      )}

      {/* Modelos */}
      {protocolos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Protocolos
          </h2>
          {protocolos.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 pr-1 py-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {p.name}{" "}
                  <span className="text-[11px] font-normal text-slate-400">
                    · {SPECIES_META[p.species].label}
                  </span>
                </p>
                <div className="mt-0.5 space-y-0.5">
                  {resumoModelo(p).map((e) => (
                    <p key={e.dia} className="text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-produmar-700 dark:text-produmar-300">
                        {diaLabel(e.dia)}:
                      </span>{" "}
                      {e.nomes.join(", ")}
                    </p>
                  ))}
                </div>
              </div>
              <button
                aria-label={`Aplicar ${p.name}`}
                title="Aplicar"
                onClick={() => {
                  setProgramarPreset(p.id);
                  setProgramarOpen(true);
                }}
                className={cn(ICON_BUTTON, "text-produmar-600 hover:bg-produmar-50 dark:hover:bg-slate-800")}
              >
                <Syringe className="w-4 h-4" />
              </button>
              <button
                aria-label={`Editar ${p.name}`}
                onClick={() => {
                  setModelo(p);
                  setModeloOpen(true);
                }}
                className={cn(ICON_BUTTON, "text-slate-400 hover:text-produmar-600")}
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Concluídas */}
      {concluidas.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 py-1">
            Concluídas ({concluidas.length})
          </summary>
          <div className="space-y-2 pt-2">
            {concluidas.map((p) => (
              <ProgramacaoCard
                key={p.ap.id}
                prog={p}
                hoje={hoje}
                onEtapa={(dia) => setEtapa({ aplicacaoId: p.ap.id, dia })}
                onCancelar={() => cancelarProgramacao(p.ap)}
              />
            ))}
          </div>
        </details>
      )}

      <MedicamentosDialog
        open={medsOpen}
        onClose={() => setMedsOpen(false)}
        medicamentos={medicamentos}
        species={medsSpecies}
      />
      <ProtocoloModeloDialog
        open={modeloOpen}
        onClose={() => setModeloOpen(false)}
        protocolo={modelo}
        itens={protocoloItens}
        medicamentos={medicamentos}
        onAbrirMedicamentos={(s) => {
          setMedsSpecies(s);
          setMedsOpen(true);
        }}
      />
      <ProgramarDialog
        open={programarOpen}
        onClose={() => setProgramarOpen(false)}
        presetProtocoloId={programarPreset}
        protocolos={protocolos}
        protocoloItens={protocoloItens}
        medicamentos={medicamentos}
        animals={animals}
        breeds={breeds}
        aplicacoes={aplicacoes}
        etapasFeitas={etapasFeitas}
      />
      {etapaAberta && etapa && (
        <EtapaDialog
          open
          onClose={() => setEtapa(null)}
          aplicacao={etapaAberta}
          dia={etapa.dia}
          animaisDaAplicacao={animaisPorAplicacao.get(etapaAberta.id) ?? []}
          animals={animals}
          feitas={feitasPorEtapa.get(`${etapaAberta.id}|${etapa.dia}`) ?? []}
        />
      )}
    </div>
  );
}

// ── Cartão de uma programação ────────────────────────────────────────────────

function ProgramacaoCard({
  prog,
  hoje,
  onEtapa,
  onCancelar,
}: {
  prog: {
    ap: AnimalProtocoloAplicacao;
    etapas: {
      dia: number;
      data: string;
      feita: boolean;
      aplicados: number;
      faltam: number;
      aplicadaEm: string | null;
      itens: AnimalProtocoloItemFoto[];
    }[];
    animais: number;
  };
  hoje: string;
  onEtapa: (dia: number) => void;
  onCancelar: () => void;
}) {
  const { ap, etapas, animais } = prog;
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {ap.name}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {animais} {animais === 1 ? "animal" : "animais"} ·{" "}
            {SPECIES_META[ap.species].label} · começou {formatDate(ap.start_date)}
          </p>
        </div>
        <button
          aria-label="Cancelar programação"
          onClick={onCancelar}
          className={cn(ICON_BUTTON, "w-9 h-9 text-slate-300 hover:text-red-500")}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-1.5">
        {etapas.map((e) => {
          const atrasada = !e.feita && e.data < hoje;
          const ehHoje = !e.feita && e.data === hoje;
          return (
            <button
              key={e.dia}
              onClick={() => onEtapa(e.dia)}
              className={cn(
                "w-full flex items-center gap-2 text-left rounded-lg border px-2.5 py-2 transition-colors active:scale-[0.99]",
                e.feita
                  ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                  : atrasada
                    ? "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20"
                    : ehHoje
                      ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              <span
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold",
                  e.feita
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                )}
              >
                {e.feita ? <Check className="w-3.5 h-3.5" /> : e.dia}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                  {diaLabel(e.dia)} · {formatDate(e.data)}
                  <span
                    className={cn(
                      "ml-1.5 font-medium",
                      e.feita
                        ? "text-emerald-600 dark:text-emerald-400"
                        : atrasada
                          ? "text-red-600 dark:text-red-400"
                          : ehHoje
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-400"
                    )}
                  >
                    {e.feita
                      ? `aplicada ${e.aplicadaEm ? formatDate(e.aplicadaEm) : ""}`
                      : atrasada
                        ? "atrasada"
                        : ehHoje
                          ? "hoje"
                          : "programada"}
                  </span>
                  {!e.feita && e.aplicados > 0 && (
                    <span className="ml-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                      · {e.aplicados} de {e.aplicados + e.faltam} aplicados
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {e.itens.map((i) => i.name).join(", ")}
                </p>
              </div>
              <ClipboardList className="w-4 h-4 text-slate-300 flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Aplicar / programar: protocolo + data + animais ──────────────────────────

type CatFiltro = "todos" | AnimalCategory;

/**
 * Duas formas de usar:
 *
 * - UM POR UM (o curral): escolhe o protocolo e o dia, toca no nº do animal,
 *   confere o peso e os ml, "Aplicar protocolo" — e volta para a grade para
 *   escolher o próximo. Quem já tomou fica verde. As próximas etapas (o
 *   reforço) ficam programadas sozinhas.
 * - PROGRAMAR GRUPO: marca vários e só programa, para aplicar depois pela
 *   lista do curral.
 */
function ProgramarDialog({
  open,
  onClose,
  presetProtocoloId,
  protocolos,
  protocoloItens,
  medicamentos,
  animals,
  breeds,
  aplicacoes,
  etapasFeitas,
}: {
  open: boolean;
  onClose: () => void;
  presetProtocoloId: string | null;
  protocolos: AnimalProtocolo[];
  protocoloItens: AnimalProtocoloItem[];
  medicamentos: AnimalMedicamento[];
  animals: AnimalWithInfo[];
  breeds: AnimalBreed[];
  aplicacoes: AnimalProtocoloAplicacao[];
  etapasFeitas: EtapaFeita[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<"um" | "grupo">("um");
  const [protocoloId, setProtocoloId] = useState("");
  const [inicio, setInicio] = useState(localDateISO());
  const [cat, setCat] = useState<CatFiltro>("todos");
  const [breedId, setBreedId] = useState("");
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  /** O animal aberto no "um por um". */
  const [animalId, setAnimalId] = useState<string | null>(null);
  const [peso, setPeso] = useState("");
  /** O último aplicado, para o aviso "aplicado — escolha o próximo". */
  const [ultimo, setUltimo] = useState<{ tag: string; animalId: string; aplicacaoId: string } | null>(
    null
  );
  /** Aplicados nesta tela (`protocolo|dia|animal` → programação), antes de a página recarregar. */
  const [locais, setLocais] = useState<Map<string, string>>(new Map());
  const buscaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setModo("um");
    setProtocoloId(presetProtocoloId ?? (protocolos.length === 1 ? protocolos[0].id : ""));
    setInicio(localDateISO());
    setCat("todos");
    setBreedId("");
    setBusca("");
    setMarcados(new Set());
    setAnimalId(null);
    setPeso("");
    setUltimo(null);
    setLocais(new Map());
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetProtocoloId]);

  const protocolo = protocolos.find((p) => p.id === protocoloId) ?? null;
  const species = protocolo?.species ?? null;

  /** O rebanho de hoje daquele tipo. */
  const doTipo = useMemo(
    () =>
      species
        ? animals
            .filter((a) => a.active !== false && a.species === species)
            .sort((a, b) => a.tag.localeCompare(b.tag, "pt-BR", { numeric: true }))
        : [],
    [animals, species]
  );

  const visiveis = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return doTipo.filter(
      (a) =>
        (cat === "todos" || a.category === cat) &&
        (!breedId || a.breed_id === breedId) &&
        (!q || a.tag.toUpperCase().includes(q))
    );
  }, [doTipo, cat, breedId, busca]);

  const racas = breeds.filter((b) => b.species === species);

  const itens = protocolo ? protocoloItens.filter((i) => i.protocolo_id === protocolo.id) : [];
  const medById = new Map(medicamentos.map((m) => [m.id, m]));
  const usaPeso = itens.some((i) => {
    const m = medById.get(i.medicamento_id);
    return !!(m?.dose_ml_per_weight && m?.dose_weight_kg);
  });
  const semPeso = doTipo.filter((a) => marcados.has(a.id) && !(Number(a.weight) > 0)).length;

  const dias = etapasDe(itens);
  const primeiroDia = dias[0] ?? 0;
  const itensAgora = itens
    .filter((i) => i.dia === primeiroDia)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({ item: i, med: medById.get(i.medicamento_id) }));

  /** Quem já tomou a primeira etapa deste protocolo neste dia: animal → programação. */
  const aplicados = useMemo(() => {
    const m = new Map<string, string>();
    if (!protocolo) return m;
    for (const ap of aplicacoes) {
      if (ap.protocolo_id !== protocolo.id || ap.start_date !== inicio) continue;
      const primeiro = Math.min(...(ap.itens ?? []).map((i) => i.dia));
      for (const f of etapasFeitas) {
        if (f.protocolo_aplicacao_id === ap.id && f.protocolo_dia === primeiro)
          m.set(f.animal_id, ap.id);
      }
    }
    locais.forEach((apId, k) => {
      const [p, d, a] = k.split("|");
      if (p === protocolo.id && d === inicio) m.set(a, apId);
    });
    return m;
  }, [protocolo, inicio, aplicacoes, etapasFeitas, locais]);

  const animal = animalId ? doTipo.find((a) => a.id === animalId) ?? null : null;
  const pesoBase = Number(animal?.weight ?? 0) || 0;
  const pesoHoje = peso !== "" ? parseDecimal(peso) : pesoBase;
  const dosesAgora = itensAgora.map(({ med }) => (med ? suggestedDoseMl(med, pesoHoje) : null));
  const faltaPeso = dosesAgora.some((d) => d == null);

  function alternar(id: string) {
    setMarcados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function abrirAnimal(id: string) {
    setAnimalId(id);
    setPeso("");
    setError(null);
  }

  function escolherOutro() {
    setAnimalId(null);
    setPeso("");
    setBusca("");
    setError(null);
    // volta para o campo do nº, pronto para o próximo
    setTimeout(() => buscaRef.current?.focus(), 50);
  }

  /** Enter no campo do nº: se achou um só (ou o nº exato), já abre. */
  function buscaEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = busca.trim().toUpperCase();
    const alvo =
      visiveis.find((a) => a.tag.toUpperCase() === q) ??
      (visiveis.length === 1 ? visiveis[0] : null);
    if (!alvo) return;
    if (modo === "um") abrirAnimal(alvo.id);
    else {
      alternar(alvo.id);
      setBusca("");
    }
  }

  function aplicarNoAnimal() {
    if (!protocolo || !animal) return;
    setError(null);
    if (faltaPeso) return setError("Digite o peso do animal para calcular a dose");
    const pesado = peso !== "" && parseDecimal(peso) > 0;
    startTransition(async () => {
      const r = await aplicarProtocoloNoAnimal({
        protocolo_id: protocolo.id,
        start_date: inicio,
        animal: {
          animal_id: animal.id,
          weight_kg: pesoHoje > 0 ? pesoHoje : null,
          pesado,
          doses: itensAgora.map(({ item }, idx) => ({
            medicamento_id: item.medicamento_id,
            dose_ml: dosesAgora[idx],
          })),
        },
      });
      if (r && "error" in r) return setError(r.error ?? "Erro ao aplicar");
      if (r && "warning" in r && r.warning) alert(r.warning);
      const apId = r && "aplicacao_id" in r ? (r.aplicacao_id as string) : "";
      setLocais((prev) => new Map(prev).set(`${protocolo.id}|${inicio}|${animal.id}`, apId));
      setUltimo({ tag: animal.tag, animalId: animal.id, aplicacaoId: apId });
      escolherOutro();
    });
  }

  function desfazerAnimal(alvo: { animalId: string; aplicacaoId: string; tag: string }) {
    if (!protocolo) return;
    if (!confirm(`Desfazer o protocolo no ${alvo.tag}? As doses saem da ficha dele.`)) return;
    startTransition(async () => {
      const r = await desfazerProtocoloNoAnimal(alvo.aplicacaoId, alvo.animalId);
      if (r && "error" in r) return setError(r.error ?? "Erro ao desfazer");
      setLocais((prev) => {
        const n = new Map(prev);
        n.delete(`${protocolo.id}|${inicio}|${alvo.animalId}`);
        return n;
      });
      if (ultimo?.animalId === alvo.animalId) setUltimo(null);
      if (animalId === alvo.animalId) escolherOutro();
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (modo === "um") {
      if (animal) aplicarNoAnimal();
      return;
    }
    setError(null);
    if (!protocolo) return setError("Escolha o protocolo");
    if (marcados.size === 0) return setError("Escolha os animais");
    startTransition(async () => {
      const r = await createProtocoloAplicacao({
        protocolo_id: protocolo.id,
        start_date: inicio,
        animais: doTipo
          .filter((a) => marcados.has(a.id))
          .map((a) => ({ animal_id: a.id, weight_kg: Number(a.weight) || null })),
      });
      if (r && "error" in r) return setError(r.error ?? "Erro ao programar");
      onClose();
    });
  }

  const umPorUm = modo === "um";
  const jaAplicadoNele = animal ? aplicados.get(animal.id) ?? null : null;
  const qtdAplicados = doTipo.filter((a) => aplicados.has(a.id)).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {umPorUm ? "Aplicar protocolo" : "Programar protocolo"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* ── O animal escolhido: peso, ml e "Aplicar protocolo" ── */}
          {umPorUm && protocolo && animal ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={escolherOutro}
                disabled={isPending}
                className="flex items-center gap-1 text-sm font-medium text-produmar-600 dark:text-produmar-400"
              >
                <ArrowLeft className="w-4 h-4" />
                Escolher outro animal
              </button>

              <div className="rounded-xl border border-produmar-200 bg-produmar-50/60 dark:border-slate-700 dark:bg-slate-800/60 px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Animal
                  </p>
                  <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100 leading-tight">
                    {animal.tag}
                  </p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">
                    {categoryLabel(animal.category, animal.sex, animal.species)}
                    {animal.breed_name ? ` · ${animal.breed_name}` : ""}
                    {pesoBase > 0 ? ` · ${formatWeight(pesoBase)}` : " · sem peso"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{protocolo.name}</p>
                  <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                    {formatDate(addDays(inicio, primeiroDia))}
                  </p>
                </div>
              </div>

              {jaAplicadoNele ? (
                <div className="space-y-2">
                  <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-400">
                    <Check className="w-4 h-4 inline -mt-0.5 mr-1" />
                    Esse animal já tomou o protocolo neste dia.
                  </p>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      desfazerAnimal({ animalId: animal.id, aplicacaoId: jaAplicadoNele, tag: animal.tag })
                    }
                    className="flex items-center gap-1 text-[13px] font-medium text-red-600 hover:underline"
                  >
                    <Undo2 className="w-4 h-4" />
                    Desfazer neste animal
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="prog_peso">Peso hoje (kg)</Label>
                    <Input
                      id="prog_peso"
                      value={peso}
                      onChange={(e) => setPeso(formatDecimalInput(e.target.value))}
                      placeholder={pesoBase > 0 ? String(pesoBase).replace(".", ",") : "Digite o peso"}
                      inputMode="decimal"
                      className="h-11 sm:h-10 tabular-nums"
                    />
                    <p className="text-[11px] text-slate-400">
                      {usaPeso
                        ? "Pesou no curral? Digite e a dose se refaz — o peso fica registrado."
                        : "Opcional — as doses deste protocolo não dependem do peso."}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Aplicar agora</Label>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                      {itensAgora.map(({ item, med }, idx) => (
                        <div key={item.id} className="flex items-center gap-2 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {med?.name ?? "?"}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {med?.dose_ml_per_weight && med?.dose_weight_kg
                                ? `${formatMl(Number(med.dose_ml_per_weight))} a cada ${Number(med.dose_weight_kg)} kg`
                                : "dose fixa"}
                            </p>
                          </div>
                          <p
                            className={cn(
                              "text-xl font-bold tabular-nums whitespace-nowrap",
                              dosesAgora[idx] == null
                                ? "text-amber-600 text-sm"
                                : "text-produmar-700 dark:text-produmar-300"
                            )}
                          >
                            {dosesAgora[idx] == null ? "falta o peso" : formatMl(dosesAgora[idx])}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {dias.length > 1 && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                      <p className="font-semibold">Fica programado:</p>
                      {dias.slice(1).map((dia) => (
                        <p key={dia}>
                          <span className="font-semibold text-produmar-700 dark:text-produmar-300">
                            {diaLabel(dia)} · {formatDate(addDays(inicio, dia))}:
                          </span>{" "}
                          {itens
                            .filter((i) => i.dia === dia)
                            .map((i) => medById.get(i.medicamento_id)?.name ?? "?")
                            .join(", ")}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                {(
                  [
                    ["um", "Aplicar um por um"],
                    ["grupo", "Programar grupo"],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setModo(v);
                      setError(null);
                    }}
                    className={cn(
                      "min-h-[40px] rounded-lg text-[13px] font-semibold transition-colors",
                      modo === v
                        ? "bg-white text-produmar-700 shadow-sm dark:bg-slate-900 dark:text-produmar-300"
                        : "text-slate-500"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label>Protocolo</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {protocolos.map((p) => (
                    <Chip
                      key={p.id}
                      active={p.id === protocoloId}
                      onClick={() => {
                        setProtocoloId(p.id);
                        setMarcados(new Set());
                        setBreedId("");
                        setUltimo(null);
                      }}
                      className="text-left leading-tight"
                    >
                      {p.name}
                      <span className="block text-[10px] opacity-70">
                        {SPECIES_META[p.species].label}
                      </span>
                    </Chip>
                  ))}
                </div>
              </div>

              {protocolo && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="prog_inicio">{umPorUm ? "Dia da aplicação" : "Começa em"}</Label>
                    <Input
                      id="prog_inicio"
                      type="date"
                      value={inicio}
                      onChange={(e) => {
                        setInicio(e.target.value);
                        setUltimo(null);
                      }}
                      className="h-11 sm:h-10"
                    />
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                      {dias.map((dia) => (
                        <p key={dia}>
                          <span className="font-semibold text-produmar-700 dark:text-produmar-300">
                            {diaLabel(dia)} · {inicio ? formatDate(addDays(inicio, dia)) : "—"}:
                          </span>{" "}
                          {itens
                            .filter((i) => i.dia === dia)
                            .map((i) => medById.get(i.medicamento_id)?.name ?? "?")
                            .join(", ")}
                        </p>
                      ))}
                    </div>
                  </div>

                  {umPorUm && ultimo && (
                    <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-400">
                      <Check className="w-4 h-4 flex-shrink-0" />
                      <p className="flex-1 min-w-0">
                        <strong>{ultimo.tag}</strong> aplicado. Escolha o próximo animal.
                      </p>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => desfazerAnimal(ultimo)}
                        className="text-[12px] font-medium text-slate-500 hover:text-red-600 underline"
                      >
                        Desfazer
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>
                        {umPorUm ? "Toque no nº do animal" : "Animais"}{" "}
                        <span className="text-produmar-600 dark:text-produmar-400">
                          ({umPorUm ? qtdAplicados : marcados.size} de {doTipo.length})
                        </span>
                      </Label>
                      {!umPorUm && (
                        <div className="flex gap-3 text-[11px] font-medium">
                          <button
                            type="button"
                            className="text-produmar-600 dark:text-produmar-400 hover:underline"
                            onClick={() =>
                              setMarcados((prev) => {
                                const n = new Set(prev);
                                visiveis.forEach((a) => n.add(a.id));
                                return n;
                              })
                            }
                          >
                            Marcar {visiveis.length === doTipo.length ? "todos" : "os filtrados"}
                          </button>
                          <button
                            type="button"
                            className="text-slate-500 hover:underline"
                            onClick={() => setMarcados(new Set())}
                          >
                            Limpar
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      {(["todos", "vaca", "boi", "bezerro"] as CatFiltro[]).map((c) => (
                        <Chip key={c} active={cat === c} onClick={() => setCat(c)} className="px-1 text-[11px]">
                          {c === "todos" ? "Todos" : categoryPlural(c, species)}
                        </Chip>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      {racas.length > 0 && (
                        <select
                          value={breedId}
                          onChange={(e) => setBreedId(e.target.value)}
                          aria-label="Raça"
                          className="h-10 flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-sm uppercase dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="">Todas as raças</option>
                          {racas.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 z-[1]" />
                        <Input
                          ref={buscaRef}
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          onKeyDown={buscaEnter}
                          placeholder="Nº do animal"
                          className="h-10 pl-8"
                          inputMode="search"
                          enterKeyHint="go"
                        />
                      </div>
                    </div>

                    {doTipo.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center">
                        Nenhum {SPECIES_META[protocolo.species].label.toLowerCase()} no rebanho.
                      </p>
                    ) : visiveis.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center">
                        Nenhum animal com esse nº.
                      </p>
                    ) : (
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-1 max-h-64 overflow-y-auto p-0.5">
                        {visiveis.map((a) => {
                          const feito = umPorUm && aplicados.has(a.id);
                          const on = !umPorUm && marcados.has(a.id);
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => (umPorUm ? abrirAnimal(a.id) : alternar(a.id))}
                              className={cn(
                                "relative min-h-[44px] rounded-lg border text-center leading-tight px-0.5 transition-colors active:scale-[0.97]",
                                on
                                  ? "bg-produmar-600 border-produmar-600 text-white"
                                  : feito
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300"
                                    : "bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                              )}
                            >
                              {feito && (
                                <Check className="w-3 h-3 absolute top-0.5 right-0.5 text-emerald-600" />
                              )}
                              <span className="block text-sm font-bold tabular-nums">{a.tag}</span>
                              <span
                                className={cn(
                                  "block text-[10px] tabular-nums",
                                  on ? "text-white/80" : feito ? "text-emerald-600" : "text-slate-400"
                                )}
                              >
                                {feito
                                  ? "aplicado"
                                  : Number(a.weight) > 0
                                    ? formatWeight(Number(a.weight))
                                    : "sem peso"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {!umPorUm && usaPeso && semPeso > 0 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        {semPeso} {semPeso === 1 ? "animal está" : "animais estão"} sem peso — dá
                        para digitar o peso na lista do curral, na hora de aplicar.
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            {umPorUm && animal ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={escolherOutro}
                  disabled={isPending}
                  className={FOOTER_CANCEL}
                >
                  Voltar
                </Button>
                {!jaAplicadoNele && (
                  <Button
                    type="submit"
                    disabled={isPending || faltaPeso}
                    className={FOOTER_SUBMIT}
                  >
                    <Syringe className="w-4 h-4" />
                    {isPending ? "Aplicando..." : "Aplicar protocolo"}
                  </Button>
                )}
              </>
            ) : umPorUm ? (
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
                className="flex-1"
              >
                {qtdAplicados > 0 ? "Concluir" : "Fechar"}
              </Button>
            ) : (
              <>
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
                  disabled={isPending || !protocolo || marcados.size === 0}
                  className={FOOTER_SUBMIT}
                >
                  {isPending ? "Programando..." : `Programar ${marcados.size || ""}`.trim()}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── A etapa: a lista do curral ───────────────────────────────────────────────

/**
 * A lista que vai para o curral: uma linha por animal (nº e peso) e uma coluna
 * por medicamento com os ml já calculados. O peso pode ser corrigido na hora —
 * pesou no curral, digita, e a dose se refaz. No fim, o total de cada remédio
 * para saber quanto preparar.
 */
function EtapaDialog({
  open,
  onClose,
  aplicacao,
  dia,
  animaisDaAplicacao,
  animals,
  feitas,
}: {
  open: boolean;
  onClose: () => void;
  aplicacao: AnimalProtocoloAplicacao;
  dia: number;
  animaisDaAplicacao: AnimalProtocoloAplicacaoAnimal[];
  animals: AnimalWithInfo[];
  feitas: EtapaFeita[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aplicadoEm, setAplicadoEm] = useState(localDateISO());
  /** Peso digitado na hora, por animal. */
  const [pesos, setPesos] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  /** O animal que acabou de ser aplicado sozinho, para o aviso. */
  const [ultimo, setUltimo] = useState<string | null>(null);

  const itens = (aplicacao.itens ?? []).filter((i) => i.dia === dia);
  const data = addDays(aplicacao.start_date, dia);
  /** Quem já tomou esta etapa — dá para aplicar aos poucos, um por vez. */
  const tomaram = useMemo(() => new Set(feitas.map((f) => f.animal_id)), [feitas]);

  useEffect(() => {
    if (!open) return;
    setAplicadoEm(data <= localDateISO() ? localDateISO() : data);
    setPesos({});
    setBusca("");
    setUltimo(null);
    setError(null);
  }, [open, aplicacao.id, dia, data]);

  const animalById = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);

  const linhas = useMemo(
    () =>
      animaisDaAplicacao
        .map((x) => {
          const a = animalById.get(x.animal_id);
          const base = Number(x.weight_kg ?? 0) || Number(a?.weight ?? 0);
          const digitado = pesos[x.animal_id];
          const peso = digitado != null && digitado !== "" ? parseDecimal(digitado) : base;
          return {
            id: x.animal_id,
            tag: a?.tag ?? "?",
            saiu: a ? a.active === false : true,
            base,
            peso,
            pesado: digitado != null && digitado !== "" && parseDecimal(digitado) > 0,
            doses: itens.map((i) => doseDe(i, peso)),
            feito: tomaram.has(x.animal_id),
          };
        })
        .sort((a, b) => a.tag.localeCompare(b.tag, "pt-BR", { numeric: true })),
    [animaisDaAplicacao, animalById, pesos, itens, tomaram]
  );

  const pendentes = linhas.filter((l) => !l.saiu && !l.feito);
  const feita = tomaram.size > 0 && pendentes.length === 0;
  const q = busca.trim().toUpperCase();
  const linhasVisiveis = q ? linhas.filter((l) => l.tag.toUpperCase().includes(q)) : linhas;

  const ativas = pendentes;
  const totais = itens.map((_, idx) =>
    ativas.reduce((s, l) => s + (l.doses[idx] ?? 0), 0)
  );
  const faltaDose = ativas.some((l) => l.doses.some((d) => d == null));

  function imprimir() {
    const esc = (s: string) =>
      s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const blocos = itens
      .map((it, idx) => {
        const rows = ativas
          .map(
            (l) =>
              `<tr><td>${esc(l.tag)}</td><td>${l.peso > 0 ? esc(formatWeight(l.peso)) : "—"}</td><td><b>${esc(
                formatMl(l.doses[idx])
              )}</b></td><td class="ok"></td></tr>`
          )
          .join("");
        return `<h2>${esc(it.name)}</h2><table><thead><tr><th>Nº</th><th>Peso</th><th>Aplicar</th><th>✓</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total</td><td><b>${esc(
          formatMl(Math.round(totais[idx] * 10) / 10)
        )}</b></td><td></td></tr></tfoot></table>`;
      })
      .join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${esc(aplicacao.name)}</title><style>
      body{font-family:system-ui,sans-serif;margin:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px} p{margin:0 0 16px;color:#555;font-size:13px}
      h2{font-size:15px;margin:20px 0 6px}
      table{border-collapse:collapse;width:100%;max-width:520px;font-size:14px}
      th,td{border:1px solid #bbb;padding:6px 8px;text-align:left}
      th{background:#f1f5f9} td.ok{width:40px} tfoot td{background:#f8fafc}
      h2{page-break-after:avoid} table{page-break-inside:auto}
      </style></head><body><h1>${esc(aplicacao.name)} — ${esc(diaLabel(dia))}</h1><p>${esc(
        formatDate(data)
      )} · ${ativas.length} animais</p>${blocos}<script>window.onload=()=>window.print()</script></body></html>`
    );
    w.document.close();
  }

  /**
   * Sem argumento, marca todos os que estão com o ✓. Com uma linha, aplica só
   * naquele animal e a lista fica aberta para escolher o próximo.
   */
  function aplicar(so?: (typeof linhas)[number]) {
    setError(null);
    const alvo = so ? [so] : ativas;
    if (alvo.length === 0) return setError("Nenhum animal marcado");
    if (!so && alvo.length > 1 && !confirm(`Marcar a etapa como aplicada nos ${alvo.length} animais que faltam?`))
      return;
    if (alvo.some((l) => l.doses.some((d) => d == null)))
      return setError(
        so
          ? `O ${so.tag} está sem peso: digite o peso dele para calcular a dose`
          : "Tem animal sem peso: digite o peso dele ou desmarque para aplicar depois"
      );
    startTransition(async () => {
      const r = await aplicarEtapaProtocolo({
        aplicacao_id: aplicacao.id,
        dia,
        applied_at: aplicadoEm,
        animais: alvo.map((l) => ({
          animal_id: l.id,
          weight_kg: l.peso > 0 ? l.peso : null,
          pesado: l.pesado,
          doses: itens.map((i, idx) => ({ medicamento_id: i.medicamento_id, dose_ml: l.doses[idx] })),
        })),
      });
      if (r && "error" in r) return setError(r.error ?? "Erro ao registrar");
      if (r && "warning" in r && r.warning) alert(r.warning);
      if (!so) return onClose();
      setUltimo(so.tag);
      setBusca("");
    });
  }

  function desfazerAnimal(l: (typeof linhas)[number]) {
    if (!confirm(`Desfazer esta etapa no ${l.tag}? As doses saem da ficha dele.`)) return;
    startTransition(async () => {
      const r = await desfazerEtapaProtocolo(aplicacao.id, dia, l.id);
      if (r && "error" in r) return setError(r.error ?? "Erro ao desfazer");
      if (ultimo === l.tag) setUltimo(null);
    });
  }

  function desfazer() {
    if (
      !confirm(
        "Desfazer esta etapa? As doses dela saem da ficha de cada animal (os pesos registrados ficam)."
      )
    )
      return;
    startTransition(async () => {
      const r = await desfazerEtapaProtocolo(aplicacao.id, dia);
      if (r && "error" in r) return setError(r.error ?? "Erro ao desfazer");
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 pr-8">
            {aplicacao.name} · {diaLabel(dia)}
          </DialogTitle>
          <p className="text-[11px] text-slate-400">
            {formatDate(data)} · {itens.map((i) => i.name).join(", ")}
          </p>
        </DialogHeader>

        {feita ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-400">
              Aplicada em {formatDate(feitas[0].applied_at)} —{" "}
              {new Set(feitas.map((f) => f.animal_id)).size} animais. Está na ficha de cada um.
            </p>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-500">
                  <tr>
                    <th className="text-left px-2 py-1.5">Nº</th>
                    <th className="text-left px-2 py-1.5">Medicamento</th>
                    <th className="text-right px-2 py-1.5">Dose</th>
                  </tr>
                </thead>
                <tbody>
                  {[...feitas]
                    .map((f) => ({ ...f, tag: animalById.get(f.animal_id)?.tag ?? "?" }))
                    .sort((a, b) => a.tag.localeCompare(b.tag, "pt-BR", { numeric: true }))
                    .map((f, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-1.5 font-semibold tabular-nums">{f.tag}</td>
                        <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300">{f.medicine}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{f.dose ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter className={STICKY_FOOTER}>
              <Button
                type="button"
                variant="outline"
                onClick={desfazer}
                disabled={isPending}
                className={cn(FOOTER_CANCEL, "text-red-600")}
              >
                <Undo2 className="w-4 h-4" />
                Desfazer
              </Button>
              <Button type="button" onClick={onClose} className={FOOTER_SUBMIT}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            {ultimo && (
              <p className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-400">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>
                  <strong>{ultimo}</strong> aplicado. Escolha o próximo animal.
                </span>
              </p>
            )}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 z-[1]" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nº do animal"
                  className="h-10 pl-8"
                  inputMode="search"
                />
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {linhas.filter((l) => l.feito).length}
                </strong>{" "}
                de {linhas.filter((l) => l.feito || !l.saiu).length} aplicados
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-500 sticky top-0 z-[1]">
                  <tr>
                    <th className="w-[76px] px-1 py-1.5"></th>
                    <th className="text-left px-1.5 py-1.5">Nº</th>
                    <th className="text-left px-1.5 py-1.5">Peso (kg)</th>
                    {itens.map((i) => (
                      <th key={i.medicamento_id} className="text-right px-1.5 py-1.5 leading-tight">
                        {i.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhasVisiveis.length === 0 && (
                    <tr>
                      <td colSpan={3 + itens.length} className="px-2 py-3 text-center text-xs text-slate-400">
                        Nenhum animal com esse nº nesta programação.
                      </td>
                    </tr>
                  )}
                  {linhasVisiveis.map((l) => {
                    const off = l.saiu || l.feito;
                    return (
                      <tr
                        key={l.id}
                        className={cn(
                          "border-t border-slate-100 dark:border-slate-800",
                          l.feito && "bg-emerald-50/60 dark:bg-emerald-950/20",
                          l.saiu && "opacity-40"
                        )}
                      >
                        <td className="px-1 py-1">
                          {l.feito ? (
                            <button
                              type="button"
                              onClick={() => desfazerAnimal(l)}
                              disabled={isPending}
                              title="Desfazer neste animal"
                              className="w-full h-9 rounded-md flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                            >
                              <Check className="w-4 h-4" />
                              feito
                            </button>
                          ) : l.saiu ? null : (
                            <button
                              type="button"
                              onClick={() => aplicar(l)}
                              disabled={isPending}
                              className="w-full h-9 rounded-md bg-produmar-600 text-white text-[11px] font-semibold active:scale-[0.97] disabled:opacity-50"
                            >
                              Aplicar
                            </button>
                          )}
                        </td>
                        <td className="px-1.5 py-1 font-bold tabular-nums whitespace-nowrap">
                          {l.tag}
                          {l.saiu && (
                            <span className="block text-[9px] font-normal text-slate-400">saiu</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1">
                          {off ? (
                            <span className="text-[12px] tabular-nums text-slate-500">
                              {l.peso > 0 ? String(l.peso).replace(".", ",") : "—"}
                            </span>
                          ) : (
                            <Input
                              value={pesos[l.id] ?? ""}
                              onChange={(e) =>
                                setPesos((p) => ({ ...p, [l.id]: formatDecimalInput(e.target.value) }))
                              }
                              placeholder={l.base > 0 ? String(l.base).replace(".", ",") : "peso"}
                              inputMode="decimal"
                              aria-label={`Peso do ${l.tag}`}
                              semDitado
                              className="h-9 w-20 tabular-nums px-2"
                            />
                          )}
                        </td>
                        {l.doses.map((d, idx) => (
                          <td
                            key={idx}
                            className={cn(
                              "px-1.5 py-1 text-right font-semibold tabular-nums whitespace-nowrap",
                              l.feito
                                ? "text-emerald-700/70 dark:text-emerald-400/70"
                                : d == null
                                  ? "text-amber-600"
                                  : "text-produmar-700 dark:text-produmar-300"
                            )}
                          >
                            {l.feito ? "✓" : d == null ? "sem peso" : formatMl(d)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800 text-[12px] sticky bottom-0">
                  <tr>
                    <td></td>
                    <td colSpan={2} className="px-1.5 py-1.5 font-semibold">
                      Falta · {ativas.length} animais
                    </td>
                    {totais.map((t, idx) => (
                      <td key={idx} className="px-1.5 py-1.5 text-right font-bold tabular-nums">
                        {formatMl(Math.round(t * 10) / 10)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {itens
                .map((i) => `${i.name}: ${i.dose_ml_per_weight && i.dose_weight_kg ? `${formatMl(Number(i.dose_ml_per_weight))} a cada ${Number(i.dose_weight_kg)} kg` : formatMl(Number(i.default_dose_ml))}`)
                .join(" · ")}
              . Toque em <strong>Aplicar</strong> no animal que tomou e siga para o próximo.
              Pesou no curral? Digite o peso antes e a dose se refaz — o peso fica registrado.
            </p>
            {faltaDose && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Animal sem peso fica sem a dose que depende do peso. Digite o peso dele antes de
                aplicar.
              </p>
            )}

            <div className="flex items-end gap-2">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="etapa_data">Aplicado em</Label>
                <Input
                  id="etapa_data"
                  type="date"
                  value={aplicadoEm}
                  onChange={(e) => setAplicadoEm(e.target.value)}
                  className="h-11 sm:h-10"
                />
              </div>
              <Button type="button" variant="outline" onClick={imprimir} className="h-11 sm:h-10">
                <Printer className="w-4 h-4" />
                Imprimir
              </Button>
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
                Fechar
              </Button>
              <Button
                type="button"
                onClick={() => aplicar()}
                disabled={isPending || ativas.length === 0}
                className={FOOTER_SUBMIT}
              >
                <Check className="w-4 h-4" />
                {isPending ? "Registrando..." : `Aplicar em todos (${ativas.length})`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
