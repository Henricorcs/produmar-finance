"use client";

import { useEffect, useState } from "react";
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
import { createCostCenter } from "@/app/(app)/cost-centers/actions";
import type { CostCenter } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (costCenter: CostCenter) => void;
}

export function QuickCreateCostCenterDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setError("");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim().toUpperCase();
    if (!cleanName) {
      setError("Informe o nome do centro de custo.");
      return;
    }
    setLoading(true);
    setError("");

    const result = await createCostCenter({
      name: cleanName,
      description: description.trim().toUpperCase() || null,
    });

    setLoading(false);
    if ("error" in result) {
      setError(result.error ?? "Erro ao criar centro de custo.");
    } else {
      onCreated(result.costCenter);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            Novo centro de custo
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cc-name">Nome *</Label>
            <Input
              id="cc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: provedor de internet"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoCapitalize="characters"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="cc-desc">Descrição</Label>
            <Textarea
              id="cc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="opcional"
              rows={2}
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoCapitalize="characters"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/50">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Criando..." : "Criar centro de custo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
