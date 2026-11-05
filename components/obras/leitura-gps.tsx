"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pontoDasLeituras, type LeituraGps, type PontoGps } from "@/lib/medir-cerca";

// ─────────────────────────────────────────────────────────────────────────────
// A LEITURA DE UM PONTO PELO GPS — usada no Medir cerca e nas Medições.
// Ouve o GPS por um tempo, tira a média das leituras boas e entrega o ponto.
// No modo preciso, fica 30 segundos no ponto e só marca sozinho com ±3 m; a
// tela fica acesa enquanto lê (com ela apagada, o iPhone corta o GPS).
// ─────────────────────────────────────────────────────────────────────────────

/** Como cada ponto é lido: o normal (rápido) e o preciso (demora mais, erra menos). */
export const MODOS = {
  normal: {
    /** Leitura boa o bastante para marcar sozinho (metros). */
    precisaoBoa: 4,
    /** Ouve o GPS pelo menos isto antes de marcar sozinho (ms) — as primeiras leituras pulam. */
    tempoMinimo: 6000,
    /** Pelo menos tantas leituras na média. */
    leiturasMinimas: 4,
    /** Passou disto, marca com a melhor que veio (ms). */
    tempoMaximo: 20000,
    /** Entram na média as leituras até tantos metros piores que a melhor. */
    folga: 2,
  },
  // MODO PRECISO: meio minuto parado no ponto e só marca sozinho com ±3 m. A
  // média de muitas leituras tira o "pulo" do GPS; a folga menor deixa de fora
  // as leituras ruins. Não conserta sombra de árvore ou telhado.
  preciso: {
    precisaoBoa: 3,
    tempoMinimo: 30000,
    leiturasMinimas: 15,
    tempoMaximo: 90000,
    folga: 1,
  },
} as const;

export type Modo = keyof typeof MODOS;

export interface Leitura {
  leituras: LeituraGps[];
  inicio: number;
  agora: number;
  modo: Modo;
}

/** Tela acesa enquanto lê: com a tela apagada, o iPhone corta o GPS do navegador. */
type Trava = { release: () => Promise<void> };
async function manterTelaAcesa(): Promise<Trava | null> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Trava> } }).wakeLock;
    return wl ? await wl.request("screen") : null;
  } catch {
    // sem suporte ou negado: segue sem — é só não deixar a tela apagar
    return null;
  }
}

/**
 * Lê um ponto. `marcar(modo)` liga o GPS; quando o ponto fica bom (ou passa do
 * tempo máximo), `aoMarcar` recebe o ponto. `usarAgora` marca com o que já veio.
 */
