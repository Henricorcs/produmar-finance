"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Fence, MapPin, Ruler, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatDate, formatQty, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { cancelFenceRun, registerFenceRun } from "@/app/(app)/tecnico/actions";
import { PhotoField, formatQtyInput, parseQty } from "@/components/almoxarifado/supply-shared";
import type { SupplyFenceRun, SupplyObraSector } from "@/lib/types";
import type { TecnicoObra } from "./tecnico-client";
import { useAtualizarAoVoltar } from "./use-atualizar-ao-voltar";

interface Props {
  obras: TecnicoObra[];
  /** Setores cadastrados pelo chefe — o técnico só escolhe. */
  sectors: SupplyObraSector[];
  /** Os trechos já lançados (de todo mundo) — dá o total do setor. */
  runs: SupplyFenceRun[];
  /** Quem está usando a tela: ele só apaga o que ele mesmo lançou. */
  meId: string;
}

/**
 * A cerca do técnico: quantos metros andaram hoje, e em qual setor.
 *
 * Esta tela NÃO TEM DINHEIRO NENHUM — nem preço por metro, nem total a receber.
 * É de propósito: quem põe preço é o chefe, na tela dele. Aqui só se informa o
 * metro feito, do mesmo jeito que o material é informado sem ver saldo.
 */
