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
import { createContact } from "@/app/(app)/obras/actions";
import type { Contact } from "@/lib/types";
import { upperKeepingCaret } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (contact: Contact) => void;
}

export function QuickCreateContactDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setName("");
      setDocument("");
      setPhone("");
      setError(null);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome do cliente");
      return;
    }
    startTransition(async () => {
      const r = await createContact({ name, document, phone });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao cadastrar cliente");
        return;
      }
      onCreated((r as { contact: Contact }).contact);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Novo cliente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ct_name">Nome *</Label>
            <Input
              id="ct_name"
              value={name}
              onChange={(e) => setName(upperKeepingCaret(e))}
              placeholder="nome ou razão social"
              autoCapitalize="characters"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct_doc">CPF / CNPJ</Label>
            <Input
              id="ct_doc"
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder="opcional"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct_phone">Telefone</Label>
            <Input
              id="ct_phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="opcional"
              autoComplete="off"
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
              {isPending ? "Criando..." : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
