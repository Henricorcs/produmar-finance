"use client";

import { useEffect, useState, useTransition } from "react";
import { Baby, ImageIcon, Pencil, Printer, Stethoscope, Syringe, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import {
  deleteAnimal,
  deleteAnimalPhoto,
  deleteBirth,
  deleteTreatment,
  deleteVaccination,
  deleteVaccinationProtocol,
  getAnimalPhotos,
} from "@/app/(app)/animais/actions";
import {
  CATEGORY_META,
  ICON_BUTTON,
  SEX_LABELS,
  VACCINE_STATUS_META,
  categoryLabel,
  doseRuleLabel,
  formatAge,
  formatMl,
  formatWeight,
  pariuLabel,
  vaccineStatusFor,
} from "./animal-shared";
import type {
  AnimalBirth,
  AnimalTreatment,
  AnimalVaccination,
  AnimalVaccine,
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
  onEdit: (animal: AnimalWithInfo) => void;
  /** Abre o protocolo de vacinação, já marcando as vacinas indicadas. */
  onVaccinate: (animal: AnimalWithInfo, vaccineIds?: string[]) => void;
  onTreatment: (animal: AnimalWithInfo) => void;
  onBirth: (animal: AnimalWithInfo) => void;
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
  onEdit,
  onVaccinate,
  onTreatment,
  onBirth,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [section, setSection] = useState<Section>("ficha");
  const [photos, setPhotos] = useState<{ id: string; url: string | null }[]>([]);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  // carrega as fotos sob demanda (URLs assinadas)
  useEffect(() => {
    setPhotos([]);
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

  function handleDeleteBirth(id: string) {
    if (!confirm("Remover este parto? O bezerro cadastrado continua no rebanho.")) return;
    startTransition(async () => {
      await deleteBirth(id);
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
  const vaccineRows = vaccines.map((v) => {
    const applications = vaccinations
      .filter((x) => x.vaccine_id === v.id)
      .sort((a, b) => (a.applied_at < b.applied_at ? 1 : -1));
    const last = applications[0] ?? null;
    const { status, nextDate } = vaccineStatusFor(last?.applied_at ?? null, v.recurrence_months);
    return { vaccine: v, last, status, nextDate };
  });

  /** Vacinas atrasadas ou nunca aplicadas — já vêm marcadas no protocolo. */
  const pendingVaccineIds = vaccineRows
    .filter((r) => r.status !== "em_dia")
    .map((r) => r.vaccine.id);

  const vaccineNameById = new Map(vaccines.map((v) => [v.id, v.name]));

  // Vacinas aplicadas juntas viram UM evento no histórico (o protocolo).
  const groups = Object.values(
    vaccinations.reduce<Record<string, AnimalVaccination[]>>((acc, v) => {
      const key = v.protocol_id ?? v.id;
      (acc[key] ??= []).push(v);
      return acc;
    }, {})
  );

  // Histórico unificado: vacinas (por protocolo) + tratamentos + partos
  const events: { key: string; date: string; node: React.ReactNode }[] = [
    ...groups.map((group) => {
      const first = group[0];
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
                {group.map((v) => (
                  <li key={v.id} className="text-sm text-slate-500 dark:text-slate-400">
                    {vaccineNameById.get(v.vaccine_id) ?? "—"}
                    {v.dose_ml ? ` · ${formatMl(Number(v.dose_ml))}` : ""}
                    {v.brand ? ` · ${v.brand}` : ""}
                  </li>
                ))}
              </ul>
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
              Pariu {b.calf_sex === "macho" ? "um bezerro (macho)" : "uma bezerra (fêmea)"}
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
            onClick={() => handleDeleteBirth(b.id)}
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

  const sections: { value: Section; label: string; count?: number }[] = [
    { value: "ficha", label: "Ficha" },
    { value: "vacinas", label: "Vacinas", count: animal.vaccines_due },
    { value: "historico", label: "Histórico", count: events.length },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 flex items-center gap-2 flex-wrap pr-6">
            Animal {animal.tag}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.chip}`}>
              {categoryLabel(animal.category, animal.sex)}
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
                <InfoRow label="Sexo" value={SEX_LABELS[animal.sex]} />
                <InfoRow label="Raça" value={animal.breed_name ?? "—"} />
                <InfoRow
                  label="Nascimento"
                  value={animal.birth_date ? formatDate(animal.birth_date) : "—"}
                />
                <InfoRow label="Idade" value={formatAge(animal.age_months)} />
                <InfoRow label="Peso" value={weightKg > 0 ? formatWeight(weightKg) : "—"} />
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
                    vaccines.length === 0
                      ? "Sem vacinas cadastradas"
                      : animal.vaccines_due > 0
                      ? `${animal.vaccines_due} pendente(s)`
                      : "Em dia"
                  }
                />
                {animal.notes && <InfoRow label="Obs." value={animal.notes} />}
              </div>

              {/* Ações principais */}
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
                  {pendingVaccineIds.length > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-white/25 text-white text-[10px] font-semibold flex items-center justify-center">
                      {pendingVaccineIds.length}
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
                  className={cn("h-12 sm:h-10", animal.sex !== "femea" && "col-span-2")}
                  onClick={() => onTreatment(animal)}
                >
                  <Stethoscope className="w-4 h-4" />
                  Tratamento
                </Button>
                {animal.sex === "femea" && (
                  <Button
                    variant="outline"
                    className="h-12 sm:h-10"
                    onClick={() => onBirth(animal)}
                  >
                    <Baby className="w-4 h-4" />
                    Parto
                  </Button>
                )}
              </div>
            </>
          )}

          {section === "vacinas" && (
            <div className="space-y-2">
              {vaccineRows.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-2">
                  Nenhuma vacina cadastrada ainda. Cadastre as vacinas do rebanho para
                  acompanhar a situação de cada animal.
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
                    {pendingVaccineIds.length > 0
                      ? `Aplicar protocolo (${pendingVaccineIds.length} pendente${
                          pendingVaccineIds.length > 1 ? "s" : ""
                        })`
                      : "Aplicar protocolo"}
                  </Button>
                  {vaccineRows.map(({ vaccine, last, status, nextDate }) => {
                    const statusMeta = VACCINE_STATUS_META[status];
                    const rule = doseRuleLabel(vaccine, weightKg);
                    return (
                      <div
                        key={vaccine.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5"
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
                            className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusMeta.chip}`}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          className="w-full mt-2 h-11 sm:h-10"
                          onClick={() => onVaccinate(animal, [vaccine.id])}
                        >
                          <Syringe className="w-4 h-4" />
                          Aplicar agora
                        </Button>
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
                  Nenhuma vacina, tratamento ou parto registrado.
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
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-sm font-medium text-slate-400 hover:text-red-500 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
          </div>
        </div>
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
