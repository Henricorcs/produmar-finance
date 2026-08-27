"use client";

import { useMemo, useState } from "react";
import { HardHat, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/utils";
import { num } from "@/components/almoxarifado/supply-shared";
import { SupplyObraDialog } from "./estoque-obra-dialog";
import {
  SupplyObraCard,
  SupplyObraDetailDialog,
  type SupplyItemCost,
} from "./estoque-obra-detail-dialog";
import { SupplyObraSectorsDialog } from "./estoque-obra-sectors-dialog";
import { EmptyState } from "./obra-shared";
import type { SupplyFenceRunView, SupplyObraSector, SupplyObraUsage } from "@/lib/types";

interface Props {
  obras: SupplyObraUsage[];
  /** Setores de todas as obras — cada diálogo filtra os da obra que abriu. */
  sectors: SupplyObraSector[];
  /** Custo médio dos materiais — é o que valoriza o consumo de cada obra. */
  costs: SupplyItemCost[];
  /** Metros de cerca — o detalhe da obra mostra o resumo por setor. */
  fenceRuns: SupplyFenceRunView[];
}

/**
 * Aba "Do Estoque" — as obras da tabela supply_obras, que antes ficavam dentro
 * do módulo Estoque. É a obra que recebe material, setor e metro de cerca.
 *
 * Continua sendo uma lista à parte das obras de public.obras (a outra aba): são
 * cadastros diferentes, só que agora cuidados no mesmo lugar. O lançamento de
 * saída de material segue no Estoque — aqui é o cadastro e o acompanhamento.
 */
export function ObrasEstoqueTab({ obras, sectors, costs, fenceRuns }: Props) {
  const [obraDialogOpen, setObraDialogOpen] = useState(false);
  const [editObra, setEditObra] = useState<SupplyObraUsage | null>(null);
  const [detailObraId, setDetailObraId] = useState<string | null>(null);
  /** Cadastro dos setores da obra (o "Setor aplicado" do técnico). */
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const [sectorsObraId, setSectorsObraId] = useState<string | null>(null);

  // o diálogo deriva do id para refletir os dados recarregados do servidor
  const detailObra = useMemo(
    () => (detailObraId ? obras.find((o) => o.id === detailObraId) ?? null : null),
    [detailObraId, obras]
  );

  const total = useMemo(() => obras.reduce((sum, o) => sum + num(o.total_value), 0), [obras]);

  function openSectors(obraId: string | null) {
    setSectorsObraId(obraId);
    setSectorsOpen(true);
  }

  function openNew() {
    setEditObra(null);
    setObraDialogOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {obras.length > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {formatBRL(total)} em material
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          {obras.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => openSectors(null)}>
              <MapPin className="w-3.5 h-3.5" />
              Setores
              {sectors.length > 0 && (
                <span className="opacity-60 tabular-nums">{sectors.length}</span>
              )}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={openNew}>
            <Plus className="w-3.5 h-3.5" />
            Nova obra
          </Button>
        </div>
      </div>

      {obras.length === 0 ? (
        <EmptyState
          icon={HardHat}
          text="Nenhuma obra cadastrada ainda."
          hint="Cadastre as obras para saber quanto de material cada uma consumiu."
          action={
            <Button size="sm" onClick={openNew}>
              <Plus className="w-4 h-4" /> Nova obra
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {obras.map((o) => (
            <SupplyObraCard key={o.id} obra={o} onOpen={() => setDetailObraId(o.id)} />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <SupplyObraDialog
        open={obraDialogOpen}
        onClose={() => setObraDialogOpen(false)}
        obra={editObra}
      />
      <SupplyObraSectorsDialog
        open={sectorsOpen}
        onClose={() => setSectorsOpen(false)}
        obras={obras}
        sectors={sectors}
        presetObraId={sectorsObraId}
      />
      <SupplyObraDetailDialog
        open={!!detailObra}
        onClose={() => setDetailObraId(null)}
        obra={detailObra}
        costs={costs}
        sectors={sectors}
        fenceRuns={fenceRuns}
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
      />
    </div>
  );
}
