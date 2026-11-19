"use client";

import { useEffect, useState, useTransition } from "react";
import { Skull } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatQty, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { createAnimalLoteMovimento } from "@/app/(app)/animais/actions";
import { formatDecimalInput, localLabel, parseDecimal } from "./animal-shared";
import type { AnimalLoteResumo } from "@/lib/types";

/**
 * MORTE NO TANQUE, direto do cartão.
 *
 * Antes a morte só entrava abrindo o ciclo e achando o formulário de
 * "movimento" lá embaixo — quem estava na beira do tanque não achava. Aqui é
 * quantos morreram, o dia e (se quiser) o motivo. Entra como movimento de
 * morte do ciclo: baixa o saldo de vivos e conta na mortalidade.
 */
export function LoteMorteDialog({
  lote,
  onClose,
}: {
  lote: AnimalLoteResumo | null;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState("");
  const [movedOn, setMovedOn] = useState(localDateISO());
  const [notes, setNotes] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!lote) return;
    setQuantity("");
    setMovedOn(localDateISO());
    setNotes("");
    setErro(null);
  }, [lote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lote) return null;
  const saldo = Number(lote.saldo ?? 0);
  const palavra = localLabel(lote.species).toLowerCase();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!lote) return;
    setErro(null);
    const qtd = parseDecimal(quantity);
    if (qtd <= 0) {
      setErro("Informe quantos morreram");
      return;
    }
    if (qtd > saldo && !confirm(`O ${palavra} só tem ${formatQty(saldo)} vivos. Lançar ${formatQty(qtd)} mortes mesmo assim?`))
      return;
    startTransition(async () => {
      const r = await createAnimalLoteMovimento({
        lote_id: lote.id,
        kind: "morte",
        moved_on: movedOn,
        quantity: qtd,
        notes,
      });
      if (r && "error" in r) {
        setErro(r.error ?? "Erro ao lançar a morte");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={!!lote} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <Skull className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            Morte · {lote.tanque_name}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Hoje tem <strong className="text-cyan-700 dark:text-cyan-400">{formatQty(saldo)} vivos</strong>{" "}
            neste {palavra}.
          </p>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="morte_qtd">Quantos morreram *</Label>
              <Input
                id="morte_qtd"
                value={quantity}
                onChange={(e) => setQuantity(formatDecimalInput(e.target.value))}
                placeholder="0"
                className="h-12 text-lg tabular-nums font-semibold"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="morte_data">Dia</Label>
              <Input
                id="morte_data"
                type="date"
                value={movedOn}
                onChange={(e) => setMovedOn(e.target.value)}
                className="h-12 tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="morte_motivo">Motivo (opcional)</Label>
            <Input
              id="morte_motivo"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="EX: FALTA DE OXIGÊNIO"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="h-11 bg-rose-600 hover:bg-rose-700"
              disabled={isPending || !quantity.trim()}
            >
              {isPending ? "Salvando..." : "Lançar morte"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
