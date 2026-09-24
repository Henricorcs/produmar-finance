"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock,
  Fuel,
  HardHat,
  List,
  PackageOpen,
  Pencil,
  Tractor,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { LancadorDeMateriais, useLancadorDeMateriais } from "./lancador-de-materiais";
import { useAtualizarAoVoltar } from "./use-atualizar-ao-voltar";
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
import { PhotoField } from "@/components/almoxarifado/supply-shared";
import { FUEL_TYPES } from "@/lib/types";
import type {
  MachineTrackingType,
  SupplyLocal,
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
  /** O SETOR onde a obra fica (Fazenda 01, Fazenda 02, Sítio). */
  local_id: string | null;
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
  /**
   * OS SETORES: Fazenda 01, Fazenda 02, Sítio. É o lugar grande, e é assim que
   * o pessoal fala — a obra (aprisco, cerca, baia) acontece dentro de um deles.
   */
  locais: SupplyLocal[];
  /** Subcadastro antigo da obra — hoje só serve para ler o histórico. */
  sectors: SupplyObraSector[];
  /** Frota ativa: o técnico só escolhe, não cadastra máquina. */
  machines: TecnicoMachine[];
  /** Recados dele que o chefe ainda não resolveu. */
  pending: SupplyRequestRow[];
}

/**
 * Tela única do técnico: "usei estes materiais aqui". Nada sai do estoque neste
 * momento — o envio é um recado que o chefe confere e transforma em saída na
 * aba "Pendentes" do Estoque.
 */
