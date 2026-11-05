"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarCheck,
  Gauge,
  HardHat,
  MapPin,
  Pencil,
  Tractor,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  cn,
  formatBRL,
  formatBRLInput,
  formatDate,
  formatQty,
  parseMoney,
  upperKeepingCaret,
} from "@/lib/utils";
import { deleteDiaristaDia, updateDiaristaDia } from "@/app/(app)/diaristas/actions";
import { formatHoras, valorDaMaquina } from "@/lib/maquina-na-diaria";
import type { DiaristaMaquina, DiaristaObra } from "./lancar-dia-dialog";
import type { DiaristaDia, SupplyObraSector } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  dia: DiaristaDia | null;
  diaristaName: string;
  obras: DiaristaObra[];
  sectors: SupplyObraSector[];
  /** Para mostrar o nome da máquina pesada do dia (132). */
  maquinas?: DiaristaMaquina[];
  /** Só o chefe corrige o que já foi lançado (a diária vale dinheiro). */
  canEdit?: boolean;
  /** O chefe apaga qualquer um; o técnico só o que ele mesmo marcou. */
  canDelete?: boolean;
}

/**
 * O que foi lançado naquele dia. Para o técnico é só conferência (e apagar o
 * que ele mesmo marcou errado); para o chefe é onde se corrige a descrição, a
 * obra e o valor daquele dia.
 */
