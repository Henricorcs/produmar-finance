"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { HandCoins, Plus, RotateCcw, Trash2, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatBRL,
  formatBRLInput,
  formatDate,
  localDateISO,
  parseMoney,
  upperKeepingCaret,
} from "@/lib/utils";
import {
  createDiaristaAcerto,
  createDiaristaAdiantamento,
  deleteDiaristaAcerto,
  deleteDiaristaAdiantamento,
} from "@/app/(app)/diaristas/actions";
import type {
  DiaristaAcerto,
  DiaristaAdiantamento,
  DiaristaDia,
  DiaristaResumo,
  SupplyObraServicoView,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  diarista: DiaristaResumo | null;
  /** Adiantamentos de todo mundo — o diálogo filtra os desta pessoa. */
  adiantamentos: DiaristaAdiantamento[];
  /** Acertos de todo mundo — idem. */
  acertos: DiaristaAcerto[];
  /**
   * Os dias lançados. Servem para calcular o acerto NA DATA DE CORTE escolhida:
   * os três números do topo são a conta inteira, mas quem acerta até sábado não
   * pode ver na tela o valor que inclui o domingo.
   */
  dias: DiaristaDia[];
  /** Os serviços fechados (069) — entram no mesmo corte que as diárias. */
  servicos?: SupplyObraServicoView[];
}

/**
 * A CONTA do colaborador: o que ele tem a receber, o que já pegou adiantado e o
 * que sobra para pagar no acerto.
 *
 * O que ele tem a receber vem de duas origens: as DIÁRIAS marcadas no
 * calendário e os SERVIÇOS fechados no setor da obra — empreita ou metro. O
 * empreiteiro fecha a conta pela mesma porta que o diarista.
 *
 * O adiantamento é o vale do meio da semana. O acerto é o pagamento: fecha as
 * diárias e os serviços em aberto, desconta os vales e pinta aqueles dias de
 * CINZA no calendário — a partir dali nada disso entra na próxima semana.
 */
