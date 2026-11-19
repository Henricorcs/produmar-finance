"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  Baby,
  Ban,
  Camera,
  ChevronRight,
  HandCoins,
  ImageIcon,
  Pencil,
  Printer,
  Scale,
  Stethoscope,
  Syringe,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn, formatBRL, formatDate, localDateISO } from "@/lib/utils";
import {
  deleteAnimal,
  deleteAnimalPhoto,
  deleteAnimalWeight,
  deleteBirth,
  deleteTreatment,
  deleteVaccination,
  deleteVaccinationProtocol,
  getAnimalPhotos,
  marcarDescarte,
  marcarDesmame,
} from "@/app/(app)/animais/actions";
import {
  CATEGORY_META,
  ICON_BUTTON,
  SEX_LABELS,
  SPECIES_META,
  VACCINE_STATUS_META,
  addMonths,
  categoryLabel,
  doseRuleLabel,
  ehNelorePO,
  ehRacaPO,
  formatAge,
  idadeComDias,
  formatMl,
  formatPeriod,
  formatWeight,
  pariuLabel,
  previousWeighing,
  prontaParaDesmame,
  speciesOf,
  vaccineStatusFor,
  vaccinesForSpecies,
  weightGain,
  useSoBovinos,
} from "./animal-shared";
import { TrocarMaeDialog } from "./trocar-mae-dialog";
import type {
  AnimalBirth,
  AnimalTreatment,
  AnimalVaccination,
  AnimalVaccine,
  AnimalWeight,
  AnimalWithInfo,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  animal: AnimalWithInfo | null;
  /** Aplicações de vacina deste animal. */
  vaccinations: AnimalVaccination[];
  /** Cadastro de vacinas — base da situação de vacinação. */
  vaccines: AnimalVaccine[];
  /** Tratamentos deste animal (com o remédio usado). */
  treatments: AnimalTreatment[];
  /** Partos deste animal (uma linha por bezerro). */
  births: AnimalBirth[];
  /** Pesagens deste animal (da mais nova para a mais velha). */
  weights?: AnimalWeight[];
  /** Quando este animal é um bezerro cadastrado por um parto: esse parto. */
  motherBirth?: AnimalBirth | null;
  /** Número da mãe (vem junto com motherBirth). */
  motherTag?: string | null;
  /** Fêmeas do cadastro — para trocar a mãe do bezerro lançado na mãe errada. */
  mothers?: AnimalWithInfo[];
  /** `animalId|vaccineId` marcados como pendentes na mão. */
  pendingKeys: Set<string>;
  onEdit: (animal: AnimalWithInfo) => void;
  /** Abre o protocolo de vacinação, já marcando as vacinas indicadas. */
  onVaccinate: (animal: AnimalWithInfo, vaccineIds?: string[]) => void;
  /** Marca/desmarca "esta vacina está pendente neste animal". */
  onTogglePending: (animal: AnimalWithInfo, vaccine: AnimalVaccine, pending: boolean) => void;
  /** Abre a ficha de outro animal (mãe ou bezerro). */
  onOpenAnimal: (id: string) => void;
  onTreatment: (animal: AnimalWithInfo) => void;
  onBirth: (animal: AnimalWithInfo) => void;
  /** Abre a pesagem avulsa deste animal. */
  onWeigh: (animal: AnimalWithInfo) => void;
  /** Abre a baixa do animal: vendido ou morto. */
  onExit: (animal: AnimalWithInfo) => void;
  /**
   * Os outros animais do mesmo tipo com o MESMO número — o brinco é
   * reaproveitado quando um morre ou é vendido (migration 149). Cada um tem a
   * sua ficha; aqui aparece quem já usou (ou usa) aquele número.
   */
  mesmoNumero?: AnimalWithInfo[];
}

type Section = "ficha" | "vacinas" | "historico";

