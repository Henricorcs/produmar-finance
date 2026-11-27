"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Archive, ArchiveRestore, Trash2, UtensilsCrossed } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { apagarPessoa, arquivarPessoa, salvarPessoa } from "@/app/(app)/alimentacao/actions";
import type { AlimentacaoPessoa } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// QUEM COME — o cadastro da lista da alimentação (migration 154)
// ─────────────────────────────────────────────────────────────────────────────
// Uma pergunta por vez: o nome e, se quiser, quem é ou o que veio fazer. É à
// parte do cadastro de Colaboradores — quem fez uma diária só também come.
// ─────────────────────────────────────────────────────────────────────────────

type Campo = "nome" | "observacao";
type Dados = Record<Campo, string>;

const PASSOS: PassoDef<Campo>[] = [
  {
    campo: "nome",
    secao: "Quem come",
    pergunta: "Nome de quem vai comer",
    tipo: "texto",
    maiusculo: true,
    obrigatorio: true,
    placeholder: "ex: JOÃO DA SILVA",
  },
  {
    campo: "observacao",
    secao: "Quem come",
    pergunta: "Quem é ou o que veio fazer",
    tipo: "texto",
    placeholder: "opcional — ex: diária na cerca",
    dica: "Ajuda a lembrar depois quem era quem veio só um dia.",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pessoa em edição — null põe alguém novo na lista. */
  pessoa: AlimentacaoPessoa | null;
}

export function PessoaDialog({ open, onClose, pessoa }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<Dados>({ nome: "", observacao: "" });

  useEffect(() => {
    if (!open) return;
    setDados({ nome: pessoa?.nome ?? "", observacao: pessoa?.observacao ?? "" });
    setErro(null);
  }, [open, pessoa]);

  const passosDef = useMemo(() => PASSOS, []);
  const fluxo = usePassoAPasso(passosDef, dados, open, !!pessoa);
  const { passo, passos, idx } = fluxo;

  function salvar() {
    setErro(null);
    if (!dados.nome.trim()) {
      setErro("Escreva o nome.");
      return;
    }
    startTransition(async () => {
      const falha = actionError(
        await salvarPessoa(pessoa?.id ?? null, {
          nome: dados.nome,
          observacao: dados.observacao,
        })
      );
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  function arquivar() {
    if (!pessoa) return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await arquivarPessoa(pessoa.id, !pessoa.ativo));
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  function apagar() {
    if (!pessoa) return;
    if (!confirm(`Apagar ${pessoa.nome} da lista? Isso não tem volta.`)) return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await apagarPessoa(pessoa.id));
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
              <UtensilsCrossed className="w-4 h-4" />
            </span>
            {fluxo.naRevisao ? "Revisar" : pessoa ? "Editar" : "Nova pessoa na alimentação"}
          </DialogTitle>
        </DialogHeader>

        {passo ? (
          <PerguntaDoPasso
            passo={passo}
            idx={idx}
            total={passos.length}
            valor={dados[passo.campo]}
            onMudar={(v) => setDados((d) => ({ ...d, [passo.campo]: v }))}
            onAvancar={fluxo.avancar}
            onVoltar={fluxo.voltar}
            onRevisao={fluxo.irParaRevisao}
            daRevisao={fluxo.daRevisao}
            rodape="Esta lista é só da comida — não entra no cadastro de Colaboradores."
          />
        ) : (
          <div className="space-y-4">
            <RevisaoDosPassos
              passos={passos}
              dados={dados}
              onEditar={fluxo.editar}
              avisoEmBranco="Toque em qualquer item para corrigir."
            />

            {pessoa && !pessoa.ativo && (
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400">
                Arquivado: não aparece na lista do dia. O que já comeu continua na conta.
              </p>
            )}

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
              </p>
            )}

            {pessoa && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={arquivar}
                  disabled={isPending}
                  className="flex-1 h-11 sm:h-10"
                >
                  {pessoa.ativo ? (
                    <>
                      <Archive className="w-4 h-4" /> Arquivar
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="w-4 h-4" /> Voltar para a lista
                    </>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={apagar}
                  disabled={isPending}
                  aria-label="Apagar da lista"
                  className="h-11 px-4 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 sm:h-10"
                >
                  <Trash2 className="w-4 h-4 inline" />
                </button>
              </div>
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
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
