"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, UserCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import { setDiaristaTecnicos } from "@/app/(app)/diaristas/actions";
import type { Diarista, EncarregadoDeObra } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  diarista: Diarista | null;
  /** Todos os usuários com o papel de encarregado de obra. */
  encarregados: EncarregadoDeObra[];
  /** Os que já cuidam deste colaborador — vêm marcados. */
  liberadoPara: string[];
}

/**
 * QUEM CUIDA DESTE COLABORADOR. O chefe marca os encarregados de obra que
 * podem ver a pessoa e marcar os dias dela na tela deles. Quem não está
 * marcado não vê a pessoa — e o banco não aceita lançamento dele (099).
 */
export function EncarregadosDialog({
  open,
  onClose,
  diarista,
  encarregados,
  liberadoPara,
}: Props) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setMarcados(new Set(liberadoPara));
    setError(null);
    // só ao abrir: a lista que chega de novo depois de salvar não pode
    // desfazer o que está sendo marcado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, diarista?.id]);

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function salvar() {
    if (!diarista) return;
    setError(null);
    startTransition(async () => {
      const r = await setDiaristaTecnicos(diarista.id, Array.from(marcados));
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isPending && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-produmar-50 text-produmar-600 dark:bg-produmar-900/40 dark:text-produmar-300 flex-shrink-0">
              <UserCheck className="w-4 h-4" />
            </span>
            <span className="min-w-0 truncate">Encarregados de obra</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Quem pode ver e marcar os dias de{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {diarista?.name}
            </span>
            ?
          </p>

          {encarregados.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-6 text-center space-y-1">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nenhum encarregado de obra cadastrado.
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Crie o usuário em Configurações → Usuários, com o perfil
                &quot;Encarregado de obra&quot;.
              </p>
            </div>
          ) : (
            <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {encarregados.map((e) => {
                const marcado = marcados.has(e.id);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={marcado}
                      onClick={() => alternar(e.id)}
                      disabled={isPending}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 min-h-[56px] text-left transition-colors",
                        marcado
                          ? "bg-produmar-50/60 dark:bg-produmar-900/20"
                          : "bg-white dark:bg-slate-900 active:bg-slate-50 dark:active:bg-slate-800"
                      )}
                    >
                      <span className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center justify-center flex-shrink-0 text-xs font-bold">
                        {getInitials(e.full_name || e.email)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {e.full_name || e.email}
                        </span>
                        {e.full_name && (
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">
                            {e.email}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                          marcado
                            ? "bg-produmar-600 border-produmar-600 text-white"
                            : "border-slate-300 dark:border-slate-600"
                        )}
                      >
                        {marcado && <Check className="w-4 h-4" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          {encarregados.length > 0 && (
            <Button
              type="button"
              onClick={salvar}
              disabled={isPending}
              className="w-full h-12 font-semibold"
            >
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Na tela do encarregado de obra só aparece quem estiver marcado aqui.
            Os dias que ele já lançou continuam valendo, mesmo se você desmarcar.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
