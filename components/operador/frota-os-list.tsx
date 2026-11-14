"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCheck,
  Clock,
  Gauge,
  Loader2,
  MapPin,
  Navigation,
  PauseCircle,
  PlayCircle,
  Truck,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionError } from "@/lib/action-result";
import {
  cn,
  formatDate,
  formatHourmeter,
  formatQty,
  localDateISO,
  parseMoney,
  upperKeepingCaret,
} from "@/lib/utils";
import {
  finalizarMachineServico,
  iniciarMachineServico,
  pausarMachineServico,
  retomarMachineServico,
} from "@/app/(app)/frota/actions";
import { kindMeta, quantosDe } from "@/components/frota/frota-shared";
import type { MachineServicoDoOperador, MachineServicoPausa } from "@/lib/types";

/**
 * AS OS DE MÁQUINA NO PAINEL DO OPERADOR.
 *
 * A OS de máquina nasce na ficha do veículo (módulo Máquinas e Veículos) e é
 * ENVIADA para o operador. Aqui ele vê só o que mandaram para ele e toca nos
 * botões do dia:
 *
 *   INICIAR    → anota o horímetro (máquina) ou o km (caminhão, caçamba);
 *   PAUSAR     → teve um problema ou acabou o expediente: a OS fica parada,
 *                com a leitura e o porquê — e dá para começar OUTRA enquanto
 *                isso (a mesma máquina, uma OS rodando de cada vez);
 *   CONTINUAR  → volta nela, com a leitura de quando voltou. O que a máquina
 *                fez em outra OS durante a pausa não conta nesta;
 *   FINALIZAR  → a leitura final, e quanto realmente fez.
 *
 * É o mesmo caminho da OS de Operações. Quando a OS de máquina mudou para a
 * ficha, ela tinha ficado só com INICIAR e FINALIZAR — e sem o horímetro não
 * havia como saber quantas horas a máquina trabalhou.
 *
 * Letra grande e botão do tamanho do dedo: quem usa está na rua, no sol.
 */

type Medicao = "horimetro" | "km";

/**
 * O que o operador anota nesta OS. Cobrar por hora é sempre horímetro; por km
 * ou por viagem é sempre o km do painel. No resto vale o que a máquina mede.
 */
function medicaoDaOs(os: MachineServicoDoOperador): Medicao {
  if (os.kind === "hora") return "horimetro";
  if (os.kind === "km" || os.kind === "viagem") return "km";
  return os.machines?.tracking_type === "km" ? "km" : "horimetro";
}

const NOME_DA_LEITURA: Record<Medicao, string> = {
  horimetro: "Horímetro",
  km: "KM",
};

/** O que vai no campo enquanto se digita: horímetro ganha a vírgula sozinho. */
function mascaraDaLeitura(medicao: Medicao, bruto: string): string {
  if (medicao === "horimetro") return formatHourmeter(bruto);
  // km: dígitos e, se quiser, uma vírgula com uma casa
  const limpo = bruto.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const partes = limpo.split(",");
  if (partes.length > 2) return partes[0] + "," + partes.slice(1).join("");
  if (partes[1]?.length > 1) return partes[0] + "," + partes[1].slice(0, 1);
  return limpo;
}

function lerLeitura(texto: string): number | null {
  if (!texto.trim()) return null;
  const n = parseFloat(texto.replace(",", "."));
  return isNaN(n) ? null : n;
}

function mostrarLeitura(n: number | null | undefined, medicao: Medicao): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return medicao === "horimetro" ? `${v} h` : `${v} km`;
}

function agoraHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Onde a máquina parou na última leitura anotada — vale para qualquer OS dela. */
function ondeParou(os: MachineServicoDoOperador | null, medicao: Medicao): number | null {
  const v = medicao === "horimetro" ? os?.ultima_leitura?.horimetro : os?.ultima_leitura?.km;
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
}