export function AnimalDetailDialog({
  open,
  onClose,
  animal,
  vaccinations,
  vaccines,
  treatments,
  births,
  weights = [],
  motherBirth,
  motherTag,
  mothers = [],
  pendingKeys,
  onEdit,
  onVaccinate,
  onTogglePending,
  onOpenAnimal,
  onTreatment,
  onBirth,
  onWeigh,
  onExit,
  mesmoNumero = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [section, setSection] = useState<Section>("ficha");
  const [photos, setPhotos] = useState<{ id: string; url: string | null }[]>([]);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [trocandoMae, setTrocandoMae] = useState(false);
  const soBovinos = useSoBovinos();
  /** O "Marcar para descarte" aberto, pedindo o motivo (147). */
  const [descarteAberto, setDescarteAberto] = useState(false);
  const [motivoDescarte, setMotivoDescarte] = useState("");

  // carrega as fotos sob demanda (URLs assinadas)
  useEffect(() => {
    setPhotos([]);
    // o motivo digitado num animal não pode ir parar no próximo
    setDescarteAberto(false);
    setMotivoDescarte("");
    if (!open || !animal?.id) return;
    let cancelled = false;
    getAnimalPhotos(animal.id).then((r) => {
      if (cancelled || !("photos" in r)) return;
      setPhotos((r.photos ?? []).map((p) => ({ id: p.id, url: p.url })));
    });
    return () => {
      cancelled = true;
    };
  }, [open, animal?.id]);

  // volta pra ficha sempre que abrir outro animal
  useEffect(() => {
    if (open) setSection("ficha");
    setTrocandoMae(false);
  }, [open, animal?.id]);

  function handleDeletePhoto(photoId: string) {
    if (!confirm("Remover esta foto?")) return;
    setDeletingPhotoId(photoId);
    startTransition(async () => {
      const r = await deleteAnimalPhoto(photoId);
      setDeletingPhotoId(null);
      if (r && "error" in r) {
        alert(r.error);
        return;
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    });
  }

  if (!animal) return null;

  const meta = CATEGORY_META[animal.category];
  const weightKg = Number(animal.weight);
  /** Nomes do tipo do animal — dão o "bezerro/potro/cabrito" de cada texto. */
  const names = SPECIES_META[speciesOf(animal.species)];

  /** Descarte (migration 147): marca hoje, com o motivo, ou tira do descarte. */
  function handleDescarte(marcar: boolean) {
    const a = animal!;
    if (!marcar && !confirm(`Tirar o nº ${a.tag} do descarte? Ele sai do alerta.`)) return;
    const motivo = motivoDescarte;
    startTransition(async () => {
      const r = await marcarDescarte(a.id, marcar, motivo);
      if (r && "error" in r) {
        alert(r.error ?? "Erro ao gravar o descarte");
        return;
      }
      setDescarteAberto(false);
      setMotivoDescarte("");
    });
  }

  /** Desmame (migration 145): marca hoje ou desfaz o que foi marcado. */
  function handleDesmame(feito: boolean) {
    const a = animal!;
    if (!feito && !confirm(`Desfazer o desmame do nº ${a.tag}? Ele volta para o alerta.`)) return;
    startTransition(async () => {
      const r = await marcarDesmame([a.id], feito ? localDateISO() : null);
      if (r && "error" in r) alert(r.error ?? "Erro ao gravar o desmame");
    });
  }

  function handleDelete() {
    const a = animal!;
    if (
      !confirm(`Excluir o animal "${a.tag}"? Isso apaga também o histórico de vacinação.`)
    )
      return;
    startTransition(async () => {
      await deleteAnimal(a.id);
      onClose();
    });
  }

  function handleDeleteTreatment(id: string) {
    if (!confirm("Remover este tratamento?")) return;
    startTransition(async () => {
      await deleteTreatment(id);
    });
  }

  /** Parto lançado errado: apaga e, se quiser, tira a cria do rebanho junto. */
  function handleDeleteBirth(b: AnimalBirth) {
    const young = names.youngMale.toLowerCase();
    const calf = b.calf_tag ? `nº ${b.calf_tag}` : "sem número";
    if (!confirm(`Apagar o parto de ${formatDate(b.birth_date)} (${young} ${calf})?`)) return;
    const alsoCalf = b.calf_animal_id
      ? confirm(
          `Tirar também o ${young} ${calf} do rebanho?\n\n` +
            `OK = apaga o parto e o ${young}.\n` +
            `Cancelar = apaga só o parto e o ${young} continua cadastrado.`
        )
      : false;
    startTransition(async () => {
      const r = await deleteBirth(b.id, alsoCalf);
      if (r && "error" in r) alert(r.error);
    });
  }

  /** Pesagem lançada errada: apaga e o peso atual volta para a anterior. */
  function handleDeleteWeight(w: AnimalWeight) {
    if (
      !confirm(
        `Apagar a pesagem de ${formatDate(w.weighed_at)} (${formatWeight(Number(w.weight))})?`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteAnimalWeight(w.id);
      if (r && "error" in r) alert(r.error);
    });
  }

  /** Remove o protocolo inteiro quando as vacinas foram aplicadas juntas. */
  function handleDeleteGroup(protocolId: string | null, id: string, count: number) {
    const msg =
      protocolId && count > 1
        ? `Remover este protocolo? As ${count} vacinas aplicadas juntas serão apagadas.`
        : "Remover esta aplicação de vacina?";
    if (!confirm(msg)) return;
    startTransition(async () => {
      if (protocolId && count > 1) await deleteVaccinationProtocol(protocolId);
      else await deleteVaccination(id);
    });
  }

  // ── Situação de cada vacina cadastrada ────────────────────────────────────
  /** Só as vacinas do bicho: a ficha do porco não cobra febre aftosa dele. */
  const speciesVaccines = vaccinesForSpecies(vaccines, animal.species);

  const vaccineRows = speciesVaccines.map((v) => {
    const applications = vaccinations
      .filter((x) => x.vaccine_id === v.id)
      .sort((a, b) => (a.applied_at < b.applied_at ? 1 : -1));
    const last = applications[0] ?? null;
    const { status, nextDate } = vaccineStatusFor(last?.applied_at ?? null, v.recurrence_months);
    return { vaccine: v, last, status, nextDate, marked: pendingKeys.has(`${animal.id}|${v.id}`) };
  });

  /** Vacinas que faltam aplicar — já vêm marcadas no protocolo. */
  const pendingVaccineIds = vaccineRows
    .filter((r) => r.status !== "em_dia" || r.marked)
    .map((r) => r.vaccine.id);

  /** Quantas foram marcadas na mão como pendentes (o que o dono decidiu). */
  const markedCount = vaccineRows.filter((r) => r.marked).length;

  const vaccineById = new Map(vaccines.map((v) => [v.id, v]));

  // ── Pesagens: o quanto engordou e em quanto tempo ─────────────────────────
  /** Da mais nova para a mais velha (a lista já vem assim, mas garantimos). */
  const sortedWeights = [...weights].sort((a, b) =>
    a.weighed_at < b.weighed_at ? 1 : -1
  );
  const lastWeighing = sortedWeights[0] ?? null;
  const firstWeighing = sortedWeights[sortedWeights.length - 1] ?? null;

  /** Ganho da vida toda: da primeira pesagem até a última. */
  const lifeGain =
    firstWeighing && lastWeighing && firstWeighing.id !== lastWeighing.id
      ? weightGain(
          { weighed_at: firstWeighing.weighed_at, weight: Number(firstWeighing.weight) },
          { weighed_at: lastWeighing.weighed_at, weight: Number(lastWeighing.weight) }
        )
      : null;

  /** Peso tirado em cada protocolo (protocol_id → pesagem). */
  const weightByProtocol = new Map(
    sortedWeights.filter((w) => w.protocol_id).map((w) => [w.protocol_id as string, w])
  );

  /** Ganho de uma pesagem para a anterior. */
  function gainFor(w: AnimalWeight) {
    const prev = previousWeighing(
      sortedWeights.map((x) => ({ ...x, weight: Number(x.weight) })),
      w.weighed_at
    );
    if (!prev) return null;
    return weightGain(
      { weighed_at: prev.weighed_at, weight: Number(prev.weight) },
      { weighed_at: w.weighed_at, weight: Number(w.weight) }
    );
  }

  // Vacinas aplicadas juntas viram UM evento no histórico (o protocolo).
  const groups = Object.values(
    vaccinations.reduce<Record<string, AnimalVaccination[]>>((acc, v) => {
      const key = v.protocol_id ?? v.id;
      (acc[key] ??= []).push(v);
      return acc;
    }, {})
  );

  // Histórico unificado: vacinas (por protocolo) + pesagens + tratamentos + partos
  const events: { key: string; date: string; node: React.ReactNode }[] = [
    ...groups.map((group) => {
      const first = group[0];
      // peso tirado nesse mesmo protocolo — e quanto ganhou desde o anterior
      const protocolWeight = first.protocol_id
        ? weightByProtocol.get(first.protocol_id) ?? null
        : null;
      const protocolGain = protocolWeight ? gainFor(protocolWeight) : null;
      return {
        key: `vc-${first.protocol_id ?? first.id}`,
        date: first.applied_at,
        node: (
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex-shrink-0">
              <Syringe className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-800 dark:text-slate-100">
                {group.length > 1 ? `Protocolo · ${group.length} vacinas` : "Vacina aplicada"}
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {group.map((v) => {
                  const vaccine = vaccineById.get(v.vaccine_id);
                  // vacinação é periódica: mostra quando esta dose vence
                  const next = vaccine?.recurrence_months
                    ? addMonths(v.applied_at, vaccine.recurrence_months)
                    : null;
                  return (
                    <li key={v.id} className="text-sm text-slate-500 dark:text-slate-400">
                      {vaccine?.name ?? "—"}
                      {v.dose_ml ? ` · ${formatMl(Number(v.dose_ml))}` : ""}
                      {v.brand ? ` · ${v.brand}` : ""}
                      {next && (
                        <span className="text-slate-400"> · reforço {formatDate(next)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {/* Pesagem do dia do protocolo: engordou quanto, em quanto tempo */}
              {protocolWeight && (
                <p className="text-sm">
                  <span className="text-slate-600 dark:text-slate-300">
                    Peso {formatWeight(Number(protocolWeight.weight))}
                  </span>
                  {protocolGain && (
                    <span
                      className={cn(
                        "ml-1 font-medium",
                        protocolGain.diff > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : protocolGain.diff < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-slate-400"
                      )}
                    >
                      · {protocolGain.label}
                    </span>
                  )}
                </p>
              )}
              <p className="text-sm text-slate-400">
                {formatDate(first.applied_at)}
                {first.notes ? ` · ${first.notes}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleDeleteGroup(first.protocol_id, first.id, group.length)}
              disabled={isPending}
              aria-label="Remover aplicação"
              className={cn(ICON_BUTTON, "text-slate-300 hover:text-red-500 -mr-2")}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ),
      };
    }),
    // pesagens avulsas (as do protocolo já aparecem dentro dele)
    ...sortedWeights
      .filter((w) => !w.protocol_id)
      .map((w) => {
        const g = gainFor(w);
        return {
          key: `wg-${w.id}`,
          date: w.weighed_at,
          node: (
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 flex-shrink-0">
                <Scale className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800 dark:text-slate-100">
                  Pesagem · {formatWeight(Number(w.weight))}
                </p>
                {g && (
                  <p
                    className={cn(
                      "text-sm font-medium",
                      g.diff > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : g.diff < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-slate-400"
                    )}
                  >
                    {g.label}
                  </p>
                )}
                <p className="text-sm text-slate-400">
                  {formatDate(w.weighed_at)}
                  {w.notes ? ` · ${w.notes}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteWeight(w)}
                disabled={isPending}
                aria-label="Remover pesagem"
                className={cn(ICON_BUTTON, "text-slate-300 hover:text-red-500 -mr-2")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ),
        };
      }),
    ...treatments.map((t) => ({
      key: `tr-${t.id}`,
      date: t.applied_at,
      node: (
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg bg-produmar-50 dark:bg-produmar-900/40 text-produmar-600 dark:text-produmar-300 flex-shrink-0">
            <Stethoscope className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800 dark:text-slate-100">
              {t.description}
              {t.medicine ? ` · ${t.medicine}` : ""}
              {t.dose ? ` (${t.dose})` : ""}
            </p>
            <p className="text-sm text-slate-400">{formatDate(t.applied_at)}</p>
          </div>
          <button
            type="button"
            onClick={() => handleDeleteTreatment(t.id)}
            disabled={isPending}
            aria-label="Remover tratamento"
            className={cn(ICON_BUTTON, "text-slate-300 hover:text-red-500 -mr-2")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    })),
    ...births.map((b) => ({
      key: `bt-${b.id}`,
      date: b.birth_date,
      node: (
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex-shrink-0">
            <Baby className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800 dark:text-slate-100">
              Pariu{" "}
              {b.calf_sex === "macho"
                ? `um ${names.youngMale.toLowerCase()} (macho)`
                : `uma ${names.youngFemale.toLowerCase()} (fêmea)`}
              {b.calf_tag ? ` · nº ${b.calf_tag}` : ""}
              {b.calf_animal_id ? " · cadastrado" : ""}
            </p>
            <p className="text-sm text-slate-400">
              {formatDate(b.birth_date)}
              {b.notes ? ` · ${b.notes}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDeleteBirth(b)}
            disabled={isPending}
            aria-label="Remover parto"
            className={cn(ICON_BUTTON, "text-slate-300 hover:text-red-500 -mr-2")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  /**
   * Saiu do rebanho (vendido ou morto): a ficha fica só para consulta — o
   * que aconteceu com ele continua todo aqui, mas não se vacina nem se pesa
   * quem já foi embora. A situação de vacinas também some (para ele nada mais
   * vence).
   */
  const saiu = animal.active === false;
  const morreu = animal.exit_reason === "morte";

  const sections: { value: Section; label: string; count?: number }[] = [
    { value: "ficha", label: "Ficha" },
    ...(saiu ? [] : [{ value: "vacinas" as Section, label: "Vacinas", count: markedCount }]),
    { value: "historico", label: "Histórico", count: events.length },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 flex items-center gap-2 flex-wrap pr-6">
            Animal {animal.tag}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.chip}`}>
              {categoryLabel(animal.category, animal.sex, animal.species)}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${names.chip}`}
            >
              {names.label}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Abas internas */}
        <div className="flex gap-1.5 mb-4">
          {sections.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSection(s.value)}
              className={`flex-1 px-3 min-h-[44px] rounded-lg text-sm font-medium border transition-colors active:scale-[0.97] ${
                section === s.value
                  ? "bg-produmar-600 border-produmar-600 text-white"
                  : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
              }`}
            >
              {s.label}
              {s.count ? <span className="opacity-70 ml-1">{s.count}</span> : null}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {section === "ficha" && (
            <>
              {/* Saiu do rebanho: o que aconteceu, logo no topo */}
              {saiu && (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm",
                    morreu
                      ? "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                  )}
                >
                  <HandCoins className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">
                      {morreu ? "Morreu" : "Vendido"}
                      {animal.exit_date ? ` em ${formatDate(animal.exit_date)}` : ""}
                      {!morreu && Number(animal.exit_amount ?? 0) > 0
                        ? ` · ${formatBRL(Number(animal.exit_amount))}`
                        : ""}
                    </p>
                    {(animal.exit_buyer || animal.exit_notes) && (
                      <p className="text-xs opacity-80">
                        {[animal.exit_buyer, animal.exit_notes].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="text-xs opacity-70 mt-0.5">
                      Saiu do rebanho — a ficha fica guardada para consulta.
                    </p>
                  </div>
                </div>
              )}

              {/* O mesmo número em outros animais (149): o brinco foi reaproveitado */}
              {mesmoNumero.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <p className="px-3 pt-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Histórico do nº {animal.tag}
                  </p>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {mesmoNumero.map((o) => {
                      const oSaiu = o.active === false;
                      const oMorreu = o.exit_reason === "morte";
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => onOpenAnimal(o.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors"
                        >
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide flex-shrink-0",
                              !oSaiu
                                ? "bg-produmar-50 text-produmar-700 dark:bg-produmar-950/40 dark:text-produmar-300"
                                : oMorreu
                                  ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            )}
                          >
                            {!oSaiu ? "No rebanho" : oMorreu ? "Morreu" : "Vendido"}
                          </span>
                          <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">
                            {categoryLabel(o.category, o.sex, o.species)}
                            {o.breed_name ? ` · ${o.breed_name}` : ""}
                            <span className="text-slate-400">
                              {oSaiu && o.exit_date
                                ? ` · ${formatDate(o.exit_date)}`
                                : o.birth_date
                                  ? ` · nasc. ${formatDate(o.birth_date)}`
                                  : ""}
                            </span>
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Para descarte (147): logo no topo, para ninguém deixar passar */}
              {!saiu && animal.descarte_em && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                  <Ban className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">Para descarte</p>
                    <p className="text-xs opacity-80">
                      {animal.descarte_motivo ? `${animal.descarte_motivo} · ` : ""}
                      desde {formatDate(animal.descarte_em)}
                    </p>
                  </div>
                  {!soBovinos && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDescarte(false)}
                      className="min-h-[36px] px-2 rounded-lg border border-red-200 bg-white text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-slate-900 dark:text-red-400 disabled:opacity-50 flex-shrink-0"
                    >
                      Tirar do descarte
                    </button>
                  )}
                </div>
              )}

              {/* Fotos (galeria) */}
              {photos.length > 0 && (
                <div className={photos.length === 1 ? "" : "grid grid-cols-2 gap-2"}>
                  {photos.map((p) => (
                    <div key={p.id} className="relative group">
                      {p.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.url}
                          alt={`Animal ${animal.tag}`}
                          className="w-full max-h-56 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                        />
                      ) : (
                        <div className="w-full h-32 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(p.id)}
                        disabled={deletingPhotoId === p.id}
                        aria-label="Remover foto"
                        className="absolute top-1.5 right-1.5 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Informações */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-base">
                <InfoRow label="Número" value={animal.tag} />
                {/* o PO que virou código de compra: o brinco de antes */}
                {animal.tag_antigo && <InfoRow label="Nº antigo" value={animal.tag_antigo} />}
                <InfoRow label="Tipo" value={names.label} />
                <InfoRow label="Sexo" value={SEX_LABELS[animal.sex]} />
                <InfoRow label="Raça" value={animal.breed_name ?? "—"} />
                {ehNelorePO(animal.breed_name) && animal.abcz_code && (
                  <InfoRow label="ABCZ" value={animal.abcz_code} />
                )}
                {/* A MÃE numa linha só, com o Pai logo abaixo. Vale o que foi
                    escrito no cadastro do PO (migration 137); sem isso, a mãe do
                    parto lançado aqui. Se a mãe está no rebanho, toca e abre a
                    ficha dela. */}
                {(ehRacaPO(animal.breed_name) || motherBirth) && (
                  <InfoLinkRow
                    label="Mãe"
                    value={animal.mae || (motherTag ? `Nº ${motherTag}` : "—")}
                    onOpen={
                      motherBirth && motherTag
                        ? () => onOpenAnimal(motherBirth.mother_id)
                        : undefined
                    }
                  />
                )}
                {/* bezerro lançado na mãe errada: o parto passa para a certa */}
                {motherBirth && (
                  <button
                    type="button"
                    onClick={() => setTrocandoMae(true)}
                    className="w-full flex items-center justify-end gap-1.5 px-3 py-2 text-sm text-slate-500 dark:text-slate-400 active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Mãe errada? Trocar a mãe
                  </button>
                )}
                {ehRacaPO(animal.breed_name) && (
                  <InfoRow label="Pai" value={animal.pai || "—"} />
                )}
                <InfoRow
                  label="Nascimento"
                  value={animal.birth_date ? formatDate(animal.birth_date) : "—"}
                />
                <InfoRow label="Idade" value={idadeComDias(animal.birth_date, animal.age_months)} />
                {/* Desmame: a data, quando já foi marcado; a cria de 8 meses
                    sem desmame aparece como pronta, com o botão de marcar */}
                {(animal.desmame_em || prontaParaDesmame(animal)) && (
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">Desmame</span>
                    <span className="flex items-center gap-2 text-right">
                      <span
                        className={cn(
                          "font-medium",
                          animal.desmame_em
                            ? "text-slate-800 dark:text-slate-100"
                            : "text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {animal.desmame_em ? formatDate(animal.desmame_em) : "Pronta para desmamar"}
                      </span>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDesmame(!animal.desmame_em)}
                        className="min-h-[36px] px-2 rounded-lg border border-slate-200 text-sm text-produmar-700 dark:border-slate-700 dark:text-produmar-400 disabled:opacity-50"
                      >
                        {animal.desmame_em ? "Desfazer" : "Feito hoje"}
                      </button>
                    </span>
                  </div>
                )}
                <InfoRow
                  label="Peso"
                  value={
                    weightKg > 0
                      ? `${formatWeight(weightKg)}${
                          lastWeighing ? ` · pesado em ${formatDate(lastWeighing.weighed_at)}` : ""
                        }`
                      : "—"
                  }
                />
                {/* Quanto engordou da primeira pesagem até agora */}
                {lifeGain && <InfoRow label="Ganho total" value={lifeGain.label} />}
                {sortedWeights.length > 1 && (
                  <InfoRow
                    label="Pesagens"
                    value={`${sortedWeights.length} em ${formatPeriod(
                      lifeGain?.days ?? 0
                    )}`}
                  />
                )}
                {animal.sex === "femea" && (
                  <InfoRow
                    label="Pariu"
                    value={
                      births.length === 0
                        ? "Não"
                        : `${pariuLabel(animal.sex, births)} · último em ${formatDate(
                            births[0].birth_date
                          )}`
                    }
                  />
                )}
                <InfoRow
                  label="Vacinação"
                  value={
                    speciesVaccines.length === 0
                      ? `Sem vacinas de ${names.label.toLowerCase()} cadastradas`
                      : markedCount > 0
                      ? `${markedCount} marcada(s) como pendente`
                      : "Sem pendência marcada"
                  }
                />
                {animal.notes && <InfoRow label="Obs." value={animal.notes} />}
              </div>

              {/* Crias: cada bezerro que nasceu dela e entrou no rebanho */}
              {births.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                  {births.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => b.calf_animal_id && onOpenAnimal(b.calf_animal_id)}
                      disabled={!b.calf_animal_id}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left disabled:cursor-default active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors"
                    >
                      <Baby className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="flex-1 min-w-0 text-sm text-slate-800 dark:text-slate-100 truncate">
                        {b.calf_sex === "macho" ? names.youngMale : names.youngFemale}
                        {b.calf_tag ? ` nº ${b.calf_tag}` : ""}
                        <span className="text-slate-400"> · {formatDate(b.birth_date)}</span>
                      </span>
                      {b.calf_animal_id && (
                        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Ações principais — quem saiu do rebanho só imprime a ficha */}
              {saiu ? (
                <Button
                  variant="outline"
                  className="w-full h-12 sm:h-10"
                  onClick={() => window.open(`/imprimir/animal/${animal.id}`, "_blank")}
                >
                  <Printer className="w-4 h-4" />
                  Imprimir ficha
                </Button>
              ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-12 sm:h-10"
                  onClick={() =>
                    onVaccinate(
                      animal,
                      pendingVaccineIds.length > 0 ? pendingVaccineIds : undefined
                    )
                  }
                >
                  <Syringe className="w-4 h-4" />
                  Vacinar
                  {markedCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-white/25 text-white text-[10px] font-semibold flex items-center justify-center">
                      {markedCount}
                    </span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="h-12 sm:h-10"
                  onClick={() => window.open(`/imprimir/animal/${animal.id}`, "_blank")}
                >
                  <Printer className="w-4 h-4" />
                  Imprimir ficha
                </Button>
                <Button
                  variant="outline"
                  className="h-12 sm:h-10"
                  onClick={() => onWeigh(animal)}
                >
                  <Scale className="w-4 h-4" />
                  Pesar
                </Button>
                <Button
                  variant="outline"
                  className="h-12 sm:h-10"
                  onClick={() => onTreatment(animal)}
                >
                  <Stethoscope className="w-4 h-4" />
                  Tratamento
                </Button>
                {/* Abre a mesma Pesagem — o botão da câmera fica logo no topo */}
                <Button
                  variant="outline"
                  className="h-12 sm:h-10 col-span-2"
                  onClick={() => onWeigh(animal)}
                >
                  <Camera className="w-4 h-4" />
                  Peso pela foto
                </Button>
                {animal.sex === "femea" && (
                  <Button
                    variant="outline"
                    className="h-12 sm:h-10 col-span-2"
                    onClick={() => onBirth(animal)}
                  >
                    <Baby className="w-4 h-4" />
                    Parto
                  </Button>
                )}
                {/* Saída do rebanho: vendido (o valor vai pro financeiro) ou
                    morto. O vaqueiro nível 01 não dá saída (146). */}
                {!soBovinos && (
                  <Button
                    variant="outline"
                    className="h-12 sm:h-10 col-span-2 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                    onClick={() => onExit(animal)}
                  >
                    <HandCoins className="w-4 h-4" />
                    Vender ou dar baixa
                  </Button>
                )}
                {/* Para descarte (147): quem marca é o patrão; o animal vai
                    para o alerta da aba Rebanho e do sino */}
                {!soBovinos && !animal.descarte_em && !descarteAberto && (
                  <Button
                    variant="outline"
                    className="h-12 sm:h-10 col-span-2 border-red-200 text-red-700 dark:border-red-900/50 dark:text-red-400"
                    onClick={() => setDescarteAberto(true)}
                  >
                    <Ban className="w-4 h-4" />
                    Marcar para descarte
                  </Button>
                )}
                {!soBovinos && !animal.descarte_em && descarteAberto && (
                  <div className="col-span-2 space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-900/50 dark:bg-red-950/20">
                    <label className="block text-sm font-medium text-red-800 dark:text-red-300">
                      Motivo do descarte (opcional)
                      <input
                        type="text"
                        value={motivoDescarte}
                        onChange={(e) => setMotivoDescarte(e.target.value)}
                        placeholder="Ex.: não emprenha, idade, casco"
                        maxLength={120}
                        autoFocus
                        className="mt-1 w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 h-11"
                        disabled={isPending}
                        onClick={() => {
                          setDescarteAberto(false);
                          setMotivoDescarte("");
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        className="flex-[2] h-11 bg-red-600 hover:bg-red-700 text-white"
                        disabled={isPending}
                        onClick={() => handleDescarte(true)}
                      >
                        <Ban className="w-4 h-4" />
                        Marcar para descarte
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              )}
            </>
          )}

          {section === "vacinas" && !saiu && (
            <div className="space-y-2">
              {vaccineRows.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-2">
                  Nenhuma vacina de {names.label.toLowerCase()} cadastrada ainda. Cadastre
                  as vacinas dessa criação (aba Vacinação) para acompanhar a situação de
                  cada animal.
                </p>
              ) : (
                <>
                  <Button
                    className="w-full h-12 sm:h-10"
                    onClick={() =>
                      onVaccinate(
                        animal,
                        pendingVaccineIds.length > 0 ? pendingVaccineIds : undefined
                      )
                    }
                  >
                    <Syringe className="w-4 h-4" />
                    Aplicar protocolo
                  </Button>
                  {vaccineRows.map(({ vaccine, last, status, nextDate, marked }) => {
                    const statusMeta = VACCINE_STATUS_META[status];
                    const rule = doseRuleLabel(vaccine, weightKg);
                    return (
                      <div
                        key={vaccine.id}
                        className={cn(
                          "rounded-xl border px-3 py-2.5",
                          marked
                            ? "border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/20"
                            : "border-slate-200 dark:border-slate-700"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                              {vaccine.name}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                              {last ? `Última: ${formatDate(last.applied_at)}` : "Nunca aplicada"}
                              {last?.dose_ml ? ` · ${formatMl(Number(last.dose_ml))}` : ""}
                              {last?.brand ? ` · ${last.brand}` : ""}
                              {nextDate ? ` · próxima ${formatDate(nextDate)}` : ""}
                              {!vaccine.recurrence_months ? " · dose única" : ""}
                            </p>
                            {rule && (
                              <p className="text-sm text-produmar-600 dark:text-produmar-400 mt-0.5">
                                aplicar {rule}
                              </p>
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                              marked
                                ? "bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300"
                                : statusMeta.chip
                            )}
                          >
                            {marked ? "Pendente" : statusMeta.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <Button
                            variant="outline"
                            className="h-11 sm:h-10"
                            onClick={() => onVaccinate(animal, [vaccine.id])}
                          >
                            <Syringe className="w-4 h-4" />
                            Aplicar
                          </Button>
                          {/* quem decide o que fica pendente é o dono do rebanho */}
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => onTogglePending(animal, vaccine, !marked)}
                            className={cn(
                              "flex items-center justify-center gap-1.5 h-11 sm:h-10 px-2 rounded-lg border text-sm font-medium transition-colors active:scale-[0.97] disabled:opacity-50",
                              marked
                                ? "border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                            )}
                          >
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            {marked ? "Tirar pendência" : "Deixar pendente"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {section === "historico" && (
            <div>
              {events.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-2">
                  Nenhuma vacina, pesagem, tratamento ou parto registrado.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {events.map((e) => (
                    <div key={e.key}>{e.node}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ações secundárias */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onEdit(animal)}
              className="flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-sm font-medium text-slate-500 hover:text-produmar-600 dark:text-slate-400 dark:hover:text-produmar-400 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Editar
            </button>
            {/* o vaqueiro nível 01 não exclui animal (146); quem saiu do
                rebanho também não se exclui daqui — a ficha é o histórico dele */}
            {!soBovinos && !saiu && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-sm font-medium text-slate-400 hover:text-red-500 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </button>
            )}
          </div>
        </div>

        {motherBirth && (
          <TrocarMaeDialog
            open={trocandoMae}
            onClose={() => setTrocandoMae(false)}
            cria={animal}
            parto={motherBirth}
            maeAtualTag={motherTag ?? null}
            maes={mothers}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className="font-medium text-slate-800 dark:text-slate-100 text-right">{value}</span>
    </div>
  );
}

/** Linha da ficha que leva para outro animal (a mãe do bezerro). */
function InfoLinkRow({
  label,
  value,
  onOpen,
}: {
  label: string;
  value: string;
  onOpen?: () => void;
}) {
  if (!onOpen) return <InfoRow label={label} value={value} />;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors"
    >
      <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className="flex items-center gap-1 font-medium text-produmar-600 dark:text-produmar-400">
        {value}
        <ChevronRight className="w-4 h-4" />
      </span>
    </button>
  );
}
