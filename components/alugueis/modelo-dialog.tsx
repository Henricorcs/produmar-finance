"use client";

import { useEffect, useState, useTransition } from "react";
import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { actionError } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { salvarModeloContrato } from "@/app/(app)/alugueis/actions";
import { CAMPOS_DO_CONTRATO } from "@/lib/alugueis-contrato";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./alugueis-shared";
import type { RentalContractTemplate } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  template: RentalContractTemplate | null;
}

/**
 * O MODELO DO CONTRATO.
 *
 * É o texto do contrato de vocês, com os campos entre chaves duplas. Na hora de
 * imprimir, cada {{CAMPO}} vira o dado do contrato cadastrado — o que antes era
 * escrito à mão em vermelho.
 *
 * Mexer aqui muda o contrato de todo mundo daqui pra frente; o que já foi
 * impresso continua como foi impresso.
 */
export function ModeloDialog({ open, onClose, template }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [verCampos, setVerCampos] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBody(template?.body ?? "");
    setVerCampos(false);
    setErro(null);
  }, [open, template]);

  function salvar() {
    setErro(null);
    if (!body.trim()) {
      setErro("O modelo não pode ficar vazio");
      return;
    }
    startTransition(async () => {
      const falha = actionError(await salvarModeloContrato(template?.id ?? null, body));
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  /** Põe o campo no fim do texto — quem edita não precisa decorar o nome. */
  function inserirCampo(campo: string) {
    setBody((atual) => `${atual}{{${campo}}}`);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <FileText className="w-4 h-4" />
            </span>
            Modelo do contrato
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            É o texto que sai na impressão. Tudo que estiver entre chaves duplas é
            trocado pelo dado do contrato — o resto sai igualzinho ao que está escrito
            aqui.
          </p>

          <button
            type="button"
            onClick={() => setVerCampos((v) => !v)}
            className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 underline underline-offset-2"
          >
            {verCampos ? "Esconder os campos" : "Ver os campos que posso usar"}
          </button>

          {verCampos && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
              {CAMPOS_DO_CONTRATO.map((c) => (
                <button
                  key={c.campo}
                  type="button"
                  onClick={() => inserirCampo(c.campo)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <span className="text-[11px] font-mono font-semibold text-produmar-700 dark:text-produmar-400">
                    {`{{${c.campo}}}`}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                    {c.descricao}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="md_body">Texto do contrato</Label>
            <textarea
              id="md_body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={18}
              spellCheck={false}
              className="w-full rounded-md border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs leading-relaxed text-slate-900 dark:text-slate-100 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-produmar-500"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Uma linha em branco separa um parágrafo do outro. A linha{" "}
              <span className="font-mono">[[ASSINATURAS]]</span> vira o bloco de
              assinaturas do fim.
            </p>
          </div>

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
            {isPending ? "Salvando..." : "Salvar o modelo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
