"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn, formatBRL, upperKeepingCaret } from "@/lib/utils";
import { createDiaristaDia } from "@/app/(app)/diaristas/actions";
import { erroDoNovoServico, lerHorimetro } from "@/lib/maquina-na-diaria";
import { longDay } from "./diarista-shared";
import { CamposDaMaquina } from "./servicos-de-maquina";
import type { Diarista, DiaristaDia, SupplyObraSector } from "@/lib/types";

/** Obra do Estoque, do jeito enxuto que esta tela precisa. */
export interface DiaristaObra {
  id: string;
  name: string;
  client?: string | null;
}

/**
 * Máquina do cadastro de Máquinas e Veículos, do jeito enxuto que a diária
 * precisa para lançar a máquina pesada (migration 132).
 */
export interface DiaristaMaquina {
  id: string;
  name: string;
  plate?: string | null;
  category?: string | null;
  tracking_type?: string | null;
  /** Valor da hora para a obra. Vazio = ainda não cadastrado. */
  hourly_rate?: number | null;
  active?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  diarista: Pick<Diarista, "id" | "name" | "daily_rate"> | null;
  /** O dia clicado no calendário (YYYY-MM-DD). */
  date: string | null;
  obras: DiaristaObra[];
  sectors: SupplyObraSector[];
  /** O cadastro de Máquinas e Veículos; a tela mostra só as pesadas ativas. */
  maquinas: DiaristaMaquina[];
  /**
   * O banco já tem os serviços de máquina (migration 133)? Sem eles a pergunta
   * aparece, mas o Sim avisa que falta rodar a migration.
   */
  maquinaPronta: boolean;
  /** Obra do lançamento anterior — quem está numa obra lança vários seguidos. */
  defaultObraId?: string | null;
  /**
   * Os dias já lançados (pode vir de todo mundo: a tela separa os deste
   * colaborador). As obras dos dias mais recentes dele aparecem no topo da
   * escolha da obra.
   */
  dias?: Pick<DiaristaDia, "diarista_id" | "obra_id" | "work_date" | "created_at">[];
  /**
   * Deu certo: quem abriu limpa o dia pendente e guarda a obra usada.
   * `emAberto` = o serviço começou e ainda falta o horímetro final.
   */
  onSaved: (obraId: string, emAberto: boolean) => void;
}

/**
 * "O que ele fez nesse dia?" — abre no clique do dia, já com a data na frente.
 * Um dia, uma descrição: o próximo dia clicado abre a sua própria tela, porque
 * no fim do mês o chefe quer ler o que foi feito em CADA diária, não um texto
 * repetido na semana inteira.
 */
