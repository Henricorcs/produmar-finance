"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FolderOpen, Loader2, MapPin, RotateCcw, Ruler, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarMetros, margemDoTotal, trechos, type PontoGps } from "@/lib/medir-cerca";
import { OpcaoModoPreciso, PainelDaLeitura, useLeituraGps, type Modo } from "@/components/obras/leitura-gps";
import { excluirMedicao, salvarCerca } from "@/app/(app)/medicoes/actions";
import { formatDate } from "@/lib/utils";
import type { Medicao } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// MEDIDOR DE CERCA — marca o 1º ponto, anda até o 2º, marca de novo: a tela
// dá a metragem. Cerca com canto ou curva: marca mais pontos no caminho, e o
// total soma os trechos. Cercado fechado (pasto, curral): "voltar ao 1º".
// A leitura de cada ponto (normal ou precisa) mora em leitura-gps.tsx.
//
// No fim, "Finalizar e salvar" grava a medida com nome (tabela medicoes, tipo
// 'cerca' — migration 148). As salvas aparecem embaixo e podem ser reabertas.
// ─────────────────────────────────────────────────────────────────────────────

/** Os pontos ficam guardados no celular: a tela pode recarregar no meio do pasto. */
const GUARDADO = "produmar:medir-cerca";

interface Guardado {
  pontos: PontoGps[];
  fechado: boolean;
  modo: Modo;
  /** A cerca salva que está aberta (null = medida nova). */
  id: string | null;
  nome: string;
  local: string;
}

function lerGuardado(): Guardado {
  try {
    const v = JSON.parse(localStorage.getItem(GUARDADO) ?? "null");
    if (v && Array.isArray(v.pontos))
      return {
        pontos: v.pontos,
        fechado: !!v.fechado,
        modo: v.modo === "preciso" ? "preciso" : "normal",
        id: typeof v.id === "string" ? v.id : null,
        nome: typeof v.nome === "string" ? v.nome : "",
        local: typeof v.local === "string" ? v.local : "",
      };
  } catch {
    // sem nada guardado (ou guardado estragado): começa do zero
  }
  return { pontos: [], fechado: false, modo: "normal", id: null, nome: "", local: "" };
}

