"use client";

import type {
  AnimalCategory,
  AnimalSex,
  AnimalSpecies,
  AnimalVaccine,
} from "@/lib/types";

// ── Layout (celular) ─────────────────────────────────────────────────────────

/**
 * Rodapé colado no fim da CAIXA do diálogo no celular: em formulário longo
 * (protocolo com 5 vacinas, cadastro do animal) o botão de salvar fica sempre
 * à mão, sem precisar rolar até o fim. No desktop segue no fluxo normal.
 */
export const STICKY_FOOTER =
  "sticky bottom-0 z-10 flex-row -mx-5 px-5 pt-3 pb-1 " +
  "bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 " +
  "sm:static sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:border-0";

/** Botão "Cancelar" do rodapé: estreito no celular, natural no desktop. */
export const FOOTER_CANCEL = "flex-1 sm:flex-none";
/** Botão principal do rodapé: ganha o dobro do espaço no celular. */
export const FOOTER_SUBMIT = "flex-[2] sm:flex-none";

/** Alvo de toque confortável para os ícones de ação nas listas (44x44). */
export const ICON_BUTTON =
  "w-11 h-11 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors";

/**
 * Link pequeno ("Gerenciar", "Marcar todas") com área de toque de 44px sem
 * esticar a linha do rótulo — as margens negativas devolvem o espaço extra.
 */
export const INLINE_LINK =
  "flex items-center gap-1 min-h-[44px] px-2 -my-2 text-[11px] font-medium " +
  "text-produmar-600 dark:text-produmar-400 hover:underline";

// ── Sexo ─────────────────────────────────────────────────────────────────────

export const SEX_OPTIONS: { value: AnimalSex; label: string }[] = [
  { value: "macho", label: "Macho" },
  { value: "femea", label: "Fêmea" },
];

export const SEX_LABELS: Record<AnimalSex, string> = {
  macho: "Macho",
  femea: "Fêmea",
};

// ── Tipo do animal (espécie) ─────────────────────────────────────────────────

/**
 * Cada tipo dá nome às três categorias do rebanho. As chaves da categoria são
 * o papel do animal (macho adulto / fêmea adulta / filhote) — aqui elas viram
 * boi, cavalo, bode, carneiro ou porco conforme o tipo.
 */
interface SpeciesNames {
  /** "Bovino" — como aparece na ficha e no cadastro. */
  label: string;
  /** "Bovinos" — como aparece no filtro. */
  plural: string;
  chip: string;
  /** Macho adulto: Boi, Cavalo, Bode, Carneiro, Porco. */
  male: string;
  /** Fêmea adulta: Vaca, Égua, Cabra, Ovelha, Porca. */
  female: string;
  /** Filhote macho: Bezerro, Potro, Cabrito, Cordeiro, Leitão. */
  youngMale: string;
  /** Filhote fêmea: Bezerra, Potra, Cabrita, Cordeira, Leitoa. */
  youngFemale: string;
  /** Plurais dos filtros. */
  males: string;
  females: string;
  young: string;
}

export const SPECIES_META: Record<AnimalSpecies, SpeciesNames> = {
  bovino: {
    label: "Bovino",
    plural: "Bovinos",
    chip: "bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-300",
    male: "Boi",
    female: "Vaca",
    youngMale: "Bezerro",
    youngFemale: "Bezerra",
    males: "Bois",
    females: "Vacas",
    young: "Bezerros",
  },
  equino: {
    label: "Equino",
    plural: "Equinos",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    male: "Cavalo",
    female: "Égua",
    youngMale: "Potro",
    youngFemale: "Potra",
    males: "Cavalos",
    females: "Éguas",
    young: "Potros",
  },
  caprino: {
    label: "Caprino",
    plural: "Caprinos",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    male: "Bode",
    female: "Cabra",
    youngMale: "Cabrito",
    youngFemale: "Cabrita",
    males: "Bodes",
    females: "Cabras",
    young: "Cabritos",
  },
  ovino: {
    label: "Ovino",
    plural: "Ovinos",
    chip: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    male: "Carneiro",
    female: "Ovelha",
    youngMale: "Cordeiro",
    youngFemale: "Cordeira",
    males: "Carneiros",
    females: "Ovelhas",
    young: "Cordeiros",
  },
  suino: {
    label: "Suíno",
    plural: "Suínos",
    chip: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
    male: "Porco",
    female: "Porca",
    youngMale: "Leitão",
    youngFemale: "Leitoa",
    males: "Porcos",
    females: "Porcas",
    young: "Leitões",
  },
};

