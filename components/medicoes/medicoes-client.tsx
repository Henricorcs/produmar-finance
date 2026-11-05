"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, LandPlot, MapPin, Plus, Printer, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MapaDoLote } from "@/components/medicoes/mapa-do-lote";
import { formatarHectares, formatarM2 } from "@/lib/medicao-lote";
import { formatarMetros } from "@/lib/medir-cerca";
import { formatDate } from "@/lib/utils";
import type { Medicao } from "@/lib/types";

/** A lista das medições salvas, com a miniatura do lote, a área e o PDF. */
export function MedicoesClient({
  medicoes,
  migrationPendente,
}: {
  medicoes: Medicao[];
  migrationPendente: boolean;
}) {
  const [busca, setBusca] = useState("");
  const termo = busca
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const visiveis = termo
    ? medicoes.filter((m) =>
        `${m.nome} ${m.local ?? ""} ${m.observacao ?? ""}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .includes(termo)
      )
    : medicoes;
  const totalM2 = visiveis.reduce((s, m) => s + (Number(m.area_m2) || 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Medições</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Marque os cantos do terreno pelo GPS — o sistema desenha o lote e dá a área
          </p>
        </div>
        <Link
          href="/medicoes/nova"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-produmar-600 px-4 text-base font-medium text-white shadow-sm hover:bg-produmar-700 sm:h-10 sm:text-sm"
        >
          <Plus className="h-4 w-4" />
          Nova medição
        </Link>
      </div>

      {migrationPendente && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Rode a migration 131 no Supabase para o sistema guardar as medições. Até lá dá para medir: os cantos
            marcados ficam guardados neste celular.
          </span>
        </p>
      )}

      {medicoes.length > 3 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar pelo nome ou local"
            className="pl-9"
          />
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
          <LandPlot className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {medicoes.length === 0 ? "Nenhuma medição ainda. Toque em Nova medição e vá para o terreno." : "Nada com esse nome."}
          </p>
        </div>
      ) : (
        <>
          {visiveis.length > 1 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {visiveis.length} medições · somando {formatarM2(totalM2)} ({formatarHectares(totalM2)})
            </p>
          )}
          <div className="space-y-2">
            {visiveis.map((m) => (
              <div
                key={m.id}
                className="flex items-stretch gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
              >
                <Link href={`/medicoes/${m.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <MapaDoLote pontos={m.pontos ?? []} simples className="h-[68px] w-[90px] shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{m.nome}</p>
                    {m.local && (
                      <p className="flex items-center gap-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {m.local}
                      </p>
                    )}
                    {m.area_m2 !== null ? (
                      <p className="mt-0.5 text-sm tabular-nums text-slate-700 dark:text-slate-200">
                        <span className="font-semibold">{formatarM2(Number(m.area_m2))}</span> ·{" "}
                        {formatarHectares(Number(m.area_m2))}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">
                        {m.pontos?.length ?? 0} ponto(s) — falta marcar cantos
                      </p>
                    )}
                    <p className="text-xs text-slate-400">
                      {m.pontos?.length ?? 0} cantos
                      {m.perimetro_m !== null ? ` · perímetro ${formatarMetros(Number(m.perimetro_m))}` : ""} ·{" "}
                      {formatDate(new Date(m.created_at))}
                    </p>
                  </div>
                </Link>
                {m.area_m2 !== null && (
                  <a
                    href={`/imprimir/medicao/${m.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium text-produmar-600 hover:bg-produmar-50 dark:text-produmar-400 dark:hover:bg-slate-800"
                    aria-label={`Imprimir ou compartilhar ${m.nome}`}
                  >
                    <Printer className="h-5 w-5" />
                    PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
