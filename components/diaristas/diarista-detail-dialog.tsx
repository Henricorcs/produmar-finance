"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  HardHat,
  Pencil,
  Phone,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate, getInitials } from "@/lib/utils";
import { deleteDiarista, setDiaristaActive } from "@/app/(app)/diaristas/actions";
import { DiaristaCalendar, monthRange } from "./diarista-shared";
import { LancarDiaDialog, type DiaristaObra } from "./lancar-dia-dialog";
import { DiaDetailDialog } from "./dia-detail-dialog";
import type { DiaristaDia, DiaristaResumo, SupplyObraSector } from "@/lib/types";

/** Nenhum dia marcado — mesma referência sempre, para não redesenhar à toa. */
const NENHUM = new Set<string>();

interface Props {
  open: boolean;
  onClose: () => void;
  diarista: DiaristaResumo | null;
  /** Todos os dias lançados (de todo mundo) — o diálogo filtra os desta pessoa. */
  dias: DiaristaDia[];
  obras: DiaristaObra[];
  sectors: SupplyObraSector[];
  /** Mês que está aberto na tela, para o calendário começar no mesmo lugar. */
  year: number;
  month: number;
  onEdit: (diarista: DiaristaResumo) => void;
}

/**
 * A ficha do diarista para o chefe: quanto ele ganha por dia, a chave PIX para
 * pagar e o calendário do mês — que aqui também é editável, porque quando o
 * técnico esquece de marcar quem sobra é o escritório.
 */
