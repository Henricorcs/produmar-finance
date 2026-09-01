"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCheck,
  Loader2,
  MapPin,
  Navigation,
  PlayCircle,
  Truck,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionError } from "@/lib/action-result";
import { cn, formatDate, formatQty, parseMoney, upperKeepingCaret } from "@/lib/utils";
import {
  finalizarMachineServico,
  iniciarMachineServico,
} from "@/app/(app)/frota/actions";
import { kindMeta } from "@/components/frota/frota-shared";
import type { MachineServicoDoOperador } from "@/lib/types";

/**
 * AS OS DE MÁQUINA NO PAINEL DO OPERADOR.
 *
 * A OS de máquina agora nasce na ficha do veículo (módulo Máquinas e Veículos)
 * e é ENVIADA para o operador. Aqui ele vê só o que mandaram para ele: qual
 * máquina, para quem é o serviço, o que fazer e o trecho. Um toque em INICIAR
 * quando começa; um toque em FINALIZAR quando acaba, contando quantas viagens
 * (ou horas, ou km) realmente fez — é o que vale para o valor da OS.
 *
 * Letra grande e botão do tamanho do dedo: quem usa está na rua, no sol.
 */
export function FrotaOSList({ items }: { items: MachineServicoDoOperador[] }) {
  const [finalizando, setFinalizando] = useState<MachineServicoDoOperador | null>(null);

  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
        <Truck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        Serviço de máquina ({items.length})
      </h2>

      {items.map((os) => (
        <FrotaOSCard key={os.id} os={os} onFinalizar={() => setFinalizando(os)} />
      ))}

      <FinalizarFrotaOSDialog
        os={finalizando}
        onClose={() => setFinalizando(null)}
      />
    </section>
  );
}

/**
 * O que este operador já finalizou na máquina — só leitura, para ele conferir
 * que fechou mesmo. Sem botão: o que passou, passou; correção é no escritório.
 */
export function FrotaOSFinalizadas({ items }: { items: MachineServicoDoOperador[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
        <Truck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        Serviço de máquina ({items.length})
      </h2>

      {items.map((os) => {
        const meta = kindMeta(os.kind);
        return (
          <Card key={os.id} className="p-4 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-base font-bold text-slate-700 dark:text-slate-200 truncate">
                {os.machines?.name ?? "Máquina"}
              </p>
              <span className="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 flex-shrink-0">
                FINALIZADA
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
              {formatDate(os.service_date)} · {meta.label}
              {meta.value !== "servico"
                ? ` · ${formatQty(Number(os.quantity))} ${
                    Number(os.quantity) === 1 ? meta.unit : meta.unitPlural
                  }`
                : ""}
              {os.contratante ? ` · ${os.contratante}` : ""}
            </p>
            {(os.completion_notes || os.description) && (
              <p className="text-sm text-slate-600 dark:text-slate-300 break-words">
                {os.completion_notes || os.description}
              </p>
            )}
          </Card>
        );
      })}
    </section>
  );
}

function FrotaOSCard({
  os,
  onFinalizar,
}: {
  os: MachineServicoDoOperador;
  onFinalizar: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const meta = kindMeta(os.kind);
  const emAndamento = !!os.started_at;
  const combinado =
    meta.value === "servico"
      ? "Valor fechado"
      : `${formatQty(Number(os.quantity))} ${
          Number(os.quantity) === 1 ? meta.unit : meta.unitPlural
        }`;
  const trecho = [os.origin, os.destination].filter(Boolean).join(" → ");

  function iniciar() {
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await iniciarMachineServico(os.id));
      if (falha) setErro(falha);
    });
  }

  return (
    <Card className="p-4 space-y-3 border-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xl font-black text-slate-800 dark:text-slate-100 truncate">
            {os.machines?.name ?? "Máquina"}
          </p>
          {os.machines?.plate && (
            <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">
              {os.machines.plate}
            </p>
          )}
        </div>
        <span
          className={cn(
            "text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0",
            emAndamento
              ? "bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
          )}
        >
          {emAndamento ? "EM ANDAMENTO" : "A FAZER"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold px-2 py-1 rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 flex items-center gap-1">
          <meta.icon className="w-3.5 h-3.5" />
          {meta.label.toUpperCase()}
        </span>
        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
          {combinado} · {formatDate(os.service_date)}
        </span>
      </div>

      {os.description && (
        <p className="text-base font-medium text-slate-700 dark:text-slate-200 break-words leading-snug">
          {os.description}
        </p>
      )}

      <div className="space-y-1.5">
        {os.contratante && (
          <Linha icon={User} label="Para">
            {os.contratante}
          </Linha>
        )}
        {os.origin && (
          <Linha icon={MapPin} label="Sai de">
            {os.origin}
          </Linha>
        )}
        {os.destination && (
          <Linha icon={Navigation} label="Vai para">
            {os.destination}
          </Linha>
        )}
        {!os.origin && !os.destination && trecho && (
          <Linha icon={Navigation} label="Trecho">
            {trecho}
          </Linha>
        )}
      </div>

      {os.notes && (
        <p className="text-sm text-slate-500 dark:text-slate-400 break-words">{os.notes}</p>
      )}

      {erro && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
          {erro}
        </p>
      )}

      {emAndamento ? (
        <Button className="w-full h-14 text-base font-bold" onClick={onFinalizar}>
          <CheckCheck className="w-5 h-5" />
          FINALIZAR
        </Button>
      ) : (
        <div className="space-y-2">
          <Button
            className="w-full h-14 text-base font-bold"
            onClick={iniciar}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <PlayCircle className="w-5 h-5" />
            )}
            INICIAR
          </Button>
          {/* Esqueceu de iniciar e o serviço já acabou: fecha direto */}
          <Button variant="outline" className="w-full h-11" onClick={onFinalizar}>
            <CheckCheck className="w-4 h-4" />
            Já terminei, finalizar
          </Button>
        </div>
      )}
    </Card>
  );
}

