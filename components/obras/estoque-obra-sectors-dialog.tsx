"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { HardHat, MapPin, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  formatBRL,
  formatDate,
  servicoConta,
  upperKeepingCaret,
} from "@/lib/utils";
import { num } from "@/components/almoxarifado/supply-shared";
import {
  createSupplyObraSector,
  deleteSupplyObraSector,
} from "@/app/(app)/almoxarifado/actions";
import { ServicoDialog } from "./servico-dialog";
import { ObraResponsavel } from "./obra-responsavel";
import type {
  Diarista,
  SupplyObraSector,
  SupplyObraServicoView,
  SupplyObraUsage,
} from "@/lib/types";

/** Chave do grupo dos serviços que ficaram sem setor. */
const SEM_SETOR = "sem-setor";

interface Props {
  open: boolean;
  onClose: () => void;
  obras: SupplyObraUsage[];
  /** Setores de todas as obras — o diálogo filtra os da obra escolhida. */
  sectors: SupplyObraSector[];
  /** Serviços de todas as obras — idem (migration 069). */
  servicos?: SupplyObraServicoView[];
  /** Quem pode receber pelo serviço — o cadastro de Colaboradores. */
  colaboradores?: Diarista[];
  /** Obra já escolhida (veio do detalhe dela). */
  presetObraId?: string | null;
}

/**
 * Cadastro dos SETORES de cada obra e do SERVIÇO feito em cada um.
 *
 * O setor é o lugar ("entrada", "galpão 2") — é o que o técnico escolhe em
 * "Setor aplicado". O SERVIÇO é o que foi feito ali e quanto se paga a quem
 * fez: cerca, alvenaria, pintura, contratados por empreita (preço fechado) ou
 * por metro (valor do metro × metragem).
 *
 * O valor do serviço entra no custo da obra E na conta do colaborador, onde é
 * quitado no acerto — o empreiteiro fecha a semana como o diarista fecha.
 *
 * Apagar um setor NÃO apaga os envios nem os serviços dele: eles ficam sem setor.
 */
