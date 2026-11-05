"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Loader2,
  MapPin,
  Printer,
  Shuffle,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OpcaoModoPreciso, PainelDaLeitura, useLeituraGps, type Modo } from "@/components/obras/leitura-gps";
import { MapaDoLote } from "@/components/medicoes/mapa-do-lote";
import { contaDoLote, formatarHectares, formatarM2, ordenarEmVolta } from "@/lib/medicao-lote";
import { formatarMetros, type PontoGps } from "@/lib/medir-cerca";
import { excluirMedicao, salvarMedicao } from "@/app/(app)/medicoes/actions";
import type { Medicao } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// A MEDIÇÃO DE UM LOTE — anda no terreno e marca cada canto pelo GPS, na
// ordem em que vai contornando. A tela desenha o lote, dá os lados, o
// perímetro e a área em m² e hectares. A leitura do GPS é a mesma do Medir
// cerca (leitura-gps.tsx), com o modo preciso de 30 segundos.
//
// Enquanto não salva, o que foi marcado fica guardado no celular: a tela pode
// recarregar (ou a bateria acabar) no meio do terreno sem perder os cantos.
// ─────────────────────────────────────────────────────────────────────────────

interface Rascunho {
  nome: string;
  local: string;
  observacao: string;
  pontos: PontoGps[];
  modo: Modo;
  /** O updated_at da medição salva quando o rascunho começou — outro salvou depois? descarta. */
  base: string | null;
}

/** Precisão a partir da qual o canto merece ser marcado de novo. */
const PRECISAO_RUIM = 5;

const chaveDoRascunho = (id: string | null) => `produmar:medicao:${id ?? "nova"}`;

function lerRascunho(id: string | null, base: string | null): Rascunho | null {
  try {
    const v = JSON.parse(localStorage.getItem(chaveDoRascunho(id)) ?? "null");
    if (v && Array.isArray(v.pontos) && (v.base ?? null) === base) return v as Rascunho;
  } catch {
    // rascunho estragado: segue com o que veio do banco
  }
  return null;
}

const precisaoTexto = (m: number) => `± ${m.toFixed(1).replace(".", ",")} m`;

