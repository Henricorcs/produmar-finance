"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  Clock,
  Gauge,
  Loader2,
  MapPin,
  Package,
  Pause,
  Printer,
  Route,
  User,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { actionError } from "@/lib/action-result";
import { historicoDaOs, pausasDaOsDaMaquina } from "@/app/(app)/frota/actions";
import { contaDoServico, kindMeta } from "./frota-shared";
import {
  cn,
  formatBRL,
  formatDate,
  formatQty,
  osTypeLabel,
} from "@/lib/utils";
import type { HistoricoDaOs, MachineServico, MachineServicoPausa } from "@/lib/types";

/**
 * O HISTÓRICO DE UMA OS, aberto da ficha do veículo.
 *
 * A ficha mostra uma linha por OS, com o valor. O que ela não mostra é o que
 * está DENTRO: quantas horas a máquina trabalhou, quantos km rodou, quantas
 * viagens fez e o que levou em cada uma. É o que se precisa para conferir a
 * cobrança e para saber o que a máquina andou fazendo.
 *
 * As duas famílias de OS entram aqui, cada uma com o que tem:
 *
 *   • a OS da FICHA (machine_servicos) já veio inteira com a tela — a conta, o
 *     trecho, o operador, o relógio e as leituras do horímetro/km que ele
 *     anotou no celular; só as paradas são buscadas na hora;
 *   • a OS de OPERAÇÕES é buscada na hora, porque o miolo dela mora em três
 *     tabelas filhas que seria caro carregar junto com a ficha.
 *
 * Só leitura: a OS de Operações se corrige no módulo dela, e a da ficha se
 * corrige com um toque na própria linha.
 */

type Alvo =
  | { tipo: "ficha"; servico: MachineServico }
  | { tipo: "operacoes"; id: string; titulo: string };

interface Props {
  alvo: Alvo | null;
  onClose: () => void;
  /** Nome de quem recebeu a OS no celular, por id. */
  nomeDoOperador: Map<string, string>;
}

