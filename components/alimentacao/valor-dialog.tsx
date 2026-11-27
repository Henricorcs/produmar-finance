"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  PerguntaDoPasso,
  RevisaoDosPassos,
  usePassoAPasso,
  type PassoDef,
} from "@/components/ui/passo-a-passo";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "@/components/alugueis/alugueis-shared";
import { actionError } from "@/lib/action-result";
import { cn, formatBRLInput, parseMoney } from "@/lib/utils";
import { salvarValorRefeicao } from "@/app/(app)/alimentacao/actions";

// ─────────────────────────────────────────────────────────────────────────────
// O VALOR DA REFEIÇÃO (migration 155) — quanto custa cada bandeco
// ─────────────────────────────────────────────────────────────────────────────
// Vale para o que for marcado daqui para frente; o que já foi marcado guarda o
// valor que tinha, e o custo dos meses passados não muda.
// ─────────────────────────────────────────────────────────────────────────────

type Campo = "valor";

const PASSOS: PassoDef<Campo>[] = [
  {
    campo: "valor",
    secao: "Alimentação",
    pergunta: "Quanto custa cada refeição?",
    tipo: "dinheiro",
    obrigatorio: true,
    dica: "Vale para o que for marcado daqui para frente. O que já foi marcado continua com o valor que tinha.",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  valorAtual: number;
}

export function ValorDialog({ open, onClose, valorAtual }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<Record<Campo, string>>({ valor: "" });

  useEffect(() => {
    if (!open) return;
    setDados({ valor: formatBRLInput(valorAtual) });
    setErro(null);
  }, [open, valorAtual]);

  const passosDef = useMemo(() => PASSOS, []);
  const fluxo = usePassoAPasso(passosDef, dados, open, false);
  const { passo, passos, idx } = fluxo;

  function salvar() {
    setErro(null);
    if (!dados.valor.trim()) {
      setErro("Informe o valor da refeição.");
      return;
    }
    startTransition(async () => {
      const falha = actionError(await salvarValorRefeicao(parseMoney(dados.valor)));
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
              <Wallet className="w-4 h-4" />
            </span>
            Valor da refeição
          </DialogTitle>
        </DialogHeader>

        {passo ? (
          <PerguntaDoPasso
            passo={passo}
            idx={idx}
            total={passos.length}
            valor={dados[passo.campo]}
            onMudar={(v) => setDados({ valor: v })}
            onAvancar={fluxo.avancar}
            onVoltar={fluxo.voltar}
            onRevisao={fluxo.irParaRevisao}
            daRevisao={fluxo.daRevisao}
          />
        ) : (
          <div className="space-y-4">
            <RevisaoDosPassos
              passos={passos}
              dados={dados}
              onEditar={fluxo.editar}
              avisoEmBranco="Toque no valor para corrigir."
            />

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
              </p>
            )}

            <DialogFooter className={STICKY_FOOTER}>
              <Button
                type="button"
                variant="outline"
                onClick={fluxo.voltar}
                disabled={isPending}
                className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
              >
                Voltar
              </Button>
              <Button
                type="button"
                onClick={salvar}
                disabled={isPending}
                className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
              >
                {isPending ? "Salvando..." : "Salvar valor"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
