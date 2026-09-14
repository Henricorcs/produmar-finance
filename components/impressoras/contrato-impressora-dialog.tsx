"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionError } from "@/lib/action-result";
import { cn, localDateISO, upperKeepingCaret } from "@/lib/utils";
import {
  createPrinterContract,
  setPrinterContractStatus,
  updatePrinterContract,
} from "@/app/(app)/impressoras/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "@/components/alugueis/alugueis-shared";
import type { PrinterContract } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Contrato em edição — null cadastra um novo. */
  contract: PrinterContract | null;
  /** Depois de criar, a tela passa a mostrar o contrato novo. */
  onCreated?: (id: string) => void;
}

/** "0,05" / "0.05" → 0.05 */
function lerNumero(texto: string): number {
  const n = parseFloat(texto.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/**
 * O CONTRATO DE ALUGUEL DE IMPRESSORAS — o cliente, a franquia e o preço.
 *
 * A franquia é o que o contrato já cobre: essas páginas saem do total da
 * fatura. O preço da página vale para toda impressora que não tiver o seu.
 */
export function ContratoImpressoraDialog({ open, onClose, contract, onCreated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [cliente, setCliente] = useState("");
  const [documento, setDocumento] = useState("");
  const [numero, setNumero] = useState("");
  const [emitente, setEmitente] = useState("");
  const [franquia, setFranquia] = useState("");
  const [precoPagina, setPrecoPagina] = useState("0,05");
  const [diaVencimento, setDiaVencimento] = useState("10");
  const [inicio, setInicio] = useState(localDateISO());
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setCliente(contract?.client_name ?? "");
    setDocumento(contract?.client_document ?? "");
    setNumero(contract?.contract_number ?? "");
    setEmitente(contract?.issuer_name ?? "");
    setFranquia(contract ? String(contract.franchise_pages) : "");
    setPrecoPagina(
      contract ? Number(contract.page_price).toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : "0,05"
    );
    setDiaVencimento(contract ? String(contract.due_day) : "10");
    setInicio(contract?.start_date ?? localDateISO());
    setObs(contract?.notes ?? "");
  }, [open, contract]);

  function salvar() {
    setErro(null);
    if (!cliente.trim()) return setErro("Informe o cliente");
    const input = {
      client_name: cliente,
      client_document: documento,
      contract_number: numero,
      issuer_name: emitente,
      franchise_pages: Math.round(lerNumero(franquia)),
      page_price: lerNumero(precoPagina),
      due_day: Math.round(lerNumero(diaVencimento)) || 10,
      start_date: inicio,
      notes: obs,
    };
    startTransition(async () => {
      if (contract) {
        const falha = actionError(await updatePrinterContract(contract.id, input));
        if (falha) return setErro(falha);
      } else {
        const r = await createPrinterContract(input);
        const falha = actionError(r);
        if (falha) return setErro(falha);
        if ("id" in r && r.id) onCreated?.(r.id);
      }
      onClose();
    });
  }

  function alternarStatus() {
    if (!contract) return;
    const novo = contract.status === "ativo" ? "encerrado" : "ativo";
    if (novo === "encerrado" && !confirm("Encerrar este contrato? As faturas continuam guardadas.")) return;
    startTransition(async () => {
      const falha = actionError(await setPrinterContractStatus(contract.id, novo));
      if (falha) return setErro(falha);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {contract ? "Contrato de impressoras" : "Novo contrato de impressoras"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ci_cliente">Cliente *</Label>
            <Input
              id="ci_cliente"
              value={cliente}
              onChange={(e) => setCliente(upperKeepingCaret(e))}
              placeholder="ex: ACQUA"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ci_numero">Nº do contrato</Label>
              <Input
                id="ci_numero"
                value={numero}
                onChange={(e) => setNumero(upperKeepingCaret(e))}
                placeholder="1895/2022"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci_doc">CNPJ do cliente</Label>
              <Input
                id="ci_doc"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="opcional"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ci_franquia">Franquia (páginas)</Label>
              <Input
                id="ci_franquia"
                value={franquia}
                onChange={(e) => setFranquia(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="4050"
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci_preco">Preço da página (R$)</Label>
              <Input
                id="ci_preco"
                value={precoPagina}
                onChange={(e) => setPrecoPagina(e.target.value.replace(/[^\d,.]/g, ""))}
                placeholder="0,05"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-2">
            As páginas da franquia saem do total da fatura, pelo preço da página.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ci_dia">Vence todo dia</Label>
              <Input
                id="ci_dia"
                value={diaVencimento}
                onChange={(e) => setDiaVencimento(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                placeholder="10"
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci_inicio">Início</Label>
              <Input
                id="ci_inicio"
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ci_emitente">Quem cobra (cabeçalho do relatório)</Label>
            <Input
              id="ci_emitente"
              value={emitente}
              onChange={(e) => setEmitente(upperKeepingCaret(e))}
              placeholder="ex: ILNET"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ci_obs">Observação</Label>
            <Textarea
              id="ci_obs"
              value={obs}
              onChange={(e) => setObs(upperKeepingCaret(e))}
              placeholder="opcional"
              rows={2}
              autoCapitalize="characters"
            />
          </div>

          {contract && (
            <button
              type="button"
              onClick={alternarStatus}
              disabled={isPending}
              className={cn(
                "text-xs font-medium",
                contract.status === "ativo"
                  ? "text-red-600 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {contract.status === "ativo" ? "Encerrar este contrato" : "Reativar este contrato"}
            </button>
          )}

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter className={STICKY_FOOTER}>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={salvar}
            disabled={isPending}
            className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
          >
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