export function MedidorDeCerca({ salvas = [] }: { salvas?: Medicao[] }) {
  const router = useRouter();
  const [pontos, setPontos] = useState<PontoGps[]>([]);
  const [fechado, setFechado] = useState(false);
  const [modo, setModo] = useState<Modo>("normal");
  const [id, setId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [local, setLocal] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, startSalvar] = useTransition();
  const carregou = useRef(false);
  const { lendo, erro, setErro, marcar, cancelar, usarAgora } = useLeituraGps((p) => {
    setPontos((ps) => [...ps, p]);
    setAviso(null);
  });

  useEffect(() => {
    const g = lerGuardado();
    setPontos(g.pontos);
    setFechado(g.fechado);
    setModo(g.modo);
    setId(g.id);
    setNome(g.nome);
    setLocal(g.local);
    carregou.current = true;
  }, []);

  useEffect(() => {
    if (!carregou.current) return;
    try {
      const g: Guardado = { pontos, fechado, modo, id, nome, local };
      localStorage.setItem(GUARDADO, JSON.stringify(g));
    } catch {
      // sem espaço no celular: a medida segue na tela, só não sobrevive a recarregar
    }
  }, [pontos, fechado, modo, id, nome, local]);

  function zerar() {
    cancelar();
    setPontos([]);
    setFechado(false);
    setId(null);
    setNome("");
    setLocal("");
    setErro(null);
  }

  function recomecar() {
    if (pontos.length > 0 && !confirm("Apagar os pontos marcados e começar uma medida nova?")) return;
    zerar();
    setAviso(null);
  }

  function salvar() {
    setAviso(null);
    startSalvar(async () => {
      const r = await salvarCerca(id, { nome, local, observacao: null, pontos, fechado });
      if ("error" in r) {
        setAviso({ tipo: "erro", texto: r.error });
        return;
      }
      const salvo = nome.trim();
      zerar();
      setAviso({ tipo: "ok", texto: `Medida "${salvo}" salva. Está na lista de cercas salvas, logo abaixo.` });
      router.refresh();
    });
  }

  function abrir(m: Medicao) {
    if (pontos.length > 0 && !confirm("Trocar a medida da tela pela salva? Os pontos marcados agora se perdem.")) return;
    cancelar();
    setPontos(m.pontos ?? []);
    setFechado(!!m.fechado);
    setId(m.id);
    setNome(m.nome);
    setLocal(m.local ?? "");
    setErro(null);
    setAviso(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function apagar(m: Medicao) {
    if (!confirm(`Apagar a medida "${m.nome}"? Não tem volta.`)) return;
    startSalvar(async () => {
      const r = await excluirMedicao(m.id);
      if ("error" in r) {
        setAviso({ tipo: "erro", texto: r.error });
        return;
      }
      if (m.id === id) setId(null);
      router.refresh();
    });
  }

  // com menos de 3 pontos não há contorno para fechar
  const fechou = fechado && pontos.length >= 3;
  const partes = trechos(pontos, fechou);
  const total = partes.reduce((s, t) => s + t, 0);
  const margem = margemDoTotal(pontos);
  const proximo = pontos.length + 1;
  const aberta = id ? salvas.find((s) => s.id === id) : null;

  return (
    <div className="space-y-4">
      {aberta && (
        <p className="rounded-lg border border-produmar-200 bg-produmar-50 px-3 py-2 text-sm text-produmar-700 dark:border-slate-700 dark:bg-slate-800 dark:text-produmar-400">
          Mexendo na medida salva <span className="font-semibold">{aberta.nome}</span>.
        </p>
      )}

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

      {/* Finalizar e salvar — logo abaixo do botão de marcar, sem precisar rolar */}
      {pontos.length >= 2 && !lendo && (
        <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Terminou? Dê um nome e salve a medida
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="cerca-nome">Nome da cerca *</Label>
            <Input
              id="cerca-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Cerca do pasto grande"
              className="bg-white dark:bg-slate-900"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cerca-local">Local</Label>
            <Input
              id="cerca-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Ex.: Fazenda, lado do açude"
              className="bg-white dark:bg-slate-900"
            />
          </div>
          <Button type="button" className="h-12 w-full text-base" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {id ? "Salvar as mudanças" : "Finalizar e salvar a medida"}
          </Button>
        </div>
      )}

      {aviso && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            aviso.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
              : "border-red-100 bg-red-50 text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {/* Os pontos e os trechos */}
      {pontos.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
          {pontos.map((p, i) => (
            <div key={`${p.em}-${i}`} className="px-4 py-2.5">
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

      {/* As medidas salvas */}
      {salvas.length > 0 && (
        <div className="space-y-2 pt-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cercas salvas</h2>
          {salvas.map((m) => (
            <div
              key={m.id}
              className={`flex items-center gap-3 rounded-2xl border bg-white p-3 dark:bg-slate-900 ${
                m.id === id ? "border-produmar-300 dark:border-produmar-700" : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <Ruler className="h-5 w-5 shrink-0 text-orange-600 dark:text-orange-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{m.nome}</p>
                <p className="text-sm tabular-nums text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">
                    {m.perimetro_m !== null ? formatarMetros(Number(m.perimetro_m)) : "—"}
                  </span>
                  {m.fechado ? " · contorno fechado" : ""}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {m.pontos?.length ?? 0} pontos{m.local ? ` · ${m.local}` : ""} · {formatDate(new Date(m.created_at))}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => abrir(m)}
                  disabled={salvando || !!lendo}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-produmar-600 hover:bg-produmar-50 disabled:opacity-30 dark:text-produmar-400 dark:hover:bg-slate-800"
                  aria-label={`Abrir ${m.nome}`}
                >
                  <FolderOpen className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => apagar(m)}
                  disabled={salvando}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30 dark:hover:bg-red-950/30"
                  aria-label={`Apagar ${m.nome}`}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