export function useLeituraGps(aoMarcar: (p: PontoGps) => void) {
  const [lendo, setLendo] = useState<Leitura | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const vigia = useRef<number | null>(null);
  const trava = useRef<Trava | null>(null);
  const relogio = useRef<number | null>(null);
  const aoMarcarRef = useRef(aoMarcar);
  aoMarcarRef.current = aoMarcar;

  // saiu da tela no meio de uma leitura: desliga o GPS
  useEffect(() => () => pararGps(), []);

  function pararGps() {
    if (vigia.current !== null) navigator.geolocation.clearWatch(vigia.current);
    vigia.current = null;
    if (relogio.current !== null) window.clearInterval(relogio.current);
    relogio.current = null;
    trava.current?.release().catch(() => {});
    trava.current = null;
  }

  function concluir(leituras: LeituraGps[], modo: Modo) {
    pararGps();
    setLendo(null);
    const p = pontoDasLeituras(leituras, MODOS[modo].folga);
    if (p) aoMarcarRef.current(p);
  }

  function marcar(modo: Modo) {
    setErro(null);
    if (!("geolocation" in navigator)) {
      setErro("Este aparelho não tem GPS disponível para o navegador.");
      return;
    }
    const regra = MODOS[modo];
    const inicio = Date.now();
    const leituras: LeituraGps[] = [];
    setLendo({ leituras, inicio, agora: inicio, modo });
    manterTelaAcesa().then((t) => {
      // a leitura pode ter acabado antes da trava chegar
      if (vigia.current === null) t?.release().catch(() => {});
      else trava.current = t;
    });
    // a barra de tempo anda mesmo quando o GPS demora a mandar leitura
    relogio.current = window.setInterval(
      () => setLendo((l) => (l ? { ...l, agora: Date.now() } : l)),
      500
    );
    vigia.current = navigator.geolocation.watchPosition(
      (pos) => {
        leituras.push({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisao: pos.coords.accuracy,
        });
        const agora = Date.now();
        const melhor = Math.min(...leituras.map((l) => l.precisao));
        const passou = agora - inicio;
        const pronto =
          passou >= regra.tempoMinimo && melhor <= regra.precisaoBoa && leituras.length >= regra.leiturasMinimas;
        if (pronto || passou >= regra.tempoMaximo) {
          concluir([...leituras], modo);
          return;
        }
        setLendo({ leituras: [...leituras], inicio, agora, modo });
      },
      (e) => {
        pararGps();
        setLendo(null);
        setErro(
          e.code === e.PERMISSION_DENIED
            ? "O GPS foi bloqueado para o sistema. No iPhone: Ajustes → Privacidade → Serviços de Localização → Safari → \"Durante o Uso\", e toque em Marcar de novo."
            : e.code === e.TIMEOUT
              ? "O GPS não respondeu a tempo. Vá para um lugar aberto, longe de telhado e árvore, e tente de novo."
              : "Não deu para ler o GPS agora. Tente de novo."
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  }

  function cancelar() {
    pararGps();
    setLendo(null);
  }

  function usarAgora() {
    if (lendo && lendo.leituras.length > 0) concluir(lendo.leituras, lendo.modo);
  }

  return { lendo, erro, setErro, marcar, cancelar, usarAgora };
}

/** O quadro de "lendo o GPS do Nº ponto…", com a barra do modo preciso. */
export function PainelDaLeitura({
  lendo,
  numero,
  onCancelar,
  onUsarAgora,
}: {
  lendo: Leitura;
  numero: number;
  onCancelar: () => void;
  onUsarAgora: () => void;
}) {
  const regra = MODOS[lendo.modo];
  const melhorAgora = lendo.leituras.length > 0 ? Math.min(...lendo.leituras.map((l) => l.precisao)) : null;
  const segundos = Math.floor((lendo.agora - lendo.inicio) / 1000);
  const minimoEmSegundos = regra.tempoMinimo / 1000;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <Crosshair className="h-6 w-6 shrink-0 animate-pulse text-produmar-600" />
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 dark:text-slate-100">Lendo o GPS do {numero}º ponto…</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {melhorAgora === null
              ? "Esperando o GPS responder. Fique parado no ponto."
              : `Precisão agora: ± ${melhorAgora.toFixed(1).replace(".", ",")} m · ${lendo.leituras.length} leitura${lendo.leituras.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
      {lendo.modo === "preciso" && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full bg-produmar-500 transition-all"
              style={{ width: `${Math.min(100, (segundos / minimoEmSegundos) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {segundos < minimoEmSegundos
              ? `Modo preciso: ${segundos} de ${minimoEmSegundos} segundos — não saia do ponto.`
              : melhorAgora !== null && melhorAgora > regra.precisaoBoa
                ? `Esperando o GPS chegar a ± ${regra.precisaoBoa} m (até ${regra.tempoMaximo / 1000} s).`
                : "Quase lá…"}
          </p>
        </div>
      )}
      {melhorAgora !== null && melhorAgora > 10 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          GPS fraco aqui — se puder, saia de baixo de árvore ou telhado.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancelar}>
          <X className="h-4 w-4" />
          Cancelar
        </Button>
        <Button
          type="button"
          className="h-11 flex-1"
          disabled={lendo.leituras.length === 0}
          onClick={onUsarAgora}
        >
          Usar agora
        </Button>
      </div>
    </div>
  );
}

/** A caixinha do modo preciso. */
export function OpcaoModoPreciso({ modo, onChange }: { modo: Modo; onChange: (m: Modo) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
      <input
        type="checkbox"
        checked={modo === "preciso"}
        onChange={(e) => onChange(e.target.checked ? "preciso" : "normal")}
        className="h-5 w-5 accent-produmar-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Modo preciso</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">
          Fica 30 segundos lendo cada ponto e só marca com ± 3 m. Demora mais, erra menos.
        </span>
      </span>
    </label>
  );
}
