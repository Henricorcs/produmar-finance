"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarMetros, margemDoTotal, trechos, type PontoGps } from "@/lib/medir-cerca";
import { OpcaoModoPreciso, PainelDaLeitura, useLeituraGps, type Modo } from "@/components/obras/leitura-gps";

// ─────────────────────────────────────────────────────────────────────────────
// MEDIDOR DE CERCA — marca o 1º ponto, anda até o 2º, marca de novo: a tela
// dá a metragem. Cerca com canto ou curva: marca mais pontos no caminho, e o
// total soma os trechos. Cercado fechado (pasto, curral): "voltar ao 1º".
// A leitura de cada ponto (normal ou precisa) mora em leitura-gps.tsx.
// ─────────────────────────────────────────────────────────────────────────────

/** Os pontos ficam guardados no celular: a tela pode recarregar no meio do pasto. */
const GUARDADO = "produmar:medir-cerca";

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

export function MedidorDeCerca() {
  const [pontos, setPontos] = useState<PontoGps[]>([]);
  const [fechado, setFechado] = useState(false);
  const [modo, setModo] = useState<Modo>("normal");
  const carregou = useRef(false);
  const { lendo, erro, setErro, marcar, cancelar, usarAgora } = useLeituraGps((p) =>
    setPontos((ps) => [...ps, p])
  );

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
  const proximo = pontos.length + 1;

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
        <PainelDaLeitura lendo={lendo} numero={proximo} onCancelar={cancelar} onUsarAgora={usarAgora} />
      ) : (
        <div className="space-y-2">
          <OpcaoModoPreciso modo={modo} onChange={setModo} />
          <Button type="button" className="h-14 w-full text-base" onClick={() => marcar(modo)}>
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