export function EditorDeMedicao({ medicao }: { medicao: Medicao | null }) {
  const router = useRouter();
  const id = medicao?.id ?? null;
  const base = medicao?.updated_at ?? null;
  const [nome, setNome] = useState(medicao?.nome ?? "");
  const [local, setLocal] = useState(medicao?.local ?? "");
  const [observacao, setObservacao] = useState(medicao?.observacao ?? "");
  const [pontos, setPontos] = useState<PontoGps[]>(medicao?.pontos ?? []);
  const [modo, setModo] = useState<Modo>("preciso");
  const [mudou, setMudou] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, startSalvar] = useTransition();
  const carregou = useRef(false);
  const { lendo, erro, setErro, marcar, cancelar, usarAgora } = useLeituraGps((p) => {
    setPontos((ps) => [...ps, p]);
    setMudou(true);
  });

  // volta o rascunho guardado no celular (se for da mesma versão da medição)
  useEffect(() => {
    const r = lerRascunho(id, base);
    if (r) {
      setNome(r.nome);
      setLocal(r.local);
      setObservacao(r.observacao);
      setPontos(r.pontos);
      setModo(r.modo === "normal" ? "normal" : "preciso");
      setMudou(true);
    }
    carregou.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, base]);

  useEffect(() => {
    if (!carregou.current || !mudou) return;
    try {
      const r: Rascunho = { nome, local, observacao, pontos, modo, base };
      localStorage.setItem(chaveDoRascunho(id), JSON.stringify(r));
    } catch {
      // sem espaço no celular: segue na tela, só não sobrevive a recarregar
    }
  }, [nome, local, observacao, pontos, modo, mudou, id, base]);

  function mexer(novos: PontoGps[]) {
    setPontos(novos);
    setMudou(true);
    setAviso(null);
  }

  function trocar(i: number, j: number) {
    if (j < 0 || j >= pontos.length) return;
    const novos = [...pontos];
    [novos[i], novos[j]] = [novos[j], novos[i]];
    mexer(novos);
  }

  function tirar(i: number) {
    if (!confirm(`Tirar o ${i + 1}º ponto? Os seguintes mudam de número.`)) return;
    mexer(pontos.filter((_, k) => k !== i));
  }

  function salvar() {
    setAviso(null);
    startSalvar(async () => {
      const r = await salvarMedicao(id, { nome, local, observacao, pontos });
      if ("error" in r) {
        setAviso({ tipo: "erro", texto: r.error });
        return;
      }
      try {
        localStorage.removeItem(chaveDoRascunho(id));
      } catch {
        // nada a limpar
      }
      setMudou(false);
      if (!id) {
        router.replace(`/medicoes/${r.id}`);
      } else {
        setAviso({ tipo: "ok", texto: "Medição salva." });
        router.refresh();
      }
    });
  }

  function apagar() {
    if (!id || !confirm(`Apagar a medição "${medicao?.nome}"? Não tem volta.`)) return;
    startSalvar(async () => {
      const r = await excluirMedicao(id);
      if ("error" in r) {
        setAviso({ tipo: "erro", texto: r.error });
        return;
      }
      try {
        localStorage.removeItem(chaveDoRascunho(id));
      } catch {
        // nada a limpar
      }
      router.replace("/medicoes");
    });
  }

  function descartar() {
    if (!confirm(id ? "Desfazer o que mudou desde que salvou?" : "Apagar os pontos e começar de novo?")) return;
    cancelar();
    try {
      localStorage.removeItem(chaveDoRascunho(id));
    } catch {
      // nada a limpar
    }
    setNome(medicao?.nome ?? "");
    setLocal(medicao?.local ?? "");
    setObservacao(medicao?.observacao ?? "");
    setPontos(medicao?.pontos ?? []);
    setMudou(false);
    setErro(null);
    setAviso(null);
  }

  const conta = contaDoLote(pontos);
  const proximo = pontos.length + 1;
  const ruins = pontos.filter((p) => p.precisao > PRECISAO_RUIM).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link
          href="/medicoes"
          className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Voltar para Medições"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-medium text-produmar-800 dark:text-slate-100">
            {medicao ? medicao.nome : "Nova medição"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ande em volta do lote e marque cada canto, em ordem
          </p>
        </div>
      </div>

      {/* O resultado */}
      <div className="rounded-2xl border border-lime-200 bg-lime-50 p-4 dark:border-lime-900/40 dark:bg-lime-950/20">
        {conta.fechado ? (
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-lime-700 dark:text-lime-400">Área</p>
              <p className="mt-0.5 text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100 sm:text-4xl">
                {formatarM2(conta.areaM2)}
              </p>
              <p className="text-lg font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {formatarHectares(conta.areaM2)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                margem do GPS: ± {formatarM2(conta.margemM2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Perímetro</p>
              <p className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {formatarMetros(conta.perimetro)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Cantos</p>
              <p className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{pontos.length}</p>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-slate-600 dark:text-slate-300">
            {pontos.length === 0
              ? "Fique em cima de um canto do lote e marque o 1º ponto."
              : `Agora ande até o próximo canto e marque o ${proximo}º ponto. A área aparece a partir do 3º — o normal é marcar 4 ou mais.`}
          </p>
        )}
      </div>

      {conta.cruzamentos.length > 0 && (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Os lados se cruzam ({conta.cruzamentos.map(([a, b]) => `lado ${a} com lado ${b}`).join("; ")}) — a área
              está errada. Quase sempre é canto marcado fora de ordem: mude a ordem com as setas ou ponha em volta
              do centro.
            </span>
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => mexer(ordenarEmVolta(pontos))}
          >
            <Shuffle className="h-4 w-4" />
            Pôr os cantos em volta do centro
          </Button>
        </div>
      )}

      {/* O mapa */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <MapaDoLote pontos={pontos} className="block h-auto w-full" />
      </div>

      {/* Marcar */}
      {lendo ? (
        <PainelDaLeitura lendo={lendo} numero={proximo} onCancelar={cancelar} onUsarAgora={usarAgora} />
      ) : (
        <div className="space-y-2">
          <OpcaoModoPreciso modo={modo} onChange={setModo} />
          <Button type="button" className="h-14 w-full text-base" onClick={() => marcar(modo)}>
            <MapPin className="h-5 w-5" />
            {pontos.length === 0 ? "Marcar o 1º canto" : `Marcar o ${proximo}º canto`}
          </Button>
        </div>
      )}

      {erro && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
          {erro}
        </p>
      )}

      {/* Os cantos e os lados */}
      {pontos.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
          {pontos.map((p, i) => {
            const lado = conta.lados[i];
            const ultimo = i === pontos.length - 1;
            const mostraLado = lado !== undefined && (pontos.length >= 3 || !ultimo);
            return (
              <div key={`${p.em}-${i}`} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-700 text-xs font-bold text-white dark:bg-lime-500 dark:text-slate-900">
                    {i + 1}
                  </span>
                  <a
                    href={`https://www.google.com/maps?q=${p.lat.toFixed(7)},${p.lng.toFixed(7)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`min-w-0 flex-1 text-sm underline ${
                      p.precisao > PRECISAO_RUIM
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-produmar-600 dark:text-produmar-400"
                    }`}
                  >
                    {precisaoTexto(p.precisao)}
                    {p.leituras ? ` · ${p.leituras} leitura${p.leituras === 1 ? "" : "s"}` : ""} · ver no mapa
                  </a>
                  {!lendo && (
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => trocar(i, i - 1)}
                        disabled={i === 0}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                        aria-label={`Subir o ${i + 1}º ponto`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => trocar(i, i + 1)}
                        disabled={ultimo}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                        aria-label={`Descer o ${i + 1}º ponto`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => tirar(i)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        aria-label={`Tirar o ${i + 1}º ponto`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                {mostraLado && (
                  <p
                    className={`mt-1 pl-9 text-sm font-semibold tabular-nums ${
                      conta.cruzamentos.some(([a, b]) => a === i + 1 || b === i + 1)
                        ? "text-red-600 dark:text-red-400"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {ultimo ? `↺ lado ${i + 1}, de volta ao 1º` : `↓ lado ${i + 1}`}: {formatarMetros(lado)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {ruins > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {ruins === 1 ? "Um canto ficou" : `${ruins} cantos ficaram`} com precisão pior que ± {PRECISAO_RUIM} m (em
            amarelo). Se puder, volte nele, tire o ponto e marque de novo no modo preciso.
          </span>
        </p>
      )}

      {pontos.length > 0 && !lendo && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => mexer(pontos.slice(0, -1))}>
            <Undo2 className="h-4 w-4" />
            Desfazer o último
          </Button>
          {pontos.length >= 4 && conta.cruzamentos.length === 0 && (
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => mexer(ordenarEmVolta(pontos))}>
              <Shuffle className="h-4 w-4" />
              Pôr em volta
            </Button>
          )}
        </div>
      )}

      {/* Os dados do lote */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-1.5">
          <Label htmlFor="med-nome">Nome do lote ou terreno *</Label>
          <Input
            id="med-nome"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              setMudou(true);
            }}
            placeholder="Ex.: Lote 12 da Quadra B"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="med-local">Local</Label>
          <Input
            id="med-local"
            value={local}
            onChange={(e) => {
              setLocal(e.target.value);
              setMudou(true);
            }}
            placeholder="Ex.: Povoado Centro dos Aflitos"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="med-obs">Observação</Label>
          <Textarea
            id="med-obs"
            value={observacao}
            onChange={(e) => {
              setObservacao(e.target.value);
              setMudou(true);
            }}
            placeholder="Confrontantes, marcos, o que mais precisar"
          />
        </div>
      </div>

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

      <div className="space-y-2 pb-6">
        <Button type="button" className="h-12 w-full text-base" onClick={salvar} disabled={salvando || !!lendo}>
          {salvando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          {id ? "Salvar as mudanças" : "Salvar a medição"}
        </Button>
        {mudou && (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            {id ? "Tem mudança sem salvar" : "Ainda não salvo"} — fica guardado neste celular até salvar.
          </p>
        )}
        <div className="flex gap-2">
          {id && !mudou && (
            <a
              href={`/imprimir/medicao/${id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-produmar-200 bg-white text-sm font-medium text-produmar-700 hover:bg-produmar-50 dark:border-slate-700 dark:bg-slate-800 dark:text-produmar-400"
            >
              <Printer className="h-4 w-4" />
              Imprimir / PDF
            </a>
          )}
          {mudou && (
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={descartar} disabled={salvando}>
              <Undo2 className="h-4 w-4" />
              {id ? "Desfazer mudanças" : "Começar de novo"}
            </Button>
          )}
          {id && (
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 text-red-600 dark:text-red-400"
              onClick={apagar}
              disabled={salvando}
            >
              <Trash2 className="h-4 w-4" />
              Apagar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
