"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, PackageOpen, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  LancadorDeMateriais,
  useLancadorDeMateriais,
} from "@/components/tecnico/lancador-de-materiais";
import { PhotoField } from "@/components/almoxarifado/supply-shared";
import {
  cancelSupplyUsageRequest,
  requestSupplyUsage,
} from "@/app/(app)/tecnico/actions";
import {
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
  /**
   * Depois do envio o formulário sai da frente e fica só a confirmação com o
   * botão de NOVO LANÇAMENTO — o botão azul de enviar parado na tela fazia
   * parecer que o envio não tinha ido.
   */
  const [success, setSuccess] = useState<string | null>(null);

  const lancador = useLancadorDeMateriais({ items });
  /** O SETOR (Fazenda 01, Sítio) — escolhido antes da obra. */
  const [localId, setLocalId] = useState("");
  const [obraId, setObraId] = useState("");
  /** O ponto da obra ("ponto 01") — do cadastro ou escrito na mão. */
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(localDateISO());
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  /**
   * As obras que aparecem na lista. Sem setor escolhido, são TODAS — quem
   * destina o material do almoxarifado manda para qualquer obra, inclusive as
   * que ainda não têm setor no cadastro. O setor só serve de filtro.
   */
  const obrasDoLocal = useMemo(
    () => (localId ? obras.filter((o) => o.local_id === localId) : obras),
    [obras, localId]
  );

  /** O nome do setor de cada obra, para a lista geral mostrar onde ela fica. */
  const nomeDoLocal = useMemo(() => new Map(locais.map((l) => [l.id, l.name])), [locais]);

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

  /** Trocar de setor zera a obra quando ela não é daquele setor. */
  function chooseLocal(id: string) {
    setLocalId(id);
    const atual = obras.find((o) => o.id === obraId);
    if (id && atual?.local_id !== id) {
      setObraId("");
      setDestination("");
    }
  }

  function chooseObra(id: string) {
    setObraId(id);
    setDestination("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const r = lancador.finalizar();
    if ("error" in r) return setError(r.error);
    const preenchidas = r.linhas;
    if (preenchidas.length === 0) return setError("Diga qual material você levou");
    if (!obraId && !destination.trim())
      return setError("Diga a obra ou onde você descarregou");
    if (!date) return setError("Diga o dia em que você levou");

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
      setSuccess(
        nomes.length === 1
          ? `${nomes[0]} enviado! O escritório confirma depois.`
          : `${nomes.length} materiais enviados! O escritório confirma depois.`
      );
      // o formulário é comprido: sem isto a confirmação ficaria lá em cima, fora da vista
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /**
   * Volta para o formulário. A obra, o setor e o ponto ficam: quem manda
   * material para uma obra costuma fazer vários envios seguidos. Zeram os
   * materiais, a observação e a foto.
   */
  function novoLancamento() {
    lancador.limpar();
    setNotes("");
    setPhoto(null);
    setError(null);
    setSuccess(null);
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
            Material para a obra
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Destine para qualquer obra — o escritório confirma depois.
          </p>
        </div>
      </div>

      {success ? (
        <Card>
          <CardContent className="pt-6 space-y-4 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                {success}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Já está na lista abaixo, esperando o escritório.
              </p>
            </div>
            <Button
              type="button"
              onClick={novoLancamento}
              className="w-full h-14 text-base font-semibold"
            >
              <Plus className="w-5 h-5 mr-1.5" />
              Novo lançamento
            </Button>
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que vai para a obra</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <LancadorDeMateriais
              lancador={lancador}
              idPrefixo="om"
              permitirEscrever
              comPreco
              tituloPicker="Qual material vai para a obra?"
              placeholderEscrito="ex: carrada de areia"
              dicaEscrito="Escreva do jeito que você chama — o escritório acha no cadastro."
              // meia carrada, meio saco: a fração se escreve com vírgula
              dicaQuantidade="Metade se escreve 0,5 — meia carrada é 0,5 carrada."
            />

            {/* O DIA: ele costuma lembrar do que descarregou ontem, e travar em
                hoje faria a informação chegar errada no escritório */}
            <div className="space-y-1.5">
              <Label htmlFor="om_date">Que dia saiu *</Label>
              <Input
                id="om_date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            {/* O SETOR: Fazenda 01, Sítio — só um filtro para achar a obra mais
                rápido; sem ele, a lista de obras mostra todas */}
            <div className="space-y-1.5">
              <Label>Setor (opcional)</Label>
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
                placeholder="Todos os setores"
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
                renderItem={(o) => {
                  // na lista geral o setor ajuda a separar obras de nome parecido
                  const setor = !localId && o.local_id ? nomeDoLocal.get(o.local_id) : null;
                  const extra = [setor, o.client].filter(Boolean).join(" · ");
                  return (
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="truncate">{o.name}</span>
                      {extra && (
                        <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[9rem]">
                          {extra}
                        </span>
                      )}
                    </div>
                  );
                }}
                placeholder="Toque para escolher a obra..."
                searchPlaceholder="Buscar obra..."
                emptyMessage={localId ? "Nenhuma obra neste setor" : "Nenhuma obra cadastrada"}
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {obrasDoLocal.length === 0
                  ? localId
                    ? "Este setor ainda não tem obra cadastrada — o escritório cadastra em Obras."
                    : "Nenhuma obra cadastrada ainda — o escritório cadastra em Obras."
                  : "A obra vale para todos os materiais deste envio."}
              </p>

              {/* O chefe acabou de cadastrar? Busca a lista de novo, sem sair. */}
              {obrasDoLocal.length === 0 && (
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
                autoCapitalize="characters"
                className="h-12 text-base placeholder:text-base"
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
                autoCapitalize="characters"
                className="h-12 text-base placeholder:text-base"
                autoComplete="off"
              />
            </div>

            <PhotoField
              label="Foto (opcional)"
              hint="Foto do material que saiu para a obra."
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
              {isPending ? "Enviando..." : "Enviar para confirmação"}
            </Button>

            <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
              Nada sai do estoque agora: o escritório confere e confirma a saída
              depois, em Pendentes.
            </p>
          </form>
        </CardContent>
      </Card>
      )}

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
