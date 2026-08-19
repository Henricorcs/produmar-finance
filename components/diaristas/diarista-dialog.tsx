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
import { createDiarista, updateDiarista } from "@/app/(app)/diaristas/actions";
import { formatBRLInput, parseMoney, upperKeepingCaret } from "@/lib/utils";
import type { Diarista } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Diarista em edição — null cadastra um novo. */
  diarista: Diarista | null;
  onCreated?: (diaristaId: string) => void;
}

/**
 * Cadastro do diarista — só o chefe. É aqui que ficam as duas coisas que o
 * técnico não decide: quanto vale o dia dele e para onde vai o PIX.
 */
export function DiaristaDialog({ open, onClose, diarista, onCreated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(diarista?.name ?? "");
    setPhone(diarista?.phone ?? "");
    setPixKey(diarista?.pix_key ?? "");
    setDailyRate(diarista ? formatBRLInput(Number(diarista.daily_rate)) : "");
    setNotes(diarista?.notes ?? "");
    setError(null);
  }, [open, diarista]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome do diarista");
      return;
    }

    startTransition(async () => {
      const input = {
        name,
        phone,
        pix_key: pixKey,
        daily_rate: parseMoney(dailyRate),
        notes,
      };
      const r = diarista
        ? await updateDiarista(diarista.id, input)
        : await createDiarista(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      const id = (r as { diaristaId?: string }).diaristaId;
      if (!diarista && id) onCreated?.(id);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {diarista ? "Editar diarista" : "Novo diarista"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="di_name">Nome *</Label>
            <Input
              id="di_name"
              value={name}
              onChange={(e) => setName(upperKeepingCaret(e))}
              placeholder="ex: joão da silva"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="di_rate">Valor da diária (R$)</Label>
            <Input
              id="di_rate"
              value={dailyRate}
              onChange={(e) => setDailyRate(formatBRLInput(e.target.value))}
              placeholder="0,00"
              inputMode="decimal"
              className="tabular-nums text-lg font-semibold"
              autoComplete="off"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              É o que cada dia marcado no calendário passa a valer. Mudar aqui NÃO
              mexe no que já foi lançado.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="di_pix">Chave PIX</Label>
            <Input
              id="di_pix"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="CPF, celular, e-mail ou chave aleatória"
              className="tabular-nums"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Sai no relatório na hora de pagar — copiada exatamente como você
              escrever (e-mail e chave aleatória diferenciam maiúscula de minúscula).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="di_phone">Telefone</Label>
            <Input
              id="di_phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="opcional"
              inputMode="tel"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="di_notes">Observações</Label>
            <Textarea
              id="di_notes"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : diarista ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
