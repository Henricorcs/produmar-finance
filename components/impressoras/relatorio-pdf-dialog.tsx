"use client";

import { FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/utils";
import { nomeDoMes } from "@/lib/impressoras";
import { RelatorioPdfAcoes } from "./relatorio-pdf-acoes";
import type { PrinterBilling } from "@/lib/types";

/** A caixa do relatório em PDF de uma fatura já fechada. */
export function RelatorioPdfDialog({
  billing,
  onClose,
}: {
  billing: PrinterBilling | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!billing} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <FileText className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
            Relatório de impressões
          </DialogTitle>
        </DialogHeader>
        {billing && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="capitalize">{nomeDoMes(billing.competencia)}</span> · total{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                {formatBRL(Number(billing.total_amount))}
              </span>
            </p>
            {/* key: trocar de fatura gera o PDF de novo */}
            <RelatorioPdfAcoes key={billing.id + billing.updated_at} billingId={billing.id} />
            <Button type="button" variant="outline" className="w-full" onClick={onClose}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