export function LancarDiaDialog({
  open,
  onClose,
  diarista,
  date,
  obras,
  sectors,
  maquinas,
  maquinaPronta,
  defaultObraId,
  dias,
  onSaved,
}: Props) {
  /** As obras em que ele trabalhou por último, da mais nova para a mais velha. */
  const obrasRecentes = useMemo(() => {
    if (!dias || !diarista) return [];
    const dele = dias
      .filter((d) => d.diarista_id === diarista.id && d.obra_id)
      .sort(
        (a, b) =>
          b.work_date.localeCompare(a.work_date) ||
          (b.created_at ?? "").localeCompare(a.created_at ?? "")
      );
    const ids: string[] = [];
    for (const d of dele) {
      if (!ids.includes(d.obra_id as string)) ids.push(d.obra_id as string);
      if (ids.length >= 5) break;
    }
    return ids;
  }, [dias, diarista]);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [obraId, setObraId] = useState("");
  const [sectorId, setSectorId] = useState("");
  /** Veio só meio expediente: vale metade e o dia fica amarelo no calendário. */
  const [halfDay, setHalfDay] = useState(false);
  /** "Usou máquina pesada?" — Não é o padrão: quase todo dia é sem máquina. */
  const [usouMaquina, setUsouMaquina] = useState(false);
  const [machineId, setMachineId] = useState("");
  const [horimetroIni, setHorimetroIni] = useState("");
  const [horimetroFim, setHorimetroFim] = useState("");

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setObraId(defaultObraId ?? "");
    setSectorId("");
    setHalfDay(false);
    setUsouMaquina(false);
    setMachineId("");
    setHorimetroIni("");
    setHorimetroFim("");
    setError(null);
    // o dia entra nas dependências porque a tela é reaproveitada: clicou noutro
    // dia sem fechar, o formulário começa limpo de novo
  }, [open, date, defaultObraId]);

  /** Os setores da obra escolhida — o setor é subcadastro dela. */
  const obraSectors = useMemo(
    () => sectors.filter((s) => s.obra_id === obraId),
    [sectors, obraId]
  );

  function chooseObra(id: string) {
    setObraId(id);
    setSectorId(""); // o setor é de uma obra só
  }

  const ini = lerHorimetro(horimetroIni);
  const fim = lerHorimetro(horimetroFim);
  /** Com máquina e sem horímetro final, a diária fica aberta até ele voltar. */
  const comMaquina = usouMaquina && maquinaPronta;
  const vaiFicarAberto = comMaquina && !horimetroFim.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!diarista || !date) return;
    // a descrição é a razão desta tela existir: sem ela, daqui a dois meses o
    // "veio dia 12" não explica nada a ninguém
    if (!description.trim()) return setError("Escreva o que ele fez nesse dia");
    // sem obra o dia fica solto: não entra no custo de obra nenhuma, e depois
    // ninguém lembra de qual era
    if (!obraId) return setError("Diga em qual obra ele trabalhou");
    if (usouMaquina) {
      if (!maquinaPronta)
        return setError(
          "A máquina ainda não pode ser gravada: falta rodar a migration 133 no banco. Marque Não e lance a diária sem a máquina por enquanto."
        );
      if (!machineId) return setError("Escolha a máquina que ele usou");
      if (horimetroFim.trim() && fim == null) return setError("Confira o horímetro final");
      const errHorimetro = erroDoNovoServico(ini, fim);
      if (errHorimetro) return setError(errHorimetro);
    }

    startTransition(async () => {
      const r = await createDiaristaDia({
        diarista_id: diarista.id,
        date,
        description,
        obra_id: obraId || null,
        sector_id: obraId && sectorId ? sectorId : null,
        half_day: halfDay,
        ...(usouMaquina
          ? { machine_id: machineId, hourmeter_start: ini, hourmeter_end: fim }
          : {}),
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao lançar o dia");
        return;
      }
      onSaved(obraId, vaiFicarAberto);
      onClose();
    });
  }

  const valor = Number(diarista?.daily_rate ?? 0);
  /** O que ele vai receber por este dia — é o número que interessa na hora. */
  const aPagar = halfDay ? Math.round((valor / 2) * 100) / 100 : valor;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-produmar-50 text-produmar-600 dark:bg-produmar-900/40 dark:text-produmar-300">
              <CalendarDays className="w-4 h-4" />
            </span>
            O que {diarista?.name ?? "ele"} fez?
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* O dia clicado, por extenso: é a confirmação de que ele não errou o toque */}
          <div className="rounded-xl border border-produmar-100 dark:border-slate-700 bg-produmar-50/60 dark:bg-slate-800/60 px-3 py-2.5">
            <p className="text-sm font-semibold text-produmar-800 dark:text-slate-100">
              {date ? longDay(date) : ""}
            </p>
            {valor > 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {halfDay
                  ? `Meia diária: ${formatBRL(aPagar)} (a diária é ${formatBRL(valor)})`
                  : `Diária de ${formatBRL(valor)}`}
              </p>
            )}
          </div>

          {/* Dia inteiro ou meio expediente — dois botões do tamanho do dedo,
              porque isso se responde na rua, sem abrir teclado. */}
          <div className="space-y-1.5">
            <Label>Trabalhou o dia todo?</Label>
            <div className="grid grid-cols-2 gap-2">
              {[false, true].map((meia) => (
                <button
                  key={String(meia)}
                  type="button"
                  onClick={() => setHalfDay(meia)}
                  className={cn(
                    "min-h-[52px] rounded-xl border text-sm font-semibold transition-colors active:scale-[0.97]",
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
            {halfDay && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Vale metade da diária e o dia fica amarelo no calendário.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ld_desc">O que ele fez *</Label>
            <Textarea
              id="ld_desc"
              value={description}
              onChange={(e) => setDescription(upperKeepingCaret(e))}
              placeholder="ex: ajudou a abrir a vala e carregou o cano"
              autoCapitalize="characters"
              className="min-h-[92px]"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Obra *</Label>
            <SearchableSelect
              items={obras}
              value={obraId}
              onChange={chooseObra}
              getId={(o) => o.id}
              getLabel={(o) => o.name}
              renderItem={(o) => (
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="truncate">{o.name}</span>
                  {o.client && (
                    <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[7rem]">
                      {o.client}
                    </span>
                  )}
                </div>
              )}
              placeholder="Toque para escolher a obra..."
              searchPlaceholder="Buscar obra..."
              telaCheia
              titulo="Escolher obra"
              lembrarRecentes="obras"
              recentes={obrasRecentes}
              getDetalhe={(o) => o.client}
              emptyMessage="Nenhuma obra cadastrada"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              É a obra que leva esta diária para o custo dela.
            </p>
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

          {/* Máquina pesada (132): só depois da obra, porque é a obra que leva
              o custo das horas. Sim/Não do tamanho do dedo, Não por padrão. */}
          {obraId && (
            <div className="space-y-1.5">
              <Label>Usou máquina pesada?</Label>
              <div className="grid grid-cols-2 gap-2">
                {[false, true].map((sim) => (
                  <button
                    key={String(sim)}
                    type="button"
                    onClick={() => setUsouMaquina(sim)}
                    className={cn(
                      "min-h-[52px] rounded-xl border text-sm font-semibold transition-colors active:scale-[0.97]",
                      usouMaquina === sim
                        ? sim
                          ? "bg-produmar-600 border-produmar-600 text-white"
                          : "bg-slate-600 border-slate-600 text-white dark:bg-slate-500 dark:border-slate-500"
                        : "bg-white border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500"
                    )}
                  >
                    {sim ? "Sim" : "Não"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {obraId && usouMaquina && !maquinaPronta && (
            <p className="text-[12px] text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400">
              A máquina na diária ainda não está liberada: falta rodar a migration 133 no
              banco. Por enquanto marque Não e lance a diária sem a máquina.
            </p>
          )}

          {obraId && comMaquina && (
            <CamposDaMaquina
              maquinas={maquinas}
              machineId={machineId}
              onMachineId={setMachineId}
              inicial={horimetroIni}
              onInicial={setHorimetroIni}
              final={horimetroFim}
              onFinal={setHorimetroFim}
            />
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="w-full h-14 text-base font-semibold">
            {isPending
              ? "Lançando..."
              : vaiFicarAberto
                ? "Iniciar o serviço"
                : `${comMaquina ? "Fechar" : "Lançar"} ${halfDay ? "a meia diária" : "a diária"}`}
          </Button>

          <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
            Depois é só tocar em outro dia para lançar o próximo.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
