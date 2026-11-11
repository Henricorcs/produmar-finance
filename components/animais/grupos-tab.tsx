"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Pencil, Plus, Search, Trash2, UserMinus, Users, X } from "lucide-react";
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
  addAnimaisAoGrupo,
  createAnimalGrupo,
  deleteAnimalGrupo,
  deleteEntradaNoGrupo,
  tirarAnimalDoGrupo,
  updateAnimalGrupo,
  updateEntradaNoGrupo,
} from "@/app/(app)/animais/actions";
import { SPECIES_META, categoryLabel, categoryPlural, criacaoPorLote, speciesOf } from "./animal-shared";
import { Chip, SpeciesChips } from "./protocolos-cadastro";
import type {
  AnimalBreed,
  AnimalCategory,
  AnimalGrupo,
  AnimalGrupoAnimal,
  AnimalSpecies,
  AnimalWithInfo,
} from "@/lib/types";

interface Props {
  grupos: AnimalGrupo[];
  membros: AnimalGrupoAnimal[];
  /** Todo mundo que já entrou no rebanho — inclusive quem já saiu. */
  animals: AnimalWithInfo[];
  breeds: AnimalBreed[];
  /** O tipo escolhido no menu "Tipo e raça" — null = todos. */
  speciesFixa: AnimalSpecies | null;
}

const ordemTag = (a: { tag: string }, b: { tag: string }) =>
  a.tag.localeCompare(b.tag, "pt-BR", { numeric: true });

/** "12 vacas · 3 bois · 4 bezerros" — o resumo do cartão do lote. */
function resumoCategorias(lista: AnimalWithInfo[], species: AnimalSpecies): string {
  const cont = new Map<AnimalCategory, number>();
  for (const a of lista) cont.set(a.category, (cont.get(a.category) ?? 0) + 1);
  return (["vaca", "boi", "bezerro"] as AnimalCategory[])
    .filter((c) => cont.get(c))
    .map((c) => `${cont.get(c)} ${categoryPlural(c, species).toLowerCase()}`)
    .join(" · ");
}

/**
 * A ABA DOS LOTES: o rebanho separado por lote ("LOTE DA ENGORDA", "VACAS
 * PARIDAS"). Cada animal fica em um lote por vez, com o dia em que entrou.
 * Tocando no lote abre quem está nele, e dali se põe e se tira animal.
 */
