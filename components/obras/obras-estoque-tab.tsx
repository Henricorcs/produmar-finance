"use client";

import { useMemo, useState } from "react";
import { HardHat, MapPin, MapPinned, Plus, Receipt, Search, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/utils";
import { num } from "@/components/almoxarifado/supply-shared";
import { SupplyObraDialog } from "./estoque-obra-dialog";
import { SupplyObraCard, SupplyObraDetailDialog } from "./estoque-obra-detail-dialog";
import { SupplyObraSectorsDialog } from "./estoque-obra-sectors-dialog";
import { LocaisDialog } from "./locais-dialog";
import { DespesaDialog } from "./despesa-dialog";
import { EmptyState } from "./obra-shared";
import type {
  Diarista,
  SupplyFenceRunView,
  SupplyLocal,
  SupplyObraDespesa,
  SupplyObraSector,
  SupplyObraServicoView,
  SupplyObraUsage,
} from "@/lib/types";

interface Props {
  obras: SupplyObraUsage[];
  /** Setores de todas as obras — cada diálogo filtra os da obra que abriu. */
  sectors: SupplyObraSector[];
  /** Locais onde as obras acontecem — Fazenda 01, Sítio... (migration 066). */
  locais?: SupplyLocal[];
  /** Metros de cerca — o detalhe da obra mostra o resumo por setor. */
  fenceRuns: SupplyFenceRunView[];
  /** Serviços por empreita / por metro lançados nos setores (migration 069). */
  servicos?: SupplyObraServicoView[];
  /** Cadastro de Colaboradores — quem pode receber pelo serviço. */
  colaboradores?: Diarista[];
}

/** A chave de agrupamento das obras sem local — vale como um grupo à parte. */
const SEM_LOCAL = "sem-local";

/**
 * A lista de OBRAS (tabela supply_obras) — o coração do módulo.
 *
 * A obra é o serviço; o LOCAL é onde ele acontece (Fazenda 01, Sítio) e o SETOR
 * é o pedaço dentro dela (entrada, curral). Por isso a lista vem agrupada por
 * local: é assim que se enxerga quanto uma fazenda inteira já custou.
 *
 * O custo mostrado tem quatro origens: o material que saiu do Estoque, as
 * diárias lançadas na obra, a despesa avulsa comprada direto para ela e o
 * serviço combinado com o profissional no setor (empreita ou metro).
 */
export function ObrasEstoqueTab({
  obras,
  sectors,
  locais = [],
  fenceRuns,
  servicos = [],
  colaboradores = [],
}: Props) {
  const [obraDialogOpen, setObraDialogOpen] = useState(false);
  const [editObra, setEditObra] = useState<SupplyObraUsage | null>(null);
  const [detailObraId, setDetailObraId] = useState<string | null>(null);
  /** Cadastro dos setores da obra (o "Setor aplicado" do técnico). */
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const [sectorsObraId, setSectorsObraId] = useState<string | null>(null);
  /** Cadastro dos locais — a lista de fazendas/sítios. */
  const [locaisOpen, setLocaisOpen] = useState(false);
  /**
   * Despesa avulsa da obra. Mora aqui, e não dentro do detalhe, porque dois
   * diálogos abertos ao mesmo tempo se atropelam: o detalhe fecha, a despesa
   * abre, e ao sair o detalhe volta — já com o extrato recarregado.
   */
  const [despesaOpen, setDespesaOpen] = useState(false);
  const [despesaObra, setDespesaObra] = useState<SupplyObraUsage | null>(null);
  const [editDespesa, setEditDespesa] = useState<SupplyObraDespesa | null>(null);

  const [search, setSearch] = useState("");
  /** Local escolhido no filtro — "" = todos. */
  const [localFiltro, setLocalFiltro] = useState("");

  // o diálogo deriva do id para refletir os dados recarregados do servidor
  const detailObra = useMemo(
    () => (detailObraId ? obras.find((o) => o.id === detailObraId) ?? null : null),
    [detailObraId, obras]
  );

  /** O custo cheio da obra: material + mão de obra. */
  function custo(o: SupplyObraUsage): number {
    return num(o.total_cost ?? o.total_value);
  }

  const totais = useMemo(() => {
    let material = 0;
    let maoDeObra = 0;
    let despesas = 0;
    for (const o of obras) {
      material += num(o.total_value);
      // diária e serviço são as duas formas de pagar gente: no número do topo
      // eles andam juntos, e o detalhe da obra é que separa um do outro
      maoDeObra += num(o.labor_value) + num(o.service_value);
      despesas += num(o.expense_value);
    }
    return { material, maoDeObra, despesas, total: material + maoDeObra + despesas };
  }, [obras]);

  /** Os grupos do filtro: cada local que tem obra, mais o "sem local". */
  const gruposFiltro = useMemo(() => {
    const porLocal = new Map<string, number>();
    for (const o of obras) {
      const key = o.local_id ?? SEM_LOCAL;
      porLocal.set(key, (porLocal.get(key) ?? 0) + 1);
    }
    const lista = locais
      .filter((l) => porLocal.has(l.id))
      .map((l) => ({ id: l.id, nome: l.name, count: porLocal.get(l.id) ?? 0 }));
    if (porLocal.has(SEM_LOCAL)) {
      lista.push({
        id: SEM_LOCAL,
        nome: "Sem local",
        count: porLocal.get(SEM_LOCAL) ?? 0,
      });
    }
    return lista;
  }, [obras, locais]);

  const filtradas = useMemo(() => {
    const q = search.trim().toUpperCase();
    return obras.filter((o) => {
      if (localFiltro) {
        const key = o.local_id ?? SEM_LOCAL;
        if (key !== localFiltro) return false;
      }
      if (!q) return true;
      return (
        o.name.includes(q) ||
        (o.client ?? "").includes(q) ||
        (o.local_name ?? "").toUpperCase().includes(q)
      );
    });
  }, [obras, search, localFiltro]);

  /**
   * As obras agrupadas por local, com o total de cada um. É o retrato que o
   * dono pede: "quanto já gastei na Fazenda 01, somando tudo que tem lá".
   */
  const grupos = useMemo(() => {
    const map = new Map<
      string,
      { id: string; nome: string; obras: SupplyObraUsage[]; total: number }
    >();
    for (const o of filtradas) {
      const key = o.local_id ?? SEM_LOCAL;
      const g = map.get(key) ?? {
        id: key,
        nome: o.local_name ?? "Sem local",
        obras: [],
        total: 0,
      };
      g.obras.push(o);
      g.total += custo(o);
      map.set(key, g);
    }
    // maior gasto primeiro; "sem local" sempre por último, é uma pendência
    return Array.from(map.values()).sort((a, b) => {
      if (a.id === SEM_LOCAL) return 1;
      if (b.id === SEM_LOCAL) return -1;
      return b.total - a.total;
    });
  }, [filtradas]);

  function openSectors(obraId: string | null) {
    setSectorsObraId(obraId);
    setSectorsOpen(true);
  }

  function openNew() {
    setEditObra(null);
    setObraDialogOpen(true);
  }

  /** Sai do detalhe e abre a despesa — `null` lança uma nova. */
  function abrirDespesa(obra: SupplyObraUsage, despesa: SupplyObraDespesa | null) {
    setDetailObraId(null);
    setDespesaObra(obra);
    setEditDespesa(despesa);
    setDespesaOpen(true);
  }

  /** Fechou a despesa (salvou ou desistiu): volta para o detalhe de onde veio. */
  function fecharDespesa() {
    setDespesaOpen(false);
    if (despesaObra) setDetailObraId(despesaObra.id);
  }

  return (
    <div className="space-y-4">
      {/* Ações */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setLocaisOpen(true)}>
          <MapPinned className="w-3.5 h-3.5" />
          Locais
          {locais.length > 0 && (
            <span className="opacity-60 tabular-nums">{locais.length}</span>
          )}
        </Button>
        {obras.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => openSectors(null)}>
            <MapPin className="w-3.5 h-3.5" />
            Setores e serviços
            {sectors.length > 0 && (
              <span className="opacity-60 tabular-nums">{sectors.length}</span>
            )}
          </Button>
        )}
        <Button size="sm" onClick={openNew}>
          <Plus className="w-3.5 h-3.5" />
          Nova obra
        </Button>
      </div>

      {obras.length === 0 ? (
        <EmptyState
          icon={HardHat}
          text="Nenhuma obra cadastrada ainda."
          hint="Cadastre as obras para saber quanto cada uma custou — material e diárias."
          action={
            <Button size="sm" onClick={openNew}>
              <Plus className="w-4 h-4" /> Nova obra
            </Button>
          }
        />
      ) : (
        <>
          {/* Quanto tudo já custou, e de onde vem o custo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kpi
              icon={Wallet}
              label="Gasto total"
              value={formatBRL(totais.total)}
              tone="produmar"
            />
            <Kpi
              icon={HardHat}
              label="Material"
              value={formatBRL(totais.material)}
              tone="orange"
            />
            <Kpi
              icon={Users}
              label="Mão de obra"
              value={formatBRL(totais.maoDeObra)}
              tone="emerald"
              hint="diárias + serviços"
            />
            <Kpi
              icon={Receipt}
              label="Despesas"
              value={formatBRL(totais.despesas)}
              tone="violet"
            />
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por obra, local ou cliente..."
              className="pl-9"
              autoComplete="off"
            />
          </div>

          {/* Filtro por local */}
          {gruposFiltro.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              <FiltroChip
                label="Todos"
                ativo={localFiltro === ""}
                onClick={() => setLocalFiltro("")}
              />
              {gruposFiltro.map((g) => (
                <FiltroChip
                  key={g.id}
                  label={g.nome}
                  count={g.count}
                  ativo={localFiltro === g.id}
                  onClick={() => setLocalFiltro(localFiltro === g.id ? "" : g.id)}
                />
              ))}
            </div>
          )}

          {filtradas.length === 0 ? (
            <EmptyState icon={Search} text="Nada encontrado com esse filtro." />
          ) : (
            <div className="space-y-5">
              {grupos.map((g) => (
                <div key={g.id} className="space-y-2">
                  {/* Cabeçalho do local: o total da fazenda inteira, com nome —
                      sem o rótulo o número aparecia solto e ninguém sabia do
                      que ele era a soma */}
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-sky-50/70 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 min-w-0">
                      <MapPinned className="w-4 h-4 text-sky-500 flex-shrink-0" />
                      <span className="truncate">{g.nome}</span>
                      <span className="text-[11px] text-slate-400 font-normal flex-shrink-0">
                        {g.obras.length === 1 ? "1 obra" : `${g.obras.length} obras`}
                      </span>
                    </p>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none">
                        Gasto no local
                      </p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">
                        {formatBRL(g.total)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {g.obras.map((o) => (
                      <SupplyObraCard
                        key={o.id}
                        obra={o}
                        onOpen={() => setDetailObraId(o.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <SupplyObraDialog
        open={obraDialogOpen}
        onClose={() => setObraDialogOpen(false)}
        obra={editObra}
        locais={locais}
      />
      <LocaisDialog
        open={locaisOpen}
        onClose={() => setLocaisOpen(false)}
        locais={locais}
        obras={obras}
      />
      <SupplyObraSectorsDialog
        open={sectorsOpen}
        onClose={() => setSectorsOpen(false)}
        obras={obras}
        sectors={sectors}
        servicos={servicos}
        colaboradores={colaboradores}
        presetObraId={sectorsObraId}
      />
      <SupplyObraDetailDialog
        open={!!detailObra}
        onClose={() => setDetailObraId(null)}
        obra={detailObra}
        sectors={sectors}
        fenceRuns={fenceRuns}
        servicos={servicos}
        onManageSectors={(o) => {
          // sai do detalhe direto para o cadastro — dois diálogos se atropelam
          setDetailObraId(null);
          openSectors(o.id);
        }}
        onEdit={(o) => {
          setDetailObraId(null);
          setEditObra(o);
          setObraDialogOpen(true);
        }}
        onDespesa={abrirDespesa}
      />
      {despesaObra && (
        <DespesaDialog
          open={despesaOpen}
          onClose={fecharDespesa}
          obraId={despesaObra.id}
          obraNome={despesaObra.name}
          despesa={editDespesa}
        />
      )}
    </div>
  );
}

/** Chip do filtro por local. */
function FiltroChip({
  label,
  count,
  ativo,
  onClick,
}: {
  label: string;
  count?: number;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        ativo
          ? "bg-produmar-600 border-produmar-600 text-white"
          : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
      }`}
    >
      {label}
      {count != null && <span className="opacity-60 ml-1 tabular-nums">{count}</span>}
    </button>
  );
}

/** Cartão de número do topo da lista. */
function Kpi({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "produmar" | "orange" | "emerald" | "violet";
  /** Uma linha a mais dizendo de que o número é a soma. */
  hint?: string;
}) {
  const tones = {
    produmar: "bg-produmar-50 text-produmar-600 dark:bg-produmar-900/30 dark:text-produmar-400",
    orange: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 flex flex-col items-center text-center gap-1">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tones}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
        {value}
      </p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
      {hint && (
        <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight">{hint}</p>
      )}
    </div>
  );
}
