import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { MapaDoLote } from "@/components/medicoes/mapa-do-lote";
import { MedicaoBarra } from "@/components/medicoes/medicao-barra";
import { contaDoLote, formatarHectares, formatarM2 } from "@/lib/medicao-lote";
import { formatarMetros } from "@/lib/medir-cerca";
import type { Medicao } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * A MEDIÇÃO IMPRESSA — o mapa do lote, a área em m² e hectares, o perímetro e
 * a tabela dos cantos. A barra de cima compartilha o mesmo conteúdo em PDF.
 */
export default async function ImprimirMedicaoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const { data: m } = await supabase.from("medicoes").select("*").eq("id", params.id).maybeSingle<Medicao>();

  if (!m) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Medição não encontrada.</p>
      </div>
    );
  }

  const pontos = m.pontos ?? [];
  const conta = contaDoLote(pontos);
  const n = pontos.length;
  const quando = new Date(m.created_at).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          @page { size: A4; margin: 10mm 12mm; }
        }
        body { font-family: Arial, Helvetica, sans-serif; background: white; color: #0f172a; }
        table, svg { break-inside: avoid; }
      `}</style>
      <MedicaoBarra
        medicao={{ nome: m.nome, local: m.local, observacao: m.observacao, pontos, data: m.created_at }}
      />
      <div className="mx-auto max-w-[190mm] space-y-4 px-4 py-4 print:px-0 print:py-0">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-lime-700">Medição de lote pelo GPS</p>
          <h1 className="text-2xl font-bold">{m.nome}</h1>
          <p className="text-sm text-slate-500">
            {[m.local, `Medido em ${quando}`].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-lime-200 bg-lime-50 p-3 text-center sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-bold uppercase text-lime-700">Área</p>
            <p className="text-lg font-bold tabular-nums">{conta.fechado ? formatarM2(conta.areaM2) : "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-lime-700">Hectares</p>
            <p className="text-lg font-bold tabular-nums">{conta.fechado ? formatarHectares(conta.areaM2) : "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-lime-700">Perímetro</p>
            <p className="text-lg font-bold tabular-nums">{conta.fechado ? formatarMetros(conta.perimetro) : "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-lime-700">Cantos</p>
            <p className="text-lg font-bold tabular-nums">{n}</p>
          </div>
          {conta.fechado && (
            <p className="col-span-2 text-xs text-slate-500 sm:col-span-4">
              margem do GPS: ± {formatarM2(conta.margemM2)}
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <MapaDoLote pontos={pontos} claro className="block h-auto w-full" />
        </div>

        {conta.cruzamentos.length > 0 && (
          <p className="text-sm font-semibold text-red-600">
            Atenção: os lados se cruzam (em vermelho) — a área desta medição não vale.
          </p>
        )}

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-lime-700 text-left text-white">
              <th className="px-2 py-1.5 text-center">Canto</th>
              <th className="px-2 py-1.5">Latitude</th>
              <th className="px-2 py-1.5">Longitude</th>
              <th className="px-2 py-1.5 text-right">Precisão</th>
              <th className="px-2 py-1.5 text-right">Lado até o próximo</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p, i) => (
              <tr key={i} className="border-b border-slate-200 tabular-nums">
                <td className="px-2 py-1.5 text-center font-semibold">{i + 1}º</td>
                <td className="px-2 py-1.5">{p.lat.toFixed(7)}</td>
                <td className="px-2 py-1.5">{p.lng.toFixed(7)}</td>
                <td className="px-2 py-1.5 text-right">± {p.precisao.toFixed(1).replace(".", ",")} m</td>
                <td className="px-2 py-1.5 text-right">
                  {conta.lados[i] !== undefined && (n >= 3 || i < n - 1)
                    ? `${formatarMetros(conta.lados[i])} (${i + 1} a ${i + 1 === n ? 1 : i + 2})`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {m.observacao && (
          <div>
            <p className="text-sm font-bold">Observação</p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{m.observacao}</p>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Medida pelo GPS do celular, no plano (o desnível do terreno não entra). Serve para conferência — não
          substitui o levantamento topográfico.
        </p>
      </div>
    </div>
  );
}