export const SPECIES_OPTIONS: { value: AnimalSpecies; label: string }[] = (
  Object.keys(SPECIES_META) as AnimalSpecies[]
).map((value) => ({ value, label: SPECIES_META[value].label }));

/**
 * O tipo do animal, com bovino de rede de segurança: enquanto a migration 047
 * não roda no Supabase a coluna não vem, e tudo que existe hoje é bovino.
 */
export function speciesOf(species?: AnimalSpecies | null): AnimalSpecies {
  return species && species in SPECIES_META ? species : "bovino";
}

// ── Categoria (derivada na view) ─────────────────────────────────────────────

export const CATEGORY_META: Record<AnimalCategory, { chip: string }> = {
  boi: {
    chip: "bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-300",
  },
  vaca: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
  bezerro: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  },
};

/** Rótulo da categoria pelo tipo e pelo sexo: Vaca, Égua, Cabrito, Cordeira... */
export function categoryLabel(
  category: AnimalCategory,
  sex: AnimalSex,
  species?: AnimalSpecies | null
): string {
  const s = SPECIES_META[speciesOf(species)];
  if (category === "bezerro") return sex === "femea" ? s.youngFemale : s.youngMale;
  return category === "vaca" ? s.female : s.male;
}

/**
 * Rótulo plural da categoria para os filtros: "Vacas", "Éguas", "Cabritos".
 * Sem tipo escolhido (rebanho misturado) usa o nome genérico — "Fêmeas",
 * "Machos", "Filhotes" — que serve para todos.
 */
export function categoryPlural(
  category: AnimalCategory,
  species: AnimalSpecies | null
): string {
  if (!species) {
    return category === "vaca" ? "Fêmeas" : category === "boi" ? "Machos" : "Filhotes";
  }
  const s = SPECIES_META[speciesOf(species)];
  return category === "vaca" ? s.females : category === "boi" ? s.males : s.young;
}

/** Como se chama o filhote deste tipo, em minúscula: "bezerro", "leitoa"... */
export function youngNoun(species?: AnimalSpecies | null, sex?: AnimalSex | null): string {
  const s = SPECIES_META[speciesOf(species)];
  return (sex === "femea" ? s.youngFemale : s.youngMale).toLowerCase();
}

// ── Formatação ───────────────────────────────────────────────────────────────

/** Idade em texto curto: "2 anos e 3 meses", "8 meses", "—". */
export function formatAge(ageMonths: number | null): string {
  if (ageMonths == null) return "—";
  if (ageMonths < 1) return "menos de 1 mês";
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  if (years === 0) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const y = `${years} ${years === 1 ? "ano" : "anos"}`;
  if (months === 0) return y;
  return `${y} e ${months} ${months === 1 ? "mês" : "meses"}`;
}

/** Peso em kg, sem casas quando inteiro (450 kg / 32,5 kg). */
export function formatWeight(kg: number): string {
  if (!kg) return "—";
  const n = Number(kg);
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1).replace(".", ",")} kg`;
}

/** Parse de número digitado com vírgula (450,5 → 450.5). */
export function parseDecimal(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** Máscara de digitação numérica: dígitos e uma vírgula com até 2 casas. */
export function formatDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 2) return parts[0] + "," + parts[1].slice(0, 2);
  return cleaned;
}

/** Volume em ml, sem casas quando inteiro (5 ml / 6,4 ml). */
export function formatMl(ml: number | null): string {
  if (!ml) return "—";
  const n = Number(ml);
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1).replace(".", ",")} ml`;
}