export function TecnicoCercaClient({ obras, sectors, runs, meId }: Props) {
  // obra e setor vêm de novo quando ele volta para a tela
  useAtualizarAoVoltar();

  const [isPending, startTransition] = useTransition();
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hoje = localDateISO();
  const [obraId, setObraId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [meters, setMeters] = useState("");
  const [workDate, setWorkDate] = useState(hoje);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const obraNome = useMemo(() => new Map(obras.map((o) => [o.id, o.name])), [obras]);
  const setorNome = useMemo(() => new Map(sectors.map((s) => [s.id, s.name])), [sectors]);

  /** Os setores da obra escolhida — o setor é subcadastro dela. */
  const obraSectors = useMemo(
    () => sectors.filter((s) => s.obra_id === obraId),
    [sectors, obraId]
  );

  /** Quanto já andou no setor escolhido (ou na obra, quando não tem setor). */
  const jaFeito = useMemo(() => {
    if (!obraId) return 0;
    return runs
      .filter((r) => r.obra_id === obraId && (!sectorId || r.sector_id === sectorId))
      .reduce((s, r) => s + Number(r.meters), 0);
  }, [runs, obraId, sectorId]);

  /** O que EU lancei — é a lista de conferência dele. */
  const meus = useMemo(
    () => runs.filter((r) => r.created_by === meId).slice(0, 20),
    [runs, meId]
  );

  /** Quanto EU já lancei neste mês. */
  const meusMetrosNoMes = useMemo(() => {
    const de = hoje.slice(0, 7); // YYYY-MM
    return runs
      .filter((r) => r.created_by === meId && r.work_date.startsWith(de))
      .reduce((s, r) => s + Number(r.meters), 0);
  }, [runs, meId, hoje]);

  /** Trocar de obra zera o setor: ele é de uma obra só. */
  function chooseObra(id: string) {
    setObraId(id);
    setSectorId("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!obraId) return setError("Diga em qual obra você fez a cerca");
    const m = parseQty(meters);
    if (m <= 0) return setError("Informe quantos metros você fez");
    if (!workDate) return setError("Informe o dia do serviço");

    const fd = new FormData();
    fd.append("obra_id", obraId);
    fd.append("sector_id", sectorId);
    fd.append("meters", meters);
    fd.append("work_date", workDate);
    fd.append("description", description);
    if (photo) fd.append("photo", photo);

    startTransition(async () => {
      const r = await registerFenceRun(fd);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao lançar");
        return;
      }
      // A obra e o setor FICAM: quem está numa cerca lança vários dias seguidos.
      // Zera o que é do dia — os metros, a descrição e a foto.
      setMeters("");
      setDescription("");
      setPhoto(null);
      setWorkDate(hoje);
      setSuccess(
        `${formatQty(m)} m lançados${sectorId ? ` em ${setorNome.get(sectorId)}` : ""}!`
      );
    });
  }

  function handleCancel(r: SupplyFenceRun) {
    if (!confirm(`Apagar o lançamento de ${formatQty(Number(r.meters))} m?`)) return;
    setCancelingId(r.id);
    setError(null);
    startTransition(async () => {
      const res = await cancelFenceRun(r.id);
      setCancelingId(null);
      if (res && "error" in res) setError(res.error ?? "Erro ao apagar");
    });
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3 pt-1">
        <div className="w-11 h-11 rounded-xl bg-lime-100 dark:bg-lime-900/40 flex items-center justify-center flex-shrink-0">
          <Fence className="w-6 h-6 text-lime-700 dark:text-lime-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Cerca
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Hoje, {formatDate(hoje)}</p>
        </div>
      </div>

      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
          <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{success}</p>
        </div>
      )}

      {meusMetrosNoMes > 0 && (
        <div className="rounded-xl border border-lime-200 dark:border-lime-900/50 bg-lime-50 dark:bg-lime-950/30 px-4 py-3 flex items-center gap-3">
          <Ruler className="w-5 h-5 text-lime-700 dark:text-lime-400 flex-shrink-0" />
          <p className="text-sm text-lime-800 dark:text-lime-300">
            Você já lançou{" "}
            <strong className="tabular-nums">{formatQty(meusMetrosNoMes)} m</strong> este mês.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quantos metros você fez</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
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
                emptyMessage="Nenhuma obra cadastrada"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Setor</Label>
              {obraSectors.length > 0 ? (
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
              ) : (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 py-2">
                  {obraId
                    ? "Esta obra ainda não tem setor cadastrado (o chefe cadastra em Almoxarifado → Obras → Setores). Pode lançar assim mesmo."
                    : "Escolha a obra acima para aparecerem os setores dela."}
                </p>
              )}

              {obraId && jaFeito > 0 && (
                <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  Já feitos {sectorId ? "neste setor" : "nesta obra"}:{" "}
                  <strong className="tabular-nums">{formatQty(jaFeito)} m</strong>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tcc_metros">Metros feitos *</Label>
              <Input
                id="tcc_metros"
                value={meters}
                onChange={(e) => setMeters(formatQtyInput(e.target.value))}
                placeholder="0"
                inputMode="decimal"
                className="h-14 text-2xl font-semibold tabular-nums"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Só o que andou HOJE — o total da obra o sistema soma sozinho.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tcc_data">Dia do serviço *</Label>
              <Input
                id="tcc_data"
                type="date"
                value={workDate}
                max={hoje}
                onChange={(e) => setWorkDate(e.target.value)}
                className="h-12 tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tcc_desc">O que foi feito</Label>
              <Input
                id="tcc_desc"
                value={description}
                onChange={(e) => setDescription(upperKeepingCaret(e))}
                placeholder="opcional — ex: esticou 5 fios"
                className="h-12 uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>

            <PhotoField
              label="Foto (se quiser)"
              hint="Foto do trecho que ficou pronto."
              file={photo}
              onChange={setPhoto}
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-14 text-base font-semibold"
            >
              {isPending ? "Lançando..." : "Lançar os metros"}
            </Button>

            <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
              Vai direto para o controle da obra. O valor é com o chefe.
            </p>
          </form>
        </CardContent>
      </Card>

      {meus.length > 0 && (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5 text-lime-600" />
            O que você lançou
          </Label>
          <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {meus.map((r) => {
              const lugar = [obraNome.get(r.obra_id), r.sector_id ? setorNome.get(r.sector_id) : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={r.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-lime-50 dark:bg-lime-900/30 flex items-center justify-center flex-shrink-0">
                    <Fence className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate tabular-nums">
                      {formatQty(Number(r.meters))} m
                      {r.description ? ` · ${r.description}` : ""}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {formatDate(r.work_date)}
                      {lugar ? ` · ${lugar}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancel(r)}
                    disabled={isPending && cancelingId === r.id}
                    aria-label="Apagar lançamento"
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex-shrink-0 -mr-2 transition-colors disabled:opacity-40"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Errou o número? Apague e lance de novo.
          </p>
        </div>
      )}
    </div>
  );
}