export function TecnicoClient({
  items,
  obras,
  locais,
  sectors,
  machines,
  pending,
}: Props) {
  // o cadastro (obra, setor, material) vem de novo quando ele volta para a tela
  useAtualizarAoVoltar();
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const lancador = useLancadorDeMateriais({ items });
  /** O SETOR (Fazenda 01, Fazenda 02, Sítio) — escolhido antes da obra. */
  const [localId, setLocalId] = useState("");
  const [obraId, setObraId] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  // ── Máquina do serviço (tudo opcional) ────────────────────────────────────
  const [usedMachine, setUsedMachine] = useState(false);
  const [machineId, setMachineId] = useState("");
  /** Leitura do painel no começo e no fim — a diferença é o que ela trabalhou. */
  const [readingStart, setReadingStart] = useState("");
  const [readingEnd, setReadingEnd] = useState("");
  /** Ninguém anotou o painel — é o caso comum, e não pode travar o envio. */
  const [noReading, setNoReading] = useState(false);
  const [fueled, setFueled] = useState(false);
  const [fuelType, setFuelType] = useState("");

  const today = localDateISO();
  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);

  /** As obras daquele setor — é o que aparece depois de escolher a fazenda. */
  const obrasDoLocal = useMemo(
    () => obras.filter((o) => o.local_id === localId),
    [obras, localId]
  );

  /** Quantas obras cada setor tem, para a lista já mostrar. */
  const obrasPorLocal = useMemo(() => {
    const conta = new Map<string, number>();
    for (const o of obras) {
      if (!o.local_id) continue;
      conta.set(o.local_id, (conta.get(o.local_id) ?? 0) + 1);
    }
    return conta;
  }, [obras]);

  const machine = useMemo(
    () => machines.find((m) => m.id === machineId) ?? null,
    [machines, machineId]
  );
  /** Caminhão/caçamba andam de km; máquina de terra conta hora. */
  const tracksKm = machine?.tracking_type === "km";

  /** Quanto a máquina trabalhou neste serviço (só com as duas leituras). */
  const worked = useMemo(() => {
    const ini = parseReadingBR(readingStart);
    const fim = parseReadingBR(readingEnd);
    if (ini <= 0 || fim <= 0) return null;
    return Math.round((fim - ini) * 10) / 10;
  }, [readingStart, readingEnd]);

  /** Trocar de setor zera a obra: cada obra fica num setor só. */
  function chooseLocal(id: string) {
    setLocalId(id);
    setObraId("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const r = lancador.finalizar();
    if ("error" in r) return setError(r.error);
    const preenchidas = r.linhas;
    if (preenchidas.length === 0) return setError("Diga qual material você usou");
    if (!obraId && !destination.trim())
      return setError("Diga a obra ou onde você aplicou o material");
    if (usedMachine && !machineId) return setError("Diga qual máquina você usou");
    if (usedMachine && !noReading) {
      const temIni = !!readingStart.trim();
      const temFim = !!readingEnd.trim();
      const nome = tracksKm ? "km" : "horímetro";
      // um sozinho não serve para nada: é a diferença que diz quanto trabalhou
      if (temIni !== temFim)
        return setError(`Informe o ${nome} inicial e o final (ou marque "Não anotei")`);
      if (temIni && temFim && (worked ?? 0) < 0)
        return setError(`O ${nome} final não pode ser menor que o inicial`);
    }
    if (usedMachine && fueled && !fuelType)
      return setError("Diga qual combustível você abasteceu");

    const nomes = preenchidas.map((l) => lancador.nomeDe(l));

    const fd = new FormData();
    fd.append(
      "items",
      JSON.stringify(
        preenchidas.map((l) => ({
          item_id: l.itemId,
          item_text: l.itemText,
          quantity: l.quantity,
          unit_cost: l.unitCost,
        }))
      )
    );
    fd.append("obra_id", obraId);
    // o subcadastro antigo de setor não é mais preenchido aqui: quem diz o
    // lugar é a obra (que já sabe o setor dela) mais o "onde foi exatamente"
    fd.append("sector_id", "");
    fd.append("destination", destination);
    fd.append("notes", notes);
    if (usedMachine && machineId) {
      fd.append("machine_id", machineId);
      // leituras só se ele anotou — em branco o banco guarda nulo
      const ini = noReading ? "" : readingStart;
      const fim = noReading ? "" : readingEnd;
      fd.append(tracksKm ? "machine_km" : "machine_hourmeter", ini);
      fd.append(tracksKm ? "machine_km_end" : "machine_hourmeter_end", fim);
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
      lancador.limpar();
      setNotes("");
      setPhoto(null);
      setReadingStart("");
      setReadingEnd("");
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
            <LancadorDeMateriais
              lancador={lancador}
              idPrefixo="tc"
              permitirEscrever
              comPreco
              placeholderEscrito="ex: cano 50mm"
              dicaEscrito="Escreva do jeito que você chama — o chefe acha no cadastro."
            />

            {/* O SETOR: Fazenda 01, Fazenda 02, Sítio — o lugar grande, do
                jeito que o pessoal fala. A obra acontece dentro de um deles. */}
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <SearchableSelect
                items={locais}
                value={localId}
                onChange={chooseLocal}
                getId={(l) => l.id}
                getLabel={(l) => l.name}
                renderItem={(l) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{l.name}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                      {obrasPorLocal.get(l.id) ?? 0}{" "}
                      {(obrasPorLocal.get(l.id) ?? 0) === 1 ? "obra" : "obras"}
                    </span>
                  </div>
                )}
                placeholder="Toque para escolher o setor..."
                searchPlaceholder="Buscar setor..."
                emptyMessage="Nenhum setor cadastrado"
              />
            </div>

            {/* A OBRA: o serviço que está sendo feito naquele setor */}
            <div className="space-y-1.5">
              <Label>Obra</Label>
              <SearchableSelect
                items={obrasDoLocal}
                value={obraId}
                onChange={setObraId}
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
                placeholder={
                  localId ? "Toque para escolher a obra..." : "Escolha o setor primeiro"
                }
                searchPlaceholder="Buscar obra..."
                emptyMessage="Nenhuma obra neste setor"
              />

              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {!localId
                  ? "Escolha o setor acima para aparecerem as obras dele."
                  : obrasDoLocal.length === 0
                    ? "Este setor ainda não tem obra cadastrada — o chefe cadastra em Obras."
                    : "A obra vale para todos os materiais deste envio."}
              </p>

              {/* O chefe acabou de cadastrar? Busca a lista de novo, sem sair. */}
              {!!localId && obrasDoLocal.length === 0 && (
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="text-left text-[11px] font-medium text-produmar-600 dark:text-produmar-400 underline underline-offset-2 min-h-[36px]"
                >
                  O chefe acabou de cadastrar? Toque para atualizar a lista.
                </button>
              )}
            </div>

            {/* O lugar exato, quando ajuda a achar depois */}
            <div className="space-y-1.5">
              <Label htmlFor="tc_dest">Onde foi exatamente</Label>
              <Input
                id="tc_dest"
                value={destination}
                onChange={(e) => setDestination(upperKeepingCaret(e))}
                placeholder="opcional — ex: piquete de cima, poste da esquina"
                autoCapitalize="characters"
                className="h-12"
                autoComplete="off"
              />
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
                    setReadingStart("");
                    setReadingEnd("");
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
                        <Label>{tracksKm ? "Km do painel" : "Horímetro"}</Label>
                        {!noReading && (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label
                                  htmlFor="tc_reading_ini"
                                  className="text-[11px] text-slate-400 dark:text-slate-500"
                                >
                                  No começo
                                </Label>
                                <Input
                                  id="tc_reading_ini"
                                  value={readingStart}
                                  onChange={(e) => setReadingStart(maskReading(e.target.value, tracksKm))}
                                  placeholder={tracksKm ? "ex: 154300" : "ex: 1230,5"}
                                  inputMode="decimal"
                                  className="h-12 text-lg font-semibold tabular-nums"
                                  autoComplete="off"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label
                                  htmlFor="tc_reading_fim"
                                  className="text-[11px] text-slate-400 dark:text-slate-500"
                                >
                                  No fim
                                </Label>
                                <Input
                                  id="tc_reading_fim"
                                  value={readingEnd}
                                  onChange={(e) => setReadingEnd(maskReading(e.target.value, tracksKm))}
                                  placeholder={tracksKm ? "ex: 154350" : "ex: 1250,5"}
                                  inputMode="decimal"
                                  className="h-12 text-lg font-semibold tabular-nums"
                                  autoComplete="off"
                                />
                              </div>
                            </div>
                            {worked != null && (
                              <p
                                className={cn(
                                  "text-sm font-medium",
                                  worked < 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-emerald-600 dark:text-emerald-400"
                                )}
                              >
                                {worked < 0
                                  ? `O ${tracksKm ? "km" : "horímetro"} final está menor que o inicial`
                                  : tracksKm
                                    ? `${formatQty(worked)} km rodados`
                                    : `${formatQty(worked)} h trabalhadas`}
                              </p>
                            )}
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setNoReading((v) => !v);
                            setReadingStart("");
                            setReadingEnd("");
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
                autoCapitalize="characters"
                className="h-12"
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

/**
 * Máscara da leitura do painel: km é número inteiro; horímetro tem uma casa e
 * vírgula automática (o técnico digita só os números, ver formatHourmeter).
 */
function maskReading(raw: string, tracksKm: boolean): string {
  return tracksKm ? raw.replace(/\D/g, "") : formatHourmeter(raw);
}

/** "1.230,5" → 1230.5. Vazio ou torto vira 0. */
function parseReadingBR(raw: string): number {
  const n = parseFloat(raw.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
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
