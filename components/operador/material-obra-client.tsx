"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, PackageOpen, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MaterialPickerDialog } from "@/components/tecnico/material-picker-dialog";
import { PhotoField, formatQtyInput, parseQty } from "@/components/almoxarifado/supply-shared";
import {
  cancelSupplyUsageRequest,
  requestSupplyUsage,
} from "@/app/(app)/tecnico/actions";
import {
  formatBRLInput,
  formatDate,
  formatQty,
  localDateISO,
  upperKeepingCaret,
} from "@/lib/utils";
import type {
  SupplyLocal,
  SupplyObraSector,
  SupplyRequestRow,
} from "@/lib/types";

/** Catálogo enxuto — o operador não vê saldo, só o nome e a unidade. */
export interface OperadorItem {
  id: string;
  name: string;
  unit: string;
}

export interface OperadorObra {
  id: string;
  name: string;
  client: string | null;
  /** O SETOR onde a obra fica (Fazenda 01, Fazenda 02, Sítio). */
  local_id: string | null;
}

interface Props {
  items: OperadorItem[];
  obras: OperadorObra[];
  /** OS SETORES: Fazenda 01, Fazenda 02, Sítio — o lugar grande. */
  locais: SupplyLocal[];
  /** Os pontos de cada obra, cadastrados pelo chefe (ponto 01, ponto 02...). */
  sectors: SupplyObraSector[];
  /** Os avisos dele que o escritório ainda não resolveu. */
  pending: SupplyRequestRow[];
}

/** Uma linha do aviso: um material com a quantidade dele. */
interface Linha {
  /** Chave de render: os materiais podem repetir e o índice muda ao remover. */
  key: string;
  itemId: string;
  /** O material não estava na lista: ele escreve o nome. */
  freeText: boolean;
  itemText: string;
  quantity: string;
  /** Preço de UMA unidade, do jeito que ele digita ("1.250,00"). */
  unitCost: string;
}

function novaLinha(): Linha {
  return {
    key: typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random()),
    itemId: "",
    freeText: false,
    itemText: "",
    quantity: "",
    unitCost: "",
  };
}

/**
 * "LEVEI ESTE MATERIAL PARA ESTA OBRA" — a tela de quem descarrega na rua.
 *
 * É AVISO, não baixa: nada sai do estoque quando ele manda. O que nasce é um
 * recado na fila que o escritório confere e formaliza depois, na aba
 * "Pendentes" do Estoque — a mesma fila do técnico.
 *
 * Por isso o dia é escolhido à mão: ele costuma lembrar do que descarregou
 * ontem ou anteontem, e travar no dia de hoje faria a informação chegar errada.
 * E por isso o material pode ser escrito na mão: "meia carrada de areia" não
 * está em cadastro nenhum, e é o escritório quem casa isso depois.
 */