export function GruposTab({ grupos, membros, animals, breeds, speciesFixa }: Props) {
  const [novoOpen, setNovoOpen] = useState(false);
  const [editGrupo, setEditGrupo] = useState<AnimalGrupo | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [verInativos, setVerInativos] = useState(false);

  const animalById = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);

  /** Quem está em cada lote hoje (entrada aberta e animal ainda no rebanho). */
  const atuaisPorGrupo = useMemo(() => {
    const m = new Map<string, AnimalWithInfo[]>();
    for (const x of membros) {
      if (x.left_on) continue;
      const a = animalById.get(x.animal_id);
      if (!a || a.active === false) continue;
      const lista = m.get(x.grupo_id) ?? [];
      lista.push(a);
      m.set(x.grupo_id, lista);
    }
    return m;
  }, [membros, animalById]);

  const doTipo = grupos
    .filter((g) => !speciesFixa || g.species === speciesFixa)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
  const ativos = doTipo.filter((g) => g.active);
  const inativos = doTipo.filter((g) => !g.active);

  /** Animais do rebanho de hoje que não estão em lote nenhum. */
  const semLote = useMemo(() => {
    const emLote = new Set(membros.filter((x) => !x.left_on).map((x) => x.animal_id));
    return animals.filter(
      (a) =>
        a.active !== false &&
        !criacaoPorLote(a.species) &&
        (!speciesFixa || speciesOf(a.species) === speciesFixa) &&
        !emLote.has(a.id)
    ).length;
  }, [animals, membros, speciesFixa]);

  const detalhe = detalheId ? grupos.find((g) => g.id === detalheId) ?? null : null;

  if (speciesFixa && criacaoPorLote(speciesFixa)) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 py-8 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
        {SPECIES_META[speciesFixa].plural} se separam por tanque/galpão — veja a aba Tanques.
      </p>
    );
  }

  const cartao = (g: AnimalGrupo) => {
    const lista = atuaisPorGrupo.get(g.id) ?? [];
    return (
      <button
        key={g.id}
        type="button"
        onClick={() => setDetalheId(g.id)}
        className={cn(
          "rounded-xl border bg-white dark:bg-slate-900 p-3 text-left transition-colors active:scale-[0.99]",
          g.active
            ? "border-produmar-200 dark:border-slate-700"
            : "border-slate-200 opacity-70 dark:border-slate-700"
        )}
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 flex-shrink-0 text-produmar-600 dark:text-produmar-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {g.name}
          </span>
          <span className="ml-auto text-lg font-bold tabular-nums text-produmar-700 dark:text-produmar-300 flex-shrink-0">
            {lista.length}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
          {SPECIES_META[g.species]?.plural ?? g.species}
          {!g.active ? " · desativado" : ""}
        </p>
        <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400 truncate">
          {lista.length > 0 ? resumoCategorias(lista, g.species) : "Nenhum animal ainda"}
        </p>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          className="h-11 flex-1 sm:flex-none"
          onClick={() => {
            setEditGrupo(null);
            setNovoOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Novo lote
        </Button>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 text-right flex-1">
          <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {semLote}
          </span>{" "}
          {semLote === 1 ? "animal" : "animais"} sem lote
        </p>
      </div>

      {ativos.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 py-8 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
          Nenhum lote ainda. Crie um lote, dê o nome e escolha os animais que vão para ele.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{ativos.map(cartao)}</div>
      )}

      {inativos.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setVerInativos((v) => !v)}
            className="text-[12px] font-medium text-slate-500 hover:underline"
          >
            {verInativos ? "Esconder" : "Ver"} lotes desativados ({inativos.length})
          </button>
          {verInativos && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{inativos.map(cartao)}</div>
          )}
        </div>
      )}

      <GrupoDialog
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        grupo={editGrupo}
        presetSpecies={speciesFixa}
        onCreated={(id) => setDetalheId(id)}
        onDeleted={() => setDetalheId(null)}
      />

      {/* some enquanto o lote está sendo editado — um diálogo de cada vez */}
      <GrupoDetailDialog
        open={!!detalhe && !novoOpen}
        onClose={() => setDetalheId(null)}
        grupo={detalhe}
        grupos={grupos}
        membros={membros}
        animalById={animalById}
        animals={animals}
        breeds={breeds}
        onEdit={(g) => {
          setEditGrupo(g);
          setNovoOpen(true);
        }}
      />
    </div>
  );
}

// ── Criar / editar o lote ────────────────────────────────────────────────────

