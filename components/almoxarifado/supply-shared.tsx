"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { SupplyMovementType, SupplyStatus } from "@/lib/types";

/** Unidades sugeridas no cadastro — o campo aceita qualquer texto. */
export const UNIT_SUGGESTIONS = [
  "un",
  "pç",
  "m",
  "cm",
  "kg",
  "g",
  "L",
  "mL",
  "cx",
  "rolo",
  "barra",
  "saco",
  "par",
  "jogo",
  "lata",
  "tubo",
];

export const STATUS_META: Record<SupplyStatus, { label: string; chip: string; dot: string }> = {
  ok: {
    label: "Em estoque",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  baixo: {
    label: "Acabando",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  zerado: {
    label: "Zerado",
    chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    dot: "bg-red-500",
  },
};

export const MOVEMENT_META: Record<
  SupplyMovementType,
  { label: string; sign: string; text: string; bg: string }
> = {
  entrada: {
    label: "Entrada",
    sign: "+",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
  },
  saida: {
    label: "Saída",
    sign: "−",
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/30",
  },
  ajuste: {
    label: "Ajuste",
    sign: "",
    text: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800",
  },
};

/**
 * Máscara de quantidade: dígitos e UMA vírgula com até 3 casas. Não usa
 * separador de milhar para o valor continuar sendo lido com `parseQty`.
 */
export function formatQtyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 3) return parts[0] + "," + parts[1].slice(0, 3);
  return cleaned;
}

/** Lê a quantidade digitada (12,5 → 12.5). */
export function parseQty(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** Valor de um numeric do Postgres — vem como string em alguns joins. */
export function num(v: unknown): number {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : n;
}

/** Data + hora curtas (a lista de movimentos usa o timestamp de criação). */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Campo de foto: abre a câmera no celular e mostra a miniatura do que foi
 * tirado. `currentUrl` é a foto que já está salva (some quando trocam por outra).
 */
export function PhotoField({
  label,
  hint,
  file,
  onChange,
  currentUrl,
  onRemoveCurrent,
}: {
  label: string;
  hint?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  currentUrl?: string | null;
  onRemoveCurrent?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = preview ?? (file ? null : currentUrl ?? null);

  function clear() {
    if (file) {
      onChange(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    onRemoveCurrent?.();
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />

      {shown ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shown}
            alt={label}
            className="w-full h-36 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
          />
          <button
            type="button"
            onClick={clear}
            aria-label="Remover foto"
            className="absolute top-1.5 right-1.5 w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-xs font-medium hover:bg-black/80"
          >
            <Camera className="w-3.5 h-3.5" />
            Trocar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 min-h-[52px] rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <Camera className="w-4 h-4" />
          Tirar foto
        </button>
      )}

      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}