export function DiaristaDetailDialog({
  open,
  onClose,
  diarista,
  dias,
  obras,
  sectors,
  year,
  month,
  onEdit,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const [ano, setAno] = useState(year);
  const [mes, setMes] = useState(month);
  /** O dia que ele acabou de tocar — azul enquanto a tela do dia está aberta. */
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [detalheDia, setDetalheDia] = useState<DiaristaDia | null>(null);

  useEffect(() => {
    if (!open) return;
    setAno(year);
    setMes(month);
    setPendingDate(null);
    setError(null);
    setCopiado(false);
    // depende do ID, não do objeto: cada revalidação do servidor devolve um
    // objeto novo, e o mês que o chefe estava olhando não pode pular sozinho
    // toda vez que ele lança um dia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, year, month, diarista?.id]);

  const meusDias = useMemo(
    () => dias.filter((d) => d.diarista_id === diarista?.id),
    [dias, diarista?.id]
  );

  const launched = useMemo(() => {
    const map = new Map<string, DiaristaDia>();
    for (const d of meusDias) map.set(d.work_date, d);
    return map;
  }, [meusDias]);

  const { from, to } = monthRange(ano, mes);
  const doMes = useMemo(
    () =>
      meusDias
        .filter((d) => d.work_date >= from && d.work_date <= to)
        .sort((a, b) => b.work_date.localeCompare(a.work_date)),
    [meusDias, from, to]
  );
  const totalMes = doMes.reduce((s, d) => s + Number(d.daily_rate), 0);

  const obraNome = useMemo(
    () => new Map(obras.map((o) => [o.id, o.name])),
    [obras]
  );

  function stepMonth(delta: number) {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  }

  async function copiarPix() {
    if (!diarista?.pix_key) return;
    try {
      await navigator.clipboard.writeText(diarista.pix_key);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("Não deu para copiar — selecione a chave na mão");
    }
  }

  function handleArquivar() {
    if (!diarista) return;
    setError(null);
    startTransition(async () => {
      const r = await setDiaristaActive(diarista.id, !diarista.active);
      if (r && "error" in r) setError(r.error ?? "Erro ao salvar");
      else onClose();
    });
  }

  function handleApagar() {
    if (!diarista) return;
    const aviso =
      diarista.days_count > 0
        ? `Apagar ${diarista.name} APAGA JUNTO os ${diarista.days_count} dias lançados dele. Para só tirar da lista use "Arquivar". Apagar mesmo assim?`
        : `Apagar ${diarista.name} do cadastro?`;
    if (!confirm(aviso)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteDiarista(diarista.id);
      if (r && "error" in r) setError(r.error ?? "Erro ao apagar");
      else onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 dark:text-slate-100">
            <span className="w-9 h-9 rounded-xl bg-produmar-50 dark:bg-produmar-900/40 text-produmar-600 dark:text-produmar-300 flex items-center justify-center flex-shrink-0 text-xs font-bold">
              {getInitials(diarista?.name)}
            </span>
            <span className="min-w-0 truncate">{diarista?.name}</span>
          </DialogTitle>
        </DialogHeader>

        {diarista && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <Wallet className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Diária</span>
                <span className="ml-auto text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                  {Number(diarista.daily_rate) > 0
                    ? formatBRL(Number(diarista.daily_rate))
                    : "não combinada"}
                </span>
              </div>

              {diarista.pix_key && (
                <button
                  type="button"
                  onClick={copiarPix}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
                >
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                    PIX
                  </span>
                  <span className="text-sm text-slate-800 dark:text-slate-100 truncate flex-1 min-w-0">
                    {diarista.pix_key}
                  </span>
                  {copiado ? (
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  )}
                </button>
              )}

              {diarista.phone && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">Telefone</span>
                  <span className="ml-auto text-sm text-slate-800 dark:text-slate-100">
                    {diarista.phone}
                  </span>
                </div>
              )}
            </div>

            {/* Calendário — o chefe também marca dia (quando o técnico esquece) */}
            <DiaristaCalendar
              year={ano}
              month={mes}
              onPrevMonth={() => stepMonth(-1)}
              onNextMonth={() => stepMonth(1)}
              launched={launched}
              selected={pendingDate ? new Set([pendingDate]) : NENHUM}
              onToggle={setPendingDate}
              onOpenLaunched={setDetalheDia}
            />

            {/* O mês fechado: dia a dia e o total */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {doMes.length === 0
                    ? "Nenhuma diária neste mês"
                    : doMes.length === 1
                      ? "1 diária no mês"
                      : `${doMes.length} diárias no mês`}
                </span>
                {totalMes > 0 && (
                  <span className="text-sm font-semibold text-produmar-700 dark:text-produmar-400 tabular-nums">
                    {formatBRL(totalMes)}
                  </span>
                )}
              </div>

              {doMes.length > 0 && (
                <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                  {doMes.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setDetalheDia(d)}
                        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
                      >
                        <span className="w-11 flex-shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums pt-0.5">
                          {formatDate(d.work_date).slice(0, 5)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-slate-800 dark:text-slate-100 truncate">
                            {d.description || "—"}
                          </span>
                          {d.obra_id && (
                            <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                              <HardHat className="w-3 h-3 flex-shrink-0" />
                              {obraNome.get(d.obra_id) ?? "obra apagada"}
                            </span>
                          )}
                        </span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums flex-shrink-0">
                          {formatBRL(Number(d.daily_rate))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-12"
                onClick={() => onEdit(diarista)}
                disabled={isPending}
              >
                <Pencil className="w-4 h-4" />
                Editar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-12"
                onClick={handleArquivar}
                disabled={isPending}
              >
                {diarista.active ? (
                  <>
                    <Archive className="w-4 h-4" />
                    Arquivar
                  </>
                ) : (
                  <>
                    <ArchiveRestore className="w-4 h-4" />
                    Reativar
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={handleApagar}
                disabled={isPending}
                aria-label={`Apagar ${diarista.name}`}
                className="w-12 h-12 flex items-center justify-center rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Arquivar tira da lista do técnico e guarda o histórico. Apagar leva os
              dias lançados junto.
            </p>
          </div>
        )}

        <LancarDiaDialog
          open={!!pendingDate}
          onClose={() => setPendingDate(null)}
          diarista={diarista}
          date={pendingDate}
          obras={obras}
          sectors={sectors}
          onSaved={() => setPendingDate(null)}
        />

        <DiaDetailDialog
          open={!!detalheDia}
          onClose={() => setDetalheDia(null)}
          dia={detalheDia}
          diaristaName={diarista?.name ?? ""}
          obras={obras}
          sectors={sectors}
          canEdit
          canDelete
        />
      </DialogContent>
    </Dialog>
  );
}
