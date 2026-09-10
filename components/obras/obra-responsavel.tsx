"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays, HandCoins, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatQtyInput, num, parseQty } from "@/components/almoxarifado/supply-shared";
import {
  deleteSupplyObraFechamento,
  saveSupplyObraFechamento,
  setSupplyObraResponsavel,
} from "@/app/(app)/almoxarifado/actions";
import {
  formatBRL,
  formatBRLInput,
  formatQty,
  localDateISO,
  parseMoney,
  upperKeepingCaret,
} from "@/lib/utils";
import {
  PAYMENT_MODE_LABEL,
  SERVICOS_SUGERIDOS,
  WORKER_TYPE_LABEL,
  type Diarista,
  type PaymentMode,
  type SupplyObraServicoView,
  type SupplyObraUsage,
} from "@/lib/types";

interface Props {
  obra: SupplyObraUsage;
  /** Quem pode ser responsável — o cadastro de Colaboradores. */
  colaboradores: Diarista[];
  /** O fechamento já lançado desta obra, quando existe. */
  fechamento: SupplyObraServicoView | null;
}

/**
 * O RESPONSÁVEL PELA OBRA — quem toca o serviço — e o acerto com ele.
 *
 * A ideia é não perguntar duas vezes a mesma coisa: escolhido o colaborador, o
 * sistema já SABE como ele é pago, porque isso está na ficha dele (migration
 * 070). A tela só pede o que falta para fechar a conta:
 *
 *   • pago NO VALOR DA OBRA → o preço já vem da ficha; é só conferir;
 *   • pago NO METRO         → falta a metragem, e a conta sai na hora;
 *   • pago NA DIÁRIA        → não falta nada: ele recebe pelos dias marcados
 *                             no calendário, e a tela só mostra quanto já é.
 *
 * O valor daqui cai direto no "a receber" dele, em Colaboradores, e é quitado
 * no mesmo acerto das diárias.
 */