/** O número como vai no campo (sem ponto de milhar, vírgula decimal). */
function leituraNoCampo(n: number): string {
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

/** A leitura de partida desta OS, conforme o que ela mede. */
function leituraInicial(os: MachineServicoDoOperador, medicao: Medicao): number | null {
  const v = medicao === "horimetro" ? os.hourmeter_start : os.km_start;
  return v === null || v === undefined ? null : Number(v);
}

/**
 * Quanto a máquina andou ENQUANTO esta OS estava pausada — as horas (ou km) de
 * outra OS que ela fez nesse meio-tempo, e que não são desta. Pausa ainda
 * aberta conta até a leitura final. Parada de fim de expediente não muda nada:
 * a máquina parada não anda, então a volta tem a mesma leitura da pausa.
 */
function andouNasPausas(os: MachineServicoDoOperador | null, fim: number | null): number {
  let total = 0;
  for (const p of os?.pausas ?? []) {
    if (p.pause_reading == null) continue;
    const volta = p.resume_time ? p.resume_reading : fim;
    if (volta === null || volta === undefined) continue;
    const d = Number(volta) - Number(p.pause_reading);
    if (Number.isFinite(d) && d > 0) total += d;
  }
  return Math.round(total * 10) / 10;
}

/** A pausa ainda aberta desta OS (a que espera o CONTINUAR). */
function pausaAbertaDe(os: MachineServicoDoOperador): MachineServicoPausa | null {
  return (os.pausas ?? []).find((p) => !p.resume_time) ?? null;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * A última leitura que ESTA OS registrou — a de partida, a de cada pausa e a
 * de cada volta. Dentro da OS o horímetro só anda para frente: a pausa não
 * pode ser menor que ela, e o fim também não.
 */
function ultimaDaOs(os: MachineServicoDoOperador, medicao: Medicao): number | null {
  let n = leituraInicial(os, medicao);
  for (const p of os.pausas ?? []) {
    for (const v of [numero(p.pause_reading), numero(p.resume_reading)]) {
      if (v !== null && (n === null || v > n)) n = v;
    }
  }
  return n;
}

/** "12/11 às 17:52" — com o que o celular gravou (já é a hora daqui). */
function diaEHora(data: string | null, hora: string | null): string {
  const d = data ? formatDate(data).slice(0, 5) : "";
  const h = hora ? hora.slice(0, 5) : "";
  return [d, h ? `às ${h}` : ""].filter(Boolean).join(" ");
}

/**
 * Um pedaço do serviço em que a máquina trabalhou NESTA OS: do começo (ou da
 * volta de uma pausa) até a pausa seguinte (ou até agora). Entre um trecho e
 * outro a máquina pode ter feito outra OS — essas horas não entram aqui.
 */
interface Trecho {
  de: number | null;
  /** Nulo = é o trecho de agora, ainda rodando. */
  ate: number | null;
  /** Quando voltou (o primeiro trecho começa no INICIAR). */
  voltou: string | null;
  parou: string | null;
  motivo: string | null;
}

function trechosDaOs(os: MachineServicoDoOperador, medicao: Medicao): Trecho[] {
  const trechos: Trecho[] = [];
  let de = leituraInicial(os, medicao);
  let voltou: string | null = null;
  const pausas = [...(os.pausas ?? [])].sort((a, b) => a.pause_number - b.pause_number);
  for (const p of pausas) {
    trechos.push({
      de,
      ate: numero(p.pause_reading),
      voltou,
      parou: diaEHora(p.pause_date, p.pause_time) || "—",
      motivo: p.pause_notes,
    });
    // pausada agora: não há trecho rodando
    if (!p.resume_time) return trechos;
    de = numero(p.resume_reading);
    voltou = diaEHora(p.resume_date, p.resume_time) || "—";
  }
  trechos.push({ de, ate: null, voltou, parou: null, motivo: null });
  return trechos;
}

/** Horas (ou km) somadas dos trechos já fechados por uma pausa. */
function feitoNosTrechos(trechos: Trecho[]): number {
  let total = 0;
  for (const t of trechos) {
    if (t.de === null || t.ate === null) continue;
    const d = t.ate - t.de;
    if (d > 0) total += d;
  }
  return Math.round(total * 10) / 10;
}

type DepoisDaPausa = () => void;

function semChave<T>(m: Record<string, T>, chave: string): Record<string, T> {
  const copia = { ...m };
  delete copia[chave];
  return copia;
}

export function FrotaOSList({ items }: { items: MachineServicoDoOperador[] }) {
  const [iniciando, setIniciando] = useState<MachineServicoDoOperador | null>(null);
  const [pausando, setPausando] = useState<{
    os: MachineServicoDoOperador;
    /** Pausou para começar (ou continuar) outra: abre ela em seguida. */
    depois?: DepoisDaPausa;
    paraQual?: MachineServicoDoOperador;
  } | null>(null);
  const [retomando, setRetomando] = useState<{
    os: MachineServicoDoOperador;
    pausa: MachineServicoPausa;
  } | null>(null);
  const [finalizando, setFinalizando] = useState<MachineServicoDoOperador | null>(null);
  // O que ele acabou de pausar/continuar neste celular. A tela recarrega do
  // servidor logo depois, mas a OS seguinte abre na hora — e já tem que saber
  // que a outra parou e em que leitura.
  const [pausadasAgora, setPausadasAgora] = useState<Record<string, number>>({});
  const [retomadasAgora, setRetomadasAgora] = useState<Record<string, true>>({});

  if (items.length === 0) return null;

  /** Esta OS está pausada? (pelo servidor ou pelo que ele acabou de fazer) */
  function estaPausada(o: MachineServicoDoOperador): boolean {
    if (o.id in pausadasAgora) return true;
    if (retomadasAgora[o.id]) return false;
    return !!pausaAbertaDe(o);
  }

  /** Outra OS da mesma máquina rodando agora (começou e não está pausada). */
  function outraRodando(os: MachineServicoDoOperador | null): MachineServicoDoOperador | null {
    if (!os) return null;
    return (
      items.find(
        (o) =>
          o.id !== os.id &&
          o.machine_id === os.machine_id &&
          !!o.started_at &&
          !estaPausada(o)
      ) ?? null
    );
  }

  /** Onde a máquina parou — contando a pausa que ele acabou de anotar. */
  function parouEm(os: MachineServicoDoOperador | null): number | null {
    if (!os) return null;
    const medicao = medicaoDaOs(os);
    let n = ondeParou(os, medicao);
    for (const o of items) {
      const v = pausadasAgora[o.id];
      if (v === undefined || o.machine_id !== os.machine_id || medicaoDaOs(o) !== medicao) continue;
      if (n === null || v > n) n = v;
    }
    return n;
  }

  /** Pausa a outra OS da máquina e, pausada, abre esta de novo. */
  function pausarOutraAntes(
    outra: MachineServicoDoOperador,
    esta: MachineServicoDoOperador,
    depois: DepoisDaPausa
  ) {
    setIniciando(null);
    setRetomando(null);
    setPausando({ os: outra, depois, paraQual: esta });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
        <Truck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        Serviço de máquina ({items.length})
      </h2>

      {items.map((os) => (
        <FrotaOSCard
          key={os.id}
          os={os}
          onIniciar={() => setIniciando(os)}
          onPausar={() => setPausando({ os })}
          onRetomar={(pausa) => setRetomando({ os, pausa })}
          onFinalizar={() => setFinalizando(os)}
        />
      ))}

      <IniciarFrotaOSDialog
        os={iniciando}
        parou={parouEm(iniciando)}
        outra={outraRodando(iniciando)}
        onPausarOutra={(outra) => {
          const esta = iniciando;
          if (!esta) return;
          pausarOutraAntes(outra, esta, () => setIniciando(esta));
        }}
        onClose={() => setIniciando(null)}
      />
      <PausarFrotaOSDialog
        os={pausando?.os ?? null}
        paraQual={pausando?.paraQual ?? null}
        onClose={() => setPausando(null)}
        onPausou={(leitura) => {
          const alvo = pausando;
          if (!alvo) return;
          setPausadasAgora((m) => ({ ...m, [alvo.os.id]: leitura }));
          setRetomadasAgora((m) => semChave(m, alvo.os.id));
          setPausando(null);
          alvo.depois?.();
        }}
      />
      <RetomarFrotaOSDialog
        alvo={retomando}
        parou={parouEm(retomando?.os ?? null)}
        outra={outraRodando(retomando?.os ?? null)}
        onPausarOutra={(outra) => {
          const alvo = retomando;
          if (!alvo) return;
          pausarOutraAntes(outra, alvo.os, () => setRetomando(alvo));
        }}
        onRetomou={(id) => {
          setRetomadasAgora((m) => ({ ...m, [id]: true }));
          setPausadasAgora((m) => semChave(m, id));
        }}
        onClose={() => setRetomando(null)}
      />
      <FinalizarFrotaOSDialog
        os={finalizando}
        parou={parouEm(finalizando)}
        onClose={() => setFinalizando(null)}
      />
    </section>
  );
}

/**
 * O que este operador já finalizou na máquina — só leitura, para ele conferir
 * que fechou mesmo. Sem botão: o que passou, passou; correção é no escritório.
 */
export function FrotaOSFinalizadas({ items }: { items: MachineServicoDoOperador[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
        <Truck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        Serviço de máquina ({items.length})
      </h2>

      {items.map((os) => {
        const meta = kindMeta(os.kind);
        const medicao = medicaoDaOs(os);
        const inicio = leituraInicial(os, medicao);
        const fimBruto = medicao === "horimetro" ? os.hourmeter_end : os.km_end;
        const fim = fimBruto === null || fimBruto === undefined ? null : Number(fimBruto);
        return (
          <Card key={os.id} className="p-4 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-base font-bold text-slate-700 dark:text-slate-200 truncate">
                {os.machines?.name ?? "Máquina"}
              </p>
              <span className="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 flex-shrink-0">
                FINALIZADA
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
              {formatDate(os.service_date)} · {meta.label}
              {meta.value !== "servico"
                ? ` · ${formatQty(Number(os.quantity))} ${
                    Number(os.quantity) === 1 ? meta.unit : meta.unitPlural
                  }`
                : ""}
              {os.contratante ? ` · ${os.contratante}` : ""}
            </p>
            {inicio !== null && fim !== null && (
              <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                {NOME_DA_LEITURA[medicao]} {mostrarLeitura(inicio, medicao)} →{" "}
                {mostrarLeitura(fim, medicao)}
              </p>
            )}
            {(os.completion_notes || os.description) && (
              <p className="text-sm text-slate-600 dark:text-slate-300 break-words">
                {os.completion_notes || os.description}
              </p>
            )}
          </Card>
        );
      })}
    </section>
  );
}

function FrotaOSCard({
  os,
  onIniciar,
  onPausar,
  onRetomar,
  onFinalizar,
}: {
  os: MachineServicoDoOperador;
  onIniciar: () => void;
  onPausar: () => void;
  onRetomar: (pausa: MachineServicoPausa) => void;
  onFinalizar: () => void;
}) {
  const meta = kindMeta(os.kind);
  const medicao = medicaoDaOs(os);
  const emAndamento = !!os.started_at;
  const pausas = os.pausas ?? [];
  const pausaAberta = pausas.find((p) => !p.resume_time) ?? null;
  const inicio = leituraInicial(os, medicao);

  const combinado =
    meta.value === "servico"
      ? "Valor fechado"
      : Number(os.quantity) <= 0
        ? `Por ${meta.unit} — você conta ao finalizar`
        : `${formatQty(Number(os.quantity))} ${
          Number(os.quantity) === 1 ? meta.unit : meta.unitPlural
        }`;
  const trecho = [os.origin, os.destination].filter(Boolean).join(" → ");

  const selo = pausaAberta
    ? { texto: "PAUSADA", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" }
    : emAndamento
      ? {
          texto: "EM ANDAMENTO",
          cls: "bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-400",
        }
      : { texto: "A FAZER", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };

  return (
    <Card className="p-4 space-y-3 border-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xl font-black text-slate-800 dark:text-slate-100 truncate">
            {os.machines?.name ?? "Máquina"}
          </p>
          {os.machines?.plate && (
            <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">
              {os.machines.plate}
            </p>
          )}
        </div>
        <span className={cn("text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0", selo.cls)}>
          {selo.texto}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold px-2 py-1 rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 flex items-center gap-1">
          <meta.icon className="w-3.5 h-3.5" />
          {meta.label.toUpperCase()}
        </span>
        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
          {combinado} · {formatDate(os.service_date)}
        </span>
      </div>

      {os.description && (
        <p className="text-base font-medium text-slate-700 dark:text-slate-200 break-words leading-snug">
          {os.description}
        </p>
      )}

      <div className="space-y-1.5">
        {os.contratante && (
          <Linha icon={User} label="Para">
            {os.contratante}
          </Linha>
        )}
        {os.origin && (
          <Linha icon={MapPin} label="Sai de">
            {os.origin}
          </Linha>
        )}
        {os.destination && (
          <Linha icon={Navigation} label="Vai para">
            {os.destination}
          </Linha>
        )}
        {!os.origin && !os.destination && trecho && (
          <Linha icon={Navigation} label="Trecho">
            {trecho}
          </Linha>
        )}
        {/* A leitura de partida fica à vista: é com ela que ele confere o fim */}
        {emAndamento && inicio !== null && (
          <Linha icon={medicao === "horimetro" ? Clock : Gauge} label={`${NOME_DA_LEITURA[medicao]} inicial`}>
            <span className="tabular-nums">{mostrarLeitura(inicio, medicao)}</span>
          </Linha>
        )}
      </div>

      {os.notes && (
        <p className="text-sm text-slate-500 dark:text-slate-400 break-words">{os.notes}</p>
      )}

      {/* Os trechos do serviço: cada vez que a máquina trabalhou NESTA OS, de
          que leitura a que leitura. Entre um e outro ela pode ter feito outra OS. */}
      {pausas.length > 0 && (
        <TrechosDaOs os={os} medicao={medicao} pausada={!!pausaAberta} />
      )}

      {emAndamento ? (
        <div className="space-y-2">
          {pausaAberta ? (
            <Button
              className="w-full h-16 text-base font-bold"
              onClick={() => onRetomar(pausaAberta)}
            >
              <PlayCircle className="w-5 h-5" />
              CONTINUAR SERVIÇO
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full h-14 text-base font-bold border-2 border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              onClick={onPausar}
            >
              <PauseCircle className="w-5 h-5" />
              PAUSAR
            </Button>
          )}
          <Button
            className="w-full h-16 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={onFinalizar}
          >
            <CheckCheck className="w-5 h-5" />
            FINALIZAR
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button className="w-full h-16 text-base font-bold" onClick={onIniciar}>
            <PlayCircle className="w-5 h-5" />
            INICIAR
          </Button>
          {/* Esqueceu de iniciar e o serviço já acabou: fecha direto */}
          <Button variant="outline" className="w-full h-11" onClick={onFinalizar}>
            <CheckCheck className="w-4 h-4" />
            Já terminei, finalizar
          </Button>
        </div>
      )}
    </Card>
  );
}

function Linha({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">
          {label}
        </span>
        <div className="text-base font-medium text-slate-700 dark:text-slate-200 break-words leading-snug">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Os trechos da OS pausada uma ou mais vezes:
 *
 *   1º  1.558,1 → 1.564,5 = 6,4 h   · parou 12/11 às 17:52 — CHUVA
 *   2º  1.570,0 → rodando agora     · voltou 13/11 às 06:57
 *   Trabalhado até agora: 6,4 h
 *
 * É a conta que o FINALIZAR faz: só entra o que a máquina andou dentro de
 * cada trecho — o que ela fez em outra OS entre um e outro fica de fora.
 */
function TrechosDaOs({
  os,
  medicao,
  pausada,
}: {
  os: MachineServicoDoOperador;
  medicao: Medicao;
  pausada: boolean;
}) {
  const trechos = trechosDaOs(os, medicao);
  const feito = feitoNosTrechos(trechos);
  const unidade = medicao === "horimetro" ? "h" : "km";
  return (
    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 px-3 py-2 space-y-2">
      {trechos.map((t, i) => {
        const d = t.de !== null && t.ate !== null ? Math.max(0, t.ate - t.de) : null;
        return (
          <div key={i} className="text-sm text-amber-900 dark:text-amber-200 tabular-nums">
            <p className="font-semibold">
              {i + 1}º trecho: {t.de !== null ? mostrarLeitura(t.de, medicao) : "—"} →{" "}
              {t.ate !== null
                ? `${mostrarLeitura(t.ate, medicao)} = ${formatQty(Math.round((d ?? 0) * 10) / 10)} ${unidade}`
                : "rodando agora"}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t.voltou ? `voltou ${t.voltou}` : "começou"}
              {t.parou ? ` · parou ${t.parou}` : ""}
              {t.motivo ? ` — ${t.motivo}` : ""}
            </p>
          </div>
        );
      })}
      <p className="text-sm font-bold text-amber-900 dark:text-amber-200 tabular-nums border-t border-amber-200 dark:border-amber-900/50 pt-1.5">
        {medicao === "horimetro" ? "Trabalhado" : "Rodado"} até {pausada ? "a pausa" : "a última pausa"}:{" "}
        {formatQty(feito)} {unidade}
      </p>
      {pausada && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          A máquina está livre para outra OS. Quando voltar aqui, toque em CONTINUAR e anote{" "}
          {medicao === "horimetro" ? "o horímetro que ela estiver marcando" : "o km do painel"}.
        </p>
      )}
    </div>
  );
}

// ── Os campos grandes que os quatro diálogos repetem ─────────────────────────

function CampoLeitura({
  medicao,
  titulo,
  valor,
  onChange,
  ajuda,
}: {
  medicao: Medicao;
  titulo: string;
  valor: string;
  onChange: (v: string) => void;
  ajuda?: string;
}) {
  const Icone = medicao === "horimetro" ? Clock : Gauge;
  return (
    <div className="space-y-2">
      <Label className="text-base font-semibold flex items-center gap-2">
        <Icone className="w-5 h-5 text-produmar-600" />
        {titulo}
      </Label>
      <Input
        value={valor}
        onChange={(e) => onChange(mascaraDaLeitura(medicao, e.target.value))}
        placeholder={medicao === "horimetro" ? "ex: 1230,5" : "ex: 154300"}
        inputMode="decimal"
        autoComplete="off"
        className="h-16 text-3xl text-center font-bold tabular-nums"
      />
      {ajuda && <p className="text-sm text-slate-500 dark:text-slate-400">{ajuda}</p>}
    </div>
  );
}

/** Dia e hora lado a lado — a pausa lançada depois fica com o dia certo. */
function CampoDiaEHora({
  tituloDia,
  dia,
  onDia,
  tituloHora,
  hora,
  onHora,
}: {
  tituloDia: string;
  dia: string;
  onDia: (v: string) => void;
  tituloHora: string;
  hora: string;
  onHora: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2 min-w-0">
        <Label className="text-base font-semibold">{tituloDia}</Label>
        <Input
          type="date"
          value={dia}
          onChange={(e) => onDia(e.target.value)}
          className="h-14 text-base text-center font-bold tabular-nums"
        />
      </div>
      <div className="space-y-2 min-w-0">
        <Label className="text-base font-semibold">{tituloHora}</Label>
        <Input
          type="time"
          value={hora}
          onChange={(e) => onHora(e.target.value)}
          className="h-14 text-xl text-center font-bold tabular-nums"
        />
      </div>
    </div>
  );
}

/** O aviso amarelo que pede para conferir — e um segundo toque confirma. */
function Aviso({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p className="text-base text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 rounded-lg border border-amber-200 dark:border-amber-900/50">
      {texto}
    </p>
  );
}

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p className="text-base text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2.5 rounded-lg border border-red-100 dark:border-red-900/40">
      {texto}
    </p>
  );
}

function Maquina({ os }: { os: MachineServicoDoOperador | null }) {
  if (!os) return null;
  return (
    <p className="text-base text-slate-600 dark:text-slate-300">
      <span className="font-semibold">{os.machines?.name ?? "Máquina"}</span>
      {os.machines?.plate ? ` — ${os.machines.plate}` : ""}
      {os.contratante ? ` · ${os.contratante}` : ""}
    </p>
  );
}

// ── INICIAR ─────────────────────────────────────────────────────────────────

/**
 * Outra OS da mesma máquina ainda rodando. Mais de uma OS no dia é normal (4 h
 * para um, 2 h para outro), mas uma de cada vez: com duas rodando juntas, as
 * mesmas horas contariam duas vezes. Então o botão pausa a outra — ela fica
 * esperando o CONTINUAR — e volta para esta.
 */
function AvisoOutraRodando({
  outra,
  medicao,
  acao,
  onPausarOutra,
}: {
  outra: MachineServicoDoOperador | null;
  medicao: Medicao;
  acao: "começar" | "continuar";
  onPausarOutra: (outra: MachineServicoDoOperador) => void;
}) {
  if (!outra) return null;
  const qual = outra.contratante ? `de ${outra.contratante}` : "anterior";
  return (
    <div className="rounded-xl px-3 py-3 space-y-3 bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50">
      <p className="text-sm text-amber-800 dark:text-amber-300">
        A OS {qual} nesta máquina ainda está rodando. Pause ela antes de {acao}{" "}
        esta — senão as mesmas {medicao === "horimetro" ? "horas" : "km"} contam duas
        vezes. Depois você volta nela e finaliza.
      </p>
      <Button
        type="button"
        className="w-full h-14 text-base font-bold bg-amber-500 hover:bg-amber-600 text-white"
        onClick={() => onPausarOutra(outra)}
      >
        <PauseCircle className="w-5 h-5" />
        PAUSAR A OS {outra.contratante ? `DE ${outra.contratante.toUpperCase()}` : "ANTERIOR"}
      </Button>
    </div>
  );
}

function IniciarFrotaOSDialog({
  os,
  parou,
  outra,
  onPausarOutra,
  onClose,
}: {
  os: MachineServicoDoOperador | null;
  /** Onde a máquina parou — a OS da tarde começa de onde a da manhã terminou. */
  parou: number | null;
  /** Outra OS da mesma máquina ainda rodando. */
  outra: MachineServicoDoOperador | null;
  onPausarOutra: (outra: MachineServicoDoOperador) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  /** A leitura que ele já conferiu depois do aviso — o segundo toque passa. */
  const [conferida, setConferida] = useState<number | null>(null);

  const medicao: Medicao = os ? medicaoDaOs(os) : "horimetro";

  useEffect(() => {
    if (!os) return;
    setValor("");
    setErro(null);
    setAviso(null);
    setConferida(null);
  }, [os]);

  function iniciar() {
    if (!os) return;
    const n = lerLeitura(valor);
    if (n === null) {
      setErro(
        medicao === "horimetro"
          ? "Anote o horímetro da máquina antes de começar"
          : "Anote o KM que está no painel do veículo"
      );
      return;
    }
    // A máquina já passou dessa leitura em outra OS (pausada ou fechada):
    // começar abaixo dela faz as mesmas horas contarem nas duas. Pode ser um
    // serviço antigo lançado agora — então avisa e o segundo toque confirma.
    if (parou !== null && n < parou && conferida !== n) {
      setErro(null);
      setConferida(n);
      setAviso(
        `A máquina já marcou ${mostrarLeitura(parou, medicao)} em outra OS. Começar com ${mostrarLeitura(
          n,
          medicao
        )} faz ${medicao === "horimetro" ? "as mesmas horas contarem" : "os mesmos km contarem"} duas vezes. Confira no painel da máquina. Se está certo (um serviço antigo lançado agora), toque em COMEÇAR de novo.`
      );
      return;
    }
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const falha = actionError(
        await iniciarMachineServico(
          os.id,
          medicao === "horimetro" ? { horimetro: n } : { km: n }
        )
      );
      if (falha) return setErro(falha);
      onClose();
    });
  }

  return (
    <Dialog open={!!os} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl dark:text-slate-100">
            <PlayCircle className="w-6 h-6 text-produmar-600" />
            Iniciar serviço
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Maquina os={os} />
          <AvisoOutraRodando
            outra={outra}
            medicao={medicao}
            acao="começar"
            onPausarOutra={onPausarOutra}
          />
          <CampoLeitura
            medicao={medicao}
            titulo={
              medicao === "horimetro" ? "Horímetro da máquina agora" : "KM do veículo agora"
            }
            valor={valor}
            onChange={(v) => {
              setValor(v);
              setAviso(null);
            }}
          />
          {parou !== null && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 text-base"
              onClick={() => {
                setValor(leituraNoCampo(parou));
                setAviso(null);
              }}
            >
              Usar {mostrarLeitura(parou, medicao)} — onde a máquina parou
            </Button>
          )}
          <Aviso texto={aviso} />
          <Erro texto={erro} />
        </div>

        <div className="grid gap-2 mt-5">
          <Button onClick={iniciar} disabled={isPending} className="h-16 text-xl gap-2">
            {isPending ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Iniciando...
              </>
            ) : (
              <>
                <PlayCircle className="w-6 h-6" />
                COMEÇAR AGORA
              </>
            )}
          </Button>
          <Button variant="outline" className="h-12 text-base" onClick={onClose} disabled={isPending}>
            Voltar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── PAUSAR ──────────────────────────────────────────────────────────────────

function PausarFrotaOSDialog({
  os,
  paraQual,
  onClose,
  onPausou,
}: {
  os: MachineServicoDoOperador | null;
  /** Está pausando esta para começar (ou continuar) aquela. */
  paraQual: MachineServicoDoOperador | null;
  onClose: () => void;
  /** Pausou — com a leitura anotada, para a próxima OS já saber onde parou. */
  onPausou: (leitura: number) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const [obs, setObs] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  const medicao: Medicao = os ? medicaoDaOs(os) : "horimetro";
  // De onde este trecho começou: o INICIAR ou a volta da última pausa.
  const desde = os ? ultimaDaOs(os, medicao) : null;

  useEffect(() => {
    if (!os) return;
    setValor("");
    setDia(localDateISO());
    setHora(agoraHHMM());
    setObs("");
    setErro(null);
    setGps(null);
    // Onde parou — best-effort, como na OS de Operações: sem GPS, pausa igual.
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setGps({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        () => undefined,
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    }
  }, [os]);

  function pausar() {
    if (!os) return;
    const n = lerLeitura(valor);
    if (n === null) {
      setErro(
        medicao === "horimetro"
          ? "Anote o horímetro da máquina na hora de parar"
          : "Anote o KM que está no painel do veículo"
      );
      return;
    }
    if (desde !== null && n < desde) {
      return setErro(
        `A leitura da pausa não pode ser menor que ${mostrarLeitura(desde, medicao)} — onde este serviço ${
          (os.pausas ?? []).length > 0 ? "voltou da última pausa" : "começou"
        }.`
      );
    }
    if (!dia) return setErro("Informe o dia da pausa");
    if (!hora.trim()) return setErro("Informe a hora da pausa");
    setErro(null);
    startTransition(async () => {
      const falha = actionError(
        await pausarMachineServico(os.id, {
          pauseDate: dia,
          pauseTime: hora,
          reading: n,
          notes: obs,
          latitude: gps?.lat ?? null,
          longitude: gps?.lng ?? null,
          locationAccuracy: gps?.accuracy ?? null,
        })
      );
      if (falha) return setErro(falha);
      onPausou(n);
    });
  }

  return (
    <Dialog open={!!os} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl dark:text-slate-100">
            <PauseCircle className="w-6 h-6 text-amber-600" />
            Pausar serviço
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Maquina os={os} />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {paraQual
              ? `Esta fica parada enquanto você faz a OS ${
                  paraQual.contratante ? `de ${paraQual.contratante}` : "seguinte"
                }. Depois é só tocar em CONTINUAR nela e finalizar.`
              : "Teve um problema ou acabou o expediente? A OS fica parada esperando você voltar — e enquanto isso dá para começar outra."}
          </p>
          <CampoLeitura
            medicao={medicao}
            titulo={medicao === "horimetro" ? "Horímetro na hora de parar" : "KM na hora de parar"}
            valor={valor}
            onChange={setValor}
            ajuda={
              desde !== null
                ? `Este trecho começou com ${mostrarLeitura(desde, medicao)}.`
                : undefined
            }
          />
          <CampoDiaEHora
            tituloDia="Dia da pausa"
            dia={dia}
            onDia={setDia}
            tituloHora="Hora"
            hora={hora}
            onHora={setHora}
          />
          <div className="space-y-2">
            <Label className="text-base font-semibold">Por que parou / o que ficou</Label>
            <Textarea
              value={obs}
              onChange={(e) => setObs(upperKeepingCaret(e))}
              placeholder="opcional — ex: CAMINHÃO NÃO CHEGOU, FALTOU TERMINAR A CERCA"
              rows={2}
              autoCapitalize="characters"
              className="text-base"
            />
          </div>
          <Erro texto={erro} />
        </div>

        <div className="grid gap-2 mt-5">
          <Button
            onClick={pausar}
            disabled={isPending}
            className="h-16 text-xl gap-2 bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isPending ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Pausando...
              </>
            ) : (
              <>
                <PauseCircle className="w-6 h-6" />
                {paraQual ? "PAUSAR E SEGUIR" : "PAUSAR AGORA"}
              </>
            )}
          </Button>
          <Button variant="outline" className="h-12 text-base" onClick={onClose} disabled={isPending}>
            Voltar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── CONTINUAR ───────────────────────────────────────────────────────────────

function RetomarFrotaOSDialog({
  alvo,
  parou,
  outra,
  onPausarOutra,
  onRetomou,
  onClose,
}: {
  alvo: { os: MachineServicoDoOperador; pausa: MachineServicoPausa } | null;
  /** Onde a máquina está agora — pode ter andado em outra OS durante a pausa. */
  parou: number | null;
  /** Outra OS da mesma máquina ainda rodando. */
  outra: MachineServicoDoOperador | null;
  onPausarOutra: (outra: MachineServicoDoOperador) => void;
  onRetomou: (id: string) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  /** A leitura que ele já conferiu depois do aviso — o segundo toque passa. */
  const [conferida, setConferida] = useState<number | null>(null);

  const os = alvo?.os ?? null;
  const pausa = alvo?.pausa ?? null;
  const medicao: Medicao = os ? medicaoDaOs(os) : "horimetro";
  const leituraDaPausa = pausa?.pause_reading != null ? Number(pausa.pause_reading) : null;
  // A máquina andou enquanto esta estava parada: fez outra OS nesse meio-tempo
  const andouEmOutra =
    parou !== null && leituraDaPausa !== null && parou > leituraDaPausa
      ? Math.round((parou - leituraDaPausa) * 10) / 10
      : null;
  const digitada = lerLeitura(valor);
  // O que a máquina fez fora desta OS durante a pausa — pela leitura digitada
  const foraDestaOs =
    digitada !== null && leituraDaPausa !== null && digitada > leituraDaPausa
      ? Math.round((digitada - leituraDaPausa) * 10) / 10
      : null;

  useEffect(() => {
    if (!alvo) return;
    // O campo vem VAZIO: a leitura da volta é a que a máquina marca agora, e
    // ela só sai do painel da máquina. Antes vinha preenchido e, no confirmar
    // sem olhar, entrava a leitura errada — e as horas da OS feita no meio
    // contavam aqui também. Os botões abaixo do campo cobrem os dois casos de
    // sempre (ficou parada / fez outra OS) com um toque.
    setValor("");
    setDia(localDateISO());
    setHora(agoraHHMM());
    setErro(null);
    setAviso(null);
    setConferida(null);
  }, [alvo]);

  function retomar() {
    if (!os) return;
    const n = lerLeitura(valor);
    if (n === null) {
      return setErro(
        medicao === "horimetro"
          ? "Anote o horímetro que a máquina está marcando agora"
          : "Anote o KM que está no painel do veículo"
      );
    }
    if (pausa?.pause_reading != null && n < Number(pausa.pause_reading)) {
      return setErro(
        `A leitura não pode ser menor que a de quando parou (${mostrarLeitura(
          pausa.pause_reading,
          medicao
        )}).`
      );
    }
    // A máquina já passou dessa leitura em outra OS durante a pausa: voltar
    // abaixo dela põe as horas da outra OS nesta também. Pode ser um serviço
    // antigo sendo lançado agora — avisa, e o segundo toque confirma.
    if (parou !== null && n < parou && conferida !== n) {
      setErro(null);
      setConferida(n);
      setAviso(
        `A máquina já marcou ${mostrarLeitura(parou, medicao)} em outra OS depois desta pausa. Voltar com ${mostrarLeitura(
          n,
          medicao
        )} faz ${medicao === "horimetro" ? "as horas da outra OS contarem" : "os km da outra OS contarem"} aqui também. Confira no painel da máquina. Se está certo, toque em CONTINUAR de novo.`
      );
      return;
    }
    if (!dia) return setErro("Informe o dia da volta");
    if (!hora.trim()) return setErro("Informe a hora da volta");
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const falha = actionError(
        await retomarMachineServico(os.id, {
          resumeDate: dia,
          resumeTime: hora,
          reading: n,
        })
      );
      if (falha) return setErro(falha);
      onRetomou(os.id);
      onClose();
    });
  }

  return (
    <Dialog open={!!alvo} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl dark:text-slate-100">
            <PlayCircle className="w-6 h-6 text-produmar-600" />
            Continuar serviço
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Maquina os={os} />
          {pausa && (
            <p className="text-sm text-amber-700 dark:text-amber-400 tabular-nums">
              Parou {pausa.pause_date ? formatDate(pausa.pause_date) : ""}
              {pausa.pause_time ? ` às ${pausa.pause_time.slice(0, 5)}` : ""}
              {pausa.pause_reading != null
                ? ` com ${mostrarLeitura(pausa.pause_reading, medicao)}`
                : ""}
            </p>
          )}
          <AvisoOutraRodando
            outra={outra}
            medicao={medicao}
            acao="continuar"
            onPausarOutra={onPausarOutra}
          />
          <CampoLeitura
            medicao={medicao}
            titulo={
              medicao === "horimetro"
                ? "Horímetro que a máquina marca agora"
                : "KM que o painel marca agora"
            }
            valor={valor}
            onChange={(v) => {
              setValor(v);
              setAviso(null);
            }}
            ajuda={
              foraDestaOs !== null
                ? `Entre a pausa e agora a máquina andou ${mostrarLeitura(foraDestaOs, medicao)} fora desta OS — ${
                    medicao === "horimetro" ? "essas horas não contam" : "esses km não contam"
                  } aqui.`
                : digitada !== null && leituraDaPausa !== null && digitada === leituraDaPausa
                  ? "A mesma de quando parou: a máquina ficou parada."
                  : undefined
            }
          />
          {/* Os dois casos de sempre, com um toque — mas é ele quem escolhe */}
          {(leituraDaPausa !== null || andouEmOutra !== null) && (
            <div className="grid gap-2 -mt-2">
              {andouEmOutra !== null && parou !== null && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-auto min-h-12 py-2 text-base whitespace-normal"
                  onClick={() => {
                    setValor(leituraNoCampo(parou));
                    setAviso(null);
                  }}
                >
                  {mostrarLeitura(parou, medicao)} — onde a outra OS deixou a máquina
                </Button>
              )}
              {leituraDaPausa !== null && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-auto min-h-12 py-2 text-base whitespace-normal"
                  onClick={() => {
                    setValor(leituraNoCampo(leituraDaPausa));
                    setAviso(null);
                  }}
                >
                  {mostrarLeitura(leituraDaPausa, medicao)} — a máquina ficou parada desde a pausa
                </Button>
              )}
            </div>
          )}
          <CampoDiaEHora
            tituloDia="Dia da volta"
            dia={dia}
            onDia={setDia}
            tituloHora="Hora"
            hora={hora}
            onHora={setHora}
          />
          <Aviso texto={aviso} />
          <Erro texto={erro} />
        </div>

        <div className="grid gap-2 mt-5">
          <Button onClick={retomar} disabled={isPending} className="h-16 text-xl gap-2">
            {isPending ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Voltando...
              </>
            ) : (
              <>
                <PlayCircle className="w-6 h-6" />
                CONTINUAR AGORA
              </>
            )}
          </Button>
          <Button variant="outline" className="h-12 text-base" onClick={onClose} disabled={isPending}>
            Voltar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── FINALIZAR ───────────────────────────────────────────────────────────────

/**
 * FINALIZAR — a leitura final e o que ele realmente fez.
 *
 * Na OS por HORA, as horas saem sozinhas do horímetro (fim − início) assim que
 * ele digita a leitura final. Na OS por KM, o mesmo com o hodômetro. Nas outras
 * a quantidade vem com o que foi combinado; se foram 4 viagens e não 3, ele
 * corrige aqui e o valor da OS acompanha. Quem estava na rua era ele.
 */
function FinalizarFrotaOSDialog({
  os,
  parou,
  onClose,
}: {
  os: MachineServicoDoOperador | null;
  /** Onde a máquina parou na última leitura anotada (qualquer OS dela). */
  parou: number | null;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [leituraFinal, setLeituraFinal] = useState("");
  /** Só usada quando a OS começou sem leitura — ver `semPartida`. */
  const [leituraInicialDigitada, setLeituraInicialDigitada] = useState("");
  const [quantidade, setQuantidade] = useState("");
  /** Ele mexeu na quantidade? Então a conta do horímetro para de sobrescrever. */
  const [qtdNaMao, setQtdNaMao] = useState(false);
  const [oQueFoiFeito, setOQueFoiFeito] = useState("");

  const meta = kindMeta(os?.kind);
  const fechado = meta.value === "servico";
  const medicao: Medicao = os ? medicaoDaOs(os) : "horimetro";
  const inicioGravado = os ? leituraInicial(os, medicao) : null;
  // A OS começou SEM a leitura de partida: foi iniciada antes de o celular
  // pedir o horímetro, ou está sendo fechada direto em "Já terminei". Então o
  // FINALIZAR pede as duas — senão não haveria de onde tirar as horas.
  const semPartida = inicioGravado === null;
  const inicio = semPartida ? lerLeitura(leituraInicialDigitada) : inicioGravado;
  // Cobrança que sai direto da leitura: hora ← horímetro, km ← hodômetro.
  const quantidadeDaLeitura =
    (meta.value === "hora" && medicao === "horimetro") ||
    (meta.value === "km" && medicao === "km");

  useEffect(() => {
    if (!os) return;
    setLeituraFinal("");
    setLeituraInicialDigitada("");
    // OS aberta sem quantidade: o campo vem vazio para ele preencher
    setQuantidade(Number(os.quantity) > 0 ? formatQty(Number(os.quantity)) : "");
    setQtdNaMao(false);
    setOQueFoiFeito(os.completion_notes ?? "");
    setErro(null);
  }, [os]);

  const fim = lerLeitura(leituraFinal);
  const diferenca = inicio !== null && fim !== null && fim >= inicio ? fim - inicio : null;
  // O que a máquina fez em OUTRA OS enquanto esta estava pausada não é desta:
  // começou 1.000, pausou 1.002, a outra foi até 1.005, voltou e fechou 1.007
  // → 7 − 3 = 4 h desta.
  const pausado = andouNasPausas(os, fim);
  const trabalhado =
    diferenca !== null ? Math.max(0, Math.round((diferenca - pausado) * 10) / 10) : null;

  // Digitou a leitura final: as horas (ou os km) aparecem sozinhas.
  useEffect(() => {
    if (!quantidadeDaLeitura || qtdNaMao || trabalhado === null) return;
    setQuantidade(formatQty(trabalhado));
  }, [trabalhado, quantidadeDaLeitura, qtdNaMao]);

  function finalizar() {
    if (!os) return;
    setErro(null);

    // Toda OS de máquina fecha com as duas leituras — é delas que saem as horas.
    if (semPartida && inicio === null) {
      return setErro(
        medicao === "horimetro"
          ? "Anote o horímetro de quando a máquina começou"
          : "Anote o KM de quando o veículo saiu"
      );
    }
    if (fim === null) {
      return setErro(
        medicao === "horimetro"
          ? "Anote o horímetro final da máquina"
          : "Anote o KM final do painel"
      );
    }
    if (inicio !== null && fim < inicio) {
      return setErro(
        `A leitura final não pode ser menor que a inicial (${mostrarLeitura(inicio, medicao)}).`
      );
    }
    // Com pausa no meio, o fim não pode ficar abaixo da última pausa ou volta
    const ultima = ultimaDaOs(os, medicao);
    if (!semPartida && ultima !== null && fim < ultima) {
      return setErro(
        `A leitura final não pode ser menor que ${mostrarLeitura(ultima, medicao)} — a última anotada neste serviço (na pausa ou na volta).`
      );
    }

    const feito = fechado ? null : parseMoney(quantidade);
    if (!fechado && (feito === null || feito <= 0)) {
      return setErro(`Diga ${quantosDe(os.kind)} você fez`);
    }

    startTransition(async () => {
      const falha = actionError(
        await finalizarMachineServico(os.id, {
          quantity: feito,
          completion_notes: oQueFoiFeito,
          horimetroFinal: medicao === "horimetro" ? fim : null,
          kmFinal: medicao === "km" ? fim : null,
          horimetroInicial: semPartida && medicao === "horimetro" ? inicio : null,
          kmInicial: semPartida && medicao === "km" ? inicio : null,
          dataLocal: localDateISO(),
          horaLocal: agoraHHMM(),
        })
      );
      if (falha) return setErro(falha);
      onClose();
    });
  }

  return (
    <Dialog open={!!os} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl dark:text-slate-100">
            <CheckCheck className="w-6 h-6 text-emerald-600" />
            Finalizar serviço
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Maquina os={os} />

          {semPartida && (
            <CampoLeitura
              medicao={medicao}
              titulo={medicao === "horimetro" ? "Horímetro inicial" : "KM inicial"}
              valor={leituraInicialDigitada}
              onChange={setLeituraInicialDigitada}
              ajuda={
                medicao === "horimetro"
                  ? "Quanto marcava quando a máquina começou este serviço."
                  : "Quanto marcava o painel quando o veículo saiu."
              }
            />
          )}
          {semPartida && parou !== null && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 text-base -mt-2"
              onClick={() => setLeituraInicialDigitada(leituraNoCampo(parou))}
            >
              Usar {mostrarLeitura(parou, medicao)} — onde a máquina parou
            </Button>
          )}

          <CampoLeitura
              medicao={medicao}
              titulo={medicao === "horimetro" ? "Horímetro final" : "KM final"}
              valor={leituraFinal}
              onChange={setLeituraFinal}
              ajuda={
                diferenca !== null && trabalhado !== null
                  ? `${mostrarLeitura(inicio, medicao)} → ${mostrarLeitura(fim, medicao)}${
                      pausado > 0
                        ? ` = ${formatQty(Math.round(diferenca * 10) / 10)}, menos ${formatQty(
                            pausado
                          )} em outra OS durante a pausa`
                        : ""
                    } = ${
                      medicao === "horimetro"
                        ? `${formatQty(trabalhado)} h trabalhadas`
                        : `${formatQty(trabalhado)} km rodados`
                    }`
                  : inicio !== null
                    ? `Começou com ${mostrarLeitura(inicio, medicao)}`
                    : undefined
              }
            />
          {/* Pausada e a máquina foi para outra OS: o fim desta é onde ela parou */}
          {!semPartida && os && pausaAbertaDe(os) && parou !== null && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 text-base -mt-2"
              onClick={() => setLeituraFinal(leituraNoCampo(parou))}
            >
              Usar {mostrarLeitura(parou, medicao)} — onde a máquina está
            </Button>
          )}

          {!fechado && (
            <div className="space-y-2">
              <Label htmlFor="fim_qtd" className="text-base font-semibold">
                {quantosDe(os?.kind, true)} você fez? *
              </Label>
              <Input
                id="fim_qtd"
                value={quantidade}
                onChange={(e) => {
                  setQtdNaMao(true);
                  setQuantidade(e.target.value);
                }}
                className="h-14 text-2xl font-bold tabular-nums text-center"
                inputMode="decimal"
                autoComplete="off"
              />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {quantidadeDaLeitura
                  ? "Sai das leituras do horímetro. Se precisar, corrija aqui."
                  : Number(os?.quantity) > 0
                    ? "Já vem com o que foi combinado. Se fez mais ou menos, corrija aqui."
                    : `Conte ${quantosDe(os?.kind)} o serviço levou — é por isso que ele vai ser cobrado.`}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="fim_obs" className="text-base font-semibold">
              O que foi feito
            </Label>
            <Textarea
              id="fim_obs"
              value={oQueFoiFeito}
              onChange={(e) => setOQueFoiFeito(upperKeepingCaret(e))}
              placeholder="opcional"
              rows={3}
              autoCapitalize="characters"
              className="text-base"
            />
          </div>

          <Erro texto={erro} />
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 h-14 text-base"
          >
            Voltar
          </Button>
          <Button
            type="button"
            onClick={finalizar}
            disabled={isPending}
            className="flex-[2] h-14 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPending ? "Finalizando..." : "FINALIZAR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
