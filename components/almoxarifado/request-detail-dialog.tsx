"use client";

import { ArrowUpFromLine, HardHat } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate, formatQty } from "@/lib/utils";
import { fmtDateTime, num } from "./supply-shared";
import type { Machine, SupplyObraSector, SupplyRequestRow } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  request: SupplyRequestRow | null;
  /** Setores das obras — o nome sai do id (sem join, para não quebrar sem a 057). */
  sectors?: SupplyObraSector[];
  /** Frota — mesma ideia: o nome da máquina sai do id. */
  machines?: Machine[];
  /** Foto que o técnico mandou (URL assinada). */
  photoUrl: string | null;
  rejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * O envio do técnico por inteiro. O cartão da aba "Pendentes" mostra o resumo
 * numa linha só (é uma fila, tem que caber na tela); o que ele escreveu de
 * observação, onde aplicou e a que horas mandou ficam aqui — antes de o chefe
 * decidir se dá baixa ou descarta.
 */
export function SupplyRequestDetailDialog({
  open,
  onClose,
  request,
  sectors = [],
  machines = [],
  photoUrl,
  rejecting,
  onApprove,
  onReject,
}: Props) {
  if (!request) return null;

  const nome = request.supply_items?.name ?? request.item_text ?? "—";
  const unit = request.supply_items?.unit ?? "";

  /** O que veio do serviço em si: setor da obra, máquina e abastecimento. */
  const setor = sectors.find((x) => x.id === request.sector_id)?.name ?? null;
  const machine = machines.find((m) => m.id === request.machine_id) ?? null;
  const maquina = machine ? `${machine.name}${machine.plate ? ` (${machine.plate})` : ""}` : null;
  const hourmeter = request.machine_hourmeter != null ? num(request.machine_hourmeter) : null;
  const km = request.machine_km != null ? num(request.machine_km) : null;
  const leituraRotulo = km != null ? "Km do painel" : "Horímetro";
  const leitura =
    km != null ? formatQty(km) : hourmeter != null ? formatQty(hourmeter) : null;
  /** Material escrito na mão: o chefe ainda tem que casar com o cadastro. */
  const foraDoCadastro = !request.item_id;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-500 dark:bg-amber-900/30 dark:text-amber-400">
              <HardHat className="w-4 h-4" />
            </span>
            Material que o técnico usou
          </DialogTitle>
        </DialogHeader>

        {photoUrl && (
          <a href={photoUrl} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={nome}
              className="w-full h-44 object-cover rounded-xl border border-slate-200 dark:border-slate-700 mb-4"
            />
          </a>
        )}

        <div className="space-y-3">
          <div>
            <p className="text-xl font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
              {formatQty(num(request.quantity))} {unit}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{nome}</p>
          </div>

          {foraDoCadastro && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2.5 py-2">
              Escrito na mão — escolha o material do cadastro ao dar baixa.
            </p>
          )}

          <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <Linha rotulo="Local da obra" valor={request.supply_obras?.name ?? "sem obra"} />
            <Linha rotulo="Setor" valor={setor ?? request.destination ?? "—"} />
            {maquina && <Linha rotulo="Máquina" valor={maquina} />}
            {leitura && <Linha rotulo={leituraRotulo} valor={leitura} />}
            {request.fuel_type && <Linha rotulo="Abasteceu" valor={request.fuel_type} />}
            <Linha rotulo="Enviado por" valor={request.sent_by_name ?? "—"} />
            <Linha rotulo="Data do uso" valor={formatDate(request.used_date)} />
            <Linha rotulo="Avisou em" valor={fmtDateTime(request.created_at)} />
          </dl>

          {request.notes && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Observação do técnico
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2">
                {request.notes}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onReject} disabled={rejecting}>
            Descartar
          </Button>
          <Button type="button" onClick={onApprove} disabled={rejecting}>
            <ArrowUpFromLine className="w-4 h-4" />
            Dar baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <dt className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">{rotulo}</dt>
      <dd className="text-xs font-medium text-slate-700 dark:text-slate-200 text-right break-words">
        {valor}
      </dd>
    </div>
  );
}
