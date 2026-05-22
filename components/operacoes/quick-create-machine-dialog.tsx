"use client";

import { useState, useTransition, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMachine } from "@/app/(app)/operacoes/actions";
import type { Machine } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (m: Machine) => void;
}

export function QuickCreateMachineDialog({ open, onClose, onCreated }: Props) {
  const [name, setName]   = useState("");
  const [plate, setPlate] = useState("");
  const [type, setType]   = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) { setName(""); setPlate(""); setType(""); setError(null); }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Nome é obrigatório");
    startTransition(async () => {
      const r = await createMachine({ name, plate, type });
      if ("error" in r) setError(r.error);
      else { onCreated(r.machine); onClose(); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Nova máquina</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mch_name">Nome *</Label>
            <Input
              id="mch_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: caminhão 01"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoCapitalize="characters"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mch_plate">Placa</Label>
              <Input
                id="mch_plate"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="ABC-1234"
                className="uppercase placeholder:normal-case"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mch_type">Tipo</Label>
              <Input
                id="mch_type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="caçamba, escavadeira..."
              />
            </div>
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
