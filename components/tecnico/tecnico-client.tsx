"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Clock,
  Fuel,
  HardHat,
  List,
  PackageOpen,
  Pencil,
  Plus,
  Tractor,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  cn,
  formatDate,
  formatHourmeter,
  formatQty,
  localDateISO,
  upperKeepingCaret,
} from "@/lib/utils";
import {
  cancelSupplyUsageRequest,
  requestSupplyUsage,
} from "@/app/(app)/tecnico/actions";
import { PhotoField, formatQtyInput, parseQty } from "@/components/almoxarifado/supply-shared";
import { FUEL_TYPES } from "@/lib/types";
import type {
  MachineTrackingType,
  SupplyObraSector,
  SupplyRequestRow,
} from "@/lib/types";

/** Catálogo enxuto — o técnico não vê saldo, só o nome e a unidade. */
export interface TecnicoItem {
  id: string;
  name: string;
  unit: string;
}

export interface TecnicoObra {
  id: string;
  name: string;
  client: string | null;
}

/** Máquina da frota, do jeito enxuto que o técnico precisa ver. */
export interface TecnicoMachine {
  id: string;
  name: string;
  plate: string | null;
  /** Se o painel dela conta hora (horímetro) ou quilômetro. */
  tracking_type: MachineTrackingType;
}

interface Props {
  items: TecnicoItem[];
  obras: TecnicoObra[];
  /** Setores cadastrados pelo chefe — o subcadastro de cada obra. */
  sectors: SupplyObraSector[];
  /** Frota ativa: o técnico só escolhe, não cadastra máquina. */
  machines: TecnicoMachine[];
  /** Recados dele que o chefe ainda não resolveu. */
  pending: SupplyRequestRow[];
}

/**
 * Uma linha do envio: um material com a quantidade dele. Numa obra o técnico
 * gasta cano, emenda e cola na mesma ida — cada um vira uma linha destas.
 */
interface Linha {
  /** Chave de render: os materiais podem repetir e o índice muda ao remover. */
  key: string;
  itemId: string;
  /** O material não estava na lista: o técnico escreve o nome. */
  freeText: boolean;
  itemText: string;
  quantity: string;
}

function novaLinha(): Linha {
  return {
    key: typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random()),
    itemId: "",
    freeText: false,
    itemText: "",
    quantity: "",
  };
}

/**
 * Tela única do técnico: "usei estes materiais aqui". Nada sai do estoque neste
 * momento — o envio é um recado que o chefe confere e transforma em saída na
 * aba "Pendentes" do Estoque.
 */
