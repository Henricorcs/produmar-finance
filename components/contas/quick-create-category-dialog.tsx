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
import { createCategory } from "@/app/(app)/categorias/actions";
import type { Category, TransactionType } from "@/lib/types";

const PRESET_COLORS = [
  "#0A4DB8", "#3378F0", "#5A97FF",
  "#10B981", "#059669", "#34D399",
  "#F59E0B", "#D97706", "#FCD34D",
  "#EF4444", "#DC2626", "#F87171",
  "#8B5CF6", "#7C3AED", "#A78BFA",
  "#EC4899", "#DB2777", "#F9A8D4",
  "#14B8A6", "#0D9488", "#2DD4BF",
  "#64748B", "#475569", "#94A3B8",
];

interface Props {
  open: boolean;
  onClose: () => void;
  defaultType: TransactionType;
  onCreated: (category: Category) => void;
}

export function QuickCreateCategoryDialog({
  open,
  onClose,
  defaultType,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<TransactionType>(defaultType);
  const [color, setColor] = useState("#0A4DB8");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setType(defaultType);
      setColor("#0A4DB8");
      setError("");
    }
  }, [open, defaultType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim().toUpperCase();
    if (!cleanName) {
      setError("Informe o nome da categoria.");
      return;
    }
    setLoading(true);
    setError("");

    const result = await createCategory({ name: cleanName, type, color });

    setLoading(false);
    if ("error" in result) {
      setError(result.error ?? "Erro ao criar categoria.");
    } else {
      onCreated(result.category);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Nova categoria</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nome *</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: aluguel"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoCapitalize="characters"
              required
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["saida", "entrada"] as TransactionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`py-2 text-xs rounded-lg border font-medium transition-colors ${
                    type === t
                      ? t === "saida"
                        ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400"
                        : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {t === "saida" ? "Despesa" : "Receita"}
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: hex,
                    borderColor: color === hex ? "#0f172a" : "transparent",
                    boxShadow:
                      color === hex
                        ? `0 0 0 2px white, 0 0 0 3px ${hex}`
                        : "none",
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className="inline-block text-[10px] px-2 py-0.5 rounded-full text-white font-semibold uppercase"
                style={{ backgroundColor: color }}
              >
                {name.trim().toUpperCase() || "PRÉVIA"}
              </span>
            </div>
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
              {loading ? "Criando..." : "Criar categoria"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
