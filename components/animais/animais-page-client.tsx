"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Baby,
  Beef,
  ChevronRight,
  HandCoins,
  Plus,
  Printer,
  Search,
  Settings2,
  Syringe,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatBRL, formatDate, localDateISO } from "@/lib/utils";
import {
  applyVaccineProtocol,
  deleteVaccination,
  getAnimalThumbnails,
  rejectBirthRequest,
  setVaccinePending,
  undoAnimalExit,
} from "@/app/(app)/animais/actions";
import { AnimalDialog } from "./animal-dialog";
import { AnimalExitDialog } from "./animal-exit-dialog";
import { AnimalDetailDialog } from "./animal-detail-dialog";
import { VaccineProtocolDialog } from "./vaccine-protocol-dialog";
import { AnimalVaccinesDialog } from "./animal-vaccines-dialog";
import { TreatmentDialog } from "./treatment-dialog";
import { BirthDialog } from "./birth-dialog";
import { BirthRequestDialog } from "./birth-request-dialog";
import { BirthRequestDetailDialog } from "./birth-request-detail-dialog";
import { QuickAddRow } from "./quick-add-row";
import { WeightDialog } from "./weight-dialog";
import {
  SPECIES_META,
  SPECIES_OPTIONS,
  categoryLabel,
  categoryPlural,
  doseLabel,
  formatGain,
  formatMl,
  formatPeriod,
  formatWeight,
  pariuLabel,
  recurrenceLabel,
  speciesOf,
  suggestedDoseMl,
  vaccineStatusFor,
  vaccinesForSpecies,
  vaccinesHaveSpecies,
  weightGain,
} from "./animal-shared";
import type {
  AnimalBirth,
  AnimalBirthRequest,
  AnimalBreed,
  AnimalCategory,
  AnimalSpecies,
  AnimalTreatment,
  AnimalVaccination,
  AnimalVaccine,
  AnimalVaccinePending,
  AnimalWeight,
  AnimalWithInfo,
} from "@/lib/types";

// ── Tipo da linha com joins ───────────────────────────────────────────────────
export type VaccinationRow = AnimalVaccination & {
  animal_vaccines: { name: string; recurrence_months: number | null } | null;
  animals: { tag: string } | null;
};

interface Props {
  /** Todo mundo que já entrou no rebanho — inclusive quem já saiu. */
  animals: AnimalWithInfo[];
  breeds: AnimalBreed[];
  vaccines: AnimalVaccine[];
  vaccinations: VaccinationRow[];
  treatments: AnimalTreatment[];
  births: AnimalBirth[];
  /** Vacinas que o dono marcou como pendentes na mão. */
  pendings: AnimalVaccinePending[];
  /** Pesagens do rebanho — daqui sai o ganho de peso de cada animal. */
  weights?: AnimalWeight[];
  /** Nascimentos enviados pelo vaqueiro, aguardando o patrão conferir. */
  birthRequests: AnimalBirthRequest[];
}

type Tab = "rebanho" | "vacinacao" | "nascimentos" | "saidas";
type CategoryFilter = "todos" | AnimalCategory;
/** Filtro pelo tipo do animal — só aparece quando o rebanho tem mais de um. */
type SpeciesFilter = "todos" | AnimalSpecies;

/** Uma vacina no plano: quantos daquela criação estão em dia e quantos faltam. */
interface VaccinePlanRowData {
  vaccine: AnimalVaccine;
  /** Tamanho do rebanho daquela criação. */
  total: number;
  ok: number;
  due: number;
}

/** As vacinas de uma criação (species null = cadastro ainda sem tipo). */
interface VaccinePlanGroup {
  species: AnimalSpecies | null;
  rows: VaccinePlanRowData[];
}

/** Ordem da planilha. */
type SortKey = "tag" | "recente" | "alterado";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "tag", label: "Nº do animal" },
  { value: "recente", label: "Cadastrados por último" },
  { value: "alterado", label: "Mexidos por último" },
];

