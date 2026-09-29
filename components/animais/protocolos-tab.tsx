"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarClock,
  Check,
  ClipboardList,
  Pencil,
  Pill,
  Plus,
  Printer,
  Search,
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
  createProtocoloAplicacao,
  deleteProtocoloAplicacao,
  desfazerEtapaProtocolo,
} from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  ICON_BUTTON,
  SPECIES_META,
  STICKY_FOOTER,
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

  /** Programações com as etapas e a situação de cada uma. */
  const programacoes = useMemo(() => {
    return aplicacoes
      .map((ap) => {
        const etapas = etapasDe(ap.itens ?? []).map((dia) => {
          const data = addDays(ap.start_date, dia);
          const feitas = feitasPorEtapa.get(`${ap.id}|${dia}`) ?? [];
          return {
            dia,
            data,
            feita: feitas.length > 0,
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
  }, [aplicacoes, feitasPorEtapa, animaisPorAplicacao]);

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
          <CalendarClock className="w-4 h-4" />
          Programar
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
              Em <strong>Programar</strong>, escolha os animais e a data. Cada etapa vira a
              lista do curral com o nº, o peso e os ml de cada animal.
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
                aria-label={`Programar ${p.name}`}
                title="Programar"
                onClick={() => {
                  setProgramarPreset(p.id);
                  setProgramarOpen(true);
                }}
                className={cn(ICON_BUTTON, "text-produmar-600 hover:bg-produmar-50 dark:hover:bg-slate-800")}
              >
                <CalendarClock className="w-4 h-4" />
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
    etapas: { dia: number; data: string; feita: boolean; aplicadaEm: string | null; itens: AnimalProtocoloItemFoto[] }[];
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

// ── Programar: protocolo + data + animais ────────────────────────────────────

type CatFiltro = "todos" | AnimalCategory;

function ProgramarDialog({
  open,
  onClose,
  presetProtocoloId,
  protocolos,
  protocoloItens,
  medicamentos,
  animals,
  breeds,
}: {
  open: boolean;
  onClose: () => void;
  presetProtocoloId: string | null;
  protocolos: AnimalProtocolo[];
  protocoloItens: AnimalProtocoloItem[];
  medicamentos: AnimalMedicamento[];
  animals: AnimalWithInfo[];
  breeds: AnimalBreed[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [protocoloId, setProtocoloId] = useState("");
  const [inicio, setInicio] = useState(localDateISO());
  const [cat, setCat] = useState<CatFiltro>("todos");
  const [breedId, setBreedId] = useState("");
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setProtocoloId(presetProtocoloId ?? (protocolos.length === 1 ? protocolos[0].id : ""));
    setInicio(localDateISO());
    setCat("todos");
    setBreedId("");
    setBusca("");
    setMarcados(new Set());
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

  function alternar(id: string) {
    setMarcados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Programar protocolo</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
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
                <Label htmlFor="prog_inicio">Começa em</Label>
                <Input
                  id="prog_inicio"
                  type="date"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  className="h-11 sm:h-10"
                />
                <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                  {etapasDe(itens).map((dia) => (
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

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>
                    Animais{" "}
                    <span className="text-produmar-600 dark:text-produmar-400">
                      ({marcados.size} de {doTipo.length})
                    </span>
                  </Label>
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
                    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Nº do animal"
                      className="h-10 pl-8"
                      inputMode="search"
                    />
                  </div>
                </div>

                {doTipo.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    Nenhum {SPECIES_META[protocolo.species].label.toLowerCase()} no rebanho.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-1 max-h-64 overflow-y-auto p-0.5">
                    {visiveis.map((a) => {
                      const on = marcados.has(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => alternar(a.id)}
                          className={cn(
                            "min-h-[44px] rounded-lg border text-center leading-tight px-0.5 transition-colors",
                            on
                              ? "bg-produmar-600 border-produmar-600 text-white"
                              : "bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                          )}
                        >
                          <span className="block text-sm font-bold tabular-nums">{a.tag}</span>
                          <span
                            className={cn(
                              "block text-[10px] tabular-nums",
                              on ? "text-white/80" : "text-slate-400"
                            )}
                          >
                            {Number(a.weight) > 0 ? formatWeight(Number(a.weight)) : "sem peso"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {usaPeso && semPeso > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {semPeso} {semPeso === 1 ? "animal está" : "animais estão"} sem peso — dá
                    para digitar o peso na lista do curral, na hora de aplicar.
                  </p>
                )}
              </div>
            </>
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
  const [fora, setFora] = useState<Set<string>>(new Set());

  const itens = (aplicacao.itens ?? []).filter((i) => i.dia === dia);
  const data = addDays(aplicacao.start_date, dia);
  const feita = feitas.length > 0;

  useEffect(() => {
    if (!open) return;
    setAplicadoEm(data <= localDateISO() ? localDateISO() : data);
    setPesos({});
    setFora(new Set());
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
          };
        })
        .sort((a, b) => a.tag.localeCompare(b.tag, "pt-BR", { numeric: true })),
    [animaisDaAplicacao, animalById, pesos, itens]
  );

  const ativas = linhas.filter((l) => !fora.has(l.id) && !l.saiu);
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

  function aplicar() {
    setError(null);
    if (ativas.length === 0) return setError("Nenhum animal marcado");
    if (faltaDose)
      return setError("Tem animal sem peso: digite o peso dele ou desmarque para aplicar depois");
    startTransition(async () => {
      const r = await aplicarEtapaProtocolo({
        aplicacao_id: aplicacao.id,
        dia,
        applied_at: aplicadoEm,
        animais: ativas.map((l) => ({
          animal_id: l.id,
          weight_kg: l.peso > 0 ? l.peso : null,
          pesado: l.pesado,
          doses: itens.map((i, idx) => ({ medicamento_id: i.medicamento_id, dose_ml: l.doses[idx] })),
        })),
      });
      if (r && "error" in r) return setError(r.error ?? "Erro ao registrar");
      if (r && "warning" in r && r.warning) alert(r.warning);
      onClose();
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
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-500 sticky top-0 z-[1]">
                  <tr>
                    <th className="w-8 px-1 py-1.5"></th>
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
                  {linhas.map((l) => {
                    const off = fora.has(l.id) || l.saiu;
                    return (
                      <tr
                        key={l.id}
                        className={cn(
                          "border-t border-slate-100 dark:border-slate-800",
                          off && "opacity-40"
                        )}
                      >
                        <td className="px-1 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={!off}
                            disabled={l.saiu}
                            onChange={() =>
                              setFora((prev) => {
                                const n = new Set(prev);
                                if (n.has(l.id)) n.delete(l.id);
                                else n.add(l.id);
                                return n;
                              })
                            }
                            aria-label={`Aplicar no ${l.tag}`}
                            className="w-5 h-5 accent-produmar-600"
                          />
                        </td>
                        <td className="px-1.5 py-1 font-bold tabular-nums whitespace-nowrap">
                          {l.tag}
                          {l.saiu && (
                            <span className="block text-[9px] font-normal text-slate-400">saiu</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1">
                          <Input
                            value={pesos[l.id] ?? ""}
                            onChange={(e) =>
                              setPesos((p) => ({ ...p, [l.id]: formatDecimalInput(e.target.value) }))
                            }
                            placeholder={l.base > 0 ? String(l.base).replace(".", ",") : "peso"}
                            inputMode="decimal"
                            aria-label={`Peso do ${l.tag}`}
                            className="h-9 w-20 tabular-nums px-2"
                          />
                        </td>
                        {l.doses.map((d, idx) => (
                          <td
                            key={idx}
                            className={cn(
                              "px-1.5 py-1 text-right font-semibold tabular-nums whitespace-nowrap",
                              d == null ? "text-amber-600" : "text-produmar-700 dark:text-produmar-300"
                            )}
                          >
                            {d == null ? "sem peso" : formatMl(d)}
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
                      Total · {ativas.length} animais
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
              . Pesou no curral? Digite o peso e a dose se refaz — o peso fica registrado.
            </p>
            {faltaDose && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Animal sem peso fica sem a dose que depende do peso. Digite o peso dele ou
                desmarque.
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
                onClick={aplicar}
                disabled={isPending || ativas.length === 0}
                className={FOOTER_SUBMIT}
              >
                <Check className="w-4 h-4" />
                {isPending ? "Registrando..." : "Marcar aplicado"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
