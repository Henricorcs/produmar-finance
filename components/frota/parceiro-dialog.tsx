"use client";

import { useEffect, useState, useTransition } from "react";
import { Handshake, Trash2 } from "lucide-react";
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
import { cn, upperKeepingCaret } from "@/lib/utils";
import {
  createMachineParceiro,
  deleteMachineParceiro,
  updateMachineParceiro,
} from "@/app/(app)/frota/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./frota-shared";
import type { MachineParceiro } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Parceiro em edição — null cadastra um novo. */
  parceiro: MachineParceiro | null;
}

/** O cadastro de quem troca máquina com a gente. */
export function ParceiroDialog({ open, onClose, parceiro }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(parceiro?.name ?? "");
    setPhone(parceiro?.phone ?? "");
    setNotes(parceiro?.notes ?? "");
    setErro(null);
  }, [open, parceiro]);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!name.trim()) {
      setErro("Escreva o nome do parceiro");
      return;
    }
    startTransition(async () => {
      const input = { name, phone, notes };
      const r = parceiro
        ? await updateMachineParceiro(parceiro.id, input)
        : await createMachineParceiro(input);
      const falha = actionError(r);
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  function apagar() {
    if (!parceiro) return;
    if (
      !confirm(
        `Apagar ${parceiro.name}? Todo o histórico de troca com ele vai junto e isso não tem volta.`
      )
    )
      return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await deleteMachineParceiro(parceiro.id));
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
              <Handshake className="w-4 h-4" />
            </span>
            {parceiro ? "Editar parceiro" : "Novo parceiro"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pc_nome">Nome *</Label>
            <Input
              id="pc_nome"
              value={name}
              onChange={(e) => setName(upperKeepingCaret(e))}
              placeholder="ex: josé da terraplanagem"
              className="h-11 uppercase placeholder:normal-case placeholder:lowercase sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pc_fone">Telefone</Label>
            <Input
              id="pc_fone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="opcional"
              className="h-11 sm:h-10"
              inputMode="tel"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pc_obs">Observação</Label>
            <Textarea
              id="pc_obs"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional — o combinado da parceria"
              rows={2}
              className="uppercase placeholder:normal-case placeholder:lowercase"
            />
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            {parceiro && (
              <button
                type="button"
                onClick={apagar}
                disabled={isPending}
                aria-label="Apagar parceiro"
                className="h-11 px-4 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 sm:h-10"
              >
                <Trash2 className="w-4 h-4 inline" />
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
              type="submit"
              disabled={isPending}
              className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
            >
              {isPending ? "Salvando..." : parceiro ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