export function AnimaisPageClient({
  animals: allAnimals,
  breeds,
  vaccines,
  vaccinations,
  treatments,
  births,
  pendings,
  weights = [],
  birthRequests,
}: Props) {
  const [, startTransition] = useTransition();
  /** Célula `animalId|vaccineId` sendo gravada — evita toque duplo. */
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  /** Animal em que se está dando baixa (vendido/morto). */
  const [exitAnimal, setExitAnimal] = useState<AnimalWithInfo | null>(null);
  /** Saída sendo desfeita — trava o botão para não desfazer duas vezes. */
  const [undoingExitId, setUndoingExitId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("rebanho");
  const [search, setSearch] = useState("");
  const [species, setSpecies] = useState<SpeciesFilter>("todos");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("todos");
  const [onlyPending, setOnlyPending] = useState(false);
  const [sort, setSort] = useState<SortKey>("tag");

  // dialogs
  const [animalDialogOpen, setAnimalDialogOpen] = useState(false);
  const [editAnimal, setEditAnimal] = useState<AnimalWithInfo | null>(null);
  const [detailAnimalId, setDetailAnimalId] = useState<string | null>(null);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [protocolPreset, setProtocolPreset] = useState<{
    animalId: string | null;
    vaccineIds: string[];
  }>({ animalId: null, vaccineIds: [] });
  const [vaccinesOpen, setVaccinesOpen] = useState(false);
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [treatmentPresetId, setTreatmentPresetId] = useState<string | null>(null);
  const [birthOpen, setBirthOpen] = useState(false);
  const [birthPresetId, setBirthPresetId] = useState<string | null>(null);
  const [weightOpen, setWeightOpen] = useState(false);
  const [weightPresetId, setWeightPresetId] = useState<string | null>(null);
  const [birthRequestThumbs, setBirthRequestThumbs] = useState<Record<string, string>>({});
  const [resolveRequest, setResolveRequest] = useState<AnimalBirthRequest | null>(null);
  const [detailRequest, setDetailRequest] = useState<AnimalBirthRequest | null>(null);
  const [discardingRequestId, setDiscardingRequestId] = useState<string | null>(null);

  // ── Índices por animal ──────────────────────────────────────────────────────
  const treatmentsByAnimal = useMemo(() => {
    const m = new Map<string, AnimalTreatment[]>();
    for (const t of treatments) {
      const arr = m.get(t.animal_id);
      if (arr) arr.push(t);
      else m.set(t.animal_id, [t]);
    }
    return m;
  }, [treatments]);

  const birthsByMother = useMemo(() => {
    const m = new Map<string, AnimalBirth[]>();
    for (const b of births) {
      const arr = m.get(b.mother_id);
      if (arr) arr.push(b);
      else m.set(b.mother_id, [b]);
    }
    return m;
  }, [births]);

  /** Pesagens por animal, da mais nova para a mais velha. */
  const weightsByAnimal = useMemo(() => {
    const m = new Map<string, AnimalWeight[]>();
    for (const w of weights) {
      const arr = m.get(w.animal_id);
      if (arr) arr.push(w);
      else m.set(w.animal_id, [w]);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.weighed_at < b.weighed_at ? 1 : -1));
    return m;
  }, [weights]);

  /** De quem é este bezerro: o parto que o cadastrou (id do bezerro → parto). */
  const birthByCalf = useMemo(() => {
    const m = new Map<string, AnimalBirth>();
    for (const b of births) if (b.calf_animal_id) m.set(b.calf_animal_id, b);
    return m;
  }, [births]);

  /**
   * O rebanho de hoje. Quem foi vendido ou morreu sai da planilha, das
   * contagens e das listas de escolha — mas continua guardado na aba Saídas.
   */
  const animals = useMemo(
    () => allAnimals.filter((a) => a.active !== false),
    [allAnimals]
  );

  /** Quem saiu do rebanho, da saída mais nova para a mais velha. */
  const exits = useMemo(
    () =>
      allAnimals
        .filter((a) => a.active === false)
        .sort((a, b) => (a.exit_date ?? "").localeCompare(b.exit_date ?? "") * -1),
    [allAnimals]
  );

  /** Quanto entrou de venda e quantos morreram — o resumo da aba Saídas. */
  const exitSummary = useMemo(() => {
    let sold = 0;
    let died = 0;
    let total = 0;
    for (const a of exits) {
      if (a.exit_reason === "morte") died++;
      else {
        sold++;
        total += Number(a.exit_amount ?? 0);
      }
    }
    return { sold, died, total };
  }, [exits]);

  /** Pendências marcadas na mão: `animalId|vaccineId`. */
  const pendingKeys = useMemo(
    () => new Set(pendings.map((p) => `${p.animal_id}|${p.vaccine_id}`)),
    [pendings]
  );
  /** Quantos animais têm alguma vacina marcada como pendente. */
  const pendingAnimalIds = useMemo(
    () => new Set(pendings.map((p) => p.animal_id)),
    [pendings]
  );

  /**
   * Última aplicação de cada par `animalId|vaccineId`. É daqui que sai a
   * situação de todo mundo — a planilha e o painel de vacinas usam o mesmo
   * índice, para não contarem coisas diferentes.
   */
  const lastByKey = useMemo(() => {
    const m = new Map<string, VaccinationRow>();
    for (const v of vaccinations) {
      const key = `${v.animal_id}|${v.vaccine_id}`;
      const cur = m.get(key);
      if (!cur || cur.applied_at < v.applied_at) m.set(key, v);
    }
    return m;
  }, [vaccinations]);

  // O detalhe deriva do id — assim a tela reflete os dados recarregados do servidor
  const detailAnimal = useMemo(
    () => (detailAnimalId ? animals.find((a) => a.id === detailAnimalId) ?? null : null),
    [detailAnimalId, animals]
  );
  const detailVaccinations = useMemo(
    () => (detailAnimalId ? vaccinations.filter((v) => v.animal_id === detailAnimalId) : []),
    [detailAnimalId, vaccinations]
  );
  const detailTreatments = detailAnimalId
    ? treatmentsByAnimal.get(detailAnimalId) ?? []
    : [];
  const detailBirths = detailAnimalId ? birthsByMother.get(detailAnimalId) ?? [] : [];
  const detailWeights = detailAnimalId ? weightsByAnimal.get(detailAnimalId) ?? [] : [];

  const females = useMemo(() => animals.filter((a) => a.sex === "femea"), [animals]);

  /** Remédios já usados — viram sugestões no campo do tratamento. */
  const medicineSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const t of treatments) if (t.medicine) set.add(t.medicine);
    return Array.from(set).sort();
  }, [treatments]);

  // ── Tipo do animal (bovino, equino, caprino, ovino, suíno) ──────────────────
  /** Quantos animais de cada tipo — o filtro só mostra o que existe. */
  const speciesCounts = useMemo(() => {
    const c = new Map<AnimalSpecies, number>();
    for (const a of animals) {
      const s = speciesOf(a.species);
      c.set(s, (c.get(s) ?? 0) + 1);
    }
    return c;
  }, [animals]);

  const speciesPresent = useMemo(
    () => SPECIES_OPTIONS.map((s) => s.value).filter((s) => (speciesCounts.get(s) ?? 0) > 0),
    [speciesCounts]
  );

  /** Animais do tipo escolhido — base das contagens e da planilha. */
  const speciesAnimals = useMemo(
    () => (species === "todos" ? animals : animals.filter((a) => speciesOf(a.species) === species)),
    [animals, species]
  );

  /**
   * As vacinas que viram COLUNA da planilha — e a planilha só ganha coluna de
   * vacina quando a lista é de UMA criação só.
   *
   * Em "todos os tipos" o rebanho misturado botava a clostridiose de bovino
   * ao lado da de caprino, a dectomax, a linfadenite... uma esteira de coluna
   * em que cada linha só usava metade. Vacina se aplica olhando um bicho de
   * cada vez: escolhe o tipo lá em cima e a planilha vira o guia daquele
   * curral. Sem tipo escolhido a tela fica sendo o cadastro do rebanho.
   *
   * Fazenda de um bicho só nunca perde as colunas: mesmo em "todos os tipos",
   * se só existe bovino no rebanho, as vacinas de bovino aparecem.
   */
  const tableVaccines = useMemo(() => {
    // sem a migration 062 o cadastro é um só para a fazenda — tudo vale para todos
    if (!vaccinesHaveSpecies(vaccines)) return vaccines;
    if (species !== "todos") return vaccinesForSpecies(vaccines, species);
    if (speciesPresent.length === 1) return vaccinesForSpecies(vaccines, speciesPresent[0]);
    return [];
  }, [vaccines, species, speciesPresent]);

  /** Rebanho misturado sem tipo escolhido: é por isso que não há coluna de vacina. */
  const vaccinesNeedSpecies =
    species === "todos" && speciesPresent.length > 1 && vaccinesHaveSpecies(vaccines);

  /**
   * O PLANO DE VACINAÇÃO: para cada vacina cadastrada, quantos animais
   * daquela criação já estão em dia e quantos ainda faltam. É o que a aba
   * Vacinação mostra — antes ela só listava o passado, sem dizer o que o
   * rebanho ainda deve.
   */
  const vaccinePlan = useMemo<VaccinePlanGroup[]>(() => {
    const rowsFor = (vs: AnimalVaccine[], herd: AnimalWithInfo[]) =>
      vs.map((v) => {
        let ok = 0;
        for (const a of herd) {
          const last = lastByKey.get(`${a.id}|${v.id}`) ?? null;
          if (vaccineStatusFor(last?.applied_at ?? null, v.recurrence_months).status === "em_dia")
            ok++;
        }
        return { vaccine: v, total: herd.length, ok, due: herd.length - ok };
      });

    // sem a migration 062 o cadastro é um só: um grupo com o rebanho inteiro
    if (!vaccinesHaveSpecies(vaccines))
      return vaccines.length ? [{ species: null, rows: rowsFor(vaccines, animals) }] : [];

    // "todos os tipos" mostra o plano das criações QUE EXISTEM no rebanho —
    // senão a tela viraria um catálogo de vacina de bicho que ninguém tem.
    // Para ver (ou cadastrar) as de um tipo novo, é só tocar no tipo em cima.
    const list: AnimalSpecies[] =
      species !== "todos"
        ? [species]
        : speciesPresent.length > 0
          ? speciesPresent
          : SPECIES_OPTIONS.map((o) => o.value);
    return list
      .map((sp) => ({
        species: sp,
        rows: rowsFor(
          vaccines.filter((v) => speciesOf(v.species) === sp),
          animals.filter((a) => speciesOf(a.species) === sp)
        ),
      }))
      .filter((g) => g.rows.length > 0);
  }, [vaccines, animals, species, speciesPresent, lastByKey]);

  /**
   * De quem são os nomes das categorias. Com um tipo escolhido (ou um rebanho
   * de um tipo só) usa os dele — "Vacas", "Éguas". Misturado sem escolha, o
   * nome genérico: "Fêmeas", "Machos", "Filhotes".
   */
  const labelSpecies: AnimalSpecies | null =
    species !== "todos" ? species : speciesPresent.length === 1 ? speciesPresent[0] : null;

  // ── Contagens ───────────────────────────────────────────────────────────────
  const countBy = useMemo(() => {
    const c: Record<AnimalCategory, number> = { boi: 0, vaca: 0, bezerro: 0 };
    for (const a of speciesAnimals) c[a.category]++;
    return c;
  }, [speciesAnimals]);

  /** Pendente é o que FOI MARCADO — o sistema não decide isso sozinho. */
  const pendingCount = pendingAnimalIds.size;
  /** Sem nada marcado o botão do filtro some — o filtro some junto, senão
   *  a planilha ficaria vazia sem jeito de desligar. */
  const filterPending = onlyPending && pendingCount > 0;

  // ── Filtro e ordem do rebanho ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    const list = speciesAnimals.filter((a) => {
      if (categoryFilter !== "todos" && a.category !== categoryFilter) return false;
      if (filterPending && !pendingAnimalIds.has(a.id)) return false;
      if (!q) return true;
      return (
        a.tag.includes(q) ||
        (a.breed_name ?? "").toUpperCase().includes(q) ||
        // procurar por "equino" ou por "égua" também acha
        SPECIES_META[speciesOf(a.species)].plural.toUpperCase().includes(q) ||
        categoryLabel(a.category, a.sex, a.species).toUpperCase().includes(q)
      );
    });

    // nº do animal é texto ("003", "1046") — compara numérico quando dá
    const byTag = (a: AnimalWithInfo, b: AnimalWithInfo) =>
      a.tag.localeCompare(b.tag, "pt-BR", { numeric: true, sensitivity: "base" });
    const desc = (x: string, y: string) => (x < y ? 1 : x > y ? -1 : 0);

    return [...list].sort((a, b) => {
      if (sort === "recente") return desc(a.created_at, b.created_at) || byTag(a, b);
      if (sort === "alterado") return desc(a.updated_at, b.updated_at) || byTag(a, b);
      return byTag(a, b);
    });
  }, [speciesAnimals, search, categoryFilter, filterPending, pendingAnimalIds, sort]);

  /**
   * Registro de vacinação: quem foi vacinado, quando, com qual vacina e
   * quantos ml. As vacinas aplicadas juntas (mesmo protocol_id) viram uma
   * linha só — foi uma ida ao curral.
   */
  const log = useMemo(() => {
    const byProtocol = new Map<string, VaccinationRow[]>();
    for (const v of vaccinations) {
      const key = v.protocol_id ?? v.id;
      const arr = byProtocol.get(key);
      if (arr) arr.push(v);
      else byProtocol.set(key, [v]);
    }

    const q = search.trim().toUpperCase();
    return Array.from(byProtocol.entries())
      .map(([key, items]) => ({
        key,
        animalId: items[0].animal_id,
        tag: items[0].animals?.tag ?? "—",
        appliedAt: items[0].applied_at,
        items,
      }))
      .filter((g) =>
        q
          ? g.tag.includes(q) ||
            g.items.some((i) => (i.animal_vaccines?.name ?? "").toUpperCase().includes(q))
          : true
      )
      .sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1));
  }, [vaccinations, search]);

  /** Link da impressão do rebanho respeitando os filtros da tela. */
  const printHref = useMemo(() => {
    const params = new URLSearchParams();
    if (species !== "todos") params.set("tipo", species);
    if (categoryFilter !== "todos") params.set("categoria", categoryFilter);
    if (onlyPending) params.set("pendentes", "1");
    const qs = params.toString();
    return `/imprimir/animais${qs ? `?${qs}` : ""}`;
  }, [species, categoryFilter, onlyPending]);

  // ── Ações auxiliares ────────────────────────────────────────────────────────
  function openNewAnimal() {
    setEditAnimal(null);
    setAnimalDialogOpen(true);
  }
  function openEdit(animal: AnimalWithInfo) {
    setEditAnimal(animal);
    setAnimalDialogOpen(true);
  }
  function openProtocol(animal?: AnimalWithInfo | null, vaccineIds?: string[]) {
    setProtocolPreset({ animalId: animal?.id ?? null, vaccineIds: vaccineIds ?? [] });
    setProtocolOpen(true);
  }
  function openTreatment(animal?: AnimalWithInfo | null) {
    setTreatmentPresetId(animal?.id ?? null);
    setTreatmentOpen(true);
  }
  function openBirth(animal?: AnimalWithInfo | null) {
    setBirthPresetId(animal?.id ?? null);
    setBirthOpen(true);
  }
  function openWeight(animal?: AnimalWithInfo | null) {
    setWeightPresetId(animal?.id ?? null);
    setWeightOpen(true);
  }

  // Miniaturas dos envios do vaqueiro — só busca URL assinada quando a aba é
  // aberta, para não gastar signed URLs que o patrão nunca vai olhar.
  useEffect(() => {
    if (tab !== "nascimentos") return;
    const paths = birthRequests.map((r) => r.photo_path).filter((p): p is string => !!p);
    if (paths.length === 0) return;
    let cancelled = false;
    getAnimalThumbnails(paths).then((r) => {
      if (cancelled || !("urls" in r)) return;
      setBirthRequestThumbs((prev) => ({ ...prev, ...r.urls }));
    });
    return () => {
      cancelled = true;
    };
  }, [tab, birthRequests]);

  /** Descarta um envio errado/duplicado do vaqueiro — não vira animal. */
  function handleDiscardRequest(r: AnimalBirthRequest) {
    if (
      !confirm(`Descartar o envio do bezerro (mãe informada: ${r.mother_tag})?`)
    )
      return;
    setDiscardingRequestId(r.id);
    startTransition(async () => {
      const res = await rejectBirthRequest(r.id);
      setDiscardingRequestId(null);
      if (res && "error" in res) alert(res.error ?? "Erro ao descartar");
    });
  }

  /**
   * Um toque na célula de ml já registra a vacina: data de hoje, a dose
   * calculada para aquele animal e o remédio do cadastro. Sem diálogo —
   * é o gesto do curral.
   */
  function applyNow(animal: AnimalWithInfo, vaccine: AnimalVaccine) {
    const key = `${animal.id}|${vaccine.id}`;
    if (applyingKey) return;
    setApplyingKey(key);
    startTransition(async () => {
      const r = await applyVaccineProtocol({
        animal_id: animal.id,
        applied_at: localDateISO(),
        items: [
          {
            vaccine_id: vaccine.id,
            dose_ml: suggestedDoseMl(vaccine, Number(animal.weight)),
            brand: vaccine.default_brand,
          },
        ],
      });
      setApplyingKey(null);
      if (r && "error" in r) alert(r.error ?? "Erro ao registrar a vacina");
    });
  }

  /**
   * "Deixar pendente": marca na mão que esta vacina falta neste animal. É essa
   * marca que alimenta o filtro "só pendentes" — o sistema não decide sozinho.
   */
  function togglePending(animal: AnimalWithInfo, vaccine: AnimalVaccine, pending: boolean) {
    const key = `${animal.id}|${vaccine.id}`;
    if (applyingKey) return;
    setApplyingKey(key);
    startTransition(async () => {
      const r = await setVaccinePending(animal.id, vaccine.id, pending);
      setApplyingKey(null);
      if (r && "error" in r) alert(r.error ?? "Erro ao marcar a pendência");
    });
  }

  /**
   * Desfaz a baixa: o animal volta para o rebanho e, se tinha sido vendido, o
   * lançamento no financeiro some junto — senão o dinheiro ficaria contado
   * duas vezes na hora de vender de novo.
   */
  function handleUndoExit(a: AnimalWithInfo) {
    if (undoingExitId) return;
    const sold = a.exit_reason !== "morte" && Number(a.exit_amount ?? 0) > 0;
    if (
      !confirm(
        `Trazer o animal ${a.tag} de volta para o rebanho?` +
          (sold ? " O lançamento da venda sai do financeiro." : "")
      )
    )
      return;
    setUndoingExitId(a.id);
    startTransition(async () => {
      const r = await undoAnimalExit(a.id);
      setUndoingExitId(null);
      if (r && "error" in r) alert(r.error ?? "Erro ao desfazer a saída");
    });
  }

  /** Desfaz a aplicação feita hoje (erro de dedo na planilha). */
  function undoToday(
    animal: AnimalWithInfo,
    vaccine: AnimalVaccine,
    last: VaccinationRow
  ) {
    if (applyingKey) return;
    if (!confirm(`Desfazer ${vaccine.name} do animal ${animal.tag} aplicada hoje?`)) return;
    const key = `${animal.id}|${vaccine.id}`;
    setApplyingKey(key);
    startTransition(async () => {
      const r = await deleteVaccination(last.id);
      setApplyingKey(null);
      if (r && "error" in r) alert(r.error ?? "Erro ao desfazer");
    });
  }

  const tabs: {
    value: Tab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    /** Só quem tem trabalho parado mostra número — o tamanho do rebanho já
     *  está na faixa de contagem, não precisa aparecer duas vezes. */
    count?: number;
    alert?: boolean;
  }[] = [
    { value: "rebanho", label: "Rebanho", icon: Beef },
    {
      value: "nascimentos",
      label: "Nascimentos",
      icon: Baby,
      count: birthRequests.length,
      alert: birthRequests.length > 0,
    },
    {
      value: "vacinacao",
      label: "Vacinação",
      icon: Syringe,
      // só conta o que foi marcado na mão — sem alarme automático
      count: pendingCount,
      alert: pendingCount > 0,
    },
    { value: "saidas", label: "Saídas", icon: HandCoins },
  ];

  const categoryFilters: { value: CategoryFilter; label: string; count: number }[] = [
    { value: "todos", label: "Total", count: speciesAnimals.length },
    { value: "vaca", label: categoryPlural("vaca", labelSpecies), count: countBy.vaca },
    { value: "boi", label: categoryPlural("boi", labelSpecies), count: countBy.boi },
    {
      value: "bezerro",
      label: categoryPlural("bezerro", labelSpecies),
      count: countBy.bezerro,
    },
  ];

  /**
   * Filtro por tipo — manda em quem aparece na planilha. Todos os tipos ficam
   * sempre à vista (mesmo zerados): é por aqui que se escolhe o rebanho que se
   * quer ver, e é ele que a linha de cadastro segue.
   */
  const speciesFilters: { value: SpeciesFilter; label: string; count: number }[] = [
    { value: "todos", label: "Todos os tipos", count: animals.length },
    ...SPECIES_OPTIONS.map((s) => ({
      value: s.value as SpeciesFilter,
      label: SPECIES_META[s.value].plural,
      count: speciesCounts.get(s.value) ?? 0,
    })),
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Animais</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            Guia de vacinação do rebanho
          </p>
        </div>
        <Button onClick={openNewAnimal} className="flex-shrink-0 h-11 px-4">
          <Plus className="w-4 h-4" />
          Novo
        </Button>
      </div>

      {/* Abas */}
      <div className="grid grid-cols-4 gap-1 sm:flex sm:gap-1.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 min-h-[58px] px-0.5 rounded-xl border text-[11px] font-medium transition-colors active:scale-[0.97]",
                "sm:text-sm",
                "sm:flex-row sm:min-h-0 sm:px-3 sm:py-2 sm:gap-1.5",
                active
                  ? "bg-produmar-600 border-produmar-600 text-white"
                  : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
              )}
            >
              <Icon className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="leading-none">{t.label}</span>
              {!!t.count && (
                <span
                  className={cn(
                    "absolute top-1 right-1 min-w-[20px] h-[20px] px-1 rounded-full text-xs font-semibold flex items-center justify-center",
                    "sm:static sm:min-w-0 sm:h-auto sm:px-0 sm:bg-transparent sm:opacity-70",
                    active
                      ? "bg-white/25 text-white sm:text-white"
                      : t.alert
                      ? "bg-red-500 text-white sm:bg-transparent sm:text-red-500"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:bg-transparent"
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Aba: Rebanho — a planilha do curral ────────────────────────────
          `uppercase` no bloco todo: o patrão pediu tudo em caixa alta aqui.
          Botões, inputs e selects não herdam text-transform — daí as variantes. */}
      {tab === "rebanho" && (
        <div className="space-y-3 uppercase [&_button]:uppercase [&_input]:uppercase [&_select]:uppercase [&_input::placeholder]:uppercase">
          {/* ── Painel do rebanho ─────────────────────────────────────────
              Tipo, contagem, busca, ordem e impressão numa caixa só. Antes
              eram quatro blocos soltos, cada um com a sua fileira de números
              — a tela ficava poluída e nada mandava em nada. A ordem agora é
              a da cabeça de quem olha: em cima o TIPO (qual rebanho eu quero
              ver), no meio a CONTAGEM desse rebanho — que já é o filtro por
              categoria — e embaixo o que se faz com a lista. */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
            {/* Tipo do animal: todos ficam à vista mesmo zerados (é por aqui
                que se escolhe o rebanho, e é ele que manda na linha de
                cadastro); os vazios ficam apagados. Sem número aqui — a
                contagem é uma só, a da faixa logo abaixo. */}
            <div className="flex flex-wrap gap-1 bg-slate-50 p-1.5 dark:bg-slate-800/60">
              {speciesFilters.map((f) => {
                const active = species === f.value;
                /* tipo que ninguém tem ainda: fica apagado, mas dá pra escolher */
                const empty = f.count === 0 && !active;
                return (
                  <button
                    key={f.value}
                    onClick={() => setSpecies(f.value)}
                    className={cn(
                      "h-9 px-3 rounded-lg text-xs font-semibold tracking-wide transition-colors active:scale-[0.97]",
                      active
                        ? "bg-produmar-600 text-white shadow-sm"
                        : empty
                        ? "text-slate-400 dark:text-slate-600"
                        : "text-slate-600 dark:text-slate-300"
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Contagem do rebanho — e o filtro por categoria no mesmo toque.
                Uma faixa dividida em quatro, não quatro caixas soltas. */}
            <div className="grid grid-cols-4 divide-x divide-slate-100 border-y border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {categoryFilters.map((f) => {
                const active = categoryFilter === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => setCategoryFilter(f.value)}
                    className={cn(
                      "relative flex flex-col items-center justify-center gap-1 py-3 transition-colors",
                      active ? "bg-produmar-50 dark:bg-produmar-950/40" : ""
                    )}
                  >
                    {/* a barrinha em cima diz qual está valendo, sem mais bordas */}
                    <span
                      className={cn(
                        "absolute inset-x-0 top-0 h-[3px]",
                        active ? "bg-produmar-500 dark:bg-produmar-400" : "bg-transparent"
                      )}
                    />
                    <span
                      className={cn(
                        "text-lg sm:text-xl font-bold leading-none tabular-nums",
                        active
                          ? "text-produmar-700 dark:text-produmar-300"
                          : "text-slate-800 dark:text-slate-100"
                      )}
                    >
                      {f.count}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-medium leading-none tracking-wide",
                        active
                          ? "text-produmar-600 dark:text-produmar-400"
                          : "text-slate-400 dark:text-slate-500"
                      )}
                    >
                      {f.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Busca, ordem e a guia impressa — uma linha só no desktop; no
                celular a busca fica em cima e o resto embaixo dela. */}
            <div className="flex flex-wrap items-center gap-2 p-2">
              <div className="w-full sm:w-auto sm:flex-1">
                <SearchField
                  value={search}
                  onChange={setSearch}
                  placeholder="Buscar pelo número, raça ou tipo..."
                  className="rounded-xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"
                />
              </div>

              {/* Ordem da planilha: por número (a de sempre) ou pelo que mexeu por último */}
              <div className="relative flex-1 sm:flex-none">
                <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  aria-label="Ordem da planilha"
                  className="w-full h-11 pl-9 pr-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-produmar-400"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => window.open(printHref, "_blank")}
                className="flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl border border-produmar-200 bg-white text-xs font-semibold text-produmar-700 dark:bg-slate-900 dark:border-slate-700 dark:text-produmar-400 transition-colors active:scale-[0.97]"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>

              {/* Só aparece quando existe pendência marcada na mão */}
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyPending((v) => !v)}
                  className={cn(
                    "w-full sm:w-auto flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl border text-xs font-semibold transition-colors active:scale-[0.97]",
                    onlyPending
                      ? "bg-red-50 border-red-300 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-400"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Só pendentes
                  <span className="opacity-70 tabular-nums">{pendingCount}</span>
                </button>
              )}
            </div>
          </div>

          {/* A planilha fica sempre na tela: a primeira linha é de digitação —
              cadastra o animal sem abrir formulário. */}
          <RebanhoTable
            animals={filtered}
            breeds={breeds}
            quickAddSpecies={species === "todos" ? null : species}
            vaccines={tableVaccines}
            lastByKey={lastByKey}
            birthsByMother={birthsByMother}
            treatmentsByAnimal={treatmentsByAnimal}
            weightsByAnimal={weightsByAnimal}
            pendingKeys={pendingKeys}
            onOpenAnimal={(id) => setDetailAnimalId(id)}
            onApplyNow={applyNow}
            onUndo={undoToday}
            onBirth={(a) => openBirth(a)}
            onWeigh={(a) => openWeight(a)}
            applyingKey={applyingKey}
            emptyMessage={
              filtered.length > 0
                ? undefined
                : animals.length === 0
                ? "Nenhum animal ainda — digite o número na linha acima e aperte Enter."
                : filterPending
                ? "Ninguém marcado como pendente."
                : species !== "todos" && speciesAnimals.length === 0
                ? `Nenhum ${SPECIES_META[species].label.toLowerCase()} no rebanho ainda — a linha acima já está pronta para cadastrar o primeiro.`
                : "Nada encontrado com esse filtro."
            }
          />
          {/* Rebanho misturado: a planilha ficou sem coluna de vacina de
              propósito — o recado diz onde elas estão, senão parece defeito. */}
          {vaccinesNeedSpecies && (
            <button
              type="button"
              onClick={() => setSpecies(speciesPresent[0])}
              className="w-full flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-produmar-200 bg-produmar-50/60 text-left text-sm font-medium text-produmar-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-produmar-400 active:scale-[0.98] transition-transform"
            >
              <Syringe className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">
                Escolha o tipo aí em cima para ver as vacinas — cada criação tem as suas
              </span>
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            </button>
          )}

          {/* O manual da planilha é comprido e só se lê uma vez: fica dobrado,
              a um toque de quem precisar. */}
          <details className="group normal-case">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
              <ChevronRight className="w-4 h-4 flex-shrink-0 transition-transform group-open:rotate-90" />
              Como usar a planilha
            </summary>
            <p className="mt-2 pl-6 text-sm text-slate-500 dark:text-slate-400">
              Digite na primeira linha para cadastrar (Enter salva); na coluna &quot;Cat.&quot;
              escolha o tipo do animal — bovino, equino, caprino, ovino ou suíno — e ele manda
              no nome da categoria, nas raças da lista e nas vacinas. As colunas de vacina só
              aparecem com UM tipo escolhido lá em cima: cada criação toma as suas, e
              misturadas a planilha não caberia na tela. Em &quot;Pariu&quot;, a data do parto
              pede M ou F e o número da cria — ela entra no rebanho atrelada à mãe, do mesmo tipo;
              toque na coluna para ver os partos da mãe e apagar o que entrou errado. Toque no
              peso para pesar de novo: embaixo dele fica quanto o animal ganhou desde a última
              pesagem e em quanto tempo. Célula vermelha = os ml a aplicar (vacina nunca dada ou
              vencida); toque nela para registrar. Para deixar uma vacina pendente de propósito,
              abra o animal na aba Vacinas — o que for marcado ganha a tarja laranja e entra no
              filtro de pendentes.
            </p>
          </details>
        </div>
      )}

      {/* ── Aba: Vacinação — o plano de cada criação e o que já foi aplicado ── */}
      {tab === "vacinacao" && (
        <div className="space-y-3">
          {/* Plano de vacinação: o que cada criação toma e quantos estão
              faltando. Antes esta aba só tinha o registro do passado — não
              dava para saber o que o rebanho ainda deve. */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
            {/* Mesmo seletor de tipo da planilha — a escolha vale nas duas abas */}
            <div className="flex flex-wrap gap-1 bg-slate-50 p-1.5 dark:bg-slate-800/60">
              {speciesFilters.map((f) => {
                const active = species === f.value;
                const empty = f.count === 0 && !active;
                return (
                  <button
                    key={f.value}
                    onClick={() => setSpecies(f.value)}
                    className={cn(
                      "h-9 px-3 rounded-lg text-xs font-semibold tracking-wide transition-colors active:scale-[0.97]",
                      active
                        ? "bg-produmar-600 text-white shadow-sm"
                        : empty
                          ? "text-slate-400 dark:text-slate-600"
                          : "text-slate-600 dark:text-slate-300"
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {vaccinePlan.length === 0 ? (
              <div className="flex flex-col items-center text-center gap-1 px-4 py-8">
                <Syringe className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-1" />
                <p className="text-base text-slate-600 dark:text-slate-300">
                  {species === "todos"
                    ? "Nenhuma vacina cadastrada."
                    : `Nenhuma vacina de ${SPECIES_META[species].label.toLowerCase()} cadastrada.`}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Cadastre as vacinas de cada criação — cada uma vira uma coluna da
                  planilha do rebanho, com os ml que o animal tem que tomar.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {vaccinePlan.map((group) => (
                  <div key={group.species ?? "todas"}>
                    {/* O nome da criação só aparece quando há mais de uma na tela */}
                    {group.species && vaccinePlan.length > 1 && (
                      <p className="px-3 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {SPECIES_META[group.species].plural}
                      </p>
                    )}
                    {group.rows.map((row) => (
                      <VaccinePlanRow
                        key={row.vaccine.id}
                        row={row}
                        onOpenHerd={() => {
                          if (group.species) setSpecies(group.species);
                          setOnlyPending(false);
                          setTab("rebanho");
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setVaccinesOpen(true)}
              className="w-full flex items-center justify-center gap-2 min-h-[48px] px-3 border-t border-slate-100 bg-slate-50/60 text-sm font-semibold text-produmar-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-produmar-400 active:scale-[0.98] transition-transform"
            >
              <Settings2 className="w-4 h-4" />
              {species === "todos"
                ? "Cadastrar vacinas"
                : `Cadastrar vacinas de ${SPECIES_META[species].label.toLowerCase()}`}
            </button>
          </div>

          <Button className="w-full h-12" onClick={() => openProtocol(null)}>
            <Syringe className="w-4 h-4" />
            Aplicar vacina num animal
          </Button>

          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setTab("rebanho");
                setOnlyPending(true);
              }}
              className="w-full flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-red-200 bg-red-50 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400 active:scale-[0.98] transition-transform"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">
                {pendingCount} animal(is) marcado(s) como pendente
              </span>
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            </button>
          )}

          {/* Registro do que já foi aplicado */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                O que já foi aplicado
              </h2>
              {log.length > 0 && (
                <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  {log.length} {log.length === 1 ? "aplicação" : "aplicações"}
                </span>
              )}
            </div>

            {vaccinations.length > 0 && (
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Buscar por animal ou vacina..."
              />
            )}

            {log.length === 0 ? (
              <EmptyState
                icon={Syringe}
                text={
                  vaccinations.length === 0
                    ? "Nenhuma vacina aplicada ainda."
                    : "Nada encontrado com essa busca."
                }
                hint={
                  vaccinations.length === 0
                    ? "O que for aplicado aparece aqui: animal, vacina, ml e marca."
                    : undefined
                }
              />
            ) : (
              <div className="space-y-2">
                {log.map((g) => (
                  <LogRow
                    key={g.key}
                    tag={g.tag}
                    appliedAt={g.appliedAt}
                    items={g.items}
                    onOpen={() => setDetailAnimalId(g.animalId)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Aba: Nascimentos — envios do vaqueiro aguardando conferência ──── */}
      {tab === "nascimentos" && (
        <>
          {birthRequests.length === 0 ? (
            <EmptyState
              icon={Baby}
              text="Nenhum nascimento para conferir."
              hint="O que o vaqueiro enviar pelo celular aparece aqui — mais antigo primeiro."
            />
          ) : (
            <div className="space-y-2">
              {birthRequests.map((r) => (
                <BirthRequestCard
                  key={r.id}
                  request={r}
                  photoUrl={r.photo_path ? birthRequestThumbs[r.photo_path] ?? null : null}
                  discarding={discardingRequestId === r.id}
                  onOpen={() => setDetailRequest(r)}
                  onResolve={() => setResolveRequest(r)}
                  onDiscard={() => handleDiscardRequest(r)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Aba: Saídas — quem foi vendido ou morreu ─────────────────────── */}
      {tab === "saidas" && (
        <>
          {exits.length === 0 ? (
            <EmptyState
              icon={HandCoins}
              text="Ninguém saiu do rebanho ainda."
              hint="Abra o animal na planilha e use 'Vender ou dar baixa'. O que for vendido cai no financeiro na hora."
            />
          ) : (
            <>
              {/* Resumo: o que entrou de venda e o que se perdeu */}
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
                <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
                  <div className="flex flex-col items-center justify-center gap-1 py-3">
                    <span className="text-lg sm:text-xl font-bold leading-none tabular-nums text-emerald-700 dark:text-emerald-400">
                      {exitSummary.sold}
                    </span>
                    <span className="text-[11px] font-medium leading-none tracking-wide text-slate-400 dark:text-slate-500">
                      VENDIDOS
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-1 py-3">
                    <span className="text-lg sm:text-xl font-bold leading-none tabular-nums text-slate-800 dark:text-slate-100">
                      {exitSummary.died}
                    </span>
                    <span className="text-[11px] font-medium leading-none tracking-wide text-slate-400 dark:text-slate-500">
                      MORTES
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-1 py-3 px-1">
                    <span className="text-sm sm:text-base font-bold leading-none tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatBRL(exitSummary.total)}
                    </span>
                    <span className="text-[11px] font-medium leading-none tracking-wide text-slate-400 dark:text-slate-500">
                      RECEBIDO
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {exits.map((a) => (
                  <ExitCard
                    key={a.id}
                    animal={a}
                    undoing={undoingExitId === a.id}
                    onUndo={() => handleUndoExit(a)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Dialogs */}
      <AnimalDialog
        open={animalDialogOpen}
        onClose={() => setAnimalDialogOpen(false)}
        animal={editAnimal}
        breeds={breeds}
        defaultSpecies={species === "todos" ? null : species}
      />
      <AnimalDetailDialog
        open={!!detailAnimal}
        onClose={() => setDetailAnimalId(null)}
        animal={detailAnimal}
        vaccinations={detailVaccinations}
        vaccines={vaccines}
        treatments={detailTreatments}
        births={detailBirths}
        weights={detailWeights}
        motherBirth={detailAnimalId ? birthByCalf.get(detailAnimalId) ?? null : null}
        motherTag={
          detailAnimalId
            ? animals.find((a) => a.id === birthByCalf.get(detailAnimalId)?.mother_id)?.tag ??
              null
            : null
        }
        pendingKeys={pendingKeys}
        onEdit={(a) => {
          setDetailAnimalId(null);
          openEdit(a);
        }}
        onVaccinate={(a, vaccineIds) => openProtocol(a, vaccineIds)}
        onTogglePending={togglePending}
        onOpenAnimal={(id) => setDetailAnimalId(id)}
        onTreatment={(a) => openTreatment(a)}
        onBirth={(a) => openBirth(a)}
        onWeigh={(a) => openWeight(a)}
        onExit={(a) => setExitAnimal(a)}
      />
      <AnimalExitDialog
        open={!!exitAnimal}
        onClose={() => setExitAnimal(null)}
        animal={exitAnimal}
      />
      <VaccineProtocolDialog
        open={protocolOpen}
        onClose={() => setProtocolOpen(false)}
        animals={animals}
        vaccines={vaccines}
        vaccinations={vaccinations}
        weights={weights}
        presetAnimalId={protocolPreset.animalId}
        presetVaccineIds={protocolPreset.vaccineIds}
      />
      <WeightDialog
        open={weightOpen}
        onClose={() => setWeightOpen(false)}
        animals={animals}
        weights={weights}
        presetAnimalId={weightPresetId}
      />
      <TreatmentDialog
        open={treatmentOpen}
        onClose={() => setTreatmentOpen(false)}
        animals={animals}
        presetAnimalId={treatmentPresetId}
        medicineSuggestions={medicineSuggestions}
      />
      <BirthDialog
        open={birthOpen}
        onClose={() => setBirthOpen(false)}
        mothers={females}
        presetMotherId={birthPresetId}
        births={births}
      />
      <BirthRequestDetailDialog
        open={!!detailRequest}
        onClose={() => setDetailRequest(null)}
        request={detailRequest}
        photoUrl={
          detailRequest?.photo_path ? birthRequestThumbs[detailRequest.photo_path] ?? null : null
        }
        mothers={females}
        discarding={discardingRequestId === detailRequest?.id}
        onResolve={() => {
          // fecha o detalhe e cai direto na conferência, sem voltar para a lista
          const r = detailRequest;
          setDetailRequest(null);
          setResolveRequest(r);
        }}
        onDiscard={() => {
          const r = detailRequest;
          setDetailRequest(null);
          if (r) handleDiscardRequest(r);
        }}
      />
      <BirthRequestDialog
        open={!!resolveRequest}
        onClose={() => setResolveRequest(null)}
        request={resolveRequest}
        mothers={females}
        photoUrl={
          resolveRequest?.photo_path ? birthRequestThumbs[resolveRequest.photo_path] ?? null : null
        }
      />
      <AnimalVaccinesDialog
        open={vaccinesOpen}
        onClose={() => setVaccinesOpen(false)}
        vaccines={vaccines}
        species={species === "todos" ? undefined : species}
      />
    </div>
  );
}

// ── Planilha do rebanho ──────────────────────────────────────────────────────
// A mesma cara do guia impresso: uma linha por animal, uma coluna por vacina
// (com os ml a aplicar), pariu (M/F) e o último tratamento com o remédio no
// tooltip. No celular desliza para o lado com a coluna do número fixa.
function RebanhoTable({
  animals,
  breeds,
  quickAddSpecies,
  vaccines,
  lastByKey,
  birthsByMother,
  treatmentsByAnimal,
  weightsByAnimal,
  pendingKeys,
  onOpenAnimal,
  onApplyNow,
  onUndo,
  onBirth,
  onWeigh,
  applyingKey,
  emptyMessage,
}: {
  animals: AnimalWithInfo[];
  breeds: AnimalBreed[];
  /** Tipo escolhido no filtro — a linha de cadastro já entra nele. */
  quickAddSpecies: AnimalSpecies | null;
  /** Só as vacinas que viram coluna — já filtradas pelo tipo escolhido. */
  vaccines: AnimalVaccine[];
  /** Última aplicação de cada `animalId|vaccineId` (vem pronta da página). */
  lastByKey: Map<string, VaccinationRow>;
  birthsByMother: Map<string, AnimalBirth[]>;
  treatmentsByAnimal: Map<string, AnimalTreatment[]>;
  /** Pesagens por animal, da mais nova para a mais velha. */
  weightsByAnimal: Map<string, AnimalWeight[]>;
  /** `animalId|vaccineId` marcados como pendentes na mão. */
  pendingKeys: Set<string>;
  onOpenAnimal: (id: string) => void;
  /** Um toque na célula = vacina aplicada na hora. */
  onApplyNow: (animal: AnimalWithInfo, vaccine: AnimalVaccine) => void;
  /** Toque de novo no "ok hoje" desfaz a aplicação. */
  onUndo: (animal: AnimalWithInfo, vaccine: AnimalVaccine, last: VaccinationRow) => void;
  /** Abre o registro de parto daquela mãe. */
  onBirth: (animal: AnimalWithInfo) => void;
  /** Abre a pesagem daquele animal. */
  onWeigh: (animal: AnimalWithInfo) => void;
  /** Chave `animalId|vaccineId` sendo salva no momento. */
  applyingKey: string | null;
  /** Mostrado numa linha quando o filtro não devolve ninguém. */
  emptyMessage?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);

  /**
   * Cabeçalho flutuante. A planilha rola com a PÁGINA (nada de caixa com
   * rolagem própria — o patrão desce a tela até o fim), mas descendo a lista
   * o nome das vacinas tem que continuar à vista: o cabeçalho desce junto,
   * empurrado na medida do que já passou do topo. Não dá pra usar `sticky`
   * aqui porque o quadro rola de lado (coluna do Nº fixa) e isso prende o
   * sticky à caixa, não à tela.
   */
  useEffect(() => {
    const wrap = wrapRef.current;
    const head = headRef.current;
    if (!wrap || !head) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const box = wrap.getBoundingClientRect();
      // no desktop a barra de abas fica colada no topo; para logo abaixo dela
      const nav = document.querySelector("[data-topnav]");
      const top = nav ? nav.getBoundingClientRect().bottom : 0;
      const limit = box.height - head.getBoundingClientRect().height;
      const y = Math.max(0, Math.min(top - box.top, limit));
      head.style.transform = y > 0 ? `translate3d(0, ${y}px, 0)` : "";
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [animals.length, vaccines.length]);

  const today = localDateISO();

  // quanto levar: soma dos ml pendentes de cada vacina (dos animais listados)
  const totals = useMemo(
    () =>
      vaccines.map((v) => {
        let count = 0;
        let ml = 0;
        for (const a of animals) {
          const last = lastByKey.get(`${a.id}|${v.id}`) ?? null;
          const { status } = vaccineStatusFor(last?.applied_at ?? null, v.recurrence_months);
          if (status === "em_dia") continue;
          count++;
          const dose = suggestedDoseMl(v, Number(a.weight));
          if (dose) ml += dose;
        }
        return { count, ml: Math.round(ml * 10) / 10 };
      }),
    [animals, vaccines, lastByKey]
  );

  /* Fundo opaco e sombra: o cabeçalho passa por cima das linhas enquanto desce. */
  const headCls =
    "bg-slate-50 dark:bg-slate-800 font-semibold shadow-[0_1px_0_0_#e2e8f0] dark:shadow-[0_1px_0_0_#334155]";

  return (
    <div
      ref={wrapRef}
      className="overflow-x-auto -mx-4 sm:mx-0 border-y sm:border border-slate-200 dark:border-slate-700 sm:rounded-xl bg-white dark:bg-slate-900"
    >
      <table className="w-full text-[15px] min-w-[940px]">
        {/* relative + z-20: fica por cima das linhas ao ser empurrado para baixo */}
        <thead ref={headRef} className="relative z-20 will-change-transform">
          <tr className="text-left text-[13px] text-slate-600 dark:text-slate-300">
            <th className={cn(headCls, "sticky left-0 z-30 px-3 py-2.5")}>Nº</th>
            <th className={cn(headCls, "px-2 py-2.5")}>Cat.</th>
            <th className={cn(headCls, "px-2 py-2.5")}>Raça</th>
            <th className={cn(headCls, "px-2 py-2.5")}>Peso</th>
            <th
              className={cn(headCls, "px-2 py-2.5")}
              title="Quantos bezerros pariu (M = macho, F = fêmea)"
            >
              Pariu
            </th>
            {vaccines.map((v) => (
              <th
                key={v.id}
                className={cn(headCls, "px-2 py-3 text-center text-sm whitespace-nowrap")}
              >
                {v.name}
                {/* o remédio usado nessa vacina (cadastrado como "remédio/marca") */}
                {v.default_brand && (
                  <span className="block text-[13px] font-normal text-slate-500 dark:text-slate-400">
                    {v.default_brand}
                  </span>
                )}
              </th>
            ))}
            <th className={cn(headCls, "px-2 py-2.5")}>Tratamento</th>
          </tr>
        </thead>
        <tbody>
          {/* Linha de digitação — cadastrar sem clicar em "Novo" */}
          <QuickAddRow
            breeds={breeds}
            species={quickAddSpecies}
            vaccinesCount={vaccines.length}
          />

          {emptyMessage && (
            <tr className="border-t border-slate-100 dark:border-slate-800">
              <td
                colSpan={6 + vaccines.length}
                className="px-3 py-6 text-center text-base text-slate-500 dark:text-slate-400"
              >
                {emptyMessage}
              </td>
            </tr>
          )}

          {animals.map((a) => {
            const weightKg = Number(a.weight);
            const abirths = birthsByMother.get(a.id) ?? [];
            const atreatments = treatmentsByAnimal.get(a.id) ?? [];
            const lastTreatment = atreatments[0] ?? null;
            // ganho da última pesagem para a anterior: engordou quanto e em quanto tempo
            const aweights = weightsByAnimal.get(a.id) ?? [];
            const gain =
              aweights.length > 1
                ? weightGain(
                    { weighed_at: aweights[1].weighed_at, weight: Number(aweights[1].weight) },
                    { weighed_at: aweights[0].weighed_at, weight: Number(aweights[0].weight) }
                  )
                : null;
            return (
              <tr
                key={a.id}
                onClick={() => onOpenAnimal(a.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpenAnimal(a.id);
                }}
                className="group border-t border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
              >
                <td className="sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60 px-3 py-3 font-bold text-[17px] text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {a.tag}
                </td>
                <td className="px-2 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                  {categoryLabel(a.category, a.sex, a.species)}
                </td>
                <td className="px-2 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                  {a.breed_name ?? "—"}
                </td>
                {/* Peso — toque para pesar; embaixo, o ganho da última pesagem */}
                <td className="px-1 py-1 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onWeigh(a);
                    }}
                    title={
                      gain
                        ? `${weightsTitle(aweights)}\n\n(toque para pesar de novo)`
                        : "Registrar o peso de hoje"
                    }
                    className="min-h-[40px] px-2 rounded-lg text-left hover:bg-produmar-50 dark:hover:bg-slate-800 active:scale-[0.95] transition-all"
                  >
                    {weightKg > 0 ? (
                      <>
                        <span className="block text-[15px]">{formatWeight(weightKg)}</span>
                        {gain && (
                          <span
                            className={cn(
                              "block text-[13px]",
                              gain.diff > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : gain.diff < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-slate-400"
                            )}
                          >
                            {formatGain(gain.diff)} · {formatPeriod(gain.days)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-produmar-600 dark:text-produmar-400 font-medium">
                        + peso
                      </span>
                    )}
                  </button>
                </td>
                {/* Pariu — clicável na fêmea: abre o parto (data + M/F do bezerro) */}
                <td
                  className="px-1 py-1 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300"
                  title={birthsTitle(abirths)}
                >
                  {a.sex === "femea" ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBirth(a);
                      }}
                      title={
                        abirths.length > 0
                          ? `${birthsTitle(abirths)}\n\n(toque para ver, registrar ou apagar um parto)`
                          : "Registrar parto — o bezerro entra no rebanho junto"
                      }
                      className="min-h-[40px] px-2 rounded-lg text-[15px] hover:bg-produmar-50 dark:hover:bg-slate-800 active:scale-[0.95] transition-all"
                    >
                      {abirths.length > 0 ? (
                        pariuLabel(a.sex, abirths)
                      ) : (
                        <span className="text-produmar-600 dark:text-produmar-400 font-medium">
                          + parto
                        </span>
                      )}
                    </button>
                  ) : (
                    <span className="px-2 text-slate-300 dark:text-slate-600">—</span>
                  )}
                </td>
                {vaccines.map((v) => {
                  const key = `${a.id}|${v.id}`;
                  const last = lastByKey.get(key) ?? null;
                  const { status } = vaccineStatusFor(
                    last?.applied_at ?? null,
                    v.recurrence_months
                  );
                  const due = status !== "em_dia";
                  const dose = suggestedDoseMl(v, weightKg);
                  const saving = applyingKey === key;
                  const appliedToday = !!last && last.applied_at === today;
                  // marcada na mão como pendente → tarja laranja por cima
                  const marked = pendingKeys.has(key);
                  return (
                    <td
                      key={v.id}
                      title={marked ? `${v.name} marcada como pendente` : undefined}
                      className={cn(
                        "px-1 py-1 text-center whitespace-nowrap",
                        due && "bg-red-50 dark:bg-red-950/30",
                        appliedToday && "bg-emerald-50 dark:bg-emerald-950/30",
                        marked &&
                          "bg-amber-100 dark:bg-amber-900/40 ring-2 ring-inset ring-amber-400"
                      )}
                    >
                      {due || (marked && !appliedToday) ? (
                        // um toque = aplicado, com a dose e o remédio do cadastro
                        <button
                          type="button"
                          disabled={saving}
                          onClick={(e) => {
                            e.stopPropagation();
                            onApplyNow(a, v);
                          }}
                          title={`Aplicar ${v.name}${
                            dose ? ` (${formatMl(dose)})` : ""
                          } no animal ${a.tag} — registra na hora${
                            marked ? " e tira a pendência" : ""
                          }`}
                          className={cn(
                            "min-h-[40px] px-2 rounded-lg font-bold text-[17px] tabular-nums active:scale-[0.95] transition-all disabled:opacity-50",
                            marked
                              ? "text-amber-800 dark:text-amber-300 hover:bg-amber-200/70 dark:hover:bg-amber-800/50"
                              : "text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                          )}
                        >
                          {saving ? "…" : dose ? formatMl(dose) : "aplicar"}
                        </button>
                      ) : appliedToday ? (
                        // aplicado agora há pouco: toque de novo desfaz (erro de dedo)
                        <button
                          type="button"
                          disabled={saving}
                          onClick={(e) => {
                            e.stopPropagation();
                            onUndo(a, v, last!);
                          }}
                          title={`${v.name} aplicada hoje${
                            last?.dose_ml ? ` (${formatMl(Number(last.dose_ml))})` : ""
                          } — toque para desfazer`}
                          className="min-h-[40px] px-2 rounded-lg font-bold text-[15px] text-emerald-700 dark:text-emerald-400 tabular-nums hover:bg-emerald-100 dark:hover:bg-emerald-900/40 active:scale-[0.95] transition-all disabled:opacity-50"
                        >
                          {saving ? "…" : "ok hoje"}
                        </button>
                      ) : (
                        <span className="text-[13px] text-slate-500 dark:text-slate-400">
                          ok{last ? ` ${formatDate(last.applied_at).slice(3)}` : ""}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td
                  className="px-2 py-3 whitespace-nowrap max-w-[170px]"
                  title={treatmentsTitle(atreatments)}
                >
                  {lastTreatment ? (
                    <div className="min-w-0">
                      <p className="truncate text-slate-700 dark:text-slate-200">
                        {lastTreatment.description}
                      </p>
                      <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">
                        {formatDate(lastTreatment.applied_at)}
                        {lastTreatment.medicine ? ` · ${lastTreatment.medicine}` : ""}
                        {atreatments.length > 1 ? ` · +${atreatments.length - 1}` : ""}
                      </p>
                    </div>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {vaccines.length > 0 && animals.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-produmar-200 dark:border-slate-600 bg-produmar-50/60 dark:bg-slate-800/80">
              <td className="sticky left-0 bg-produmar-50 dark:bg-slate-800 px-3 py-2.5 font-bold text-[13px] text-produmar-700 dark:text-produmar-300 whitespace-nowrap">
                Levar
              </td>
              <td colSpan={4} className="px-2 py-2.5 text-right text-[13px] text-slate-500 dark:text-slate-400">
                total do que falta aplicar →
              </td>
              {vaccines.map((v, i) => (
                <td key={v.id} className="px-1 py-2 text-center whitespace-nowrap">
                  {totals[i].count > 0 ? (
                    <div>
                      <p className="font-bold text-base tabular-nums text-slate-800 dark:text-slate-100">
                        {totals[i].ml > 0 ? formatMl(totals[i].ml) : "—"}
                      </p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400">{totals[i].count} animal(is)</p>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-300 dark:text-slate-600">—</span>
                  )}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Tooltip nativo com o histórico de pesagens (data — peso — ganho). */
function weightsTitle(ws: AnimalWeight[]): string | undefined {
  if (ws.length === 0) return undefined;
  return ws
    .map((w, i) => {
      const prev = ws[i + 1];
      const g = prev
        ? ` — ${
            weightGain(
              { weighed_at: prev.weighed_at, weight: Number(prev.weight) },
              { weighed_at: w.weighed_at, weight: Number(w.weight) }
            ).label
          }`
        : "";
      return `${formatDate(w.weighed_at)} — ${formatWeight(Number(w.weight))}${g}`;
    })
    .join("\n");
}

/** Tooltip nativo com todos os partos (data — sexo — nº). */
function birthsTitle(births: AnimalBirth[]): string | undefined {
  if (births.length === 0) return undefined;
  return births
    .map(
      (b) =>
        `${formatDate(b.birth_date)} — ${
          b.calf_sex === "macho" ? "macho" : b.calf_sex === "femea" ? "fêmea" : "sexo não informado"
        }${b.calf_tag ? ` (nº ${b.calf_tag})` : ""}`
    )
    .join("\n");
}

/** Tooltip nativo com os tratamentos e o remédio de cada um. */
function treatmentsTitle(ts: AnimalTreatment[]): string | undefined {
  if (ts.length === 0) return undefined;
  return ts
    .map(
      (t) =>
        `${formatDate(t.applied_at)} — ${t.description}${
          t.medicine ? ` — remédio: ${t.medicine}` : ""
        }${t.dose ? ` (${t.dose})` : ""}`
    )
    .join("\n");
}

// ── Cartão de quem saiu do rebanho ──────────────────────────────────────────
/**
 * Uma saída: o número do animal, o que houve (vendido/morreu), quando, por
 * quanto e para quem. O "desfazer" existe porque baixa errada acontece — e
 * pela venda o dinheiro já entrou no financeiro.
 */
function ExitCard({
  animal,
  undoing,
  onUndo,
}: {
  animal: AnimalWithInfo;
  undoing: boolean;
  onUndo: () => void;
}) {
  const died = animal.exit_reason === "morte";
  const amount = Number(animal.exit_amount ?? 0);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="text-base font-bold text-slate-800 dark:text-slate-100 tabular-nums">
          {animal.tag}
        </span>
        <span
          className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
            died
              ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          )}
        >
          {died ? "Morreu" : "Vendido"}
        </span>
        {!died && amount > 0 && (
          <span className="ml-auto text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {formatBRL(amount)}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {categoryLabel(animal.category, animal.sex, animal.species)}
        {animal.breed_name ? ` · ${animal.breed_name}` : ""}
        {animal.exit_date ? ` · ${formatDate(animal.exit_date)}` : ""}
        {animal.exit_buyer ? ` · ${animal.exit_buyer}` : ""}
      </p>

      {animal.exit_notes && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{animal.exit_notes}</p>
      )}

      <button
        type="button"
        onClick={onUndo}
        disabled={undoing}
        className="mt-2 min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors active:scale-[0.97] disabled:opacity-50"
      >
        {undoing ? "Desfazendo..." : "Voltar para o rebanho"}
      </button>
    </div>
  );
}

// ── Campo de busca ──────────────────────────────────────────────────────────
function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Ajuste fino do campo quando ele mora dentro de um painel. */
  className?: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("pl-9 pr-10 h-11", className)}
        autoComplete="off"
        enterKeyHint="search"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ── Linha do plano de vacinação ─────────────────────────────────────────────
/**
 * Uma vacina cadastrada, com o retrato do rebanho: quantos estão em dia,
 * quantos faltam e a barrinha que mostra isso sem precisar ler número.
 * Tocar leva para a planilha daquela criação, onde se aplica com um toque.
 */
function VaccinePlanRow({
  row,
  onOpenHerd,
}: {
  row: VaccinePlanRowData;
  onOpenHerd: () => void;
}) {
  const { vaccine, total, ok, due } = row;
  const pct = total > 0 ? Math.round((ok / total) * 100) : 0;
  const facts = [recurrenceLabel(vaccine.recurrence_months), doseLabel(vaccine), vaccine.default_brand]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onOpenHerd}
      className="w-full px-3 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
          {vaccine.name}
        </span>
        {total === 0 ? (
          <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
            sem animais
          </span>
        ) : due > 0 ? (
          <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
            {due} faltando
          </span>
        ) : (
          <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            Tudo em dia
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
      </div>

      {facts && (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">{facts}</p>
      )}

      {total > 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <span
              className="block h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">
            {ok} de {total} em dia
          </span>
        </div>
      )}
    </button>
  );
}

// ── Linha do registro de vacinação ──────────────────────────────────────────
/** Uma aplicação: o animal, a data e o que foi dado (vacina, ml e marca). */
function LogRow({
  tag,
  appliedAt,
  items,
  onOpen,
}: {
  tag: string;
  appliedAt: string;
  items: VaccinationRow[];
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3 cursor-pointer transition-all active:scale-[0.98] active:bg-slate-50 dark:active:bg-slate-800/60 hover:border-produmar-200 dark:hover:border-produmar-800"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate">
          {tag}
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
            {formatDate(appliedAt)}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
        </div>
      </div>

      <ul className="mt-1.5 space-y-1">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <Syringe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span className="text-slate-700 dark:text-slate-200 truncate">
              {i.animal_vaccines?.name ?? "—"}
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums flex-shrink-0">
              {i.dose_ml ? formatMl(Number(i.dose_ml)) : "—"}
            </span>
            {i.brand && (
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-shrink-0">
                {i.brand}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Card de solicitação de nascimento (envio do vaqueiro) ───────────────────
function BirthRequestCard({
  request,
  photoUrl,
  discarding,
  onOpen,
  onResolve,
  onDiscard,
}: {
  request: AnimalBirthRequest;
  photoUrl: string | null;
  discarding: boolean;
  onOpen: () => void;
  onResolve: () => void;
  onDiscard: () => void;
}) {
  const sentAt = new Date(request.created_at).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-3">
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center gap-3 text-left rounded-lg -m-1 p-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={`Bezerro da mãe ${request.mother_tag}`}
            className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-slate-200 dark:border-slate-700"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <Baby className="w-6 h-6 text-amber-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            Bezerro {request.calf_sex === "macho" ? "macho" : "fêmea"}
            {request.calf_tag ? ` · nº ${request.calf_tag}` : ""}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            Mãe informada: {request.mother_tag}
          </p>
          <p className="text-[11px] text-slate-400">
            {formatDate(request.birth_date)} · enviado {sentAt}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
      </button>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-10"
          onClick={onDiscard}
          disabled={discarding}
        >
          Descartar
        </Button>
        <Button type="button" className="flex-[2] h-10" onClick={onResolve} disabled={discarding}>
          Lançar
        </Button>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({
  icon: Icon,
  text,
  hint,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
      <Icon className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
      <p className="text-base text-slate-600 dark:text-slate-300">{text}</p>
      {hint && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