export function TecnicoClient({ items, obras, sectors, machines, pending }: Props) {
  const [isPending, startTransition] = useTransition();
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [linhas, setLinhas] = useState<Linha[]>(() => [novaLinha()]);
  const [obraId, setObraId] = useState("");
  const [sectorId, setSectorId] = useState("");
  /** O setor não estava na lista: o técnico escreve o lugar na mão. */
  const [sectorFreeText, setSectorFreeText] = useState(false);
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  // ── Máquina do serviço (tudo opcional) ────────────────────────────────────
  const [usedMachine, setUsedMachine] = useState(false);
  const [machineId, setMachineId] = useState("");
  /** Leitura do painel: horímetro ou km, conforme a máquina. */
  const [reading, setReading] = useState("");
  /** Ninguém anotou o painel — é o caso comum, e não pode travar o envio. */
  const [noReading, setNoReading] = useState(false);
  const [fueled, setFueled] = useState(false);
  const [fuelType, setFuelType] = useState("");

  const today = localDateISO();
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);

  /** Os setores da obra escolhida — o setor é subcadastro dela. */
  const obraSectors = useMemo(
    () => sectors.filter((s) => s.obra_id === obraId),
    [sectors, obraId]
  );
  /** Sem obra escolhida (ou obra ainda sem setor) só resta escrever o lugar. */
  const useSectorList = !!obraId && obraSectors.length > 0 && !sectorFreeText;

  const machine = useMemo(
    () => machines.find((m) => m.id === machineId) ?? null,
    [machines, machineId]
  );
  /** Caminhão/caçamba andam de km; máquina de terra conta hora. */
  const tracksKm = machine?.tracking_type === "km";

  /** Trocar de obra zera o setor: ele é de uma obra só. */
  function chooseObra(id: string) {
    setObraId(id);
    setSectorId("");
    setSectorFreeText(false);
  }

  function patchLinha(key: string, patch: Partial<Linha>) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLinha() {
    setLinhas((prev) => [...prev, novaLinha()]);
  }

  function removeLinha(key: string) {
    // sempre sobra uma: a tela sem nenhum campo de material não diz o que fazer
    setLinhas((prev) => (prev.length === 1 ? [novaLinha()] : prev.filter((l) => l.key !== key)));
  }

  /** Linhas que o técnico realmente preencheu (as em branco são ignoradas). */
  const preenchidas = useMemo(
    () => linhas.filter((l) => l.itemId || l.itemText.trim()),
    [linhas]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (preenchidas.length === 0) return setError("Diga qual material você usou");
    const semQtd = preenchidas.find((l) => parseQty(l.quantity) <= 0);
    if (semQtd) {
      const nome = itemById.get(semQtd.itemId)?.name ?? semQtd.itemText.trim() ?? "";
      return setError(
        nome ? `Informe quanto de ${nome} você usou` : "Informe a quantidade de cada material"
      );
    }
    if (!obraId && !destination.trim())
      return setError("Diga o local da obra ou onde você aplicou o material");
    if (usedMachine && !machineId) return setError("Diga qual máquina você usou");
    if (usedMachine && fueled && !fuelType)
      return setError("Diga qual combustível você abasteceu");

    const nomes = preenchidas.map(
      (l) => itemById.get(l.itemId)?.name ?? l.itemText.trim().toUpperCase()
    );

    const fd = new FormData();
    fd.append(
      "items",
      JSON.stringify(
        preenchidas.map((l) => ({
          item_id: l.itemId,
          item_text: l.itemText,
          quantity: l.quantity,
        }))
      )
    );
    fd.append("obra_id", obraId);
    // o setor manda quando veio da lista; senão vale o lugar escrito na mão
    fd.append("sector_id", useSectorList ? sectorId : "");
    fd.append("destination", useSectorList ? "" : destination);
    fd.append("notes", notes);
    if (usedMachine && machineId) {
      fd.append("machine_id", machineId);
      // leitura só se ele anotou — em branco o banco guarda nulo
      const leitura = noReading ? "" : reading;
      fd.append(tracksKm ? "machine_km" : "machine_hourmeter", leitura);
      if (fueled && fuelType) fd.append("fuel_type", fuelType);
    }
    if (photo) fd.append("photo", photo);

    startTransition(async () => {
      const r = await requestSupplyUsage(fd);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao enviar");
        return;
      }
      // A obra, o setor e a máquina ficam: quem está numa obra manda vários
      // envios seguidos. Zeram os materiais, a observação, a foto e o que é do
      // momento (leitura do painel e abastecimento).
      setLinhas([novaLinha()]);
      setNotes("");
      setPhoto(null);
      setReading("");
      setNoReading(false);
      setFueled(false);
      setFuelType("");
      setSuccess(
        nomes.length === 1
          ? `${nomes[0]} enviado! O chefe confere e dá baixa no estoque.`
          : `${nomes.length} materiais enviados! O chefe confere e dá baixa no estoque.`
      );
    });
  }

  function handleCancel(r: SupplyRequestRow) {
    const nome = r.supply_items?.name ?? r.item_text ?? "material";
    if (!confirm(`Cancelar o envio de ${nome}? O chefe não vai mais ver este recado.`)) return;
    setCancelingId(r.id);
    startTransition(async () => {
      const res = await cancelSupplyUsageRequest(r.id);
      setCancelingId(null);
      if (res && "error" in res) setError(res.error ?? "Erro ao cancelar");
    });
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3 pt-1">
        <div className="w-11 h-11 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center flex-shrink-0">
          <PackageOpen className="w-6 h-6 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Material usado
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Hoje, {formatDate(today)}</p>
        </div>
      </div>

      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
          <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{success}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que você usou</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Materiais *</Label>
                {preenchidas.length > 1 && (
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    {preenchidas.length} materiais
                  </span>
                )}
              </div>

              {linhas.map((linha, i) => (
                <MaterialLinha
                  key={linha.key}
                  linha={linha}
                  numero={i + 1}
                  total={linhas.length}
                  items={items}
                  unit={itemById.get(linha.itemId)?.unit ?? ""}
                  onChange={(patch) => patchLinha(linha.key, patch)}
                  onRemove={() => removeLinha(linha.key)}
                />
              ))}

              <button
                type="button"
                onClick={addLinha}
                className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-sm font-medium text-produmar-600 dark:text-produmar-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar outro material
              </button>
            </div>

            <div className="space-y-1.5">
              <Label>Local da obra</Label>
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
                placeholder="Toque para escolher o local..."
                searchPlaceholder="Buscar local da obra..."
                emptyMessage="Nenhum local cadastrado"
              />
            </div>

            {/* Setor: subcadastro do local da obra, cadastrado pelo chefe. O
                texto livre continua existindo para o técnico não travar na rua. */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="tc_dest">Setor aplicado</Label>
                {!!obraId && obraSectors.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSectorFreeText((v) => !v);
                      setSectorId("");
                      setDestination("");
                    }}
                    className="flex items-center gap-1 min-h-[36px] px-2 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
                  >
                    {sectorFreeText ? (
                      <>
                        <List className="w-3 h-3" />
                        Escolher da lista
                      </>
                    ) : (
                      <>
                        <Pencil className="w-3 h-3" />
                        Não achei na lista
                      </>
                    )}
                  </button>
                )}
              </div>

              {useSectorList ? (
                <SearchableSelect
                  items={obraSectors}
                  value={sectorId}
                  onChange={setSectorId}
                  getId={(x) => x.id}
                  getLabel={(x) => x.name}
                  placeholder="Toque para escolher o setor..."
                  searchPlaceholder="Buscar setor..."
                  emptyMessage="Nenhum setor cadastrado nesta obra"
                />
              ) : (
                <Input
                  id="tc_dest"
                  value={destination}
                  onChange={(e) => setDestination(upperKeepingCaret(e))}
                  placeholder="ex: poste da esquina, casa do cliente"
                  className="h-12 uppercase placeholder:normal-case placeholder:lowercase"
                  autoComplete="off"
                />
              )}

              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {useSectorList
                  ? "Vale para todos os materiais deste envio."
                  : obraId
                    ? "Esta obra ainda não tem setor cadastrado — escreva o lugar que o chefe cadastra depois."
                    : "Escolha o local da obra acima para aparecerem os setores dele."}
              </p>
            </div>

            {/* Máquina — o serviço nem sempre é só material */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Tractor className="w-3.5 h-3.5 text-slate-400" />
                Usou máquina?
              </Label>
              <SimNao
                value={usedMachine}
                onChange={(v) => {
                  setUsedMachine(v);
                  if (!v) {
                    setMachineId("");
                    setReading("");
                    setNoReading(false);
                    setFueled(false);
                    setFuelType("");
                  }
                }}
              />

              {usedMachine && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label>Qual máquina *</Label>
                    <SearchableSelect
                      items={machines}
                      value={machineId}
                      onChange={setMachineId}
                      getId={(m) => m.id}
                      getLabel={(m) => m.name}
                      renderItem={(m) => (
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <span className="truncate">{m.name}</span>
                          {m.plate && (
                            <span className="text-[10px] text-slate-400 flex-shrink-0">
                              {m.plate}
                            </span>
                          )}
                        </div>
                      )}
                      placeholder="Toque para escolher a máquina..."
                      searchPlaceholder="Buscar máquina..."
                      emptyMessage="Nenhuma máquina cadastrada"
                    />
                  </div>

                  {machineId && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="tc_reading">
                          {tracksKm ? "Km do painel" : "Horímetro"}
                        </Label>
                        {!noReading && (
                          <Input
                            id="tc_reading"
                            value={reading}
                            onChange={(e) =>
                              setReading(
                                tracksKm
                                  ? e.target.value.replace(/\D/g, "")
                                  : formatHourmeter(e.target.value)
                              )
                            }
                            placeholder={tracksKm ? "ex: 154300" : "ex: 1230,5"}
                            inputMode="decimal"
                            className="h-12 text-lg font-semibold tabular-nums"
                            autoComplete="off"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setNoReading((v) => !v);
                            setReading("");
                          }}
                          className={cn(
                            "w-full min-h-[44px] px-3 rounded-lg border text-sm font-medium transition-colors active:scale-[0.98]",
                            noReading
                              ? "bg-produmar-50 border-produmar-300 text-produmar-700 dark:bg-produmar-950/40 dark:border-produmar-700 dark:text-produmar-300"
                              : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                          )}
                        >
                          {noReading ? "\u2713 " : ""}
                          Não anotei o {tracksKm ? "km" : "horímetro"}
                        </button>
                      </div>

                      <div className="space-y-2">
                        <Label>Abasteceu?</Label>
                        <SimNao
                          value={fueled}
                          onChange={(v) => {
                            setFueled(v);
                            if (!v) setFuelType("");
                          }}
                        />
                        {fueled && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {FUEL_TYPES.map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => setFuelType(f)}
                                className={cn(
                                  "flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border text-sm font-medium transition-colors active:scale-[0.97]",
                                  fuelType === f
                                    ? "bg-produmar-600 border-produmar-600 text-white"
                                    : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                                )}
                              >
                                <Fuel className="w-3.5 h-3.5" />
                                {f}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <PhotoField
              label="Foto (se quiser)"
              hint="Foto do serviço ou do material que você usou."
              file={photo}
              onChange={setPhoto}
            />

            <div className="space-y-1.5">
              <Label htmlFor="tc_notes">Observação</Label>
              <Input
                id="tc_notes"
                value={notes}
                onChange={(e) => setNotes(upperKeepingCaret(e))}
                placeholder="opcional"
                className="h-12 uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>

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
              {isPending ? "Enviando..." : "Enviar"}
            </Button>

            <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
              Isso não tira do estoque agora — o chefe confere e dá baixa.
            </p>
          </form>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Aguardando o chefe ({pending.length})
          </Label>
          <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {pending.map((r) => {
              const nome = r.supply_items?.name ?? r.item_text ?? "—";
              const un = r.supply_items?.unit ?? "";
              // o setor manda no rótulo; sem setor vale a obra ou o que ele escreveu
              const setor = r.sector_id ? sectorById.get(r.sector_id)?.name : null;
              const lugar =
                [r.supply_obras?.name, setor ?? r.destination].filter(Boolean).join(" · ");
              const at = new Date(r.created_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <li key={r.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <HardHat className="w-4 h-4 text-amber-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate tabular-nums">
                      {formatQty(Number(r.quantity))} {un} · {nome}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {lugar ? `${lugar} · ` : ""}
                      {at}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancel(r)}
                    disabled={isPending && cancelingId === r.id}
                    aria-label="Cancelar envio"
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex-shrink-0 -mr-2 transition-colors disabled:opacity-40"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Some da lista quando o chefe dá baixa no estoque.
          </p>
        </div>
      )}
    </div>
  );
}

/** Sim/Não do tamanho do dedo — o técnico responde sem abrir teclado. */
function SimNao({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[false, true].map((op) => (
        <button
          key={String(op)}
          type="button"
          onClick={() => onChange(op)}
          className={cn(
            "min-h-[48px] rounded-xl border text-sm font-semibold transition-colors active:scale-[0.97]",
            value === op
              ? op
                ? "bg-produmar-600 border-produmar-600 text-white"
                : "bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
              : "bg-white border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500"
          )}
        >
          {op ? "Sim" : "Não"}
        </button>
      ))}
    </div>
  );
}

/** Um material do envio: escolher (ou escrever) e dizer quanto usou. */
function MaterialLinha({
  linha,
  numero,
  total,
  items,
  unit,
  onChange,
  onRemove,
}: {
  linha: Linha;
  numero: number;
  total: number;
  items: TecnicoItem[];
  unit: string;
  onChange: (patch: Partial<Linha>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          {total > 1 ? `Material ${numero}` : "Material"}
        </span>
        <div className="flex items-center gap-1">
          {linha.freeText ? (
            <button
              type="button"
              onClick={() => onChange({ freeText: false, itemText: "" })}
              className="flex items-center gap-1 min-h-[36px] px-2 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
            >
              <List className="w-3 h-3" />
              Escolher da lista
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onChange({ freeText: true, itemId: "" })}
              className="flex items-center gap-1 min-h-[36px] px-2 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
            >
              <Pencil className="w-3 h-3" />
              Não achei na lista
            </button>
          )}
          {total > 1 && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Tirar o material ${numero}`}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {linha.freeText ? (
        <>
          <Input
            value={linha.itemText}
            onChange={(e) => onChange({ itemText: upperKeepingCaret(e) })}
            placeholder="ex: cano 50mm"
            className="h-12 text-lg uppercase placeholder:normal-case placeholder:text-base placeholder:lowercase"
            autoComplete="off"
          />
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Escreva do jeito que você chama — o chefe acha no cadastro.
          </p>
        </>
      ) : (
        <SearchableSelect
          items={items}
          value={linha.itemId}
          onChange={(id) => onChange({ itemId: id })}
          getId={(i) => i.id}
          getLabel={(i) => i.name}
          renderItem={(i) => (
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="truncate">{i.name}</span>
              <span className="text-[10px] text-slate-400 flex-shrink-0">{i.unit}</span>
            </div>
          )}
          placeholder="Toque para escolher..."
          searchPlaceholder="Buscar material..."
          emptyMessage="Nenhum material cadastrado"
          onCreateNew={() => onChange({ freeText: true, itemId: "" })}
          createNewLabel="Não achei — escrever o nome"
        />
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`tc_qty_${linha.key}`}>
          Quantidade{unit ? ` (${unit})` : ""} *
        </Label>
        <Input
          id={`tc_qty_${linha.key}`}
          value={linha.quantity}
          onChange={(e) => onChange({ quantity: formatQtyInput(e.target.value) })}
          placeholder="0"
          inputMode="decimal"
          className="h-12 text-lg font-semibold tabular-nums"
          autoComplete="off"
        />
      </div>
    </div>
  );
}
