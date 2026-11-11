"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trocarCodigosPO } from "@/app/(app)/animais/actions";
import { normalizarCodigoPO } from "./animal-shared";
import type { AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** O gado PO aberto na tela (só quem está no rebanho hoje). */
  animals: AnimalWithInfo[];
}

/**
 * Gado PO: troca o número de brinco pelo código de compra (GSC 7893, CSCN
 * 21368, GART 1341...). Uma linha por animal com o número de hoje e o campo
 * do código; só vai para o banco o que foi preenchido. O número de antes fica
 * guardado e a busca ainda acha o animal por ele.
 */
export function CodigoPODialog({ open, onClose, animals }: Props) {
  const [codigos, setCodigos] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setCodigos({});
    setBusca("");
    setError(null);
    setAviso(null);
  }, [open]);

  const lista = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return [...animals]
      .filter(
        (a) =>
          !q ||
          a.tag.toUpperCase().includes(q) ||
          (a.tag_antigo ?? "").toUpperCase().includes(q)
      )
      .sort((a, b) => a.tag.localeCompare(b.tag, "pt-BR", { numeric: true, sensitivity: "base" }));
  }, [animals, busca]);

  /** O que vai mudar de verdade: preenchido e diferente do número de hoje. */
  const mudancas = useMemo(() => {
    const porId = new Map(animals.map((a) => [a.id, a]));
    return Object.entries(codigos)
      .map(([animal_id, codigo]) => ({ animal_id, codigo: normalizarCodigoPO(codigo) }))
      .filter((m) => m.codigo && m.codigo !== porId.get(m.animal_id)?.tag);
  }, [codigos, animals]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mudancas.length === 0) {
      setError("Digite o código de compra de pelo menos um animal");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await trocarCodigosPO(mudancas);
      if (r.error) {
        setError(r.error);
        // o que passou já passou: a tela recarrega com o número novo e esses
        // somem da contagem do botão — sobram só os que falharam
        if (r.trocados) setAviso(`${r.trocados} já trocado(s).`);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 pr-6">Código de compra do gado PO</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <p className="text-[13px] text-slate-600 dark:text-slate-400">
            Digite o código de compra no lugar do número (ex: GSC 7893, CSCN 21368, GART 1341).
            Deixe em branco quem não muda. O número de hoje fica guardado e a busca ainda acha o
            animal por ele.
          </p>

          {animals.length > 8 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Procurar pelo número..."
                className="h-11 pl-9 text-base sm:text-sm"
                autoComplete="off"
              />
            </div>
          )}

          <div className="max-h-[50vh] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 divide-y divide-slate-100 dark:border-slate-700 dark:divide-slate-800">
            {lista.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">Nenhum animal com esse número.</p>
            ) : (
              lista.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="w-24 flex-shrink-0 min-w-0">
                    <span className="block text-base font-bold tabular-nums text-slate-800 dark:text-slate-100 truncate">
                      {a.tag}
                    </span>
                    {a.tag_antigo && (
                      <span className="block text-[11px] text-slate-400 truncate">nº antigo {a.tag_antigo}</span>
                    )}
                  </div>
                  <Input
                    value={codigos[a.id] ?? ""}
                    onChange={(e) => setCodigos((c) => ({ ...c, [a.id]: e.target.value.toUpperCase() }))}
                    placeholder="Código de compra"
                    aria-label={`Código de compra do animal ${a.tag}`}
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-11 flex-1 text-base uppercase"
                  />
                </div>
              ))
            )}
          </div>

          {aviso && <p className="text-[12px] text-emerald-700 dark:text-emerald-400">{aviso}</p>}
          {error && (
            <p className="text-[13px] text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-300">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-10">
              Voltar
            </Button>
            <Button type="submit" disabled={isPending || mudancas.length === 0} className="h-11 sm:h-10">
              {isPending
                ? "Salvando..."
                : mudancas.length === 0
                  ? "Trocar números"
                  : `Trocar ${mudancas.length} ${mudancas.length === 1 ? "número" : "números"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