export function HistoricoOsDialog({ alvo, onClose, nomeDoOperador }: Props) {
  return (
    <Dialog open={!!alvo} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <ClipboardList className="w-4 h-4 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />
            <span className="truncate">Histórico da OS</span>
          </DialogTitle>
        </DialogHeader>

        {alvo?.tipo === "ficha" && (
          <HistoricoDaFicha servico={alvo.servico} nomeDoOperador={nomeDoOperador} />
        )}
        {alvo?.tipo === "operacoes" && (
          <HistoricoDeOperacoes id={alvo.id} titulo={alvo.titulo} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Blocos de leitura ───────────────────────────────────────────────────────

function Linha({
  icone: Icone,
  label,
  valor,
}: {
  icone: typeof Clock;
  label: string;
  valor: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
      <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
        {label}
      </span>
      {/* Endereço é texto livre e vem comprido: quebra em vez de vazar do card */}
      <span className="text-xs text-slate-800 dark:text-slate-100 ml-auto text-right tabular-nums min-w-0 break-words">
        {valor}
      </span>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
        {titulo}
      </p>
      {children}
    </div>
  );
}

/** "18/07/2026 às 14:32" — o relógio de quando o operador tocou no botão. */
function quando(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Quanto tempo passou entre começar e terminar ("3h20"). */
function duracao(inicio?: string | null, fim?: string | null): string | null {
  if (!inicio || !fim) return null;
  const a = new Date(inicio).getTime();
  const b = new Date(fim).getTime();
  if (isNaN(a) || isNaN(b) || b <= a) return null;
  const minutos = Math.round((b - a) / 60000);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

// ── A OS da ficha do veículo ────────────────────────────────────────────────

function HistoricoDaFicha({
  servico,
  nomeDoOperador,
}: {
  servico: MachineServico;
  nomeDoOperador: Map<string, string>;
}) {
  const meta = kindMeta(servico.kind);
  const conta = contaDoServico(
    servico.kind,
    Number(servico.quantity),
    Number(servico.unit_price)
  );
  const trecho = [servico.origin, servico.destination].filter(Boolean).join(" → ");
  const levou = duracao(servico.started_at, servico.finished_at);

  const num = (v?: number | null) => (v === null || v === undefined ? null : Number(v));
  const hIni = num(servico.hourmeter_start);
  const hFim = num(servico.hourmeter_end);
  const kIni = num(servico.km_start);
  const kFim = num(servico.km_end);
  const horas = hIni !== null && hFim !== null ? hFim - hIni : null;
  const kmRodado = kIni !== null && kFim !== null ? kFim - kIni : null;

  // As paradas moram numa tabela à parte (migration 094): vêm na hora.
  const [pausas, setPausas] = useState<MachineServicoPausa[] | null>(null);
  useEffect(() => {
    let vivo = true;
    setPausas(null);
    (async () => {
      const r = await pausasDaOsDaMaquina(servico.id);
      if (vivo) setPausas((r.pausas as MachineServicoPausa[]) ?? []);
    })();
    return () => {
      vivo = false;
    };
  }, [servico.id]);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          {servico.description || meta.label}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {formatDate(servico.service_date)} · lançada na ficha do veículo
        </p>
      </div>

      <Secao titulo="A conta">
        <Linha
          icone={meta.icon}
          label={meta.label}
          valor={
            conta
              ? `${conta} = ${formatBRL(Number(servico.total ?? 0))}`
              : formatBRL(Number(servico.total ?? 0))
          }
        />
        {/* É esta linha que responde "quantas horas / quantas viagens" */}
        <Linha
          icone={Gauge}
          label={
            Number(servico.quantity) === 1 ? meta.unit : meta.unitPlural
          }
          valor={
            Number(servico.quantity) > 0
              ? formatQty(Number(servico.quantity))
              : "a contar — o operador diz ao finalizar"
          }
        />
        {servico.contratante && (
          <Linha icone={User} label="Contratante" valor={servico.contratante} />
        )}
        {trecho && <Linha icone={MapPin} label="Trecho" valor={trecho} />}
        {servico.operator && (
          <Linha icone={User} label="Quem estava na máquina" valor={servico.operator} />
        )}
      </Secao>

      {/* HORÍMETRO — anotado pelo operador ao iniciar e ao finalizar */}
      {(hIni !== null || hFim !== null) && (
        <Secao titulo="Horímetro">
          <Linha
            icone={Gauge}
            label="Início"
            valor={hIni !== null ? `${formatQty(hIni)} h` : "—"}
          />
          <Linha
            icone={Gauge}
            label="Fim"
            valor={hFim !== null ? `${formatQty(hFim)} h` : "ainda trabalhando"}
          />
          {horas !== null && (
            <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
              <Linha
                icone={Clock}
                label="Horas trabalhadas"
                valor={`${formatQty(Math.round(horas * 10) / 10)} h`}
              />
            </div>
          )}
        </Secao>
      )}

      {/* HODÔMETRO — o do caminhão e da caçamba */}
      {(kIni !== null || kFim !== null) && (
        <Secao titulo="Hodômetro">
          <Linha icone={Gauge} label="KM inicial" valor={kIni !== null ? formatQty(kIni) : "—"} />
          <Linha
            icone={Gauge}
            label="KM final"
            valor={kFim !== null ? formatQty(kFim) : "ainda rodando"}
          />
          {kmRodado !== null && (
            <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
              <Linha
                icone={Route}
                label="KM rodado"
                valor={`${formatQty(Math.round(kmRodado * 10) / 10)} km`}
              />
            </div>
          )}
        </Secao>
      )}

      {/* PARADAS — o serviço que atravessou dias */}
      {pausas && pausas.length > 0 && (
        <Secao titulo={`Paradas (${pausas.length})`}>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pausas.map((p) => (
              <div key={p.id} className="py-1.5">
                <div className="flex items-center gap-2">
                  <Pause className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-700 dark:text-slate-200 truncate">
                    {p.pause_date ? formatDate(p.pause_date) : "—"}
                    {p.pause_time ? ` às ${p.pause_time.slice(0, 5)}` : ""}
                    {p.resume_time
                      ? ` → ${p.resume_date ? formatDate(p.resume_date) : ""} às ${p.resume_time.slice(0, 5)}`
                      : " → não voltou"}
                  </span>
                  {p.pause_reading != null && (
                    <span className="text-[10px] text-slate-400 ml-auto tabular-nums flex-shrink-0">
                      {formatQty(Number(p.pause_reading))}
                    </span>
                  )}
                </div>
                {p.pause_notes && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 pl-5">
                    {p.pause_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Secao>
      )}

      <Secao titulo="O relógio">
        {servico.assigned_to && (
          <Linha
            icone={User}
            label="Enviada para"
            valor={nomeDoOperador.get(servico.assigned_to) ?? "Operador"}
          />
        )}
        <Linha icone={Clock} label="Começou" valor={quando(servico.started_at)} />
        <Linha icone={Clock} label="Terminou" valor={quando(servico.finished_at)} />
        {levou && <Linha icone={Clock} label="Levou" valor={levou} />}
        {!servico.started_at && !servico.finished_at && (
          <p className="text-xs text-slate-400 dark:text-slate-500 py-1">
            Esta OS não passou pelo celular do operador — foi lançada direto na
            ficha, então não tem hora de início nem de fim.
          </p>
        )}
      </Secao>

      {(servico.completion_notes || servico.notes) && (
        <Secao titulo="O que ficou escrito">
          {servico.completion_notes && (
            <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap py-1">
              {servico.completion_notes}
            </p>
          )}
          {servico.notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap py-1">
              {servico.notes}
            </p>
          )}
        </Secao>
      )}
    </div>
  );
}

// ── A OS do módulo Operações ────────────────────────────────────────────────

function HistoricoDeOperacoes({ id, titulo }: { id: string; titulo: string }) {
  const [dados, setDados] = useState<HistoricoDaOs | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    setErro(null);
    (async () => {
      const r = await historicoDaOs(id);
      if (!vivo) return;
      const falha = actionError(r);
      if (falha) return setErro(falha);
      setDados((r as { historico: HistoricoDaOs }).historico);
    })();
    return () => {
      vivo = false;
    };
  }, [id]);

  if (erro) {
    return <p className="text-sm text-rose-600 dark:text-rose-400 py-4">{erro}</p>;
  }

  if (!dados) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Buscando o histórico…
      </div>
    );
  }

  const { order, trips, items, pauses } = dados;

  const horas =
    order.hourmeter_start != null && order.hourmeter_end != null
      ? Number(order.hourmeter_end) - Number(order.hourmeter_start)
      : null;
  const kmRodado =
    order.km_start != null && order.km_end != null
      ? Number(order.km_end) - Number(order.km_start)
      : null;

  // Frete não é material: a linha de viagem/km entra na conta, não na carroceria.
  const material = items.filter((i) => !i.is_freight);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          {titulo}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          OS nº {order.order_number} · {osTypeLabel(order.type)} ·{" "}
          {formatDate(order.delivery_date ?? order.issue_date)}
          {order.client_name ? ` · ${order.client_name}` : ""}
        </p>
      </div>

      {/* HORÍMETRO — a pergunta da máquina: quantas horas ela trabalhou */}
      {(order.hourmeter_start != null || order.hourmeter_end != null) && (
        <Secao titulo="Horímetro">
          <Linha
            icone={Gauge}
            label="Início"
            valor={
              order.hourmeter_start != null
                ? `${formatQty(Number(order.hourmeter_start))} h`
                : "—"
            }
          />
          <Linha
            icone={Gauge}
            label="Fim"
            valor={
              order.hourmeter_end != null
                ? `${formatQty(Number(order.hourmeter_end))} h`
                : "—"
            }
          />
          {horas != null && (
            <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
              <Linha
                icone={Clock}
                label="Horas trabalhadas"
                valor={`${formatQty(horas)} h`}
              />
            </div>
          )}
        </Secao>
      )}

      {/* HODÔMETRO — a pergunta do caminhão e da caçamba */}
      {(order.km_start != null || order.km_end != null) && (
        <Secao titulo="Hodômetro">
          <Linha
            icone={Gauge}
            label="KM inicial"
            valor={order.km_start != null ? formatQty(Number(order.km_start)) : "—"}
          />
          <Linha
            icone={Gauge}
            label="KM final"
            valor={order.km_end != null ? formatQty(Number(order.km_end)) : "—"}
          />
          {kmRodado != null && (
            <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
              <Linha icone={Route} label="KM rodado" valor={`${formatQty(kmRodado)} km`} />
            </div>
          )}
        </Secao>
      )}

      {/* VIAGENS — uma a uma, com o trecho e quem recebeu */}
      {(trips.length > 0 || (order.trips_count ?? 0) > 0) && (
        <Secao titulo={`Viagens (${trips.length || order.trips_count})`}>
          {trips.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-1">
              {order.trips_count} viagem(ns) contada(s), sem o detalhe de cada uma.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {trips.map((t) => {
                const trecho = [t.origin, t.destination].filter(Boolean).join(" → ");
                return (
                  <div key={t.id} className="py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-produmar-700 dark:text-produmar-400 tabular-nums flex-shrink-0">
                        {t.trip_number}ª
                      </span>
                      <span className="text-xs text-slate-700 dark:text-slate-200 truncate">
                        {trecho || "sem trecho anotado"}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto tabular-nums flex-shrink-0">
                        {t.start_time ? t.start_time.slice(0, 5) : "—"}
                        {t.trip_time ? ` → ${t.trip_time.slice(0, 5)}` : ""}
                      </span>
                    </div>
                    {t.received_by && (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 pl-6">
                        recebeu: {t.received_by}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Secao>
      )}

      {/* MATERIAL CARREGADO */}
      {material.length > 0 && (
        <Secao titulo="Material carregado">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {material.map((i) => (
              <div key={i.id} className="flex items-center gap-2 py-1.5">
                <Package className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-700 dark:text-slate-200 truncate">
                  {i.products?.name ?? i.description ?? "—"}
                </span>
                <span className="text-xs text-slate-800 dark:text-slate-100 ml-auto tabular-nums flex-shrink-0">
                  {formatQty(Number(i.quantity))} {i.unit ?? ""}
                </span>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* PARADAS DO DIA */}
      {pauses.length > 0 && (
        <Secao titulo={`Paradas (${pauses.length})`}>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pauses.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1.5">
                <Pause className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-700 dark:text-slate-200 truncate">
                  {p.pause_date ? formatDate(p.pause_date) : "—"}
                  {p.pause_time ? ` às ${p.pause_time.slice(0, 5)}` : ""}
                  {p.pause_notes ? ` · ${p.pause_notes}` : ""}
                </span>
                {p.pause_reading != null && (
                  <span className="text-[10px] text-slate-400 ml-auto tabular-nums flex-shrink-0">
                    {formatQty(Number(p.pause_reading))}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Secao>
      )}

      <Secao titulo="O dia">
        {order.start_time && (
          <Linha icone={Clock} label="Saída" valor={order.start_time.slice(0, 5)} />
        )}
        {order.end_time && (
          <Linha icone={Clock} label="Chegada" valor={order.end_time.slice(0, 5)} />
        )}
        {order.origin_address && (
          <Linha icone={MapPin} label="De" valor={order.origin_address} />
        )}
        {order.delivery_address && (
          <Linha icone={MapPin} label="Para" valor={order.delivery_address} />
        )}
        {order.received_by && (
          <Linha icone={User} label="Recebido por" valor={order.received_by} />
        )}
        <Linha icone={Package} label="Total da OS" valor={formatBRL(Number(order.total_amount ?? 0))} />
      </Secao>

      {order.completion_notes && (
        <Secao titulo="O que foi feito">
          <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap py-1">
            {order.completion_notes}
          </p>
        </Secao>
      )}

      <Button
        variant="outline"
        className={cn("w-full")}
        onClick={() => window.open(`/imprimir/os/${order.id}`, "_blank")}
      >
        <Printer className="w-4 h-4" />
        Abrir a folha da OS
      </Button>
    </div>
  );
}