function Linha({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">
          {label}
        </span>
        <div className="text-base font-medium text-slate-700 dark:text-slate-200 break-words leading-snug">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * FINALIZAR — o operador conta o que realmente fez.
 *
 * A quantidade já vem preenchida com o que foi combinado no escritório; se
 * foram 4 viagens e não 3, ele corrige aqui e o valor da OS acompanha. Quem
 * estava na rua era ele.
 */
function FinalizarFrotaOSDialog({
  os,
  onClose,
}: {
  os: MachineServicoDoOperador | null;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [oQueFoiFeito, setOQueFoiFeito] = useState("");

  const meta = kindMeta(os?.kind);
  const fechado = meta.value === "servico";

  useEffect(() => {
    if (!os) return;
    setQuantidade(formatQty(Number(os.quantity)));
    setOQueFoiFeito(os.completion_notes ?? "");
    setErro(null);
  }, [os]);

  function finalizar() {
    if (!os) return;
    setErro(null);

    const feito = fechado ? null : parseMoney(quantidade);
    if (!fechado && (feito === null || feito <= 0)) {
      setErro(`Diga quantos ${meta.unitPlural} você fez`);
      return;
    }

    startTransition(async () => {
      const falha = actionError(
        await finalizarMachineServico(os.id, {
          quantity: feito,
          completion_notes: oQueFoiFeito,
        })
      );
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={!!os} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Finalizar serviço</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {os?.machines?.name}
            {os?.contratante ? ` · ${os.contratante}` : ""}
          </p>

          {!fechado && (
            <div className="space-y-1.5">
              <Label htmlFor="fim_qtd">
                Quantos {meta.unitPlural} você fez? *
              </Label>
              <Input
                id="fim_qtd"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="h-14 text-xl font-bold tabular-nums text-center"
                inputMode="decimal"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Já vem com o que foi combinado. Se fez mais ou menos, corrija aqui.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="fim_obs">O que foi feito</Label>
            <Textarea
              id="fim_obs"
              value={oQueFoiFeito}
              onChange={(e) => setOQueFoiFeito(upperKeepingCaret(e))}
              placeholder="opcional"
              rows={3}
              className="uppercase placeholder:normal-case placeholder:lowercase"
            />
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 h-12"
          >
            Voltar
          </Button>
          <Button
            type="button"
            onClick={finalizar}
            disabled={isPending}
            className="flex-[2] h-12 font-bold"
          >
            {isPending ? "Finalizando..." : "FINALIZAR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