// ── Peso e ganho (quanto engordou e em quanto tempo) ─────────────────────────

/** Dias entre duas datas YYYY-MM-DD (sempre >= 0). */
export function daysBetween(fromISO: string, toISO: string): number {
  const [y1, m1, d1] = fromISO.split("-").map(Number);
  const [y2, m2, d2] = toISO.split("-").map(Number);
  const a = new Date(y1, m1 - 1, d1).getTime();
  const b = new Date(y2, m2 - 1, d2).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Período em texto curto: "62 dias", "3 meses e 10 dias", "1 ano e 2 meses". */
export function formatPeriod(days: number): string {
  if (days <= 0) return "no mesmo dia";
  if (days < 60) return `${days} ${days === 1 ? "dia" : "dias"}`;
  const months = Math.floor(days / 30);
  if (months < 12) {
    const rest = days - months * 30;
    return rest > 0 ? `${months} meses e ${rest} dias` : `${months} meses`;
  }
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  const y = `${years} ${years === 1 ? "ano" : "anos"}`;
  return restMonths > 0 ? `${y} e ${restMonths} meses` : y;
}

/** Ganho em kg com sinal: "+25 kg", "-8 kg", "sem mudança". */
export function formatGain(kg: number): string {
  const n = Math.round(kg * 10) / 10;
  if (n === 0) return "sem mudança";
  const txt = `${Math.abs(n) % 1 === 0 ? Math.abs(n).toFixed(0) : Math.abs(n).toFixed(1).replace(".", ",")} kg`;
  return n > 0 ? `+${txt}` : `-${txt}`;
}

export type WeighingLike = { weighed_at: string; weight: number };

export interface WeightGain {
  /** Diferença de peso em kg (pode ser negativa — o boi emagreceu). */
  diff: number;
  days: number;
  /** Ganho médio diário em kg/dia (null quando as pesagens são do mesmo dia). */
  perDay: number | null;
  /** "+25 kg em 62 dias · 0,40 kg/dia" — pronto para a tela. */
  label: string;
}

/**
 * Quanto o animal ganhou de uma pesagem para a outra e em quanto tempo.
 * É o que o dono quer ver a cada protocolo: engordou quanto, em quantos dias.
 */
export function weightGain(from: WeighingLike, to: WeighingLike): WeightGain {
  const diff = Number(to.weight) - Number(from.weight);
  const days = daysBetween(from.weighed_at, to.weighed_at);
  const perDay = days > 0 ? Math.round((diff / days) * 100) / 100 : null;
  const gmd = perDay != null ? ` · ${perDay.toFixed(2).replace(".", ",")} kg/dia` : "";
  return {
    diff,
    days,
    perDay,
    label: `${formatGain(diff)} em ${formatPeriod(days)}${gmd}`,
  };
}

/** Pesagem anterior a uma data (a mais recente antes dela). */
export function previousWeighing<T extends WeighingLike>(
  weights: T[],
  beforeISO: string
): T | null {
  const older = weights
    .filter((w) => w.weighed_at < beforeISO)
    .sort((a, b) => (a.weighed_at < b.weighed_at ? 1 : -1));
  return older[0] ?? null;
}

// ── Dose da vacina ───────────────────────────────────────────────────────────

type DoseRule = Pick<
  AnimalVaccine,
  "default_dose_ml" | "dose_ml_per_weight" | "dose_weight_kg"
>;

/**
 * Quantos ml dar neste animal: se a vacina tem dose por peso ("X ml a cada
 * Y kg") e o animal tem peso, calcula; senão usa a dose fixa do cadastro.
 */
export function suggestedDoseMl(vaccine: DoseRule, weightKg: number): number | null {
  const perWeight = Number(vaccine.dose_ml_per_weight ?? 0);
  const everyKg = Number(vaccine.dose_weight_kg ?? 0);
  if (perWeight > 0 && everyKg > 0 && weightKg > 0) {
    return Math.round((weightKg / everyKg) * perWeight * 10) / 10;
  }
  const fixed = Number(vaccine.default_dose_ml ?? 0);
  return fixed > 0 ? fixed : null;
}

/** Explica de onde saiu a dose sugerida (mostrado abaixo do campo). */
export function doseRuleLabel(vaccine: DoseRule, weightKg: number): string | null {
  const perWeight = Number(vaccine.dose_ml_per_weight ?? 0);
  const everyKg = Number(vaccine.dose_weight_kg ?? 0);
  if (perWeight > 0 && everyKg > 0) {
    const rule = `${formatMl(perWeight)} a cada ${everyKg} kg`;
    return weightKg > 0
      ? `${rule} · peso ${formatWeight(weightKg)}`
      : `${rule} · animal sem peso cadastrado`;
  }
  const fixed = Number(vaccine.default_dose_ml ?? 0);
  return fixed > 0 ? `dose padrão ${formatMl(fixed)}` : null;
}

// ── Partos ───────────────────────────────────────────────────────────────────

/**
 * Resumo dos partos para a coluna "Pariu": "2 (1M, 1F)".
 * Macho não pare e sem parto registrado vira "—".
 */
export function pariuLabel(
  sex: AnimalSex,
  births: { calf_sex: AnimalSex | null }[]
): string {
  if (sex !== "femea" || births.length === 0) return "—";
  const m = births.filter((b) => b.calf_sex === "macho").length;
  const f = births.filter((b) => b.calf_sex === "femea").length;
  const unknown = births.length - m - f;
  const parts: string[] = [];
  if (m) parts.push(`${m}M`);
  if (f) parts.push(`${f}F`);
  if (unknown) parts.push(`${unknown}?`);
  return parts.length ? `${births.length} (${parts.join(", ")})` : String(births.length);
}

// ── Vacinação ────────────────────────────────────────────────────────────────

export type VaccineStatus = "em_dia" | "atrasada" | "nunca";

export const VACCINE_STATUS_META: Record<VaccineStatus, { label: string; chip: string }> = {
  em_dia: {
    label: "Em dia",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  },
  atrasada: {
    label: "Atrasada",
    chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  },
  nunca: {
    label: "Nunca aplicada",
    chip: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
};

/** Soma meses a uma data YYYY-MM-DD, devolvendo YYYY-MM-DD. */
export function addMonths(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Situação de uma vacina para um animal.
 *  • nunca    — não há aplicação registrada
 *  • em_dia   — dose única aplicada, ou reforço ainda dentro do prazo
 *  • atrasada — passou da data do reforço
 */
export function vaccineStatusFor(
  lastAppliedAt: string | null,
  recurrenceMonths: number | null
): { status: VaccineStatus; nextDate: string | null } {
  if (!lastAppliedAt) return { status: "nunca", nextDate: null };
  if (!recurrenceMonths || recurrenceMonths <= 0) return { status: "em_dia", nextDate: null };

  const nextDate = addMonths(lastAppliedAt, recurrenceMonths);
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  return { status: nextDate > todayISO ? "em_dia" : "atrasada", nextDate };
}

// ── Seletor de tipo (chips 2x2, bom de tocar no celular) ─────────────────────

export function SpeciesPicker({
  value,
  onChange,
}: {
  value: AnimalSpecies;
  onChange: (v: AnimalSpecies) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {SPECIES_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`min-h-[44px] px-2 text-sm rounded-lg border font-medium transition-colors active:scale-[0.97] ${
            value === opt.value
              ? "bg-produmar-50 border-produmar-300 text-produmar-700 dark:bg-produmar-950/40 dark:border-produmar-700 dark:text-produmar-300"
              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Seletor de sexo (chips, bom de tocar no celular) ─────────────────────────

export function SexPicker({
  value,
  onChange,
}: {
  value: AnimalSex;
  onChange: (v: AnimalSex) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {SEX_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`min-h-[44px] px-2 text-sm rounded-lg border font-medium transition-colors active:scale-[0.97] ${
            value === opt.value
              ? "bg-produmar-50 border-produmar-300 text-produmar-700 dark:bg-produmar-950/40 dark:border-produmar-700 dark:text-produmar-300"
              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
