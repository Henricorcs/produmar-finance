"use client";

import { useState, useTransition, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPickupLocation } from "@/app/(app)/operacoes/actions";
import type { PickupLocation } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (loc: PickupLocation) => void;
}

export function QuickCreateLocationDialog({ open, onClose, onCreated }: Props) {
  const [name, setName]         = useState("");
  const [address, setAddress]   = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) { setName(""); setAddress(""); setError(null); }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Nome é obrigatório");
    startTransition(async () => {
      const r = await createPickupLocation({ name, address });
      if ("error" in r) setError(r.error);
      else { onCreated(r.location); onClose(); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Novo local de retirada</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="loc_name">Nome *</Label>
            <Input
              id="loc_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: pedreira norte"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoCapitalize="characters"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc_addr">Endereço</Label>
            <Input
              id="loc_addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="rua / km / referência"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoCapitalize="characters"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Criando…" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
