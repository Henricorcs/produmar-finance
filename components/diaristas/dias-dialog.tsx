"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatBRL, upperKeepingCaret } from "@/lib/utils";
import { createDiaristaDias } from "@/app/(app)/diaristas/actions";
import { daysPhrase, shortDay } from "./diarista-shared";
import type { Diarista, SupplyObraSector } from "@/lib/types";

/** Obra do Estoque, do jeito enxuto que esta tela precisa. */
export interface DiaristaObra {
  id: string;
  name: string;
  client?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  diarista: Pick<Diarista, "id" | "name" | "daily_rate"> | null;
  /** Os dias marcados no calendário (YYYY-MM-DD). */
  dates: string[];
  obras: DiaristaObra[];
  sectors: SupplyObraSector[];
  /** Obra já escolhida (quem está numa obra lança vários seguidos). */
  defaultObraId?: string | null;
  /** Deu certo: quem abriu limpa a seleção do calendário. */
  onSaved: (obraId: string) => void;
}

/**
 * "O que ele fez nesses dias?" — a tela que aparece depois de marcar os dias no
 * calendário. A descrição e a obra valem para TODOS os dias marcados: quem
 * passou a semana na mesma obra não vai repetir o mesmo texto cinco vezes.
 */
export function DiasDialog({
  open,
  onClose,
  diarista,
  dates,
  obras,
  sectors,
  defaultObraId,
  onSaved,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [obraId, setObraId] = useState("");
  const [sectorId, setSectorId] = useState("");

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setObraId(defaultObraId ?? "");
    setSectorId("");
    setError(null);
  }, [open, defaultObraId]);

  /** Os setores da obra escolhida — o setor é subcadastro dela. */
  const obraSectors = useMemo(
    () => sectors.filter((s) => s.obra_id === obraId),
    [sectors, obraId]
  );

  const total = (diarista?.daily_rate ?? 0) * dates.length;

  function chooseObra(id: string) {
    setObraId(id);
    setSectorId(""); // o setor é de uma obra só
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!diarista) return;
    if (dates.length === 0) return setError("Marque pelo menos um dia no calendário");
    // a descrição é a razão desta tela existir: sem ela, daqui a dois meses o
    // "veio dia 12" não explica nada a ninguém
    if (!description.trim()) return setError("Escreva o que ele fez nesses dias");

    startTransition(async () => {
      const r = await createDiaristaDias({
        diarista_id: diarista.id,
        dates,
        description,
        obra_id: obraId || null,
        sector_id: obraId && sectorId ? sectorId : null,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao lançar os dias");
        return;
      }
      onSaved(obraId);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-produmar-50 text-produmar-600 dark:bg-produmar-900/40 dark:text-produmar-300">
              <CalendarDays className="w-4 h-4" />
            </span>
            O que {diarista?.name ?? "ele"} fez?
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Os dias marcados, para conferir antes de lançar */}
          <div className="rounded-xl border border-produmar-100 dark:border-slate-700 bg-produmar-50/60 dark:bg-slate-800/60 p-3 space-y-2">
            <p className="text-sm font-semibold text-produmar-800 dark:text-slate-100">
              {dates.length === 1 ? "1 dia marcado" : `${dates.length} dias marcados`}
            </p>
            <div className="flex flex-wrap gap-1">
              {[...dates].sort().map((d) => (
                <span
                  key={d}
                  className="px-2 py-1 rounded-lg bg-produmar-600 text-white text-[11px] font-semibold tabular-nums"
                >
                  {shortDay(d)}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {daysPhrase(dates)}
              {total > 0 && ` · ${formatBRL(total)}`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dd_desc">O que ele fez *</Label>
            <Textarea
              id="dd_desc"
              value={description}
              onChange={(e) => setDescription(upperKeepingCaret(e))}
              placeholder="ex: ajudou a abrir a vala e carregou o cano"
              className="uppercase placeholder:normal-case placeholder:lowercase min-h-[92px]"
              rows={3}
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Vale para todos os dias marcados.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Obra</Label>
            <SearchableSelect
              items={obras}
              value={obraId}
              onChange={chooseObra}
              getId={(o) => o.id}
              getLabel={(o) => o.name}
              renderItem={(o) => (
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="truncate">{o.name}</span>
                  {o.client && (
                    <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[7rem]">
                      {o.client}
                    </span>
                  )}
                </div>
              )}
              placeholder="Toque para escolher a obra..."
              searchPlaceholder="Buscar obra..."
              emptyMessage="Nenhuma obra cadastrada"
            />
          </div>

          {obraSectors.length > 0 && (
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <SearchableSelect
                items={obraSectors}
                value={sectorId}
                onChange={setSectorId}
                getId={(s) => s.id}
                getLabel={(s) => s.name}
                placeholder="Toque para escolher o setor..."
                searchPlaceholder="Buscar setor..."
                emptyMessage="Nenhum setor cadastrado nesta obra"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="w-full h-14 text-base font-semibold">
            {isPending
              ? "Lançando..."
              : dates.length === 1
                ? "Lançar 1 diária"
                : `Lançar ${dates.length} diárias`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