function GrupoDialog({
  open,
  onClose,
  grupo,
  presetSpecies,
  onCreated,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  grupo: AnimalGrupo | null;
  presetSpecies: AnimalSpecies | null;
  onCreated: (id: string) => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<AnimalSpecies>("bovino");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(grupo?.name ?? "");
    setSpecies(
      grupo?.species ??
        (presetSpecies && !criacaoPorLote(presetSpecies) ? presetSpecies : "bovino")
    );
    setNotes(grupo?.notes ?? "");
    setActive(grupo?.active ?? true);
  }, [open, grupo, presetSpecies]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Dê um nome ao lote");
    startTransition(async () => {
      const input = { species, name, notes, active };
      const r = grupo ? await updateAnimalGrupo(grupo.id, input) : await createAnimalGrupo(input);
      if (r && "error" in r && r.error) return setError(r.error);
      onClose();
      // lote novo já abre para escolher os animais
      if (!grupo && r && "id" in r && r.id) onCreated(String(r.id));
    });
  }

  function apagar() {
    if (!grupo) return;
    if (
      !confirm(
        `Apagar o lote ${grupo.name}? Os animais continuam no rebanho, mas o histórico de quem passou por este lote some. Para guardar o histórico, desative em vez de apagar.`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteAnimalGrupo(grupo.id);
      if (r && "error" in r && r.error) return setError(r.error);
      onClose();
      onDeleted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {grupo ? "Editar lote" : "Novo lote"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="grupo_nome">Nome do lote</Label>
            <Input
              id="grupo_nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex.: LOTE DA ENGORDA"
              className="h-11 sm:h-10 uppercase"
              autoFocus
            />
          </div>

          {!grupo ? (
            <div className="space-y-1.5">
              <Label>Tipo de animal</Label>
              <SpeciesChips value={species} onChange={setSpecies} />
            </div>
          ) : (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Lote de {SPECIES_META[grupo.species]?.plural.toLowerCase() ?? grupo.species}.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="grupo_obs">Observação (opcional)</Label>
            <Input
              id="grupo_obs"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex.: PASTO DO RIO"
              className="h-11 sm:h-10 uppercase"
            />
          </div>

          {grupo && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4"
              />
              Lote ativo
            </label>
          )}

          {error && <ErrorBox>{error}</ErrorBox>}

          <DialogFooter className="gap-2 sm:justify-between">
            {grupo ? (
              <Button
                type="button"
                variant="outline"
                onClick={apagar}
                disabled={isPending}
                className="h-11 sm:h-10 text-red-600 border-red-200 dark:border-red-900/50"
              >
                <Trash2 className="w-4 h-4" />
                Apagar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-10">
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="h-11 sm:h-10">
                {isPending ? "Salvando..." : grupo ? "Salvar" : "Criar lote"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Quem está no lote ────────────────────────────────────────────────────────

function GrupoDetailDialog({
  open,
  onClose,
  grupo,
  grupos,
  membros,
  animalById,
  animals,
  breeds,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  grupo: AnimalGrupo | null;
  grupos: AnimalGrupo[];
  membros: AnimalGrupoAnimal[];
  animalById: Map<string, AnimalWithInfo>;
  animals: AnimalWithInfo[];
  breeds: AnimalBreed[];
  onEdit: (g: AnimalGrupo) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adicionar, setAdicionar] = useState(false);
  /** A linha sendo mexida: corrigir a entrada ou tirar do lote. */
  const [editando, setEditando] = useState<{
    id: string;
    modo: "entrada" | "saida";
    data: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAdicionar(false);
    setEditando(null);
  }, [open, grupo?.id]);

  const doGrupo = grupo ? membros.filter((x) => x.grupo_id === grupo.id) : [];
  const atuais = doGrupo
    .filter((x) => !x.left_on && animalById.get(x.animal_id)?.active !== false)
    .map((x) => ({ m: x, a: animalById.get(x.animal_id) }))
    .filter((r): r is { m: AnimalGrupoAnimal; a: AnimalWithInfo } => !!r.a)
    .sort((x, y) => ordemTag(x.a, y.a));
  /** Quem passou por aqui: saiu do lote, ou saiu do rebanho estando nele. */
  const historico = doGrupo
    .filter((x) => x.left_on || animalById.get(x.animal_id)?.active === false)
    .map((x) => ({ m: x, a: animalById.get(x.animal_id) }))
    .filter((r): r is { m: AnimalGrupoAnimal; a: AnimalWithInfo } => !!r.a)
    .sort((x, y) => (y.m.left_on ?? "9999").localeCompare(x.m.left_on ?? "9999"));

  function salvarLinha() {
    if (!editando) return;
    setError(null);
    const { id, modo, data } = editando;
    if (!data) return setError("Escolha a data");
    startTransition(async () => {
      const r =
        modo === "entrada"
          ? await updateEntradaNoGrupo(id, data)
          : await tirarAnimalDoGrupo(id, data);
      if (r && "error" in r && r.error) return setError(r.error);
      setEditando(null);
    });
  }

  function apagarPassagem(m: AnimalGrupoAnimal, tag: string) {
    if (!confirm(`Apagar a passagem do ${tag} por este lote? Use só se ele foi posto aqui por engano.`))
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteEntradaNoGrupo(m.id);
      if (r && "error" in r && r.error) setError(r.error);
    });
  }

  if (!grupo) return null;

  return (
    <>
      <Dialog open={open && !adicionar} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100 pr-6">{grupo.name}</DialogTitle>
          </DialogHeader>

          <p className="-mt-2 text-[12px] text-slate-500 dark:text-slate-400">
            {SPECIES_META[grupo.species]?.plural ?? grupo.species} ·{" "}
            <strong className="tabular-nums">{atuais.length}</strong>{" "}
            {atuais.length === 1 ? "animal" : "animais"}
            {grupo.notes ? ` · ${grupo.notes}` : ""}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Button className="h-11" onClick={() => setAdicionar(true)} disabled={!grupo.active}>
              <Plus className="w-4 h-4" />
              Pôr animais
            </Button>
            <Button variant="outline" className="h-11" onClick={() => onEdit(grupo)}>
              <Pencil className="w-4 h-4" />
              Editar lote
            </Button>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          {atuais.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
              Nenhum animal neste lote. Toque em &quot;Pôr animais&quot;.
            </p>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {atuais.map(({ m, a }) => {
                const ed = editando?.id === m.id ? editando : null;
                return (
                  <div key={m.id} className="px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="min-w-[56px] text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {a.tag}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">
                          {categoryLabel(a.category, a.sex, a.species)}
                          {a.breed_name ? ` · ${a.breed_name}` : ""}
                        </p>
                        <button
                          type="button"
                          onClick={() => setEditando({ id: m.id, modo: "entrada", data: m.joined_on })}
                          className="text-[12px] font-medium text-produmar-700 dark:text-produmar-300 hover:underline"
                        >
                          entrou em {formatDate(m.joined_on)}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditando({ id: m.id, modo: "saida", data: localDateISO() })}
                        className="flex items-center gap-1 h-9 px-2.5 rounded-lg border border-slate-200 text-[12px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
                      >
                        <UserMinus className="w-4 h-4" />
                        Tirar
                      </button>
                    </div>
                    {ed && (
                      <LinhaData
                        label={ed.modo === "entrada" ? "Entrou no lote em" : "Saiu do lote em"}
                        value={ed.data}
                        onChange={(data) => setEditando({ ...ed, data })}
                        onSave={salvarLinha}
                        onCancel={() => setEditando(null)}
                        saving={isPending}
                        saveLabel={ed.modo === "entrada" ? "Salvar" : "Tirar do lote"}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {historico.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-[12px] font-medium text-slate-500">
                Já passaram por este lote ({historico.length})
              </summary>
              <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {historico.map(({ m, a }) => {
                  const foiPara = !m.left_on
                    ? null
                    : membros.find(
                        (x) => x.animal_id === a.id && x.id !== m.id && x.joined_on === m.left_on
                      );
                  const destino = foiPara ? grupos.find((g) => g.id === foiPara.grupo_id) : null;
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-[56px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                        {a.tag}
                      </span>
                      <p className="flex-1 min-w-0 text-[12px] text-slate-500 dark:text-slate-400">
                        {formatDate(m.joined_on)} → {m.left_on ? formatDate(m.left_on) : "—"}
                        {destino ? ` · foi para ${destino.name}` : ""}
                        {a.active === false ? " · saiu do rebanho" : ""}
                      </p>
                      <button
                        type="button"
                        title="Apagar esta passagem"
                        onClick={() => apagarPassagem(m, a.tag)}
                        disabled={isPending}
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </DialogContent>
      </Dialog>

      <AdicionarAnimaisDialog
        open={open && adicionar}
        onClose={() => setAdicionar(false)}
        grupo={grupo}
        grupos={grupos}
        membros={membros}
        animals={animals}
        breeds={breeds}
      />
    </>
  );
}

function LinhaData({
  label,
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  saveLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2">
      <div className="flex-1 min-w-[150px] space-y-1">
        <Label className="text-[11px]">{label}</Label>
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10"
        />
      </div>
      <Button type="button" size="sm" className="h-10" onClick={onSave} disabled={saving}>
        <Check className="w-4 h-4" />
        {saveLabel}
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-10" onClick={onCancel}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ── Pôr animais no lote ──────────────────────────────────────────────────────

type CatFiltro = "todos" | AnimalCategory;

function AdicionarAnimaisDialog({
  open,
  onClose,
  grupo,
  grupos,
  membros,
  animals,
  breeds,
}: {
  open: boolean;
  onClose: () => void;
  grupo: AnimalGrupo;
  grupos: AnimalGrupo[];
  membros: AnimalGrupoAnimal[];
  animals: AnimalWithInfo[];
  breeds: AnimalBreed[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState(localDateISO());
  const [cat, setCat] = useState<CatFiltro>("todos");
  const [breedId, setBreedId] = useState("");
  const [busca, setBusca] = useState("");
  const [soSemLote, setSoSemLote] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setError(null);
    setData(localDateISO());
    setCat("todos");
    setBreedId("");
    setBusca("");
    setSoSemLote(false);
    setMarcados(new Set());
  }, [open]);

  /** Onde cada animal está hoje: animal → lote. */
  const loteAtual = useMemo(() => {
    const nomes = new Map(grupos.map((g) => [g.id, g.name]));
    const m = new Map<string, { grupoId: string; nome: string }>();
    for (const x of membros)
      if (!x.left_on) m.set(x.animal_id, { grupoId: x.grupo_id, nome: nomes.get(x.grupo_id) ?? "?" });
    return m;
  }, [membros, grupos]);

  /** O rebanho de hoje do tipo do lote, menos quem já está neste lote. */
  const candidatos = useMemo(
    () =>
      animals
        .filter(
          (a) =>
            a.active !== false &&
            speciesOf(a.species) === grupo.species &&
            loteAtual.get(a.id)?.grupoId !== grupo.id
        )
        .sort(ordemTag),
    [animals, grupo, loteAtual]
  );

  const visiveis = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return candidatos.filter(
      (a) =>
        (cat === "todos" || a.category === cat) &&
        (!breedId || a.breed_id === breedId) &&
        (!soSemLote || !loteAtual.has(a.id)) &&
        (!q || a.tag.toUpperCase().includes(q))
    );
  }, [candidatos, cat, breedId, soSemLote, busca, loteAtual]);

  const racas = breeds.filter((b) => speciesOf(b.species) === grupo.species);
  const mudamDeLote = candidatos.filter((a) => marcados.has(a.id) && loteAtual.has(a.id)).length;

  function alternar(id: string) {
    setMarcados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function buscaEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = busca.trim().toUpperCase();
    const alvo =
      visiveis.find((a) => a.tag.toUpperCase() === q) ?? (visiveis.length === 1 ? visiveis[0] : null);
    if (!alvo) return;
    alternar(alvo.id);
    setBusca("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (marcados.size === 0) return setError("Toque nos números dos animais que vão para o lote");
    if (!data) return setError("Escolha o dia em que entraram no lote");
    startTransition(async () => {
      const r = await addAnimaisAoGrupo({
        grupo_id: grupo.id,
        animal_ids: Array.from(marcados),
        joined_on: data,
      });
      if (r && "error" in r && r.error) return setError(r.error);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 pr-6">Pôr animais em {grupo.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="grupo_entrada">Entraram no lote em</Label>
            <Input
              id="grupo_entrada"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="h-11 sm:h-10"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>
                Animais{" "}
                <span className="text-produmar-600 dark:text-produmar-400">
                  ({marcados.size} de {candidatos.length})
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
                  Marcar {visiveis.length === candidatos.length ? "todos" : "os filtrados"}
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
                  {c === "todos" ? "Todos" : categoryPlural(c, grupo.species)}
                </Chip>
              ))}
            </div>

            <div className="flex gap-1.5">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={buscaEnter}
                  placeholder="Nº do animal"
                  inputMode="search"
                  className="h-10 pl-8 uppercase"
                />
              </div>
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
            </div>

            <label className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={soSemLote}
                onChange={(e) => setSoSemLote(e.target.checked)}
                className="w-4 h-4"
              />
              Mostrar só quem está sem lote
            </label>

            {visiveis.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                Nenhum animal com esse filtro.
              </p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1 max-h-[45vh] overflow-y-auto">
                {visiveis.map((a) => {
                  const on = marcados.has(a.id);
                  const outro = loteAtual.get(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => alternar(a.id)}
                      className={cn(
                        "min-h-[48px] rounded-lg border px-1 py-1 text-center transition-colors active:scale-[0.97]",
                        on
                          ? "bg-produmar-600 border-produmar-600 text-white"
                          : "bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                      )}
                    >
                      <span className="block text-sm font-bold tabular-nums leading-tight">{a.tag}</span>
                      {outro && (
                        <span
                          className={cn(
                            "block text-[9px] leading-tight truncate",
                            on ? "text-white/80" : "text-amber-600 dark:text-amber-400"
                          )}
                        >
                          {outro.nome}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {mudamDeLote > 0 && (
            <p className="text-[12px] text-amber-800 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-300">
              {mudamDeLote === 1 ? "1 marcado está" : `${mudamDeLote} marcados estão`} em outro
              lote e {mudamDeLote === 1 ? "sai" : "saem"} de lá no dia{" "}
              {data ? formatDate(data) : "escolhido"}.
            </p>
          )}

          {error && <ErrorBox>{error}</ErrorBox>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-10">
              Voltar
            </Button>
            <Button type="submit" disabled={isPending || marcados.size === 0} className="h-11 sm:h-10">
              {isPending
                ? "Salvando..."
                : `Pôr ${marcados.size || ""} ${marcados.size === 1 ? "animal" : "animais"} no lote`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
      {children}
    </p>
  );
}
