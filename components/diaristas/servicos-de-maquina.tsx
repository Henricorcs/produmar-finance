"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Plus, Tractor, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatBRL, formatQty, machineCategoryLabel, upperKeepingCaret } from "@/lib/utils";
import {
  apagarServicoDeMaquina,
  fecharServicoDeMaquina,
  iniciarServicoDeMaquina,
} from "@/app/(app)/diaristas/actions";
import {
  erroDoHorimetro,
  erroDoNovoServico,
  formatHoras,
  horasDaMaquina,
  lerHorimetro,
  maquinasPesadas,
  temServicoAberto,
  valorDaMaquina,
} from "@/lib/maquina-na-diaria";
import type { DiaristaMaquina, DiaristaObra } from "./lancar-dia-dialog";
import type { DiaristaDia, DiaristaDiaMaquina, SupplyObraSector } from "@/lib/types";

/** Horas × valor da hora, do jeito que ele confere antes de gravar. */
function ContaDaMaquina({
  horas,
  valorHora,
  temMaquina,
}: {
  horas: number;
  valorHora: number;
  temMaquina: boolean;
}) {
  return (
    <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center gap-2.5">
      <Tractor className="w-4 h-4 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
          {formatHoras(horas)}
          {valorHora > 0 && (
            <span className="font-normal text-slate-500 dark:text-slate-400">
              {" "}× {formatBRL(valorHora)}
            </span>
          )}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {valorHora > 0
            ? "Vai para o custo da obra"
            : temMaquina
              ? "Esta máquina ainda não tem valor da hora — as horas ficam gravadas e o valor entra na obra quando ele for cadastrado em Máquinas e Veículos."
              : "Escolha a máquina para ver o valor"}
        </p>
      </div>
      {valorHora > 0 && (
        <p className="text-base font-bold text-produmar-700 dark:text-produmar-300 tabular-nums flex-shrink-0">
          {formatBRL(valorDaMaquina(horas, valorHora))}
        </p>
      )}
    </div>
  );
}

/**
 * Máquina e horímetros. O inicial é obrigatório; o final, não: quem está
 * começando o serviço ainda não sabe, e volta para colocar quando terminar.
 */
export function CamposDaMaquina({
  maquinas,
  machineId,
  onMachineId,
  inicial,
  onInicial,
  final,
  onFinal,
}: {
  maquinas: DiaristaMaquina[];
  machineId: string;
  onMachineId: (id: string) => void;
  inicial: string;
  onInicial: (v: string) => void;
  final: string;
  onFinal: (v: string) => void;
}) {
  const id = useId();
  const opcoes = useMemo(() => maquinasPesadas(maquinas), [maquinas]);
  const maquina = maquinas.find((m) => m.id === machineId) ?? null;
  const ini = lerHorimetro(inicial);
  const fim = lerHorimetro(final);
  const horas = horasDaMaquina(ini, fim);
  /** Só reclama do horímetro depois que os dois foram preenchidos. */
  const aviso = ini != null && fim != null ? erroDoHorimetro(ini, fim) : null;

  return (
    <div className="space-y-3 rounded-xl border border-produmar-100 dark:border-slate-700 bg-produmar-50/40 dark:bg-slate-800/40 p-3">
      <div className="space-y-1.5">
        <Label>Máquina *</Label>
        <SearchableSelect
          items={opcoes}
          value={machineId}
          onChange={onMachineId}
          getId={(m) => m.id}
          getLabel={(m) => m.name}
          renderItem={(m) => (
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="truncate">{m.name}</span>
              {m.category && (
                <span className="text-[10px] text-slate-400 flex-shrink-0">
                  {machineCategoryLabel(m.category)}
                </span>
              )}
            </div>
          )}
          placeholder="Toque para escolher a máquina..."
          searchPlaceholder="Buscar máquina..."
          emptyMessage="Nenhuma máquina cadastrada em Máquinas e Veículos"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}_ini`}>Horímetro inicial *</Label>
          <Input
            id={`${id}_ini`}
            value={inicial}
            onChange={(e) => onInicial(e.target.value)}
            placeholder="ex: 1250,5"
            inputMode="decimal"
            autoComplete="off"
            className="h-11 tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}_fim`}>Horímetro final</Label>
          <Input
            id={`${id}_fim`}
            value={final}
            onChange={(e) => onFinal(e.target.value)}
            placeholder="no fim do serviço"
            inputMode="decimal"
            autoComplete="off"
            className="h-11 tabular-nums"
          />
        </div>
      </div>

      {aviso ? (
        <p className="text-[12px] text-red-600 dark:text-red-400">{aviso}</p>
      ) : horas != null && horas > 0 ? (
        <ContaDaMaquina
          horas={horas}
          valorHora={Number(maquina?.hourly_rate ?? 0)}
          temMaquina={!!maquina}
        />
      ) : !final.trim() ? (
        <p className="text-[11px] text-orange-700 dark:text-orange-400">
          Sem o horímetro final o serviço fica aberto: o dia fica laranja no calendário e é só
          tocar nele para colocar o final e fechar.
        </p>
      ) : null}
    </div>
  );
}