export function OperadorMaterialClient({ items, obras, locais, sectors, pending }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** O SETOR (Fazenda 01, Sítio) — escolhido antes da obra. */
  const [localId, setLocalId] = useState("");
  const [obraId, setObraId] = useState("");
  /** O ponto da obra ("ponto 01") — do cadastro ou escrito na mão. */
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(localDateISO());
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

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

  /** Os pontos cadastrados da obra escolhida — viram atalho do "onde". */
  const pontos = useMemo(
    () => sectors.filter((s) => s.obra_id === obraId && s.active !== false),
    [sectors, obraId]
  );

  /** Trocar de setor zera a obra: cada obra fica num setor só. */
  function chooseLocal(id: string) {
    setLocalId(id);
    setObraId("");
    setDestination("");
  }

  function chooseObra(id: string) {
    setObraId(id);
    setDestination("");
  }

  function patchLinha(key: string, patch: Partial<Linha>) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  /** Tocou num material da lista: entra no aviso; tocou de novo, sai. */
  function alternarItem(item: { id: string }) {
    setLinhas((prev) => {
      const jaTem = prev.find((l) => l.itemId === item.id);
      if (jaTem) return prev.filter((l) => l.key !== jaTem.key);
      return [...prev, { ...novaLinha(), itemId: item.id }];
    });
  }

  /** "Não achei na lista": entra uma linha para escrever o nome na mão. */
  function adicionarEscrito() {
    setLinhas((prev) => [...prev, { ...novaLinha(), freeText: true }]);
  }

  function removeLinha(key: string) {
    setLinhas((prev) => prev.filter((l) => l.key !== key));
  }

  const idsEscolhidos = useMemo(
    () => linhas.filter((l) => l.itemId).map((l) => l.itemId),
    [linhas]
  );

  /** Linhas que ele realmente preencheu (as em branco são ignoradas). */
  const preenchidas = useMemo(
    () => linhas.filter((l) => l.itemId || l.itemText.trim()),
    [linhas]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (preenchidas.length === 0) return setError("Diga qual material você levou");
    const semQtd = preenchidas.find((l) => parseQty(l.quantity) <= 0);
    if (semQtd) {
      const nome = itemById.get(semQtd.itemId)?.name ?? semQtd.itemText.trim();
      return setError(
        nome ? `Informe quanto de ${nome} você levou` : "Informe a quantidade de cada material"
      );
    }
    if (!obraId && !destination.trim())
      return setError("Diga a obra ou onde você descarregou");
    if (!date) return setError("Diga o dia em que você levou");

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
          unit_cost: l.unitCost,
        }))
      )
    );
    fd.append("obra_id", obraId);
    fd.append("sector_id", "");
    fd.append("destination", destination);
    fd.append("used_date", date);
    fd.append("notes", notes);
    if (photo) fd.append("photo", photo);

    startTransition(async () => {
      const r = await requestSupplyUsage(fd);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao enviar");
        return;
      }
      // A obra, o setor e o ponto ficam: quem descarregou numa obra costuma
      // mandar vários avisos seguidos. Zeram os materiais, a observação e a foto.
      setLinhas([]);
      setNotes("");
      setPhoto(null);
      setSuccess(
        nomes.length === 1
          ? `${nomes[0]} avisado! O escritório confere depois.`
          : `${nomes.length} materiais avisados! O escritório confere depois.`
      );
    });
  }

  function handleCancel(r: SupplyRequestRow) {
    const nome = r.supply_items?.name ?? r.item_text ?? "material";
    if (!confirm(`Cancelar o aviso de ${nome}? O escritório não vai mais ver este recado.`))
      return;
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
        <div className="w-11 h-11 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
          <PackageOpen className="w-6 h-6 text-orange-600 dark:text-orange-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Material levado para a obra
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            É só aviso — o escritório confere depois.
          </p>
        </div>
      </div>

      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
          <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{success}</p>
        </div>
      )}

      <MaterialPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={items}
        escolhidos={idsEscolhidos}
        onToggle={alternarItem}
        onEscrever={adicionarEscrito}
        titulo="Qual material você levou?"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que você levou</CardTitle>
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

              {linhas.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-3 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-4">
                  Toque no botão abaixo e escolha na lista o que você levou.
                </p>
              )}

              {linhas.map((linha) => (
                <MaterialLinha
                  key={linha.key}
                  linha={linha}
                  nome={itemById.get(linha.itemId)?.name ?? ""}
                  unit={itemById.get(linha.itemId)?.unit ?? ""}
                  onChange={(patch) => patchLinha(linha.key, patch)}
                  onRemove={() => removeLinha(linha.key)}
                />
              ))}

              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full flex items-center justify-center gap-2 min-h-[52px] rounded-lg border-2 border-dashed border-produmar-300 dark:border-produmar-700 text-base font-semibold text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Adicionar material
              </button>
            </div>

            {/* O DIA: ele costuma lembrar do que descarregou ontem, e travar em
                hoje faria a informação chegar errada no escritório */}
            <div className="space-y-1.5">
              <Label htmlFor="om_date">Que dia você levou *</Label>
              <Input
                id="om_date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            {/* O SETOR: Fazenda 01, Sítio — o lugar grande onde a obra fica */}
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
                    ? "Este setor ainda não tem obra cadastrada — o escritório cadastra em Obras."
                    : "A obra vale para todos os materiais deste aviso."}
              </p>

              {/* O chefe acabou de cadastrar? Busca a lista de novo, sem sair. */}
              {!!localId && obrasDoLocal.length === 0 && (
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="text-left text-[11px] font-medium text-produmar-600 dark:text-produmar-400 underline underline-offset-2 min-h-[36px]"
                >
                  O escritório acabou de cadastrar? Toque para atualizar a lista.
                </button>
              )}
            </div>

            {/* O PONTO: "ponto 01", "fundo do lote" — do cadastro ou na mão */}
            <div className="space-y-1.5">
              <Label htmlFor="om_destination">Em que ponto da obra</Label>
              {pontos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pontos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setDestination((atual) => (atual === p.name ? "" : p.name))
                      }
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        destination === p.name
                          ? "bg-produmar-600 border-produmar-600 text-white"
                          : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              <Input
                id="om_destination"
                value={destination}
                onChange={(e) => setDestination(upperKeepingCaret(e))}
                placeholder="ex: ponto 01"
                className="h-12 text-base uppercase placeholder:normal-case placeholder:text-base placeholder:lowercase"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="om_notes">Observação</Label>
              <Input
                id="om_notes"
                value={notes}
                onChange={(e) => setNotes(upperKeepingCaret(e))}
                placeholder="alguma coisa que o escritório precisa saber (opcional)"
                className="h-12 text-base uppercase placeholder:normal-case placeholder:text-base placeholder:lowercase"
                autoComplete="off"
              />
            </div>

            <PhotoField
              label="Foto (opcional)"
              hint="Foto do material descarregado na obra."
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
              {isPending ? "Enviando..." : "Enviar aviso"}
            </Button>

            <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
              Nada sai do estoque agora: isto é o recado que o escritório confere e
              formaliza depois.
            </p>
          </form>
        </CardContent>
      </Card>

      {/* O que ele já mandou e o escritório ainda não resolveu */}
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Esperando o escritório ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((r) => {
              const nome = r.supply_items?.name ?? r.item_text ?? "material";
              const unit = r.supply_items?.unit ?? "";
              return (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 break-words">
                      {formatQty(Number(r.quantity))} {unit} · {nome}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {formatDate(r.used_date)}
                      {r.supply_obras?.name ? ` · ${r.supply_obras.name}` : ""}
                      {r.destination ? ` · ${r.destination}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancel(r)}
                    disabled={isPending && cancelingId === r.id}
                    aria-label={`Cancelar o aviso de ${nome}`}
                    className="w-11 h-11 -mt-1 -mr-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex-shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Mandou errado? Cancele enquanto o escritório não resolveu.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Um material já escolhido: o nome de um lado, quanto levou do outro. O escrito
 * na mão continua editável, porque esse nome não veio de cadastro nenhum — é
 * onde entra "meia carrada de areia".
 */
function MaterialLinha({
  linha,
  nome,
  unit,
  onChange,
  onRemove,
}: {
  linha: Linha;
  nome: string;
  unit: string;
  onChange: (patch: Partial<Linha>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {linha.freeText ? (
            <>
              <Input
                value={linha.itemText}
                onChange={(e) => onChange({ itemText: upperKeepingCaret(e) })}
                placeholder="ex: carrada de areia"
                className="h-12 text-lg uppercase placeholder:normal-case placeholder:text-base placeholder:lowercase"
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                Escreva do jeito que você chama — o escritório acha no cadastro.
              </p>
            </>
          ) : (
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100 break-words leading-snug">
              {nome || "Material"}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Tirar ${nome || "o material"} da lista`}
          className="w-11 h-11 -mt-1 -mr-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`om_qty_${linha.key}`}>
          Quantidade{unit ? ` (${unit})` : ""} *
        </Label>
        <Input
          id={`om_qty_${linha.key}`}
          value={linha.quantity}
          onChange={(e) => onChange({ quantity: formatQtyInput(e.target.value) })}
          placeholder="0"
          inputMode="decimal"
          className="h-12 text-lg font-semibold tabular-nums"
          autoComplete="off"
        />
        {/* meia carrada, meio saco: a fração se escreve com vírgula */}
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Metade se escreve 0,5 — meia carrada é 0,5 carrada.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`om_cost_${linha.key}`}>
          Preço de {unit ? `1 ${unit}` : "cada um"} (R$)
        </Label>
        <Input
          id={`om_cost_${linha.key}`}
          value={linha.unitCost}
          onChange={(e) => onChange({ unitCost: formatBRLInput(e.target.value) })}
          placeholder="0,00"
          inputMode="decimal"
          className="h-12 text-lg tabular-nums"
          autoComplete="off"
        />
        {/* opcional de propósito: obrigar preço faz o pessoal parar de avisar */}
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Só se você comprou. Material que já era da casa deixa em branco.
        </p>
      </div>
    </div>
  );
}