export function DiaDetailDialog({
  open,
  onClose,
  dia,
  diaristaName,
  obras,
  sectors,
  maquinas = [],
  canEdit,
  canDelete,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [description, setDescription] = useState("");
  const [obraId, setObraId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [rate, setRate] = useState("");
  const [halfDay, setHalfDay] = useState(false);

  // A máquina do dia e o valor da hora: o gravado no dia manda; sem ele, o do
  // cadastro (é a mesma regra das views da obra, migration 132).
  const maquinaDoDia = dia?.machine_id
    ? maquinas.find((m) => m.id === dia.machine_id) ?? null
    : null;
  const valorHoraDoDia = Number(dia?.machine_hourly_rate ?? maquinaDoDia?.hourly_rate ?? 0);

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setError(null);
    setDescription(dia?.description ?? "");
    setObraId(dia?.obra_id ?? "");
    setSectorId(dia?.sector_id ?? "");
    setRate(dia ? formatBRLInput(Number(dia.daily_rate)) : "");
    setHalfDay(dia?.half_day === true);
  }, [open, dia]);

  /**
   * Trocar entre dia inteiro e meia diária já ajusta o valor na tela (metade ou
   * dobro do que está lá). O chefe ainda pode digitar por cima — mas ninguém
   * precisa fazer a conta na mão para o caso normal.
   */
  function toggleHalf(meia: boolean) {
    if (meia === halfDay) return;
    setHalfDay(meia);
    const atual = parseMoney(rate);
    if (atual > 0) {
      const novo = meia ? atual / 2 : atual * 2;
      setRate(formatBRLInput(Math.round(novo * 100) / 100));
    }
  }

  const obraSectors = useMemo(
    () => sectors.filter((s) => s.obra_id === obraId),
    [sectors, obraId]
  );

  const obraName = obras.find((o) => o.id === dia?.obra_id)?.name ?? null;
  const sectorName = sectors.find((s) => s.id === dia?.sector_id)?.name ?? null;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dia) return;
    setError(null);
    // a diária é de uma obra: corrigir o dia não pode deixá-lo solto de novo
    if (!obraId) return setError("Diga em qual obra ele trabalhou");
    startTransition(async () => {
      const r = await updateDiaristaDia(dia.id, {
        description,
        obra_id: obraId || null,
        sector_id: obraId && sectorId ? sectorId : null,
        daily_rate: parseMoney(rate),
        half_day: halfDay,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!dia) return;
    if (
      !confirm(
        `Apagar a diária de ${diaristaName} do dia ${formatDate(dia.work_date)}? Ela some da conta.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteDiaristaDia(dia.id);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao apagar");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center",
                dia?.half_day
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                  : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              )}
            >
              <CalendarCheck className="w-4 h-4" />
            </span>
            {dia ? formatDate(dia.work_date) : "Dia"}
            {dia?.half_day && (
              <span className="ml-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[11px] font-semibold">
                meia diária
              </span>
            )}
            {/* Dia já pago: quem for mexer aqui precisa saber que o acerto já
                foi feito — o recibo daquele acerto não muda junto */}
            {dia?.acerto_id && (
              <span className="ml-1 px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 text-[11px] font-semibold">
                já acertado
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {dia && !editing && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              <Linha icon={User} label="Colaborador" value={diaristaName} />
              <Linha
                icon={Wallet}
                label={dia.half_day ? "Meia diária" : "Valor do dia"}
                value={formatBRL(Number(dia.daily_rate))}
              />
              {obraName && <Linha icon={HardHat} label="Obra" value={obraName} />}
              {sectorName && <Linha icon={MapPin} label="Setor" value={sectorName} />}
              {/* Máquina pesada do dia (132): custo da obra, não do colaborador */}
              {dia.machine_hours != null && (
                <>
                  <Linha
                    icon={Tractor}
                    label="Máquina"
                    value={maquinaDoDia?.name ?? "Máquina apagada do cadastro"}
                  />
                  <Linha
                    icon={Gauge}
                    label="Horímetro"
                    value={`${formatQty(Number(dia.hourmeter_start))} → ${formatQty(
                      Number(dia.hourmeter_end)
                    )} (${formatHoras(Number(dia.machine_hours))})`}
                  />
                  <Linha
                    icon={HardHat}
                    label="Máquina na obra"
                    value={
                      valorHoraDoDia > 0
                        ? formatBRL(valorDaMaquina(Number(dia.machine_hours), valorHoraDoDia))
                        : "sem valor da hora"
                    }
                  />
                </>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                O que ele fez
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                {dia.description || "—"}
              </p>
            </div>

            {dia.registered_by_name && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Marcado por {dia.registered_by_name}
              </p>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {error}
              </p>
            )}

            {(canEdit || canDelete) && (
              <div className="flex gap-2">
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-12"
                    onClick={() => setEditing(true)}
                    disabled={isPending}
                  >
                    <Pencil className="w-4 h-4" />
                    Editar
                  </Button>
                )}
                {canDelete && (
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1 h-12"
                    onClick={handleDelete}
                    disabled={isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                    Apagar
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {dia && editing && (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dde_desc">O que ele fez</Label>
              <Textarea
                id="dde_desc"
                value={description}
                onChange={(e) => setDescription(upperKeepingCaret(e))}
                autoCapitalize="characters"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Trabalhou o dia todo?</Label>
              <div className="grid grid-cols-2 gap-2">
                {[false, true].map((meia) => (
                  <button
                    key={String(meia)}
                    type="button"
                    onClick={() => toggleHalf(meia)}
                    className={cn(
                      "min-h-[48px] rounded-xl border text-sm font-semibold transition-colors active:scale-[0.97]",
                      halfDay === meia
                        ? meia
                          ? "bg-amber-400 border-amber-400 text-amber-950"
                          : "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500"
                    )}
                  >
                    {meia ? "Meia diária" : "Dia inteiro"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dde_rate">
                {halfDay ? "Valor da meia diária (R$)" : "Valor do dia (R$)"}
              </Label>
              <Input
                id="dde_rate"
                value={rate}
                onChange={(e) => setRate(formatBRLInput(e.target.value))}
                placeholder="0,00"
                inputMode="decimal"
                className="tabular-nums"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Só muda este dia — o cadastro do diarista continua igual.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Obra *</Label>
              <SearchableSelect
                items={obras}
                value={obraId}
                onChange={(id) => {
                  setObraId(id);
                  setSectorId("");
                }}
                getId={(o) => o.id}
                getLabel={(o) => o.name}
                placeholder="Toque para escolher a obra..."
                searchPlaceholder="Buscar obra..."
                emptyMessage="Nenhuma obra cadastrada"
              />
            </div>

            {obraSectors.length > 0 && (
              <div className="space-y-1.5">
                <Label>Setor</Label>
                <SearchableSelect
                  items={obraSectors}
                  value={sectorId}
                  onChange={setSectorId}
                  getId={(s) => s.id}
                  getLabel={(s) => s.name}
                  placeholder="Toque para escolher o setor..."
                  searchPlaceholder="Buscar setor..."
                  emptyMessage="Nenhum setor cadastrado nesta obra"
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-12"
                onClick={() => setEditing(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 h-12" disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Linha({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className="ml-auto text-sm font-medium text-slate-800 dark:text-slate-100 truncate text-right">
        {value}
      </span>
    </div>
  );
}
