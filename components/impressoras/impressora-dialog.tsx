"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
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
import { actionError } from "@/lib/action-result";
import { cn, formatBRLInput, parseMoney, upperKeepingCaret } from "@/lib/utils";
import { formatPreco } from "@/lib/impressoras";
import { createPrinter, deletePrinter, updatePrinter } from "@/app/(app)/impressoras/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "@/components/alugueis/alugueis-shared";
import type { Printer, PrinterContract } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  contract: PrinterContract;
  /** Impressora em edição — null cadastra uma nova. */
  printer: Printer | null;
  /** A próxima unidade livre, para a nova já nascer numerada. */
  proximaUnidade: number;
  /** Os modelos já cadastrados, para não digitar de novo. */
  modelos: string[];
}

function lerNumero(texto: string): number {
  const n = parseFloat(texto.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/**
 * A IMPRESSORA — unidade, série, modelo, mensalidade e o contador inicial.
 *
 * O contador inicial é a leitura de quando ela foi instalada: é a "leitura
 * anterior" do primeiro mês. Dali em diante a leitura anterior sai sozinha da
 * fatura do mês passado.
 */
export function ImpressoraDialog({
  open,
  onClose,
  contract,
  printer,
  proximaUnidade,
  modelos,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [unidade, setUnidade] = useState("");
  const [serie, setSerie] = useState("");
  const [modelo, setModelo] = useState("");
  const [local, setLocal] = useState("");
  const [mensalidade, setMensalidade] = useState("");
  const [precoProprio, setPrecoProprio] = useState("");
  const [contadorInicial, setContadorInicial] = useState("");
  const [ativa, setAtiva] = useState(true);

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setUnidade(String(printer?.unit ?? proximaUnidade));
    setSerie(printer?.serial_number ?? "");
    setModelo(printer?.model ?? "");
    setLocal(printer?.location ?? "");
    setMensalidade(printer ? formatBRLInput(Number(printer.monthly_fee)) : "");
    setPrecoProprio(printer?.page_price != null ? formatPreco(Number(printer.page_price)) : "");
    setContadorInicial(printer ? String(printer.initial_reading) : "");
    setAtiva(printer?.active ?? true);
  }, [open, printer, proximaUnidade]);

  const sugestoes = modelos.filter((m) => m && m !== modelo.toUpperCase()).slice(0, 6);

  function salvar() {
    setErro(null);
    if (!serie.trim()) return setErro("Informe o número de série");
    if (!(Number(unidade) > 0)) return setErro("Informe a unidade (UNID)");
    const input = {
      contract_id: contract.id,
      unit: Number(unidade),
      serial_number: serie,
      model: modelo,
      location: local,
      monthly_fee: parseMoney(mensalidade),
      page_price: precoProprio.trim() ? lerNumero(precoProprio) : null,
      initial_reading: Math.round(lerNumero(contadorInicial)),
      active: ativa,
    };
    startTransition(async () => {
      const falha = actionError(
        printer ? await updatePrinter(printer.id, input) : await createPrinter(input)
      );
      if (falha) return setErro(falha);
      onClose();
    });
  }

  function apagar() {
    if (!printer) return;
    if (!confirm(`Apagar a impressora ${printer.unit} (${printer.serial_number})?`)) return;
    startTransition(async () => {
      const falha = actionError(await deletePrinter(printer.id));
      if (falha) return setErro(falha);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {printer ? `Impressora ${printer.unit}` : "Nova impressora"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[5rem_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="imp_unid">UNID *</Label>
              <Input
                id="imp_unid"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums text-center"
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="imp_serie">Número de série *</Label>
              <Input
                id="imp_serie"
                value={serie}
                onChange={(e) => setSerie(upperKeepingCaret(e))}
                placeholder="U63883D2N864009"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imp_modelo">Modelo</Label>
            {sugestoes.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {sugestoes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModelo(m)}
                    className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            <Input
              id="imp_modelo"
              value={modelo}
              onChange={(e) => setModelo(upperKeepingCaret(e))}
              placeholder="HL - L2360DW"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imp_local">Onde está</Label>
            <Input
              id="imp_local"
              value={local}
              onChange={(e) => setLocal(upperKeepingCaret(e))}
              placeholder="ex: RECEPÇÃO (opcional)"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="imp_mensal">Mensalidade (R$)</Label>
              <Input
                id="imp_mensal"
                value={mensalidade}
                onChange={(e) => setMensalidade(formatBRLInput(e.target.value))}
                placeholder="350,00"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imp_preco">Preço da página</Label>
              <Input
                id="imp_preco"
                value={precoProprio}
                onChange={(e) => setPrecoProprio(e.target.value.replace(/[^\d,.]/g, ""))}
                placeholder={formatPreco(Number(contract.page_price))}
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-2">
            Preço da página vazio usa o do contrato (R$ {formatPreco(Number(contract.page_price))}).
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="imp_inicial">Contador na instalação</Label>
            <Input
              id="imp_inicial"
              value={contadorInicial}
              onChange={(e) => setContadorInicial(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="ex: 22343"
              inputMode="numeric"
              autoComplete="off"
              className="tabular-nums"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              É a leitura anterior do primeiro mês. Depois, ela sai sozinha da fatura passada.
            </p>
          </div>

          {printer && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={ativa}
                onChange={(e) => setAtiva(e.target.checked)}
                className="w-4 h-4"
              />
              Ativa — entra na leitura do mês
            </label>
          )}

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter className={STICKY_FOOTER}>
          {printer && (
            <button
              type="button"
              onClick={apagar}
              disabled={isPending}
              aria-label="Apagar impressora"
              className="h-11 px-3 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 sm:h-10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
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
