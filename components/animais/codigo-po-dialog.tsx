"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trocarCodigosPO } from "@/app/(app)/animais/actions";
import { normalizarCodigoPO } from "./animal-shared";
import type { AnimalWithInfo } from "@/lib/types";

/**
 * Para a busca: sem espaço e com a letra O igual ao zero — no curral se fala
 * "T zero zero um" para o TO01, e quem procura digita T001.
 */
function chaveBusca(s: string): string {
  return s.toUpperCase().replace(/s+/g, "").replace(/O/g, "0");
}

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
    const q = chaveBusca(busca.trim());
    return [...animals]
      .filter(
        (a) =>
          !q ||
          chaveBusca(a.tag).includes(q) ||
          chaveBusca(a.tag_antigo ?? "").includes(q) ||
          chaveBusca(codigos[a.id] ?? "").includes(q)
      )
      .sort((a, b) => a.tag.localeCompare(b.tag, "pt-BR", { numeric: true, sensitivity: "base" }));
  }, [animals, busca, codigos]);

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
      {/* Uma rolagem só — a da caixa. Antes a lista tinha rolagem própria
          dentro da caixa, e no iPhone com o teclado aberto sobravam duas
          linhas e o dedo prendia na rolagem errada. Agora a busca fica presa
          no alto e os botões presos embaixo, sempre à vista. */}
      <DialogContent className="max-w-md pt-0 pb-0">
        <form onSubmit={submit}>
          <div className="sticky top-0 -mx-5 px-5 pt-5 pb-2 bg-white dark:bg-slate-900 space-y-2">
            <DialogHeader className="mb-0">
              <DialogTitle className="dark:text-slate-100 pr-6">Código de compra do gado PO</DialogTitle>
            </DialogHeader>
            <p className="text-[12px] leading-snug text-slate-500 dark:text-slate-400">
              Ex: GSC 7893, CSCN 21368. Quem ficar em branco não muda; o número de hoje fica guardado.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Procurar o número (ex: TO01)"
                className="h-11 pl-9 text-base"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 dark:border-slate-700 dark:divide-slate-800">
            {lista.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">Nenhum animal com esse número.</p>
            ) : (
              lista.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="w-[5.5rem] flex-shrink-0 min-w-0">
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
                    // o teclado sobe e cobre metade da tela: traz a linha para o
                    // meio do que sobrou, senão se digita sem ver o campo
                    onFocus={(e) => {
                      const el = e.currentTarget;
                      setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
                    }}
                    // "Ok" do teclado fecha o teclado — não grava a lista
                    // inteira sem querer
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    enterKeyHint="done"
                    placeholder="Novo código"
                    aria-label={`Código de compra do animal ${a.tag}`}
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-11 min-w-0 flex-1 text-base uppercase"
                  />
                </div>
              ))
            )}
          </div>

          <div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-5 bg-white dark:bg-slate-900 space-y-2">
            {aviso && <p className="text-[12px] text-emerald-700 dark:text-emerald-400">{aviso}</p>}
            {error && (
              <p className="text-[13px] text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-300">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-10 flex-1 sm:flex-none">
                Voltar
              </Button>
              <Button
                type="submit"
                disabled={isPending || mudancas.length === 0}
                className="h-11 sm:h-10 flex-[2] sm:flex-none sm:ml-auto"
              >
                {isPending
                  ? "Salvando..."
                  : mudancas.length === 0
                    ? "Trocar números"
                    : `Trocar ${mudancas.length} ${mudancas.length === 1 ? "número" : "números"}`}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
