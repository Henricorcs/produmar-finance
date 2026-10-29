"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, RotateCcw, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatarMetros,
  margemDoTotal,
  pontoDasLeituras,
  trechos,
  type LeituraGps,
  type PontoGps,
} from "@/lib/medir-cerca";

// ─────────────────────────────────────────────────────────────────────────────
// MEDIDOR DE CERCA — marca o 1º ponto, anda até o 2º, marca de novo: a tela
// dá a metragem. Cerca com canto ou curva: marca mais pontos no caminho, e o
// total soma os trechos. Cercado fechado (pasto, curral): "voltar ao 1º".
// ─────────────────────────────────────────────────────────────────────────────

/** Os pontos ficam guardados no celular: a tela pode recarregar no meio do pasto. */
const GUARDADO = "produmar:medir-cerca";

/** Como cada ponto é lido: o normal (rápido) e o preciso (demora mais, erra menos). */
const MODOS = {
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

type Modo = keyof typeof MODOS;

interface Leitura {
  leituras: LeituraGps[];
  inicio: number;
  agora: number;
}

function lerGuardado(): { pontos: PontoGps[]; fechado: boolean; modo: Modo } {
  try {
    const v = JSON.parse(localStorage.getItem(GUARDADO) ?? "null");
    if (v && Array.isArray(v.pontos))
      return { pontos: v.pontos, fechado: !!v.fechado, modo: v.modo === "preciso" ? "preciso" : "normal" };
  } catch {
    // sem nada guardado (ou guardado estragado): começa do zero
  }
  return { pontos: [], fechado: false, modo: "normal" };
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

export function MedidorDeCerca() {
  const [pontos, setPontos] = useState<PontoGps[]>([]);
  const [fechado, setFechado] = useState(false);
  const [modo, setModo] = useState<Modo>("normal");
  const [lendo, setLendo] = useState<Leitura | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const vigia = useRef<number | null>(null);
  const trava = useRef<Trava | null>(null);
  const relogio = useRef<number | null>(null);
  const carregou = useRef(false);
  const regra = MODOS[modo];

  useEffect(() => {
    const g = lerGuardado();
    setPontos(g.pontos);
    setFechado(g.fechado);
    setModo(g.modo);
    carregou.current = true;
  }, []);

  useEffect(() => {
    if (!carregou.current) return;
    try {
      localStorage.setItem(GUARDADO, JSON.stringify({ pontos, fechado, modo }));
    } catch {
      // sem espaço no celular: a medida segue na tela, só não sobrevive a recarregar
    }
  }, [pontos, fechado, modo]);

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

  function concluir(leituras: LeituraGps[]) {
    pararGps();
    setLendo(null);
    const p = pontoDasLeituras(leituras, regra.folga);
    if (p) setPontos((ps) => [...ps, p]);
  }

  function marcar() {
    setErro(null);
    if (!("geolocation" in navigator)) {
      setErro("Este aparelho não tem GPS disponível para o navegador.");
      return;
    }
    const inicio = Date.now();
    const leituras: LeituraGps[] = [];
    setLendo({ leituras, inicio, agora: inicio });
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
          concluir([...leituras]);
          return;
        }
        setLendo({ leituras: [...leituras], inicio, agora });
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

  function recomecar() {
    if (pontos.length > 0 && !confirm("Apagar os pontos marcados e começar uma medida nova?")) return;
    cancelar();
    setPontos([]);
    setFechado(false);
    setErro(null);
  }

  // com menos de 3 pontos não há contorno para fechar
  const fechou = fechado && pontos.length >= 3;
  const partes = trechos(pontos, fechou);
  const total = partes.reduce((s, t) => s + t, 0);
  const margem = margemDoTotal(pontos);
  const melhorAgora = lendo && lendo.leituras.length > 0 ? Math.min(...lendo.leituras.map((l) => l.precisao)) : null;
  const proximo = pontos.length + 1;
  const segundos = lendo ? Math.floor((lendo.agora - lendo.inicio) / 1000) : 0;
  const minimoEmSegundos = regra.tempoMinimo / 1000;

  return (
    <div className="space-y-4">
      {/* O total */}
      <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-center dark:border-orange-900/40 dark:bg-orange-950/20">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">
          {fechou ? "Contorno fechado" : "Metragem da cerca"}
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
          {pontos.length >= 2 ? formatarMetros(total) : "—"}
        </p>
        {pontos.length >= 2 ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            margem do GPS: ± {formatarMetros(margem)}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {pontos.length === 0
              ? "Fique no começo da cerca e marque o 1º ponto."
              : "Agora ande até o fim da cerca e marque o 2º ponto."}
          </p>
        )}
      </div>

      {/* Marcar */}
      {lendo ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <Crosshair className="h-6 w-6 shrink-0 animate-pulse text-produmar-600" />
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 dark:text-slate-100">Lendo o GPS do {proximo}º ponto…</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {melhorAgora === null
                  ? "Esperando o GPS responder. Fique parado no ponto."
                  : `Precisão agora: ± ${melhorAgora.toFixed(1).replace(".", ",")} m · ${lendo.leituras.length} leitura${lendo.leituras.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          {modo === "preciso" && (
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
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={cancelar}>
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button
              type="button"
              className="h-11 flex-1"
              disabled={lendo.leituras.length === 0}
              onClick={() => concluir(lendo.leituras)}
            >
              Usar agora
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
            <input
              type="checkbox"
              checked={modo === "preciso"}
              onChange={(e) => setModo(e.target.checked ? "preciso" : "normal")}
              className="h-5 w-5 accent-produmar-600"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Modo preciso</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Fica 30 segundos lendo cada ponto e só marca com ± 3 m. Demora mais, erra menos.
              </span>
            </span>
          </label>
          <Button type="button" className="h-14 w-full text-base" onClick={marcar}>
            <MapPin className="h-5 w-5" />
            {pontos.length === 0
              ? "Marcar o 1º ponto"
              : pontos.length === 1
                ? "Marcar o 2º ponto"
                : `Marcar mais um ponto (${proximo}º)`}
          </Button>
        </div>
      )}

      {erro && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
          {erro}
        </p>
      )}

      {/* Os pontos e os trechos */}
      {pontos.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
          {pontos.map((p, i) => (
            <div key={p.em} className="px-4 py-2.5">
              {i > 0 && (
                <p className="mb-1.5 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                  ↓ {formatarMetros(partes[i - 1])}
                </p>
              )}
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-800 dark:text-slate-100">{i + 1}º ponto</span>
                <a
                  href={`https://www.google.com/maps?q=${p.lat.toFixed(7)},${p.lng.toFixed(7)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-produmar-600 underline dark:text-produmar-400"
                >
                  ± {p.precisao.toFixed(1).replace(".", ",")} m
                  {p.leituras ? ` · ${p.leituras} leitura${p.leituras === 1 ? "" : "s"}` : ""} · ver no mapa
                </a>
              </div>
            </div>
          ))}
          {fechou && (
            <p className="px-4 py-2.5 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
              ↺ volta ao 1º ponto: {formatarMetros(partes[partes.length - 1])}
            </p>
          )}
        </div>
      )}

      {/* Ajustes da medida */}
      {pontos.length > 0 && !lendo && (
        <div className="space-y-2">
          {pontos.length >= 3 && (
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              <input
                type="checkbox"
                checked={fechado}
                onChange={(e) => setFechado(e.target.checked)}
                className="h-5 w-5 accent-orange-600"
              />
              <span className="text-slate-700 dark:text-slate-200">
                Cercado fechado — somar a volta do último ponto até o 1º
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              onClick={() => setPontos((ps) => ps.slice(0, -1))}
            >
              <Undo2 className="h-4 w-4" />
              Desfazer o último
            </Button>
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={recomecar}>
              <RotateCcw className="h-4 w-4" />
              Nova medida
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Fique parado em cima de cada ponto até o GPS marcar sozinho (uns segundos). Cerca com canto ou
        curva: marque um ponto em cada canto — o total soma os trechos. A medida é pelo chão, em linha reta
        entre os pontos.
      </p>
    </div>
  );
}