export function ObraResponsavel({ obra, colaboradores, fechamento }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [serviceType, setServiceType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(localDateISO());

  const modo: PaymentMode = obra.responsavel_payment_mode ?? "diaria";
  const metro = modo === "metro";
  const naDiaria = modo === "diaria";

  /** O preço combinado na ficha dele — é o que vale, salvo troca aqui. */
  const precoFicha = metro
    ? num(obra.responsavel_meter_rate)
    : num(obra.responsavel_job_rate);

  useEffect(() => {
    setError(null);
    setServiceType(fechamento?.service_type ?? "");
    setQuantity(
      fechamento && num(fechamento.quantity) > 0
        ? formatQtyInput(String(num(fechamento.quantity)).replace(".", ","))
        : ""
    );
    // o preço travado do fechamento, ou o da ficha — nunca em branco, para
    // ninguém achar que o valor ainda não foi combinado
    const precoAtual = fechamento
      ? metro
        ? num(fechamento.rate_per_unit)
        : num(fechamento.contract_amount)
      : precoFicha;
    setRate(precoAtual > 0 ? formatBRLInput(precoAtual) : "");
    setDate(fechamento?.service_date ?? localDateISO());
  }, [fechamento, metro, precoFicha, obra.responsavel_id]);

  /** Só colaborador ativo pode ser responsável — arquivado não toca obra. */
  const candidatos = useMemo(
    () =>
      colaboradores
        .filter((c) => c.active || c.id === obra.responsavel_id)
        .sort((a, b) => {
          // empreiteiro primeiro: é quem costuma tocar a obra
          const ea = a.worker_type === "empreiteiro" ? 0 : 1;
          const eb = b.worker_type === "empreiteiro" ? 0 : 1;
          if (ea !== eb) return ea - eb;
          return a.name.localeCompare(b.name);
        }),
    [colaboradores, obra.responsavel_id]
  );

  /** O que vai ser pago pelo fechamento, com a conta à vista. */
  const preco = parseMoney(rate);
  const total = metro ? parseQty(quantity) * preco : preco;
  const jaFechado = num(fechamento?.total_value) > 0;
  const travado = !!fechamento?.acerto_id;

  function trocarResponsavel(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await setSupplyObraResponsavel(obra.id, id || null);
      if (r && "error" in r) setError(r.error ?? "Erro ao salvar o responsável");
    });
  }

  function salvar() {
    setError(null);
    if (metro && parseQty(quantity) <= 0) {
      setError("Informe a metragem da obra");
      return;
    }
    if (preco <= 0) {
      setError(metro ? "Informe o valor do metro" : "Informe o valor da obra");
      return;
    }
    startTransition(async () => {
      const r = await saveSupplyObraFechamento({
        obra_id: obra.id,
        service_type: serviceType,
        quantity: parseQty(quantity),
        rate: preco,
        service_date: date,
      });
      if (r && "error" in r) setError(r.error ?? "Erro ao salvar o fechamento");
    });
  }

  function desfazer() {
    if (
      !confirm(
        `Tirar o fechamento de ${formatBRL(num(fechamento?.total_value))} desta obra? Ele sai do custo da obra e do que ${obra.responsavel_name ?? "ele"} tem a receber.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteSupplyObraFechamento(obra.id);
      if (r && "error" in r) setError(r.error ?? "Erro ao desfazer");
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-produmar-100 dark:border-slate-700 bg-produmar-50/40 dark:bg-slate-800/40 p-3">
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <UserCog className="w-3.5 h-3.5 text-produmar-600 dark:text-produmar-400" />
          Responsável pela obra
        </Label>
        <SearchableSelect
          items={candidatos}
          value={obra.responsavel_id ?? ""}
          onChange={trocarResponsavel}
          getId={(c) => c.id}
          getLabel={(c) => c.name}
          renderItem={(c) => (
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="truncate">{c.name}</span>
              <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[8rem]">
                {c.profession || WORKER_TYPE_LABEL[c.worker_type ?? "diarista"]}
              </span>
            </div>
          )}
          placeholder="Toque para escolher quem toca a obra..."
          searchPlaceholder="Buscar colaborador..."
          emptyMessage="Nenhum colaborador cadastrado"
        />
        {!obra.responsavel_id && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Escolhendo o responsável, o sistema já mostra como ele é pago — a forma
            vem da ficha dele, em Colaboradores.
          </p>
        )}
      </div>

      {obra.responsavel_id && (
        <>
          {/* Como ele é pago — a informação que vem pronta da ficha dele */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 flex items-center gap-2">
            <HandCoins className="w-4 h-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {obra.responsavel_name}
                {obra.responsavel_profession ? ` · ${obra.responsavel_profession}` : ""}
              </p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {PAYMENT_MODE_LABEL[modo]}
                <span className="ml-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 tabular-nums">
                  {naDiaria
                    ? `${formatBRL(num(obra.responsavel_daily_rate))}/dia`
                    : metro
                      ? `${formatBRL(precoFicha)}/m`
                      : formatBRL(precoFicha)}
                </span>
              </p>
            </div>
          </div>

          {naDiaria ? (
            /*
              Pago por dia: não há fechamento a lançar. O valor dele nesta obra
              é a soma das diárias já marcadas no calendário, que JÁ estão no
              "a receber". Mostrar isso aqui evita alguém lançar um fechamento
              por cima e pagar a mesma coisa duas vezes.
            */
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2.5 space-y-1">
              <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                Recebe pelos dias trabalhados
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                {num(obra.responsavel_days_count)}{" "}
                {num(obra.responsavel_days_count) === 1 ? "diária" : "diárias"} nesta obra
                ={" "}
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {formatBRL(num(obra.responsavel_days_value))}
                </span>
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Já está no &quot;a receber&quot; dele. Os dias são marcados no calendário,
                em Colaboradores — não há fechamento a lançar aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="fe_tipo">O que foi feito na obra</Label>
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                  {SERVICOS_SUGERIDOS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={travado}
                      onClick={() => setServiceType(serviceType === s ? "" : s)}
                      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors disabled:opacity-40 ${
                        serviceType === s
                          ? "bg-teal-600 border-teal-600 text-white"
                          : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <Input
                  id="fe_tipo"
                  value={serviceType}
                  onChange={(e) => setServiceType(upperKeepingCaret(e))}
                  placeholder="ex: cerca (em branco vira OBRA)"
                  autoCapitalize="characters"
                  autoComplete="off"
                  disabled={travado}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {metro && (
                  <div className="space-y-1.5">
                    <Label htmlFor="fe_qtd">Metragem da obra *</Label>
                    <Input
                      id="fe_qtd"
                      value={quantity}
                      onChange={(e) => setQuantity(formatQtyInput(e.target.value))}
                      placeholder="0"
                      inputMode="decimal"
                      className="h-12 tabular-nums text-lg font-semibold"
                      autoComplete="off"
                      disabled={travado}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="fe_rate">
                    {metro ? "Valor do metro *" : "Valor da obra *"}
                  </Label>
                  <Input
                    id="fe_rate"
                    value={rate}
                    onChange={(e) => setRate(formatBRLInput(e.target.value))}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="h-12 tabular-nums text-lg font-semibold"
                    autoComplete="off"
                    disabled={travado}
                  />
                </div>
              </div>

              {precoFicha > 0 && preco !== precoFicha && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Diferente da ficha dele ({formatBRL(precoFicha)}
                  {metro ? "/m" : ""}) — esta obra foi combinada por outro preço, e é
                  este que vale aqui.
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="fe_data">Data</Label>
                <Input
                  id="fe_data"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="tabular-nums"
                  disabled={travado}
                />
              </div>

              {/* A conta, escrita do jeito que se fala */}
              <div className="rounded-lg border border-teal-200 dark:border-teal-900/50 bg-teal-50/60 dark:bg-teal-950/20 px-3 py-2.5 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-teal-800 dark:text-teal-300">
                    A pagar pela obra
                  </span>
                  <span className="text-lg font-bold text-teal-700 dark:text-teal-300 tabular-nums">
                    {formatBRL(total)}
                  </span>
                </div>
                {metro && (
                  <p className="text-[11px] text-teal-700/80 dark:text-teal-400/80 tabular-nums">
                    {formatQty(parseQty(quantity))} {fechamento?.unit ?? "M"} ×{" "}
                    {formatBRL(preco)} = {formatBRL(total)}
                  </p>
                )}
              </div>

              {travado ? (
                <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                  Este fechamento já foi acertado — o valor está pago e não muda mais.
                  Para corrigir, desfaça o acerto na ficha dele.
                </p>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={salvar}
                    disabled={isPending}
                  >
                    {isPending
                      ? "Salvando..."
                      : jaFechado
                        ? "Salvar o fechamento"
                        : "Fechar a obra com ele"}
                  </Button>
                  {jaFechado && (
                    <button
                      type="button"
                      onClick={desfazer}
                      disabled={isPending}
                      aria-label="Tirar o fechamento"
                      className="w-12 h-10 flex items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Este valor entra no custo da obra e no &quot;a receber&quot; dele, em
                Colaboradores — onde é pago no mesmo acerto das diárias.
              </p>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
