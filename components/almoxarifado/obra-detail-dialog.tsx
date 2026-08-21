"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowUpFromLine, Fence, HardHat, MapPin, Pencil, Trash2, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL, formatQty } from "@/lib/utils";
import { deleteSupplyObra, getSupplyObraMovements } from "@/app/(app)/almoxarifado/actions";
import { fmtDateTime, num } from "./supply-shared";
import type {
  SupplyFenceRunView,
  SupplyItemWithStock,
  SupplyObraSector,
  SupplyObraUsage,
} from "@/lib/types";

/** Saída da obra — vem da consulta sob demanda, sem o limite da listagem. */
type ObraMovement = {
  id: string;
  item_id: string;
  quantity: number;
  person: string | null;
  destination: string | null;
  created_at: string;
  supply_items: { name: string; unit: string } | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  obra: SupplyObraUsage | null;
  /** Catálogo, para pegar o custo médio de cada material. */
  items: SupplyItemWithStock[];
  /** Setores de TODAS as obras — o diálogo filtra os desta. */
  sectors?: SupplyObraSector[];
  /** Metros de cerca de TODAS as obras — o diálogo filtra os desta (063). */
  fenceRuns?: SupplyFenceRunView[];
  onNewSaida: (obra: SupplyObraUsage) => void;
  onEdit: (obra: SupplyObraUsage) => void;
  /** Abre o cadastro de setores já nesta obra. */
  onManageSectors: (obra: SupplyObraUsage) => void;
}

