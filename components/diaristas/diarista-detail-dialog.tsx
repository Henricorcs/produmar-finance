"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  HandCoins,
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
import { formatBRL, formatDate, getInitials, servicoConta } from "@/lib/utils";
import { deleteDiarista, setDiaristaActive } from "@/app/(app)/diaristas/actions";
import { DiaristaCalendar, monthRange } from "./diarista-shared";
import {
  LancarDiaDialog,
  type DiaristaMaquina,
  type DiaristaObra,
} from "./lancar-dia-dialog";
import { DiaDetailDialog } from "./dia-detail-dialog";
import { temServicoAberto } from "@/lib/maquina-na-diaria";
import {
  PAYMENT_MODE_LABEL,
  PAYMENT_MODE_RATE_LABEL,
  WORKER_TYPE_LABEL,
  type DiaristaDia,
  type DiaristaResumo,
  type PaymentMode,
  type SupplyObraSector,
  type SupplyObraServicoView,
} from "@/lib/types";

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
  /** Cadastro de Máquinas e Veículos, para a máquina pesada da diária (132). */
  maquinas?: DiaristaMaquina[];
  /** A migration 133 já rodou? */
  maquinaPronta?: boolean;
  /** Serviços de todo mundo — o diálogo filtra os desta pessoa (069). */
  servicos?: SupplyObraServicoView[];
  /** Mês que está aberto na tela, para o calendário começar no mesmo lugar. */
  year: number;
  month: number;
  onEdit: (diarista: DiaristaResumo) => void;
  /**
   * Abre a conta dele — adiantamentos e acerto. Quem cuida desse diálogo é a
   * página: aberto por cima deste, os dois se atropelariam.
   */
  onAcerto: (diarista: DiaristaResumo) => void;
}

/**
 * A ficha do colaborador para o chefe: o tipo e a profissão dele, quanto ganha
 * por dia, a chave PIX para pagar, o calendário do mês — que aqui também é
 * editável, porque quando o técnico esquece de marcar quem sobra é o escritório
 * — e os serviços por empreita/metro que ele fechou nas obras.
 */
