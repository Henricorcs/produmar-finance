import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ServiceOrderStatus, ServiceOrderType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function formatBRLCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(1).replace(".", ",")}k`;
  }
  return formatBRL(value);
}

/**
 * Converte qualquer entrada em Date no fuso local. Strings no formato
 * YYYY-MM-DD são interpretadas como data local (não UTC) para evitar
 * o bug clássico de -1 dia em fusos negativos como BRT (UTC-3).
 */
function parseLocalDate(date: string | Date): Date {
  if (date instanceof Date) return new Date(date);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (match) {
    return new Date(
      parseInt(match[1], 10),
      parseInt(match[2], 10) - 1,
      parseInt(match[3], 10)
    );
  }
  return new Date(date);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR").format(parseLocalDate(date));
}

export function daysUntil(date: string | Date): number {
  const d = parseLocalDate(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Rótulo de status de OS — "Entregue" vira "Finalizado" quando a OS
 * é prestação de serviço (não há nada sendo entregue).
 */
export function osStatusLabel(
  status: ServiceOrderStatus,
  type?: ServiceOrderType
): string {
  if (status === "entregue" && type === "prestacao_servico") return "Finalizado";
  const map: Record<ServiceOrderStatus, string> = {
    pendente:     "Pendente",
    em_andamento: "Em andamento",
    entregue:     "Entregue",
    cancelado:    "Cancelado",
  };
  return map[status];
}

export function formatDueLabel(date: string | Date): {
  label: string;
  variant: "danger" | "warning" | "muted";
} {
  const days = daysUntil(date);
  if (days < 0) return { label: `Vencido há ${Math.abs(days)} dia(s)`, variant: "danger" };
  if (days === 0) return { label: "Vence hoje", variant: "danger" };
  if (days === 1) return { label: "Vence amanhã", variant: "danger" };
  if (days <= 3) return { label: `Em ${days} dias`, variant: "warning" };
  if (days <= 15) return { label: `Em ${days} dias`, variant: "muted" };
  return { label: formatDate(date), variant: "muted" };
}

export function getInitials(name?: string | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
