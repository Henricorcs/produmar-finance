"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays, Check, Search, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { num } from "@/components/almoxarifado/supply-shared";
import { assignDiariasToObra } from "@/app/(app)/diaristas/actions";
import type { Diarista, DiaristaDia, SupplyObraUsage } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** As diárias que ficaram sem obra — as lançadas antes de a obra virar regra. */
  dias: DiaristaDia[];
  /** Cadastro de Colaboradores, para pôr nome em quem trabalhou o dia. */
  colaboradores: Diarista[];
  obras: SupplyObraUsage[];
  /** Obra já escolhida — quando a tela abre de dentro de uma obra. */
  presetObraId?: string | null;
}

/** Sem acento e em caixa alta: "joao" acha "JOÃO". */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

/**
 * AS DIÁRIAS QUE FICARAM SOLTAS — pôr cada uma na obra dela.
 *
 * A obra só passou a ser obrigatória agora; o que foi lançado antes não tem
 * obra nenhuma e por isso nunca entrou no custo de obra alguma. Abrir dia por
 * dia em Colaboradores para consertar meses de lançamento não é caminho: aqui
 * escolhe-se a obra uma vez e marcam-se todos os dias que são dela.
 *
 * Assim que os dias entram na obra, eles aparecem no card "Diárias" e no
 * extrato dela, exatamente como os lançados de hoje em diante.
 */
export function DiariasSemObraDialog({
  open,
  onClose,
  dias,
  colaboradores,
  obras,
  presetObraId,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [obraId, setObraId] = useState("");
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setObraId(presetObraId ?? "");
    setBusca("");
    setMarcados([]);
    setError(null);
  }, [open, presetObraId]);

  const nomePorId = useMemo(
    () => new Map(colaboradores.map((c) => [c.id, c.name])),
    [colaboradores]
  );

  /** O dia com o nome de quem trabalhou, que é o que se procura na busca. */
  const linhas = useMemo(
    () =>
      dias
        .map((d) => ({ dia: d, nome: nomePorId.get(d.diarista_id) ?? "Sem nome" }))
        .sort(
          (a, b) =>
            b.dia.work_date.localeCompare(a.dia.work_date) ||
            a.nome.localeCompare(b.nome)
        ),
    [dias, nomePorId]
  );

  const encontradas = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return linhas;
    return linhas.filter(
      (l) =>
        normalizar(l.nome).includes(q) ||
        normalizar(l.dia.description ?? "").includes(q)
    );
  }, [linhas, busca]);

  const obra = obras.find((o) => o.id === obraId) ?? null;
  const total = useMemo(
    () =>
      linhas
        .filter((l) => marcados.includes(l.dia.id))
        .reduce((s, l) => s + num(l.dia.daily_rate), 0),
    [linhas, marcados]
  );

  /** Todas as que a busca está mostrando já estão marcadas? */
  const todasMarcadas =
    encontradas.length > 0 && encontradas.every((l) => marcados.includes(l.dia.id));

  function alternar(id: string) {
    setMarcados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  /** Marca (ou desmarca) de uma vez o que a busca está mostrando. */
  function alternarTodas() {
    const ids = encontradas.map((l) => l.dia.id);
    setMarcados((prev) =>
      todasMarcadas
        ? prev.filter((x) => !ids.includes(x))
        : [...new Set([...prev, ...ids])]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!obraId) return setError("Escolha a obra que recebe estas diárias");
    if (marcados.length === 0) return setError("Marque as diárias que são desta obra");

    startTransition(async () => {
      const r = await assignDiariasToObra(obraId, marcados);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao atribuir");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100 pr-8">
            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
              <CalendarDays className="w-4 h-4" />
            </span>
            Diárias sem obra
          </DialogTitle>
          <p className="text-[11px] text-slate-400">
            {dias.length === 1
              ? "1 diária lançada sem obra"
              : `${dias.length} diárias lançadas sem obra`}{" "}
            — escolha a obra e marque as que são dela.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Obra que recebe *</Label>
            <SearchableSelect
              items={obras}
              value={obraId}
              onChange={setObraId}
              getId={(o) => o.id}
              getLabel={(o) => o.name}
              renderItem={(o) => (
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="truncate">{o.name}</span>
                  {o.local_name && (
                    <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[7rem]">
                      {o.local_name}
                    </span>
                  )}
                </div>
              )}
              placeholder="Toque para escolher a obra..."
              searchPlaceholder="Buscar obra..."
              telaCheia
              titulo="Escolher obra"
              lembrarRecentes="obras"
              getDetalhe={(o) => o.local_name}
              emptyMessage="Nenhuma obra cadastrada"
            />
          </div>

          {/* Busca por quem trabalhou: é assim que se acha "os dias do João" */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por colaborador ou serviço..."
              className="pl-9"
              autoComplete="off"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {encontradas.length === 1
                ? "1 diária na lista"
                : `${encontradas.length} diárias na lista`}
            </span>
            {encontradas.length > 0 && (
              <button
                type="button"
                onClick={alternarTodas}
                className="min-h-[36px] px-2 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
              >
                {todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
            {encontradas.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center">
                {dias.length === 0
                  ? "Nenhuma diária solta — está tudo em alguma obra."
                  : "Nada encontrado com essa busca."}
              </p>
            ) : (
              encontradas.map(({ dia, nome }) => {
                const marcado = marcados.includes(dia.id);
                return (
                  <button
                    key={dia.id}
                    type="button"
                    onClick={() => alternar(dia.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                      marcado
                        ? "bg-emerald-50 dark:bg-emerald-950/30"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    )}
                  >
                    <span
                      className={cn(
                        "w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0",
                        marcado
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-slate-300 dark:border-slate-600"
                      )}
                    >
                      {marcado && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                        <Users className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        {nome}
                        {dia.half_day && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 flex-shrink-0">
                            meia
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {formatDate(dia.work_date)}
                        {dia.description ? ` · ${dia.description}` : ""}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
                      {formatBRL(num(dia.daily_rate))}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {marcados.length > 0 && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2 flex items-baseline justify-between gap-2">
              <span className="text-xs text-emerald-800 dark:text-emerald-300">
                {marcados.length === 1
                  ? "1 diária marcada"
                  : `${marcados.length} diárias marcadas`}
                {obra ? ` para ${obra.name}` : ""}
              </span>
              <span className="text-base font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                {formatBRL(total)}
              </span>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            As marcadas entram no custo da obra na hora. Sobrou diária de outra obra?
            Troque a obra lá em cima e marque as dela — dá para fazer uma de cada vez.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Fechar
            </Button>
            <Button type="submit" disabled={isPending || marcados.length === 0}>
              {isPending
                ? "Atribuindo..."
                : marcados.length > 0
                  ? `Pôr ${marcados.length} na obra`
                  : "Pôr na obra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