/** Um serviço do dia: o que foi feito, os horímetros e, se aberto, como fechar. */
function CartaoDoServico({
  servico,
  descricaoDoDia,
  maquinas,
  obras,
  sectors,
  podeFechar,
  podeApagar,
}: {
  servico: DiaristaDiaMaquina;
  descricaoDoDia: string | null;
  maquinas: DiaristaMaquina[];
  obras: DiaristaObra[];
  sectors: SupplyObraSector[];
  podeFechar: boolean;
  podeApagar: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [final, setFinal] = useState("");

  const maquina = maquinas.find((m) => m.id === servico.machine_id) ?? null;
  const obra = obras.find((o) => o.id === servico.obra_id)?.name ?? null;
  const setor = sectors.find((s) => s.id === servico.sector_id)?.name ?? null;
  const valorHora = Number(servico.machine_hourly_rate ?? maquina?.hourly_rate ?? 0);
  const aberto = servico.hourmeter_end == null;
  const inicial = Number(servico.hourmeter_start);

  const fim = lerHorimetro(final);
  const horasNovas = horasDaMaquina(inicial, fim);
  const aviso = fim != null ? erroDoHorimetro(inicial, fim) : null;

  function fechar() {
    setError(null);
    startTransition(async () => {
      const r = await fecharServicoDeMaquina(servico.id, fim);
      if (r && "error" in r) setError(r.error ?? "Erro ao fechar o serviço");
    });
  }

  function apagar() {
    if (!confirm("Apagar este serviço de máquina? A diária continua lançada.")) return;
    setError(null);
    startTransition(async () => {
      const r = await apagarServicoDeMaquina(servico.id);
      if (r && "error" in r) setError(r.error ?? "Erro ao apagar o serviço");
    });
  }

  return (
    <div
      className={`rounded-xl border p-3 space-y-2 ${
        aberto
          ? "border-orange-300 bg-orange-50/60 dark:border-orange-900/60 dark:bg-orange-950/20"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      <div className="flex items-start gap-2">
        <Tractor className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {maquina?.name ?? "Máquina apagada do cadastro"}
          </p>
          {servico.description && servico.description !== descricaoDoDia && (
            <p className="text-xs text-slate-600 dark:text-slate-300">{servico.description}</p>
          )}
          {obra && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
              {obra}
              {setor ? ` · ${setor}` : ""}
            </p>
          )}
        </div>
        {aberto && (
          <span className="px-2 py-0.5 rounded-md bg-orange-500 text-white text-[11px] font-semibold flex-shrink-0">
            aberto
          </span>
        )}
        {podeApagar && (
          <button
            type="button"
            onClick={apagar}
            disabled={isPending}
            aria-label="Apagar este serviço"
            className="w-8 h-8 -mt-1 -mr-1 flex items-center justify-center rounded-md text-slate-400 hover:text-red-500 disabled:opacity-40 flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {aberto ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          Começou no horímetro {formatQty(inicial)}
        </p>
      ) : (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span>
            {formatQty(inicial)} → {formatQty(Number(servico.hourmeter_end))} (
            {formatHoras(Number(servico.machine_hours))})
          </span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {valorHora > 0
              ? formatBRL(valorDaMaquina(Number(servico.machine_hours), valorHora))
              : "sem valor da hora"}
          </span>
        </div>
      )}

      {aberto && podeFechar && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor={`final_${servico.id}`}>Horímetro final *</Label>
            <Input
              id={`final_${servico.id}`}
              value={final}
              onChange={(e) => setFinal(e.target.value)}
              placeholder={`maior que ${formatQty(inicial)}`}
              inputMode="decimal"
              autoComplete="off"
              className="h-11 tabular-nums"
            />
          </div>
          {aviso ? (
            <p className="text-[12px] text-red-600 dark:text-red-400">{aviso}</p>
          ) : horasNovas != null && horasNovas > 0 ? (
            <ContaDaMaquina horas={horasNovas} valorHora={valorHora} temMaquina={!!maquina} />
          ) : null}
          <Button
            type="button"
            className="w-full h-12 font-semibold"
            disabled={fim == null || !!aviso || isPending}
            onClick={fechar}
          >
            {isPending ? "Fechando..." : "Fechar o serviço"}
          </Button>
        </div>
      )}

      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** O próximo serviço do dia. Pode ser outra máquina e outra obra. */
function NovoServico({
  dia,
  maquinas,
  obras,
  sectors,
  onClose,
}: {
  dia: DiaristaDia;
  maquinas: DiaristaMaquina[];
  obras: DiaristaObra[];
  sectors: SupplyObraSector[];
  onClose: () => void;
}) {
  const servicos = dia.servicos_maquina ?? [];
  const anterior = servicos[servicos.length - 1];

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [obraId, setObraId] = useState(dia.obra_id ?? "");
  const [sectorId, setSectorId] = useState("");
  const [machineId, setMachineId] = useState(anterior?.machine_id ?? "");
  const [inicial, setInicial] = useState("");
  const [final, setFinal] = useState("");

  const obraSectors = useMemo(
    () => sectors.filter((s) => s.obra_id === obraId),
    [sectors, obraId]
  );

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) return setError("Escreva o que ele fez neste serviço");
    if (!obraId) return setError("Diga em qual obra foi o serviço");
    if (!machineId) return setError("Escolha a máquina que ele usou");
    const ini = lerHorimetro(inicial);
    const fim = lerHorimetro(final);
    if (final.trim() && fim == null) return setError("Confira o horímetro final");
    const err = erroDoNovoServico(ini, fim);
    if (err) return setError(err);

    startTransition(async () => {
      const r = await iniciarServicoDeMaquina({
        dia_id: dia.id,
        machine_id: machineId,
        obra_id: obraId,
        sector_id: sectorId || null,
        description,
        hourmeter_start: ini,
        hourmeter_end: fim,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao lançar o serviço");
        return;
      }
      onClose();
    });
  }

  return (
    <form onSubmit={salvar} className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="ns_desc">O que ele fez neste serviço *</Label>
        <Textarea
          id="ns_desc"
          value={description}
          onChange={(e) => setDescription(upperKeepingCaret(e))}
          placeholder="ex: jogou calcário no piquete 3"
          autoCapitalize="characters"
          rows={2}
        />
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

      <CamposDaMaquina
        maquinas={maquinas}
        machineId={machineId}
        onMachineId={setMachineId}
        inicial={inicial}
        onInicial={setInicial}
        final={final}
        onFinal={setFinal}
      />

      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1 h-12" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1 h-12 font-semibold" disabled={isPending}>
          {isPending ? "Salvando..." : final.trim() ? "Lançar serviço" : "Iniciar serviço"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Os serviços de máquina da diária: fecha o que está aberto e começa outro.
 * A diária é uma só; um operador pode gradear de manhã e jogar calcário à tarde.
 */
export function ServicosDeMaquina({
  dia,
  maquinas,
  obras,
  sectors,
  pronta,
  podeApagar,
}: {
  dia: DiaristaDia;
  maquinas: DiaristaMaquina[];
  obras: DiaristaObra[];
  sectors: SupplyObraSector[];
  /** A migration 133 já rodou? */
  pronta: boolean;
  podeApagar: boolean;
}) {
  const [novo, setNovo] = useState(false);
  const servicos = dia.servicos_maquina ?? [];
  const aberto = temServicoAberto(dia);

  if (!pronta) return null;

  return (
    <div className="space-y-2">
      {servicos.length > 0 && (
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {servicos.length === 1 ? "Serviço de máquina" : "Serviços de máquina"}
        </p>
      )}

      {servicos.map((s) => (
        <CartaoDoServico
          key={s.id}
          servico={s}
          descricaoDoDia={dia.description}
          maquinas={maquinas}
          obras={obras}
          sectors={sectors}
          podeFechar
          podeApagar={podeApagar}
        />
      ))}

      {novo ? (
        <NovoServico
          dia={dia}
          maquinas={maquinas}
          obras={obras}
          sectors={sectors}
          onClose={() => setNovo(false)}
        />
      ) : aberto ? (
        <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
          Feche o serviço aberto para começar outro.
        </p>
      ) : (
        <Button type="button" variant="outline" className="w-full h-12" onClick={() => setNovo(true)}>
          <Plus className="w-4 h-4" />
          {servicos.length > 0 ? "Outro serviço de máquina" : "Lançar serviço de máquina"}
        </Button>
      )}
    </div>
  );
}