export function AcertoDialog({
  open,
  onClose,
  diarista,
  adiantamentos,
  acertos,
  dias,
  servicos = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // novo adiantamento
  const [valeData, setValeData] = useState(localDateISO());
  const [valeValor, setValeValor] = useState("");
  const [valeObs, setValeObs] = useState("");

  // acerto
  const [acertoData, setAcertoData] = useState(localDateISO());

  useEffect(() => {
    if (!open) return;
    setValeData(localDateISO());
    setValeValor("");
    setValeObs("");
    setAcertoData(localDateISO());
    setError(null);
  }, [open, diarista?.id]);

  const meusVales = useMemo(
    () => adiantamentos.filter((v) => v.diarista_id === diarista?.id),
    [adiantamentos, diarista?.id]
  );

  /** Os vales que ainda serão descontados — os outros já foram num acerto. */
  const valesAbertos = useMemo(
    () =>
      meusVales
        .filter((v) => !v.acerto_id)
        .sort((a, b) => b.advance_date.localeCompare(a.advance_date)),
    [meusVales]
  );

  const meusAcertos = useMemo(
    () =>
      acertos
        .filter((a) => a.diarista_id === diarista?.id)
        .sort((a, b) => b.settled_on.localeCompare(a.settled_on)),
    [acertos, diarista?.id]
  );

  // A conta inteira, do jeito que o banco soma (view da migration 068)
  const aReceber = Number(diarista?.pending_value ?? 0);
  const adiantado = Number(diarista?.advance_pending ?? 0);
  const saldo = Number(diarista?.balance ?? aReceber - adiantado);
  const diasAbertos = Number(diarista?.pending_days ?? 0);
  const servicosAbertosTotal = Number(diarista?.pending_services ?? 0);

  /**
   * O que ENTRA neste acerto: só o que aconteceu até a data de corte — diárias
   * E serviços. É a mesma conta que o servidor refaz na hora de gravar; aqui
   * ela existe para o botão não prometer um valor diferente do que vai ser pago.
   */
  const doAcerto = useMemo(() => {
    const diasNoCorte = dias.filter(
      (d) => d.diarista_id === diarista?.id && !d.acerto_id && d.work_date <= acertoData
    );
    const servicosNoCorte = servicos.filter(
      (s) =>
        s.diarista_id === diarista?.id && !s.acerto_id && s.service_date <= acertoData
    );
    const valesNoCorte = valesAbertos.filter((v) => v.advance_date <= acertoData);
    const totalDiarias = diasNoCorte.reduce((s, d) => s + Number(d.daily_rate), 0);
    const totalServicos = servicosNoCorte.reduce(
      (s, v) => s + Number(v.total_value),
      0
    );
    const totalVales = valesNoCorte.reduce((s, v) => s + Number(v.amount), 0);
    return {
      dias: diasNoCorte.length,
      servicos: servicosNoCorte.length,
      vales: valesNoCorte.length,
      totalDiarias,
      totalServicos,
      /** O que ele tem a receber neste corte, das duas origens somadas. */
      totalDias: totalDiarias + totalServicos,
      totalVales,
      aPagar: totalDiarias + totalServicos - totalVales,
    };
  }, [dias, servicos, valesAbertos, diarista?.id, acertoData]);

  /** O corte deixou algo de fora? Então vale avisar, para ninguém se assustar. */
  const sobraForaDoCorte =
    diasAbertos > doAcerto.dias ||
    servicosAbertosTotal > doAcerto.servicos ||
    valesAbertos.length > doAcerto.vales;

  function handleAddVale(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const valor = parseMoney(valeValor);
    if (valor <= 0) {
      setError("Informe o valor do adiantamento");
      return;
    }
    startTransition(async () => {
      const r = await createDiaristaAdiantamento({
        diarista_id: diarista!.id,
        advance_date: valeData,
        amount: valor,
        notes: valeObs,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao lançar o adiantamento");
        return;
      }
      setValeValor("");
      setValeObs("");
      setValeData(localDateISO());
    });
  }

  function handleDeleteVale(v: DiaristaAdiantamento) {
    if (!confirm(`Apagar o adiantamento de ${formatBRL(Number(v.amount))}?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteDiaristaAdiantamento(v.id);
      if (r && "error" in r) setError(r.error ?? "Erro ao apagar");
    });
  }

  function handleAcerto() {
    setError(null);
    const msg =
      `Fechar o acerto de ${diarista!.name} até ${formatDate(acertoData)}?\n\n` +
      (doAcerto.totalDiarias > 0
        ? `Diárias: ${formatBRL(doAcerto.totalDiarias)}\n`
        : "") +
      (doAcerto.totalServicos > 0
        ? `Serviços: ${formatBRL(doAcerto.totalServicos)}\n`
        : "") +
      `Adiantado: −${formatBRL(doAcerto.totalVales)}\n` +
      `A pagar agora: ${formatBRL(doAcerto.aPagar)}\n\n` +
      `Esses dias ficam cinza no calendário e os serviços saem da conta da próxima semana.`;
    if (!confirm(msg)) return;

    startTransition(async () => {
      const r = await createDiaristaAcerto({
        diarista_id: diarista!.id,
        settled_on: acertoData,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao registrar o acerto");
        return;
      }
      onClose();
    });
  }

  function handleDesfazer(a: DiaristaAcerto) {
    if (
      !confirm(
        `Desfazer o acerto de ${formatDate(a.settled_on)}?\n\nAs diárias e os serviços voltam a contar como em aberto e os adiantamentos daquele acerto voltam a ser descontados.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteDiaristaAcerto(a.id);
      if (r && "error" in r) setError(r.error ?? "Erro ao desfazer");
    });
  }

  if (!diarista) return null;

  // olha o que entra NESTE corte, não a conta inteira: com a data recuada para
  // antes da primeira diária não há acerto a fazer, e o botão tem que dizer isso
  const podeAcertar =
    doAcerto.dias > 0 || doAcerto.servicos > 0 || doAcerto.vales > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100 pr-8">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <HandCoins className="w-4 h-4" />
            </span>
            Acerto e adiantamentos
          </DialogTitle>
          <p className="text-[11px] text-slate-400">{diarista.name}</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* A conta: os três números que o chefe olha antes de pagar */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
            <Linha
              label="Valor a receber"
              hint={
                [
                  diasAbertos > 0
                    ? `${diasAbertos} ${diasAbertos === 1 ? "diária" : "diárias"}`
                    : null,
                  servicosAbertosTotal > 0
                    ? `${servicosAbertosTotal} ${servicosAbertosTotal === 1 ? "serviço" : "serviços"}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" + ") || "nada em aberto"
              }
              valor={formatBRL(aReceber)}
            />
            <Linha
              label="Valor adiantado"
              hint={
                valesAbertos.length > 0
                  ? `${valesAbertos.length} ${valesAbertos.length === 1 ? "vale" : "vales"}`
                  : "nenhum vale em aberto"
              }
              valor={adiantado > 0 ? `− ${formatBRL(adiantado)}` : formatBRL(0)}
              tom={adiantado > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
            />
            <div className="flex items-center gap-2 px-3 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-b-xl">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                Saldo a receber
              </span>
              <span
                className={`ml-auto text-lg font-bold tabular-nums ${
                  saldo < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {formatBRL(saldo)}
              </span>
            </div>
          </div>

          {saldo < 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded-lg px-3 py-2">
              Ele pegou mais adiantado do que trabalhou até agora. Não dá para fechar o
              acerto assim — esse saldo continua valendo e desconta nas próximas diárias.
            </p>
          )}

          {/* Novo adiantamento */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-slate-400" />
              Lançar adiantamento
            </p>
            <form onSubmit={handleAddVale} className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="vale_valor" className="text-[11px]">
                    Valor *
                  </Label>
                  <Input
                    id="vale_valor"
                    value={valeValor}
                    onChange={(e) => setValeValor(formatBRLInput(e.target.value))}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="tabular-nums font-semibold"
                    autoComplete="off"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="vale_data" className="text-[11px]">
                    Data
                  </Label>
                  <Input
                    id="vale_data"
                    type="date"
                    value={valeData}
                    onChange={(e) => setValeData(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  value={valeObs}
                  onChange={(e) => setValeObs(upperKeepingCaret(e))}
                  placeholder="observação (opcional)"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
                <Button type="submit" disabled={isPending || !valeValor.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </form>
          </div>

          {/* Vales ainda não descontados */}
          {valesAbertos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Adiantamentos em aberto
              </p>
              <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {valesAbertos.map((v) => (
                  <li key={v.id} className="flex items-center gap-2.5 px-3 py-2">
                    <span className="w-11 flex-shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatDate(v.advance_date).slice(0, 5)}
                    </span>
                    <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">
                      {v.notes || "adiantamento"}
                    </span>
                    <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums flex-shrink-0">
                      {formatBRL(Number(v.amount))}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteVale(v)}
                      disabled={isPending}
                      aria-label="Apagar adiantamento"
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Fechar a semana */}
          <div className="space-y-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Acerto semanal
            </p>
            <div className="space-y-1">
              <Label htmlFor="acerto_data" className="text-[11px]">
                Acertar tudo até o dia
              </Label>
              <Input
                id="acerto_data"
                type="date"
                value={acertoData}
                onChange={(e) => setAcertoData(e.target.value)}
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Diária ou serviço lançado depois dessa data continua em aberto para a
                próxima semana.
              </p>
            </div>

            {podeAcertar && (
              <div className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums space-y-0.5">
                {doAcerto.dias > 0 && (
                  <p>
                    {doAcerto.dias} {doAcerto.dias === 1 ? "diária" : "diárias"} ·{" "}
                    {formatBRL(doAcerto.totalDiarias)}
                  </p>
                )}
                {doAcerto.servicos > 0 && (
                  <p className="text-teal-700 dark:text-teal-400">
                    {doAcerto.servicos} {doAcerto.servicos === 1 ? "serviço" : "serviços"}{" "}
                    · {formatBRL(doAcerto.totalServicos)}
                  </p>
                )}
                {doAcerto.totalVales > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">
                    menos {doAcerto.vales}{" "}
                    {doAcerto.vales === 1 ? "adiantamento" : "adiantamentos"} ·{" "}
                    −{formatBRL(doAcerto.totalVales)}
                  </p>
                )}
                {sobraForaDoCorte && (
                  <p className="text-slate-500 dark:text-slate-400">
                    O que veio depois dessa data fica para o próximo acerto.
                  </p>
                )}
              </div>
            )}

            <Button
              type="button"
              className="w-full"
              onClick={handleAcerto}
              disabled={isPending || !podeAcertar || doAcerto.aPagar < 0}
            >
              {podeAcertar
                ? `Registrar acerto de ${formatBRL(doAcerto.aPagar)}`
                : "Nada em aberto para acertar"}
            </Button>
          </div>

          {/* O que já foi pago */}
          {meusAcertos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Acertos anteriores
              </p>
              <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                {meusAcertos.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 tabular-nums">
                        {formatDate(a.settled_on)}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        a receber {formatBRL(Number(a.days_total))}
                        {Number(a.advance_total) > 0 &&
                          ` · adiantado −${formatBRL(Number(a.advance_total))}`}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
                      {formatBRL(Number(a.amount_paid))}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDesfazer(a)}
                      disabled={isPending}
                      aria-label="Desfazer acerto"
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-produmar-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 flex-shrink-0"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="button" variant="outline" className="w-full" onClick={onClose}>
            Voltar para a ficha
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Linha({
  label,
  hint,
  valor,
  tom,
}: {
  label: string;
  hint: string;
  valor: string;
  tom?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-slate-600 dark:text-slate-300">{label}</p>
        <p className="text-[11px] text-slate-400">{hint}</p>
      </div>
      <span
        className={`ml-auto text-sm font-semibold tabular-nums flex-shrink-0 ${
          tom ?? "text-slate-800 dark:text-slate-100"
        }`}
      >
        {valor}
      </span>
    </div>
  );
}