export function SupplyObraSectorsDialog({
  open,
  onClose,
  obras,
  sectors,
  servicos = [],
  colaboradores = [],
  presetObraId,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [obraId, setObraId] = useState("");
  const [name, setName] = useState("");

  /** Serviço aberto: `servico` corrige um existente, `sectorId` lança um novo. */
  const [servicoOpen, setServicoOpen] = useState(false);
  const [servicoEdit, setServicoEdit] = useState<SupplyObraServicoView | null>(null);
  const [servicoSectorId, setServicoSectorId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // com uma obra só, ela já entra escolhida — ninguém precisa selecionar
    setObraId(presetObraId ?? (obras.length === 1 ? obras[0].id : ""));
    setName("");
    setError(null);
  }, [open, presetObraId, obras]);

  const obraSectors = useMemo(
    () => sectors.filter((s) => s.obra_id === obraId),
    [sectors, obraId]
  );
  const obra = obras.find((o) => o.id === obraId) ?? null;

  /**
   * O fechamento da obra com o responsável (migration 071) — mora no painel
   * dele, não na lista de setores: é o acerto da obra inteira, não de um pedaço.
   */
  const fechamento = useMemo(
    () =>
      servicos.find((s) => s.obra_id === obraId && s.is_obra_contract) ?? null,
    [servicos, obraId]
  );

  /**
   * Os serviços desta obra, agrupados pelo setor onde foram feitos. O
   * fechamento fica DE FORA: ele já aparece no painel do responsável, e listado
   * aqui também apareceria duas vezes.
   */
  const porSetor = useMemo(() => {
    const map = new Map<string, SupplyObraServicoView[]>();
    for (const s of servicos) {
      if (s.obra_id !== obraId || s.is_obra_contract) continue;
      const key = s.sector_id ?? SEM_SETOR;
      const lista = map.get(key) ?? [];
      lista.push(s);
      map.set(key, lista);
    }
    for (const lista of map.values())
      lista.sort((a, b) => b.service_date.localeCompare(a.service_date));
    return map;
  }, [servicos, obraId]);

  /** Os serviços da obra que ficaram sem setor (o setor foi apagado depois). */
  const semSetor = porSetor.get(SEM_SETOR) ?? [];
  const totalServicos = useMemo(
    () =>
      servicos
        .filter((s) => s.obra_id === obraId)
        .reduce((acc, s) => acc + num(s.total_value), 0),
    [servicos, obraId]
  );

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!obraId) {
      setError("Escolha a obra primeiro");
      return;
    }
    if (!name.trim()) {
      setError("Informe o nome do setor");
      return;
    }
    startTransition(async () => {
      const r = await createSupplyObraSector(obraId, name);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao cadastrar o setor");
        return;
      }
      setName("");
    });
  }

  function handleDelete(s: SupplyObraSector) {
    const qtd = (porSetor.get(s.id) ?? []).length;
    const aviso = qtd
      ? `Apagar o setor "${s.name}"? Os ${qtd} ${qtd === 1 ? "serviço" : "serviços"} lançados nele continuam valendo — só ficam sem setor.`
      : `Apagar o setor "${s.name}"? Os envios que já usaram ele continuam guardados, só ficam sem setor.`;
    if (!confirm(aviso)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteSupplyObraSector(s.id);
      if (r && "error" in r) setError(r.error ?? "Erro ao apagar o setor");
    });
  }

  /** Abre o lançamento: `servico` nulo é um serviço novo naquele setor. */
  function abrirServico(sectorId: string | null, servico: SupplyObraServicoView | null) {
    setServicoSectorId(sectorId);
    setServicoEdit(servico);
    setServicoOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-50 text-orange-500 dark:bg-orange-900/30 dark:text-orange-400">
              <MapPin className="w-4 h-4" />
            </span>
            Setores e serviços
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Obra *</Label>
            <SearchableSelect
              items={obras}
              value={obraId}
              onChange={(id) => {
                setObraId(id);
                setError(null);
              }}
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
              emptyMessage="Nenhuma obra cadastrada"
            />
          </div>

          {obra && (
            <ObraResponsavel
              obra={obra}
              colaboradores={colaboradores}
              fechamento={fechamento}
            />
          )}

          {obraId && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="sec_name">Novo setor</Label>
                <form onSubmit={handleAdd} className="flex gap-2">
                  <Input
                    id="sec_name"
                    value={name}
                    onChange={(e) => setName(upperKeepingCaret(e))}
                    placeholder="ex: entrada, galpão 2, área externa"
                    autoCapitalize="characters"
                    autoComplete="off"
                  />
                  <Button type="submit" disabled={isPending || !name.trim()}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </form>
              </div>

              {/* Quanto já foi combinado de serviço nesta obra */}
              {totalServicos > 0 && (
                <div className="rounded-xl border border-teal-200 dark:border-teal-900/50 bg-teal-50/60 dark:bg-teal-950/20 px-3 py-2.5 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-teal-800 dark:text-teal-300">
                    Total a pagar de serviço
                    <span className="block text-[10px] font-normal text-teal-700/70 dark:text-teal-400/70">
                      o fechamento da obra mais os serviços dos setores
                    </span>
                  </span>
                  <span className="text-base font-bold text-teal-700 dark:text-teal-300 tabular-nums">
                    {formatBRL(totalServicos)}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {obraSectors.length === 0
                    ? "Nenhum setor nesta obra ainda"
                    : obraSectors.length === 1
                      ? "1 setor cadastrado"
                      : `${obraSectors.length} setores cadastrados`}
                </p>

                {obraSectors.map((s) => (
                  <SetorCard
                    key={s.id}
                    setor={s}
                    servicos={porSetor.get(s.id) ?? []}
                    disabled={isPending}
                    onDelete={() => handleDelete(s)}
                    onNovoServico={() => abrirServico(s.id, null)}
                    onAbrirServico={(sv) => abrirServico(s.id, sv)}
                  />
                ))}

                {/* Serviços cujo setor foi apagado — o valor não some com ele */}
                {semSetor.length > 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-3 space-y-2">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Serviços sem setor
                    </p>
                    {semSetor.map((sv) => (
                      <ServicoLinha
                        key={sv.id}
                        servico={sv}
                        onClick={() => abrirServico(null, sv)}
                      />
                    ))}
                  </div>
                )}

                {/* Serviço sem setor nenhum: a obra pode não ter setor cadastrado */}
                {obraSectors.length === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => abrirServico(null, null)}
                  >
                    <HardHat className="w-4 h-4" />
                    Lançar serviço sem setor
                  </Button>
                )}
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            O setor é o que o técnico escolhe em &quot;Setor aplicado&quot;. O serviço diz
            o que foi feito ali e quanto se paga a quem fez — por empreita ou por metro
            —, e esse valor cai na conta do colaborador.
          </p>
        </div>

        {obra && (
          <ServicoDialog
            open={servicoOpen}
            onClose={() => setServicoOpen(false)}
            obraId={obra.id}
            obraNome={obra.name}
            sectors={obraSectors}
            presetSectorId={servicoSectorId}
            colaboradores={colaboradores}
            servico={servicoEdit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Um setor com os serviços que foram feitos nele. */
function SetorCard({
  setor,
  servicos,
  disabled,
  onDelete,
  onNovoServico,
  onAbrirServico,
}: {
  setor: SupplyObraSector;
  servicos: SupplyObraServicoView[];
  disabled: boolean;
  onDelete: () => void;
  onNovoServico: () => void;
  onAbrirServico: (servico: SupplyObraServicoView) => void;
}) {
  const total = servicos.reduce((s, v) => s + num(v.total_value), 0);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60">
        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
          {setor.name}
        </span>
        {total > 0 && (
          <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 tabular-nums flex-shrink-0">
            {formatBRL(total)}
          </span>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          aria-label={`Apagar o setor ${setor.name}`}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {servicos.length > 0 && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {servicos.map((sv) => (
            <ServicoLinha key={sv.id} servico={sv} onClick={() => onAbrirServico(sv)} />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onNovoServico}
        className="w-full min-h-[40px] flex items-center justify-center gap-1.5 text-[11px] font-medium text-teal-600 dark:text-teal-400 border-t border-slate-100 dark:border-slate-800 hover:bg-teal-50/60 dark:hover:bg-teal-950/20 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        {servicos.length > 0 ? "Outro serviço neste setor" : "Definir o serviço deste setor"}
      </button>
    </div>
  );
}

/** Uma linha de serviço: o que foi, como foi contratado e quanto vale. */
function ServicoLinha({
  servico,
  onClick,
}: {
  servico: SupplyObraServicoView;
  onClick: () => void;
}) {
  const conta = servicoConta(servico);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-2.5 px-3 py-2 text-left active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
    >
      <span className="w-1.5 h-9 rounded-full bg-teal-400 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {servico.service_type}
        </span>
        {/* a conta por extenso: 10 M × R$ 2,00 = R$ 20,00 */}
        <span className="block text-[11px] font-medium text-teal-700 dark:text-teal-400 tabular-nums truncate">
          {conta.formula ? `${conta.formula} = ${conta.total}` : `empreita = ${conta.total}`}
        </span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {formatDate(servico.service_date)} ·{" "}
          {servico.worker_name ?? "sem profissional"}
          {servico.acerto_id ? " · já acertado" : ""}
        </span>
      </span>
      <span className="text-sm font-semibold text-teal-700 dark:text-teal-400 tabular-nums flex-shrink-0">
        {formatBRL(num(servico.total_value))}
      </span>
    </button>
  );
}