export function DiaristaDetailDialog({
  open,
  onClose,
  diarista,
  dias,
  obras,
  sectors,
  maquinas = [],
  maquinaPronta = false,
  servicos = [],
  year,
  month,
  onEdit,
  onAcerto,
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
  // o valor da meia diária já entra pela metade no lançamento (migration 064)
  const totalMes = doMes.reduce((s, d) => s + Number(d.daily_rate), 0);
  const meiasDoMes = doMes.filter((d) => d.half_day).length;

  const obraNome = useMemo(
    () => new Map(obras.map((o) => [o.id, o.name])),
    [obras]
  );

  /** Os serviços dele — todos, não só os do mês: uma empreita atravessa meses. */
  const meusServicos = useMemo(
    () =>
      servicos
        .filter((s) => s.diarista_id === diarista?.id)
        .sort((a, b) => b.service_date.localeCompare(a.service_date)),
    [servicos, diarista?.id]
  );
  const servicosAbertos = meusServicos.filter((s) => !s.acerto_id);

  /** Como ele é pago e quanto vale essa forma — o preço combinado no cadastro. */
  const modoPagamento: PaymentMode = diarista?.payment_mode ?? "diaria";
  /** O CLT ganha o salário do mês: o preço dele é esse, não a diária (098). */
  const clt = diarista?.worker_type === "clt";
  const precoCombinado = clt
    ? Number(diarista?.monthly_salary ?? 0)
    : modoPagamento === "metro"
      ? Number(diarista?.meter_rate ?? 0)
      : modoPagamento === "obra"
        ? Number(diarista?.job_rate ?? 0)
        : Number(diarista?.daily_rate ?? 0);

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
        : meusServicos.length > 0
          ? `Apagar ${diarista.name} do cadastro? Os ${meusServicos.length} serviços dele continuam no custo das obras, só ficam sem dono.`
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
          {diarista && (
            <p className="text-[11px] text-slate-400">
              {WORKER_TYPE_LABEL[diarista.worker_type ?? "diarista"]}
              {diarista.profession ? ` · ${diarista.profession}` : ""}
              {diarista.worker_type === "empreiteiro"
                ? ` · ${PAYMENT_MODE_LABEL[modoPagamento].toLowerCase()}`
                : ""}
            </p>
          )}
        </DialogHeader>

        {diarista && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {/*
                O preço combinado com ele, do jeito que foi combinado. Mostrar
                sempre "Diária" escondia o essencial de um empreiteiro pago no
                metro — que é justamente o valor do metro.
              */}
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <Wallet className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {clt ? "Salário mensal" : PAYMENT_MODE_RATE_LABEL[modoPagamento]}
                </span>
                <span className="ml-auto text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                  {precoCombinado > 0
                    ? `${formatBRL(precoCombinado)}${modoPagamento === "metro" ? "/m" : ""}`
                    : clt
                      ? "não informado"
                      : "não combinado"}
                </span>
              </div>

              {/* A diária continua aparecendo à parte quando ele também vem por dia */}
              {(modoPagamento !== "diaria" || clt) && Number(diarista.daily_rate) > 0 && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <Wallet className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Diária, quando vem por dia
                  </span>
                  <span className="ml-auto text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                    {formatBRL(Number(diarista.daily_rate))}
                  </span>
                </div>
              )}

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

            {/* A conta dele: o que se deve hoje, já descontando os vales */}
            <button
              type="button"
              onClick={() => onAcerto(diarista)}
              className="w-full rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 text-left active:bg-emerald-100/60 dark:active:bg-emerald-950/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  {clt ? "Adiantamento e salário" : "Adiantamento e acerto"}
                </span>
                <span className="ml-auto text-[11px] text-emerald-700/70 dark:text-emerald-400/70">
                  tocar para abrir
                </span>
              </div>

              {/* De onde vem o "a receber": dia trabalhado e serviço fechado */}
              {(Number(diarista.pending_days ?? 0) > 0 ||
                Number(diarista.pending_services ?? 0) > 0 ||
                Number(diarista.salary_pending ?? 0) > 0) && (
                <p className="mt-1 text-[11px] text-emerald-700/80 dark:text-emerald-400/80 tabular-nums">
                  {[
                    Number(diarista.salary_pending ?? 0) > 0
                      ? `salário do mês · ${formatBRL(Number(diarista.salary_pending))}`
                      : null,
                    Number(diarista.pending_days ?? 0) > 0
                      ? `${diarista.pending_days} ${Number(diarista.pending_days) === 1 ? "diária" : "diárias"} · ${formatBRL(Number(diarista.pending_days_value ?? 0))}`
                      : null,
                    Number(diarista.pending_services ?? 0) > 0
                      ? `${diarista.pending_services} ${Number(diarista.pending_services) === 1 ? "serviço" : "serviços"} · ${formatBRL(Number(diarista.pending_services_value ?? 0))}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join("  +  ")}
                </p>
              )}

              <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                <Conta
                  label="A receber"
                  valor={formatBRL(Number(diarista.pending_value ?? 0))}
                />
                <Conta
                  label="Adiantado"
                  valor={formatBRL(Number(diarista.advance_pending ?? 0))}
                  tom="text-amber-600 dark:text-amber-400"
                />
                <Conta
                  label="Saldo"
                  valor={formatBRL(Number(diarista.balance ?? 0))}
                  tom={
                    Number(diarista.balance ?? 0) < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-700 dark:text-emerald-400"
                  }
                  forte
                />
              </div>
            </button>

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
                    : `${doMes.length} ${doMes.length === 1 ? "diária" : "diárias"} no mês${
                        meiasDoMes > 0
                          ? ` · ${meiasDoMes} ${meiasDoMes === 1 ? "meia" : "meias"}`
                          : ""
                      }`}
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
                        <span className="text-right flex-shrink-0">
                          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                            {formatBRL(Number(d.daily_rate))}
                          </span>
                          {d.half_day && (
                            <span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              meia
                            </span>
                          )}
                          {temServicoAberto(d) && (
                            <span className="block text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                              em aberto
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Os serviços dele — a metade que não passa pelo calendário */}
            {meusServicos.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <HardHat className="w-3.5 h-3.5 text-teal-600" />
                    Serviços fechados
                  </span>
                  {servicosAbertos.length > 0 && (
                    <span className="text-[11px] text-teal-700 dark:text-teal-400 tabular-nums">
                      {servicosAbertos.length} em aberto
                    </span>
                  )}
                </div>
                <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 max-h-52 overflow-y-auto">
                  {meusServicos.map((s) => (
                    <li key={s.id} className="flex items-start gap-2.5 px-3 py-2.5">
                      <span className="w-11 flex-shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums pt-0.5">
                        {formatDate(s.service_date).slice(0, 5)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-slate-800 dark:text-slate-100 truncate">
                          {s.service_type}
                          {s.is_obra_contract && (
                            <span className="ml-1.5 text-[10px] font-semibold text-produmar-600 dark:text-produmar-400">
                              obra inteira
                            </span>
                          )}
                        </span>
                        {/* a conta por extenso: 10 M × R$ 2,00 = R$ 20,00 */}
                        <span className="block text-[11px] font-medium text-teal-700 dark:text-teal-400 tabular-nums truncate">
                          {servicoConta(s).formula
                            ? `${servicoConta(s).formula} = ${servicoConta(s).total}`
                            : `empreita = ${servicoConta(s).total}`}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                          <HardHat className="w-3 h-3 flex-shrink-0" />
                          {s.obra_name}
                          {s.sector_name ? ` · ${s.sector_name}` : ""}
                        </span>
                      </span>
                      <span className="text-right flex-shrink-0">
                        <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatBRL(Number(s.total_value))}
                        </span>
                        {s.acerto_id && (
                          <span className="block text-[10px] font-semibold text-slate-400">
                            pago
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  O serviço é combinado em Obras, dentro do setor. Aqui ele só é pago.
                </p>
              </div>
            )}

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
              Arquivar tira da lista do encarregado de obra e guarda o histórico. Apagar leva os
              dias lançados junto; os serviços ficam nas obras, sem dono.
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
          maquinas={maquinas}
          maquinaPronta={maquinaPronta}
          onSaved={() => setPendingDate(null)}
        />

        <DiaDetailDialog
          open={!!detalheDia}
          onClose={() => setDetalheDia(null)}
          // o dia atualizado: fechar um serviço precisa aparecer na hora
          dia={detalheDia ? launched.get(detalheDia.work_date) ?? detalheDia : null}
          diaristaName={diarista?.name ?? ""}
          obras={obras}
          sectors={sectors}
          maquinas={maquinas}
          maquinaPronta={maquinaPronta}
          canEdit
          canDelete
        />
      </DialogContent>
    </Dialog>
  );
}

/** Um dos três números da conta do diarista, no bloco verde da ficha. */
function Conta({
  label,
  valor,
  tom,
  forte,
}: {
  label: string;
  valor: string;
  tom?: string;
  forte?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none">
        {label}
      </p>
      <p
        className={`mt-1 tabular-nums leading-none ${forte ? "text-base font-bold" : "text-sm font-semibold"} ${
          tom ?? "text-slate-800 dark:text-slate-100"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}
