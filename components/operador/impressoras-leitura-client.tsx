"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, Gauge, Pencil, Printer as PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MonthNav } from "@/components/ui/month-nav";
import { formatBRL, formatDate } from "@/lib/utils";
import {
  competenciaDe,
  dataDaLeituraAnterior,
  formatPaginas,
  leiturasAnteriores,
  nomeDoMes,
} from "@/lib/impressoras";
import { LeiturasDialog } from "@/components/impressoras/leituras-dialog";
import { RelatorioPdfDialog } from "@/components/impressoras/relatorio-pdf-dialog";
import type { Printer, PrinterBilling, PrinterContract, PrinterReading } from "@/lib/types";

interface Props {
  contracts: PrinterContract[];
  printers: Printer[];
  billings: PrinterBilling[];
  readings: PrinterReading[];
  month: string;
  migrationPendente?: boolean;
}

/**
 * A ABA IMPRESSORAS DO PAINEL DO OPERADOR.
 *
 * Um cartão por contrato: se a leitura do mês ainda não foi feita, um botão
 * grande para lançar; se já foi, o total e o relatório em PDF para mandar. Nada
 * de cadastro, baixa ou exclusão — isso é do escritório.
 */
export function OperadorImpressorasClient({
  contracts,
  printers,
  billings,
  readings,
  month,
  migrationPendente = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [lancando, setLancando] = useState<PrinterContract | null>(null);
  const [pdfDe, setPdfDe] = useState<PrinterBilling | null>(null);

  const competencia = competenciaDe(month);

  function navegarMes(dir: -1 | 1) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    startTransition(() => router.push(`${pathname}?m=${mes}`));
  }

  /** Tudo que a caixa de leituras precisa de um contrato, no mês da tela. */
  const doContrato = useMemo(() => {
    const map = new Map<
      string,
      {
        impressoras: Printer[];
        faturas: PrinterBilling[];
        fatura: PrinterBilling | null;
        leiturasDaFatura: PrinterReading[];
      }
    >();
    for (const c of contracts) {
      const faturas = billings.filter((b) => b.contract_id === c.id);
      const fatura = faturas.find((b) => b.competencia === competencia) ?? null;
      const leiturasDaFatura = fatura ? readings.filter((r) => r.billing_id === fatura.id) : [];
      const naFatura = new Set(leiturasDaFatura.map((r) => r.printer_id));
      const impressoras = printers
        .filter((p) => p.contract_id === c.id && (p.active || naFatura.has(p.id)))
        .sort((a, b) => a.unit - b.unit);
      map.set(c.id, { impressoras, faturas, fatura, leiturasDaFatura });
    }
    return map;
  }, [contracts, printers, billings, readings, competencia]);

  const alvo = lancando ? doContrato.get(lancando.id) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <PrinterIcon className="w-5 h-5 text-produmar-600 dark:text-produmar-400" />
          Leitura das impressoras
        </h1>
      </div>

      <MonthNav label={nomeDoMes(competencia)} onPrev={() => navegarMes(-1)} onNext={() => navegarMes(1)} />

      {migrationPendente && (
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>O aluguel de impressoras ainda não está ligado no banco. Avise o escritório.</span>
        </p>
      )}

      {contracts.length === 0 && !migrationPendente && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
          Nenhum contrato de impressoras ativo.
        </p>
      )}

      {contracts.map((c) => {
        const d = doContrato.get(c.id);
        if (!d) return null;
        return (
          <Card key={c.id} className="p-4 space-y-3 border-2">
            <div>
              <p className="text-xl font-black text-slate-800 dark:text-slate-100">{c.client_name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {c.contract_number ? `Contrato nº ${c.contract_number} · ` : ""}
                {d.impressoras.length} {d.impressoras.length === 1 ? "impressora" : "impressoras"}
              </p>
            </div>

            {d.fatura ? (
              <>
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2.5 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      Leitura feita em {formatDate(d.fatura.reading_date)}
                    </p>
                    <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 tabular-nums">
                      {formatPaginas(d.fatura.total_pages)} páginas · {formatBRL(Number(d.fatura.total_amount))}
                    </p>
                  </div>
                </div>
                <Button className="w-full h-14 text-base font-bold" onClick={() => setPdfDe(d.fatura)}>
                  <FileText className="w-5 h-5" />
                  RELATÓRIO EM PDF
                </Button>
                <Button variant="outline" className="w-full h-11" onClick={() => setLancando(c)}>
                  <Pencil className="w-4 h-4" />
                  Corrigir as leituras
                </Button>
              </>
            ) : d.impressoras.length === 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Este contrato ainda não tem impressora cadastrada. Avise o escritório.
              </p>
            ) : (
              <Button className="w-full h-16 text-base font-bold" onClick={() => setLancando(c)}>
                <Gauge className="w-5 h-5" />
                LANÇAR AS LEITURAS
              </Button>
            )}
          </Card>
        );
      })}

      {lancando && alvo && (
        <LeiturasDialog
          open={!!lancando}
          onClose={() => setLancando(null)}
          contract={lancando}
          printers={alvo.impressoras}
          billing={alvo.fatura}
          readings={alvo.leiturasDaFatura}
          anteriores={leiturasAnteriores(alvo.impressoras, alvo.faturas, readings, competencia)}
          competencia={competencia}
          dataAnterior={dataDaLeituraAnterior(alvo.faturas, competencia)}
          modo="operador"
        />
      )}

      <RelatorioPdfDialog billing={pdfDe} onClose={() => setPdfDe(null)} />
    </div>
  );
}
