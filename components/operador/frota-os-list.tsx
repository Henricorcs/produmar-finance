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
import { kindMeta } from "@/components/frota/frota-shared";
import type { MachineServicoDoOperador, MachineServicoPausa } from "@/lib/types";

/**
 * AS OS DE MÁQUINA NO PAINEL DO OPERADOR.
 *
 * A OS de máquina nasce na ficha do veículo (módulo Máquinas e Veículos) e é
 * ENVIADA para o operador. Aqui ele vê só o que mandaram para ele e toca nos
 * botões do dia:
 *
 *   INICIAR    → anota o horímetro (máquina) ou o km (caminhão, caçamba);
 *   PAUSAR     → fim do expediente, com a leitura e o que ficou do dia;
 *   CONTINUAR  → volta no dia seguinte, com a leitura de quando voltou;
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

/** A leitura de partida desta OS, conforme o que ela mede. */
function leituraInicial(os: MachineServicoDoOperador, medicao: Medicao): number | null {
  const v = medicao === "horimetro" ? os.hourmeter_start : os.km_start;
  return v === null || v === undefined ? null : Number(v);
}

export function FrotaOSList({ items }: { items: MachineServicoDoOperador[] }) {
  const [iniciando, setIniciando] = useState<MachineServicoDoOperador | null>(null);
  const [pausando, setPausando] = useState<MachineServicoDoOperador | null>(null);
  const [retomando, setRetomando] = useState<{
    os: MachineServicoDoOperador;
    pausa: MachineServicoPausa;
  } | null>(null);
  const [finalizando, setFinalizando] = useState<MachineServicoDoOperador | null>(null);

  if (items.length === 0) return null;

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
          onPausar={() => setPausando(os)}
          onRetomar={(pausa) => setRetomando({ os, pausa })}
          onFinalizar={() => setFinalizando(os)}
        />
      ))}

      <IniciarFrotaOSDialog os={iniciando} onClose={() => setIniciando(null)} />
      <PausarFrotaOSDialog os={pausando} onClose={() => setPausando(null)} />
      <RetomarFrotaOSDialog alvo={retomando} onClose={() => setRetomando(null)} />
      <FinalizarFrotaOSDialog os={finalizando} onClose={() => setFinalizando(null)} />
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

      {/* O diário das paradas — para ele saber de onde voltou */}
      {pausas.length > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 px-3 py-2 space-y-1">
          {pausas.map((p) => (
            <p key={p.id} className="text-sm text-amber-800 dark:text-amber-300 tabular-nums">
              Parou {p.pause_date ? formatDate(p.pause_date) : ""}
              {p.pause_time ? ` às ${p.pause_time.slice(0, 5)}` : ""}
              {p.pause_reading != null ? ` · ${mostrarLeitura(p.pause_reading, medicao)}` : ""}
              {p.resume_time
                ? ` — voltou ${p.resume_date ? formatDate(p.resume_date) : ""} às ${p.resume_time.slice(0, 5)}`
                : " — aguardando continuar"}
            </p>
          ))}
        </div>
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

function CampoHora({
  titulo,
  valor,
  onChange,
}: {
  titulo: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-base font-semibold flex items-center gap-2">
        <Clock className="w-5 h-5 text-produmar-600" />
        {titulo}
      </Label>
      <Input
        type="time"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-16 text-3xl text-center font-bold tabular-nums"
      />
    </div>
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

function IniciarFrotaOSDialog({
  os,
  onClose,
}: {
  os: MachineServicoDoOperador | null;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [valor, setValor] = useState("");

  const medicao: Medicao = os ? medicaoDaOs(os) : "horimetro";

  useEffect(() => {
    if (!os) return;
    setValor("");
    setErro(null);
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
    setErro(null);
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
          <CampoLeitura
            medicao={medicao}
            titulo={
              medicao === "horimetro" ? "Horímetro da máquina agora" : "KM do veículo agora"
            }
            valor={valor}
            onChange={setValor}
          />
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
  onClose,
}: {
  os: MachineServicoDoOperador | null;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [hora, setHora] = useState("");
  const [obs, setObs] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  const medicao: Medicao = os ? medicaoDaOs(os) : "horimetro";

  useEffect(() => {
    if (!os) return;
    setValor("");
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
    if (!hora.trim()) return setErro("Informe a hora da pausa");
    setErro(null);
    startTransition(async () => {
      const falha = actionError(
        await pausarMachineServico(os.id, {
          pauseDate: localDateISO(),
          pauseTime: hora,
          reading: n,
          notes: obs,
          latitude: gps?.lat ?? null,
          longitude: gps?.lng ?? null,
          locationAccuracy: gps?.accuracy ?? null,
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
            <PauseCircle className="w-6 h-6 text-amber-600" />
            Pausar serviço
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Maquina os={os} />
          <CampoLeitura
            medicao={medicao}
            titulo={medicao === "horimetro" ? "Horímetro na hora de parar" : "KM na hora de parar"}
            valor={valor}
            onChange={setValor}
          />
          <CampoHora titulo="Hora da pausa" valor={hora} onChange={setHora} />
          <div className="space-y-2">
            <Label className="text-base font-semibold">O que ficou do dia</Label>
            <Textarea
              value={obs}
              onChange={(e) => setObs(upperKeepingCaret(e))}
              placeholder="opcional — ex: FALTOU TERMINAR O LADO DA CERCA"
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
                PAUSAR AGORA
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
  onClose,
}: {
  alvo: { os: MachineServicoDoOperador; pausa: MachineServicoPausa } | null;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [hora, setHora] = useState("");

  const os = alvo?.os ?? null;
  const pausa = alvo?.pausa ?? null;
  const medicao: Medicao = os ? medicaoDaOs(os) : "horimetro";

  useEffect(() => {
    if (!alvo) return;
    // A leitura de quando parou já vem no campo: a máquina parada não anda,
    // então quase sempre é só confirmar.
    setValor(
      alvo.pausa.pause_reading != null
        ? String(alvo.pausa.pause_reading).replace(".", ",")
        : ""
    );
    setHora(agoraHHMM());
    setErro(null);
  }, [alvo]);

  function retomar() {
    if (!os) return;
    const n = lerLeitura(valor);
    if (n === null) {
      return setErro(
        medicao === "horimetro"
          ? "Anote o horímetro da máquina ao voltar"
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
    if (!hora.trim()) return setErro("Informe a hora da volta");
    setErro(null);
    startTransition(async () => {
      const falha = actionError(
        await retomarMachineServico(os.id, {
          resumeDate: localDateISO(),
          resumeTime: hora,
          reading: n,
        })
      );
      if (falha) return setErro(falha);
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
          <CampoLeitura
            medicao={medicao}
            titulo={medicao === "horimetro" ? "Horímetro ao voltar" : "KM ao voltar"}
            valor={valor}
            onChange={setValor}
          />
          <CampoHora titulo="Hora da volta" valor={hora} onChange={setHora} />
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
  onClose,
}: {
  os: MachineServicoDoOperador | null;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [leituraFinal, setLeituraFinal] = useState("");
  const [quantidade, setQuantidade] = useState("");
  /** Ele mexeu na quantidade? Então a conta do horímetro para de sobrescrever. */
  const [qtdNaMao, setQtdNaMao] = useState(false);
  const [oQueFoiFeito, setOQueFoiFeito] = useState("");

  const meta = kindMeta(os?.kind);
  const fechado = meta.value === "servico";
  const medicao: Medicao = os ? medicaoDaOs(os) : "horimetro";
  const inicio = os ? leituraInicial(os, medicao) : null;
  // A leitura é pedida quando a OS começou com uma — senão não há o que subtrair.
  const pedeLeitura = inicio !== null;
  // Cobrança que sai direto da leitura: hora ← horímetro, km ← hodômetro.
  const quantidadeDaLeitura =
    (meta.value === "hora" && medicao === "horimetro") ||
    (meta.value === "km" && medicao === "km");

  useEffect(() => {
    if (!os) return;
    setLeituraFinal("");
    setQuantidade(formatQty(Number(os.quantity)));
    setQtdNaMao(false);
    setOQueFoiFeito(os.completion_notes ?? "");
    setErro(null);
  }, [os]);

  const fim = lerLeitura(leituraFinal);
  const diferenca = inicio !== null && fim !== null && fim >= inicio ? fim - inicio : null;

  // Digitou a leitura final: as horas (ou os km) aparecem sozinhas.
  useEffect(() => {
    if (!quantidadeDaLeitura || qtdNaMao || diferenca === null) return;
    setQuantidade(formatQty(Math.round(diferenca * 10) / 10));
  }, [diferenca, quantidadeDaLeitura, qtdNaMao]);

  function finalizar() {
    if (!os) return;
    setErro(null);

    if (pedeLeitura) {
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
    }

    const feito = fechado ? null : parseMoney(quantidade);
    if (!fechado && (feito === null || feito <= 0)) {
      return setErro(`Diga quantos ${meta.unitPlural} você fez`);
    }

    startTransition(async () => {
      const falha = actionError(
        await finalizarMachineServico(os.id, {
          quantity: feito,
          completion_notes: oQueFoiFeito,
          horimetroFinal: medicao === "horimetro" ? fim : null,
          kmFinal: medicao === "km" ? fim : null,
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

          {pedeLeitura && (
            <CampoLeitura
              medicao={medicao}
              titulo={medicao === "horimetro" ? "Horímetro final" : "KM final"}
              valor={leituraFinal}
              onChange={setLeituraFinal}
              ajuda={
                diferenca !== null
                  ? `${mostrarLeitura(inicio, medicao)} → ${mostrarLeitura(fim, medicao)} = ${
                      medicao === "horimetro"
                        ? `${formatQty(Math.round(diferenca * 10) / 10)} h trabalhadas`
                        : `${formatQty(Math.round(diferenca * 10) / 10)} km rodados`
                    }`
                  : `Começou com ${mostrarLeitura(inicio, medicao)}`
              }
            />
          )}

          {!fechado && (
            <div className="space-y-2">
              <Label htmlFor="fim_qtd" className="text-base font-semibold">
                Quantos {meta.unitPlural} você fez? *
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
                {quantidadeDaLeitura && pedeLeitura
                  ? "Sai da leitura final. Se precisar, corrija aqui."
                  : "Já vem com o que foi combinado. Se fez mais ou menos, corrija aqui."}
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
