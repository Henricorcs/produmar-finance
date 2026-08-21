"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Fence, MapPin, Plus, Ruler, Tag, Trash2 } from "lucide-react";
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
  cn,
  formatBRL,
  formatBRLInput,
  formatDate,
  formatQty,
  localDateISO,
  parseMoney,
  upperKeepingCaret,
} from "@/lib/utils";
import {
  createFenceRun,
  deleteFenceRun,
  setObraFenceRate,
  setSectorFenceRate,
  updateFenceRun,
} from "@/app/(app)/almoxarifado/actions";
import { formatQtyInput, num, parseQty } from "./supply-shared";
import type { SupplyFenceRunView, SupplyObraSector, SupplyObraUsage } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// A REGRA DE PREÇO, em um lugar só
// ─────────────────────────────────────────────────────────────────────────────
// A mesma do coalesce da view (migration 063), repetida aqui porque a tela
// precisa mostrar o preço ANTES de salvar (no diálogo de lançamento):
//   1) o preço travado no trecho (zero incluído: trecho que não paga)
//   2) o preço do setor (0 = não tem preço próprio)
//   3) o preço da obra
export function effectiveRate(
  runRate: number | null | undefined,
  sector: SupplyObraSector | null | undefined,
  obra: { fence_rate?: number } | null | undefined
): number {
  if (runRate != null) return num(runRate);
  const doSetor = num(sector?.fence_rate ?? 0);
  if (doSetor > 0) return doSetor;
  return num(obra?.fence_rate ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA: CERCA
// ─────────────────────────────────────────────────────────────────────────────

interface TabProps {
  runs: SupplyFenceRunView[];
  obras: SupplyObraUsage[];
  sectors: SupplyObraSector[];
  /** Lançar metros — já na obra que está filtrada, quando há uma. */
  onNew: (obraId: string | null) => void;
  onOpen: (run: SupplyFenceRunView) => void;
  /** Abre o cadastro de preço por metro (opcionalmente já numa obra). */
  onRates: (obraId: string | null) => void;
}

/**
 * O metro de cerca por setor: quanto andou, quanto custou e a que preço.
 *
 * O técnico lança o metro na tela dele (sem ver preço nenhum). Aqui é onde o
 * metro vira dinheiro — e onde o chefe cadastra o preço que faz isso acontecer.
 */
export function CercaTab({ runs, obras, sectors, onNew, onOpen, onRates }: TabProps) {
  /** Obra escolhida no filtro; "" = todas. */
  const [obraId, setObraId] = useState("");

  const obraById = useMemo(() => new Map(obras.map((o) => [o.id, o])), [obras]);
  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);

  const listados = useMemo(
    () => (obraId ? runs.filter((r) => r.obra_id === obraId) : runs),
    [runs, obraId]
  );

  const totalMetros = listados.reduce((s, r) => s + num(r.meters), 0);
  const totalValor = listados.reduce((s, r) => s + num(r.total_value), 0);

  /** O metro somado por setor — é o "por setor aplicado" que o chefe pediu. */
  const porSetor = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        sectorId: string | null;
        obraId: string;
        nome: string;
        obraNome: string;
        metros: number;
        valor: number;
        /** Preço por metro que está valendo naquele setor hoje. */
        preco: number;
      }
    >();
    for (const r of listados) {
      // sem setor os metros ficam num balde só, por obra: continuam contando
      const key = `${r.obra_id}:${r.sector_id ?? "sem"}`;
      const setor = r.sector_id ? sectorById.get(r.sector_id) ?? null : null;
      const obra = obraById.get(r.obra_id) ?? null;
      const cur = map.get(key) ?? {
        key,
        sectorId: r.sector_id,
        obraId: r.obra_id,
        nome: r.sector_name ?? setor?.name ?? "Sem setor",
        obraNome: r.obra_name ?? obra?.name ?? "—",
        metros: 0,
        valor: 0,
        preco: effectiveRate(null, setor, obra),
      };
      cur.metros += num(r.meters);
      cur.valor += num(r.total_value);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.metros - a.metros);
  }, [listados, sectorById, obraById]);

  /** Lançamento sem preço nenhum: é o aviso de que falta cadastrar o valor. */
  const semPreco = listados.filter((r) => num(r.effective_rate) <= 0).length;

  return (
    <div className="space-y-3">
      {/* Painel único: os números do que está filtrado + as duas ações */}
      <div className="rounded-xl border border-produmar-100/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2 py-2">
            <p className="text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100 truncate">
              {formatQty(totalMetros)} m
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
              de cerca feita
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2 py-2">
            <p className="text-base font-semibold tabular-nums text-produmar-700 dark:text-produmar-400 truncate">
              {formatBRL(totalValor)}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
              a esse preço
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 min-h-[48px]" onClick={() => onRates(obraId || null)}>
            <Tag className="w-4 h-4" />
            Preço por metro
          </Button>
          <Button className="flex-1 min-h-[48px]" onClick={() => onNew(obraId || null)}>
            <Plus className="w-4 h-4" />
            Lançar metros
          </Button>
        </div>

        {semPreco > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {semPreco === 1
              ? "1 lançamento ainda está sem preço"
              : `${semPreco} lançamentos ainda estão sem preço`}{" "}
            — cadastre o preço por metro e eles já entram na conta.
          </p>
        )}
      </div>

      {/* Filtro por obra */}
      {obras.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          <FiltroChip label="Todas" ativo={!obraId} onClick={() => setObraId("")} />
          {obras.map((o) => (
            <FiltroChip
              key={o.id}
              label={o.name}
              ativo={obraId === o.id}
              onClick={() => setObraId(o.id)}
            />
          ))}
        </div>
      )}

      {listados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-10 px-4 text-center space-y-2">
          <Fence className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nenhum metro de cerca lançado.
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
            Quem lança é o técnico, na tela dele — ele informa só o metro, por setor. Você
            cadastra o preço por metro e o valor sai sozinho.
          </p>
          <Button size="sm" onClick={() => onNew(obraId || null)}>
            <Plus className="w-4 h-4" /> Lançar metros
          </Button>
        </div>
      ) : (
        <>
          {/* Por setor — o controle que o chefe pediu */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              Por setor
            </p>
            <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {porSetor.map((s) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => onRates(s.obraId)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {s.nome}
                      </span>
                      <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {!obraId ? `${s.obraNome} · ` : ""}
                        {s.preco > 0 ? `${formatBRL(s.preco)}/m` : "sem preço cadastrado"}
                      </span>
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className="block text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                        {formatQty(s.metros)} m
                      </span>
                      <span className="block text-[11px] text-produmar-600 dark:text-produmar-400 tabular-nums">
                        {formatBRL(s.valor)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Os lançamentos, um por um */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Ruler className="w-3.5 h-3.5 text-slate-400" />
              Lançamentos
            </p>
            <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {listados.slice(0, 200).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(r)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
                  >
                    <span className="w-12 flex-shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums pt-0.5">
                      {formatDate(r.work_date).slice(0, 5)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate tabular-nums">
                        {formatQty(num(r.meters))} m
                        {r.sector_name ? ` · ${r.sector_name}` : ""}
                      </span>
                      <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {r.obra_name}
                        {r.description ? ` · ${r.description}` : ""}
                        {r.registered_by_name ? ` · ${r.registered_by_name}` : ""}
                      </span>
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className="block text-sm font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                        {formatBRL(num(r.total_value))}
                      </span>
                      <span className="block text-[10px] text-slate-400 tabular-nums">
                        {num(r.effective_rate) > 0
                          ? `${formatBRL(num(r.effective_rate))}/m`
                          : "sem preço"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function FiltroChip({
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
        "flex-shrink-0 px-3 min-h-[36px] rounded-full text-xs font-medium border transition-colors max-w-[12rem] truncate",
        ativo
          ? "bg-produmar-600 border-produmar-600 text-white"
          : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
      )}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIÁLOGO: preço por metro (a tabela do chefe)
// ─────────────────────────────────────────────────────────────────────────────

interface RateProps {
  open: boolean;
  onClose: () => void;
  obras: SupplyObraUsage[];
  sectors: SupplyObraSector[];
  /** Obra já escolhida (veio do filtro ou de um setor da lista). */
  presetObraId?: string | null;
}

/**
 * Onde o chefe cadastra o valor: um preço por metro para a obra inteira e,
 * quando um setor for diferente (mais fio, terreno ruim), um preço só dele.
 *
 * O preço vale para TODO metro daquela obra/setor — inclusive o que o técnico
 * já lançou antes de o preço existir. É por isso que não se digita valor em
 * cada lançamento: cadastra uma vez, vale para tudo.
 */
export function FenceRateDialog({ open, onClose, obras, sectors, presetObraId }: RateProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [obraId, setObraId] = useState("");
  const [obraRate, setObraRate] = useState("");
  const [sectorRates, setSectorRates] = useState<Record<string, string>>({});

  const obra = obras.find((o) => o.id === obraId) ?? null;
  const obraSectors = useMemo(
    () => sectors.filter((s) => s.obra_id === obraId),
    [sectors, obraId]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    // com uma obra só, ela já entra escolhida — ninguém precisa selecionar
    setObraId(presetObraId ?? (obras.length === 1 ? obras[0].id : ""));
  }, [open, presetObraId, obras]);

  // os campos nascem com o que já está cadastrado
  useEffect(() => {
    const o = obras.find((x) => x.id === obraId) ?? null;
    setObraRate(o && num(o.fence_rate ?? 0) > 0 ? formatBRLInput(num(o.fence_rate ?? 0)) : "");
    const map: Record<string, string> = {};
    for (const s of sectors.filter((x) => x.obra_id === obraId))
      map[s.id] = num(s.fence_rate ?? 0) > 0 ? formatBRLInput(num(s.fence_rate ?? 0)) : "";
    setSectorRates(map);
  }, [obraId, obras, sectors]);

  function handleSave() {
    if (!obraId) return setError("Escolha a obra");
    setError(null);

    startTransition(async () => {
      const r = await setObraFenceRate(obraId, parseMoney(obraRate));
      if (r && "error" in r) return setError(r.error ?? "Erro ao salvar o preço");

      // só os setores que mudaram: um update por setor tocado, não pela lista toda
      for (const s of obraSectors) {
        const novo = parseMoney(sectorRates[s.id] ?? "");
        if (novo === num(s.fence_rate ?? 0)) continue;
        const rs = await setSectorFenceRate(s.id, novo);
        if (rs && "error" in rs) return setError(rs.error ?? "Erro ao salvar o preço do setor");
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-lime-50 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400">
              <Tag className="w-4 h-4" />
            </span>
            Preço por metro
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
              placeholder="Toque para escolher a obra..."
              searchPlaceholder="Buscar obra..."
              emptyMessage="Nenhuma obra cadastrada"
            />
          </div>

          {obraId && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="fr_obra">Preço da obra (R$ por metro)</Label>
                <Input
                  id="fr_obra"
                  value={obraRate}
                  onChange={(e) => setObraRate(formatBRLInput(e.target.value))}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="h-12 text-lg font-semibold tabular-nums"
                  autoComplete="off"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Vale para todos os setores desta obra que não tiverem preço próprio.
                </p>
              </div>

              {obraSectors.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Setores com preço diferente</Label>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                    {obraSectors.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                        <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">
                          {s.name}
                        </span>
                        <Input
                          value={sectorRates[s.id] ?? ""}
                          onChange={(e) =>
                            setSectorRates((prev) => ({
                              ...prev,
                              [s.id]: formatBRLInput(e.target.value),
                            }))
                          }
                          placeholder={obraRate || "0,00"}
                          inputMode="decimal"
                          aria-label={`Preço por metro do setor ${s.name}`}
                          className="h-11 w-28 flex-shrink-0 text-right tabular-nums"
                          autoComplete="off"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Em branco = vale o preço da obra{obra && num(obra.fence_rate ?? 0) > 0 ? "" : " (que ainda não foi cadastrado)"}.
                  </p>
                </div>
              )}
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || !obraId}
            className="w-full h-12 font-semibold"
          >
            {isPending ? "Salvando..." : "Salvar preço"}
          </Button>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            O preço vale para todo metro já lançado nesta obra — o técnico nunca vê valor
            nenhum na tela dele.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIÁLOGO: lançar / corrigir metros
// ─────────────────────────────────────────────────────────────────────────────

interface RunProps {
  open: boolean;
  onClose: () => void;
  /** Lançamento aberto (null = está lançando um novo). */
  run: SupplyFenceRunView | null;
  obras: SupplyObraUsage[];
  sectors: SupplyObraSector[];
  presetObraId?: string | null;
}

export function FenceRunDialog({
  open,
  onClose,
  run,
  obras,
  sectors,
  presetObraId,
}: RunProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [obraId, setObraId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [meters, setMeters] = useState("");
  const [workDate, setWorkDate] = useState(localDateISO());
  const [description, setDescription] = useState("");
  /** O chefe travou um preço só para este trecho? */
  const [lockRate, setLockRate] = useState(false);
  const [rate, setRate] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setObraId(run?.obra_id ?? presetObraId ?? "");
    setSectorId(run?.sector_id ?? "");
    setMeters(run ? formatQtyInput(String(num(run.meters)).replace(".", ",")) : "");
    setWorkDate(run?.work_date ?? localDateISO());
    setDescription(run?.description ?? "");
    setLockRate(run?.rate_per_meter != null);
    setRate(run?.rate_per_meter != null ? formatBRLInput(num(run.rate_per_meter)) : "");
  }, [open, run, presetObraId]);

  const obraSectors = useMemo(
    () => sectors.filter((s) => s.obra_id === obraId),
    [sectors, obraId]
  );
  const obra = obras.find((o) => o.id === obraId) ?? null;
  const setor = sectors.find((s) => s.id === sectorId) ?? null;

  /** O preço que vai valer — e de onde ele vem. É o que tira a dúvida na hora. */
  const precoTravado = lockRate ? parseMoney(rate) : null;
  const preco = effectiveRate(precoTravado, setor, obra);
  const origem = lockRate
    ? "preço deste trecho"
    : num(setor?.fence_rate ?? 0) > 0
      ? `preço do setor ${setor?.name ?? ""}`
      : num(obra?.fence_rate ?? 0) > 0
        ? "preço da obra"
        : "sem preço cadastrado";
  const total = parseQty(meters) * preco;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!obraId) return setError("Escolha a obra");
    const m = parseQty(meters);
    if (m <= 0) return setError("Informe quantos metros foram feitos");
    if (!workDate) return setError("Informe o dia do serviço");

    const input = {
      obra_id: obraId,
      sector_id: sectorId || null,
      work_date: workDate,
      meters: m,
      description,
      rate_per_meter: lockRate ? parseMoney(rate) : null,
    };

    startTransition(async () => {
      const r = run ? await updateFenceRun(run.id, input) : await createFenceRun(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!run) return;
    if (!confirm(`Apagar o lançamento de ${formatQty(num(run.meters))} m? Ele sai da conta.`))
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteFenceRun(run.id);
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
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-lime-50 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400">
              <Fence className="w-4 h-4" />
            </span>
            {run ? "Corrigir os metros" : "Lançar metros de cerca"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="fru_metros">Metros *</Label>
              <Input
                id="fru_metros"
                value={meters}
                onChange={(e) => setMeters(formatQtyInput(e.target.value))}
                placeholder="0"
                inputMode="decimal"
                className="h-12 text-lg font-semibold tabular-nums"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fru_data">Dia *</Label>
              <Input
                id="fru_data"
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="h-12 tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fru_desc">O que foi feito</Label>
            <Input
              id="fru_desc"
              value={description}
              onChange={(e) => setDescription(upperKeepingCaret(e))}
              placeholder="opcional"
              className="h-12 uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          {/* O preço: por padrão vem da tabela; travar é a exceção */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {preco > 0 ? `${formatBRL(preco)}/m` : "Sem preço"} · {origem}
              </span>
              {total > 0 && (
                <span className="text-sm font-bold text-produmar-700 dark:text-produmar-400 tabular-nums">
                  {formatBRL(total)}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setLockRate((v) => !v);
                if (!lockRate && !rate && preco > 0) setRate(formatBRLInput(preco));
              }}
              className={cn(
                "w-full min-h-[44px] px-3 rounded-lg border text-sm font-medium transition-colors active:scale-[0.98]",
                lockRate
                  ? "bg-produmar-50 border-produmar-300 text-produmar-700 dark:bg-produmar-950/40 dark:border-produmar-700 dark:text-produmar-300"
                  : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
              )}
            >
              {lockRate ? "✓ " : ""}
              Este trecho tem preço próprio
            </button>

            {lockRate && (
              <Input
                value={rate}
                onChange={(e) => setRate(formatBRLInput(e.target.value))}
                placeholder="0,00"
                inputMode="decimal"
                aria-label="Preço por metro deste trecho"
                className="h-12 text-lg font-semibold tabular-nums"
                autoComplete="off"
              />
            )}

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Sem preço próprio, este trecho segue o preço do setor (ou o da obra) — e
              acompanha quando ele mudar.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            {run && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                aria-label="Apagar lançamento"
                className="w-12 h-12 flex items-center justify-center rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <Button type="submit" disabled={isPending} className="flex-1 h-12 font-semibold">
              {isPending ? "Salvando..." : run ? "Salvar" : "Lançar"}
            </Button>
          </div>

          {run?.registered_by_name && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Lançado por {run.registered_by_name}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
