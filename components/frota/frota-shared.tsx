"use client";

import {
  CalendarDays,
  Clock,
  Gauge,
  HandCoins,
  Route,
  type LucideIcon,
} from "lucide-react";
import { cn, formatBRL, formatQty } from "@/lib/utils";
import { MACHINE_SERVICO_KINDS, type MachineServicoKind } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// O visual e os rótulos que a Frota inteira usa
// ─────────────────────────────────────────────────────────────────────────────

/** Rodapé de diálogo que fica colado embaixo no celular. */
export const STICKY_FOOTER =
  "sticky bottom-0 z-10 flex-row -mx-5 px-5 pt-3 pb-1 " +
  "bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 " +
  "sm:static sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:border-0";

/** Botão "Cancelar" do rodapé: estreito no celular, natural no desktop. */
export const FOOTER_CANCEL = "flex-1 sm:flex-none";
/** Botão principal do rodapé: ganha o dobro do espaço no celular. */
export const FOOTER_SUBMIT = "flex-[2] sm:flex-none";

/** Ícone de cada forma de cobrança — o mesmo na lista e no formulário. */
const KIND_ICON: Record<MachineServicoKind, LucideIcon> = {
  diaria: CalendarDays,
  viagem: Route,
  hora: Clock,
  km: Gauge,
  servico: HandCoins,
};

export type KindMeta = (typeof MACHINE_SERVICO_KINDS)[number] & { icon: LucideIcon };

/** A forma de cobrança com o ícone junto; cai na diária quando vem torto. */
export function kindMeta(kind?: string | null): KindMeta {
  const found =
    MACHINE_SERVICO_KINDS.find((k) => k.value === kind) ?? MACHINE_SERVICO_KINDS[0];
  return { ...found, icon: KIND_ICON[found.value] };
}

/**
 * A CONTA DO SERVIÇO do jeito que se fala: "3 viagens × R$ 200,00".
 *
 * É o que tira a dúvida na hora de conferir: sem ela a tela mostra só o total e
 * ninguém sabe se os R$ 600,00 vieram de 3 viagens a 200 ou de 2 a 300. No
 * valor fechado não há conta — a fórmula vem vazia.
 */
export function contaDoServico(
  kind: string | null | undefined,
  quantity: number,
  unitPrice: number
): string {
  const meta = kindMeta(kind);
  if (meta.value === "servico") return "";
  const q = Number(quantity) || 0;
  const nome = q === 1 ? meta.unit : meta.unitPlural;
  return `${formatQty(q)} ${nome} × ${formatBRL(Number(unitPrice) || 0)}`;
}

/** Cor do selo de cada categoria de veículo. */
export const CATEGORY_CHIP: Record<string, string> = {
  caminhao: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
  cacamba: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  trator: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  carregadeira: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
  maquina: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  outro: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function categoryChip(category?: string | null): string {
  return CATEGORY_CHIP[category ?? "outro"] ?? CATEGORY_CHIP.outro;
}

/** Verde quando sobrou, vermelho quando faltou. */
export function toneResultado(valor: number): string {
  return valor < 0
    ? "text-rose-700 dark:text-rose-400"
    : "text-emerald-700 dark:text-emerald-400";
}

/** Chip de filtro rolável (categoria do veículo, tipo de lançamento). */
export function Chip({
  label,
  ativo,
  onClick,
}: {
  label: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
        ativo
          ? "bg-produmar-600 border-produmar-600 text-white"
          : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
      )}
    >
      {label}
    </button>
  );
}

/** Um número do painel (RECEITAS / DESPESAS / RESULTADO). */
export function Numero({
  label,
  valor,
  tom,
}: {
  label: string;
  valor: string;
  tom: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-3 px-1">
      <span className={cn("text-sm sm:text-base font-bold leading-none tabular-nums", tom)}>
        {valor}
      </span>
      <span className="text-[11px] font-medium leading-none tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
    </div>
  );
}