export function ObraDetailDialog({
  open,
  onClose,
  obra,
  items,
  sectors = [],
  fenceRuns = [],
  onNewSaida,
  onEdit,
  onManageSectors,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [movements, setMovements] = useState<ObraMovement[]>([]);
  const [loading, setLoading] = useState(false);

  // o consumo inteiro da obra, sem o teto da listagem da página
  const obraId = obra?.id ?? null;
  useEffect(() => {
    setMovements([]);
    if (!open || !obraId) return;
    let cancelled = false;
    setLoading(true);
    getSupplyObraMovements(obraId).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if ("movements" in r) setMovements(r.movements as unknown as ObraMovement[]);
    });
    return () => {
      cancelled = true;
    };
  }, [open, obraId]);

  /** Os setores desta obra — é o que o técnico vê em "Setor aplicado". */
  const obraSectors = useMemo(
    () => sectors.filter((x) => x.obra_id === obra?.id),
    [sectors, obra?.id]
  );

  /**
   * A cerca desta obra: quanto andou e quanto custou, por setor. Numa obra de
   * cerca é este o número que interessa — o material é só o meio.
   */
  const cerca = useMemo(() => {
    const meus = fenceRuns.filter((r) => r.obra_id === obra?.id);
    const porSetor = new Map<string, { nome: string; metros: number; valor: number }>();
    for (const r of meus) {
      const key = r.sector_id ?? "sem";
      const cur = porSetor.get(key) ?? {
        nome: r.sector_name ?? "Sem setor",
        metros: 0,
        valor: 0,
      };
      cur.metros += num(r.meters);
      cur.valor += num(r.total_value);
      porSetor.set(key, cur);
    }
    return {
      metros: meus.reduce((s, r) => s + num(r.meters), 0),
      valor: meus.reduce((s, r) => s + num(r.total_value), 0),
      setores: [...porSetor.values()].sort((a, b) => b.metros - a.metros),
    };
  }, [fenceRuns, obra?.id]);

  const costByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) map.set(i.id, i.avg_unit_cost != null ? num(i.avg_unit_cost) : 0);
    return map;
  }, [items]);

  /** Consumo somado por material — é o que interessa numa obra. */
  const byItem = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; unit: string; qty: number; value: number }
    >();
    for (const m of movements) {
      const key = m.item_id;
      const current = map.get(key) ?? {
        id: key,
        name: m.supply_items?.name ?? "—",
        unit: m.supply_items?.unit ?? "",
        qty: 0,
        value: 0,
      };
      const qty = num(m.quantity);
      current.qty += qty;
      current.value += qty * (costByItem.get(key) ?? 0);
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value || b.qty - a.qty);
  }, [movements, costByItem]);

  if (!obra) return null;

  function handleDelete() {
    const o = obra!;
    if (
      !confirm(
        `Excluir a obra "${o.name}"? As saídas já lançadas NÃO são apagadas — elas ficam sem obra.`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteSupplyObra(o.id);
      if (r && "error" in r) {
        alert(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 pr-8">{obra.name}</DialogTitle>
          {obra.client && <p className="text-[11px] text-slate-400">{obra.client}</p>}
        </DialogHeader>

        <div className="space-y-4">
          {/* Total consumido */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">
              Material consumido
            </p>
            {/* números da view: não piscam zero enquanto as saídas carregam */}
            <p className="mt-1.5 text-3xl font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
              {formatBRL(num(obra.total_value))}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {num(obra.items_count) === 1 ? "1 material" : `${num(obra.items_count)} materiais`} ·{" "}
              {num(obra.movements_count) === 1
                ? "1 saída"
                : `${num(obra.movements_count)} saídas`}
            </p>
          </div>

          <Button className="w-full" onClick={() => onNewSaida(obra)}>
            <ArrowUpFromLine className="w-4 h-4" />
            Lançar saída para esta obra
          </Button>

          {/* Cerca: metro feito por setor (o técnico lança só o metro) */}
          {cerca.metros > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Fence className="w-3.5 h-3.5 text-lime-600" />
                Cerca feita
              </p>
              <div className="rounded-xl border border-lime-200 dark:border-lime-900/50 bg-lime-50/60 dark:bg-lime-950/20 px-3 py-2.5 flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {formatQty(cerca.metros)} m
                </span>
                <span className="text-sm font-semibold text-produmar-700 dark:text-produmar-400 tabular-nums">
                  {formatBRL(cerca.valor)}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {cerca.setores.map((s) => (
                  <div key={s.nome} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">
                      {s.nome}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums flex-shrink-0">
                      {formatQty(s.metros)} m
                    </span>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0 w-24 text-right">
                      {formatBRL(s.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Setores: o subcadastro que o técnico escolhe na tela dele */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Setores desta obra
              </p>
              <button
                type="button"
                onClick={() => onManageSectors(obra!)}
                className="min-h-[36px] px-2 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
              >
                {obraSectors.length > 0 ? "Cadastrar / apagar" : "Cadastrar setores"}
              </button>
            </div>

            {obraSectors.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {obraSectors.map((s) => (
                  <span
                    key={s.id}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Nenhum setor ainda — é o que o técnico escolhe em &quot;Setor aplicado&quot;.
              </p>
            )}
          </div>

          {/* Consumo por material */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Consumo por material
            </p>
            {byItem.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                {loading ? "Carregando..." : "Nenhum material saiu para esta obra ainda."}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {byItem.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {r.name}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {formatQty(r.qty)} {r.unit}
                      </p>
                    </div>
                    {r.value > 0 && (
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
                        {formatBRL(r.value)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saídas lançadas */}
          {movements.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Saídas lançadas
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 max-h-48 overflow-y-auto">
                {movements.slice(0, 40).map((m) => (
                  <div key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                    <span className="w-1.5 h-8 rounded-full bg-red-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate tabular-nums">
                        {formatQty(num(m.quantity))} {m.supply_items?.unit ?? ""} ·{" "}
                        {m.supply_items?.name ?? "—"}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {fmtDateTime(m.created_at)}
                        {m.person ? ` · ${m.person}` : ""}
                        {m.destination ? ` · ${m.destination}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {obra.notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
              {obra.notes}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onEdit(obra)}>
              <Pencil className="w-4 h-4" />
              Editar
            </Button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="h-10 px-4 rounded-md border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
            >
              <Trash2 className="w-4 h-4 inline" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Card da obra na aba — nome, cliente e quanto de material já consumiu. */
export function ObraCard({
  obra,
  onOpen,
}: {
  obra: SupplyObraUsage;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 cursor-pointer transition-all hover:shadow-md hover:border-produmar-200 dark:hover:border-produmar-800 active:bg-slate-50 dark:active:bg-slate-800/60"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
          <HardHat className="w-4 h-4 text-orange-600 dark:text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {obra.name}
          </p>
          {obra.client && (
            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
              <User className="w-3 h-3" />
              {obra.client}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
            {formatBRL(num(obra.total_value))}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
            {num(obra.items_count)} {num(obra.items_count) === 1 ? "material" : "materiais"}
          </p>
        </div>
      </div>
    </div>
  );
}
