"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Info, Loader2, MapPinned } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatBRL } from "@/lib/utils";
import { getGastosDasObrasNoAno, type GastoDaObraLinha } from "@/app/(app)/almoxarifado/actions";
import type { SupplyObraUsage } from "@/lib/types";

interface Props {
  /** As obras da lista — é delas que vem o nome e o local de cada uma. */
  obras: SupplyObraUsage[];
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_EXTENSO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

type Origem = GastoDaObraLinha["kind"];

/** As origens de gasto da obra, na ordem e com as cores do extrato da obra. */
const ORIGENS: { kind: Origem; label: string; cor: string }[] = [
  { kind: "material", label: "Material", cor: "bg-orange-400" },
  { kind: "diaria", label: "Diárias", cor: "bg-emerald-400" },
  { kind: "servico", label: "Serviços", cor: "bg-teal-400" },
  { kind: "despesa", label: "Despesas", cor: "bg-violet-400" },
  { kind: "maquina", label: "Máquina pesada", cor: "bg-amber-400" },
];

/** Quanto foi gasto num mês, separado por origem. */
type Conta = Record<Origem, number>;

const vazia = (): Conta => ({ material: 0, diaria: 0, servico: 0, despesa: 0, maquina: 0 });

const totalDe = (c: Conta) => c.material + c.diaria + c.servico + c.despesa + c.maquina;

const somar = (contas: Conta[]): Conta => {
  const t = vazia();
  for (const c of contas) for (const o of ORIGENS) t[o.kind] += c[o.kind];
  return t;
};

/** Uma linha do relatório: uma obra, com os 12 meses do ano escolhido. */
interface ObraDoAno {
  id: string;
  nome: string;
  localId: string;
  localNome: string;
  meses: Conta[];
}

/** As obras sem local formam um grupo à parte, sempre no fim. */
const SEM_LOCAL = "sem-local";
const TODOS = "todos";

type Modo = "mes" | "ano";

/**
 * RELATÓRIO DE GASTOS MENSAIS DAS OBRAS — quanto cada obra gastou em cada mês,
 * separado pelas cinco origens (material, diárias, serviços, despesas avulsas e
 * máquina pesada), e o ano inteiro de cada obra mês a mês.
 *
 * Os números saem do mesmo extrato que o detalhe da obra mostra, então o total
 * de uma obra aqui bate com o "Este ano" / "Este mês" dela aberta.
 */
export function ObrasRelatorioMensal({ obras }: Props) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(hoje.getMonth());
  const [modo, setModo] = useState<Modo>("mes");
  const [localFiltro, setLocalFiltro] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const [linhas, setLinhas] = useState<GastoDaObraLinha[]>([]);
  const [primeiroAno, setPrimeiroAno] = useState(anoAtual);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** Ano já buscado não vai ao banco de novo enquanto a tela está aberta. */
  const cache = useRef(new Map<number, GastoDaObraLinha[]>());

  useEffect(() => {
    const guardado = cache.current.get(ano);
    if (guardado) {
      setLinhas(guardado);
      setErro(null);
      setLoading(false);
      return;
    }
    let cancelado = false;
    setLoading(true);
    getGastosDasObrasNoAno(ano).then((r) => {
      if (cancelado) return;
      setLoading(false);
      if ("error" in r) {
        setErro(r.error ?? "Não foi possível carregar os gastos");
        setLinhas([]);
        return;
      }
      setErro(null);
      cache.current.set(ano, r.linhas);
      setLinhas(r.linhas);
      setPrimeiroAno(Math.min(r.primeiroAno, anoAtual));
    });
    return () => {
      cancelado = true;
    };
  }, [ano, anoAtual]);

  /** Do primeiro ano com gasto até o ano corrente. */
  const anos = useMemo(() => {
    const lista: number[] = [];
    for (let y = primeiroAno; y <= anoAtual; y++) lista.push(y);
    return lista;
  }, [primeiroAno, anoAtual]);

  const obraPorId = useMemo(() => new Map(obras.map((o) => [o.id, o])), [obras]);

  /** Cada obra que teve gasto no ano, com os 12 meses separados por origem. */
  const doAno = useMemo(() => {
    const map = new Map<string, ObraDoAno>();
    for (const l of linhas) {
      if (!l.obra_id || !l.entry_date) continue;
      const m = Number(l.entry_date.slice(5, 7)) - 1;
      if (m < 0 || m > 11) continue;
      const cad = obraPorId.get(l.obra_id);
      const o =
        map.get(l.obra_id) ??
        ({
          id: l.obra_id,
          nome: cad?.name ?? "Obra fora da lista",
          localId: cad?.local_id ?? SEM_LOCAL,
          localNome: cad?.local_name ?? "Sem setor",
          meses: Array.from({ length: 12 }, vazia),
        } satisfies ObraDoAno);
      const kind: Origem = ORIGENS.some((x) => x.kind === l.kind) ? l.kind : "material";
      o.meses[m][kind] += Number(l.value) || 0;
      map.set(l.obra_id, o);
    }
    return [...map.values()];
  }, [linhas, obraPorId]);

  /** Os locais que tiveram gasto no ano — viram o menu do filtro. */
  const locaisDoAno = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of doAno) m.set(o.localId, o.localNome);
    return [...m.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => {
        if (a.id === SEM_LOCAL) return 1;
        if (b.id === SEM_LOCAL) return -1;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [doAno]);

  // o local escolhido sumiu no ano novo: volta para todos
  useEffect(() => {
    if (localFiltro && !locaisDoAno.some((l) => l.id === localFiltro)) setLocalFiltro("");
  }, [locaisDoAno, localFiltro]);

  const conta = (o: ObraDoAno): Conta => (modo === "mes" ? o.meses[mes] : somar(o.meses));

  /** As obras do recorte, agrupadas por local; a que gastou mais fica em cima. */
  const grupos = useMemo(() => {
    const valor = (o: ObraDoAno) => totalDe(modo === "mes" ? o.meses[mes] : somar(o.meses));
    const map = new Map<string, { id: string; nome: string; obras: ObraDoAno[]; total: number }>();
    for (const o of doAno) {
      if (localFiltro && o.localId !== localFiltro) continue;
      const v = valor(o);
      if (v === 0) continue;
      const g = map.get(o.localId) ?? { id: o.localId, nome: o.localNome, obras: [], total: 0 };
      g.obras.push(o);
      g.total += v;
      map.set(o.localId, g);
    }
    for (const g of map.values()) g.obras.sort((a, b) => valor(b) - valor(a));
    return [...map.values()].sort((a, b) => {
      if (a.id === SEM_LOCAL) return 1;
      if (b.id === SEM_LOCAL) return -1;
      return b.total - a.total;
    });
  }, [doAno, localFiltro, modo, mes]);

  const total = somar(grupos.flatMap((g) => g.obras.map(conta)));
  const totalGeral = totalDe(total);
  const periodo = modo === "mes" ? `${MESES_EXTENSO[mes]} de ${ano}` : `${ano}`;

  /** Os meses que tiveram gasto (no filtro escolhido) — os outros ficam apagados. */
  const mesesComGasto = useMemo(() => {
    const s = new Set<number>();
    for (const o of doAno) {
      if (localFiltro && o.localId !== localFiltro) continue;
      o.meses.forEach((c, i) => {
        if (totalDe(c) !== 0) s.add(i);
      });
    }
    return s;
  }, [doAno, localFiltro]);

  function mudarAno(delta: number) {
    const i = anos.indexOf(ano) + delta;
    if (i >= 0 && i < anos.length) {
      setAno(anos[i]);
      setAberto(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Mês ou ano */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {(
          [
            ["mes", "Mês a mês"],
            ["ano", "Ano inteiro"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setModo(v);
              setAberto(null);
            }}
            className={cn(
              "h-9 rounded-lg text-sm font-medium transition-colors",
              modo === v
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                : "text-slate-500 dark:text-slate-400"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* O ano */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          aria-label="Ano anterior"
          disabled={anos.indexOf(ano) <= 0}
          onClick={() => mudarAno(-1)}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {ano}
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </span>
        <button
          type="button"
          aria-label="Próximo ano"
          disabled={anos.indexOf(ano) >= anos.length - 1}
          onClick={() => mudarAno(1)}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* O mês — só no modo mês a mês */}
      {modo === "mes" && (
        <div className="grid grid-cols-6 gap-1.5">
          {MESES.map((nome, i) => (
            <button
              key={nome}
              type="button"
              onClick={() => setMes(i)}
              className={cn(
                "h-9 rounded-lg text-xs font-medium border transition-colors",
                mes === i
                  ? "bg-produmar-600 border-produmar-600 text-white"
                  : mesesComGasto.has(i)
                    ? "bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                    : "bg-white border-slate-100 text-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-600"
              )}
            >
              {nome}
            </button>
          ))}
        </div>
      )}

      {/* O local — num menu, como na lista de obras */}
      {locaisDoAno.length > 1 && (
        <Select
          value={localFiltro || TODOS}
          onValueChange={(v) => {
            setLocalFiltro(v === TODOS ? "" : v);
            setAberto(null);
          }}
        >
          <SelectTrigger aria-label="Escolher o setor">
            <div className="flex min-w-0 items-center gap-2">
              <MapPinned className="w-4 h-4 text-sky-500 flex-shrink-0" />
              <span className="truncate">
                <SelectValue />
              </span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os setores</SelectItem>
            {locaisDoAno.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {erro ? (
        <p className="text-sm text-rose-600 dark:text-rose-400 rounded-lg border border-rose-200 dark:border-rose-900/50 px-3 py-2">
          {erro}
        </p>
      ) : (
        <>
          {/* O gasto do período, separado por origem */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
            <div className="px-3 pt-3 pb-2.5 text-center">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {modo === "mes" ? "Gasto de " : "Gasto do ano de "}
                {periodo}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
                {loading ? "…" : formatBRL(totalGeral)}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 border-t border-slate-100 dark:border-slate-800">
              {ORIGENS.map((o, i) => (
                <div
                  key={o.kind}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 border-slate-100 dark:border-slate-800",
                    // no celular: duas colunas e a máquina na linha de baixo,
                    // inteira; no computador: as cinco lado a lado
                    i < 4 ? "border-b sm:border-b-0 sm:border-r" : "col-span-2 sm:col-span-1",
                    i % 2 === 0 && i < 4 && "border-r"
                  )}
                >
                  <span className={cn("w-1.5 h-7 rounded-full flex-shrink-0", o.cor)} />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 truncate">
                      {o.label}
                    </p>
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        total[o.kind] === 0
                          ? "text-slate-300 dark:text-slate-600"
                          : "text-slate-700 dark:text-slate-200"
                      )}
                    >
                      {formatBRL(total[o.kind])}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Obra por obra, agrupadas por local */}
          {loading ? null : grupos.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
              Nenhum gasto lançado em obra em {periodo}.
            </p>
          ) : (
            grupos.map((g) => (
              <div key={g.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-lg bg-sky-50/70 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 min-w-0">
                    <MapPinned className="w-4 h-4 text-sky-500 flex-shrink-0" />
                    <span className="truncate">{g.nome}</span>
                    <span className="text-[11px] text-slate-400 font-normal flex-shrink-0">
                      {g.obras.length === 1 ? "1 obra" : `${g.obras.length} obras`}
                    </span>
                  </p>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums flex-shrink-0">
                    {formatBRL(g.total)}
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {g.obras.map((o) => {
                    const c = conta(o);
                    const expandido = modo === "ano" && aberto === o.id;
                    return (
                      <div key={o.id} className="bg-white dark:bg-slate-900">
                        <button
                          type="button"
                          disabled={modo !== "ano"}
                          onClick={() => setAberto(expandido ? null : o.id)}
                          className="w-full text-left px-3 py-2.5 flex items-start gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                              {o.nome}
                            </p>
                            <Origens conta={c} />
                          </div>
                          <span className="text-sm font-bold tabular-nums flex-shrink-0 text-slate-800 dark:text-slate-100">
                            {formatBRL(totalDe(c))}
                          </span>
                          {modo === "ano" && (
                            <ChevronDown
                              className={cn(
                                "w-4 h-4 mt-0.5 flex-shrink-0 text-slate-300 dark:text-slate-600 transition-transform",
                                expandido && "rotate-180"
                              )}
                            />
                          )}
                        </button>

                        {/* O ano dessa obra, mês a mês */}
                        {expandido && (
                          <div className="px-3 pb-3">
                            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 px-2.5">
                              {o.meses.map((m, i) => {
                                const t = totalDe(m);
                                return (
                                  <div key={i} className="py-1.5">
                                    <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                                      <span
                                        className={cn(
                                          "font-medium",
                                          t === 0
                                            ? "text-slate-300 dark:text-slate-600"
                                            : "text-slate-600 dark:text-slate-300"
                                        )}
                                      >
                                        {MESES_EXTENSO[i].charAt(0).toUpperCase() +
                                          MESES_EXTENSO[i].slice(1)}
                                      </span>
                                      <span
                                        className={cn(
                                          "font-semibold",
                                          t === 0
                                            ? "text-slate-300 dark:text-slate-600"
                                            : "text-slate-800 dark:text-slate-100"
                                        )}
                                      >
                                        {t === 0 ? "—" : formatBRL(t)}
                                      </span>
                                    </div>
                                    {t !== 0 && <Origens conta={m} />}
                                  </div>
                                );
                              })}
                              <div className="py-2 flex items-baseline justify-between gap-2 text-xs tabular-nums">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">
                                  Total de {ano}
                                </span>
                                <span className="font-bold text-slate-800 dark:text-slate-100">
                                  {formatBRL(totalDe(c))}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
        <span>
          Entra todo gasto lançado na obra, pela data em que aconteceu: o material que saiu do
          Estoque, as diárias, os serviços por empreita ou metro, as despesas avulsas e a
          máquina pesada (só o serviço já fechado com o horímetro final). São os mesmos números
          do extrato de cada obra.
          {modo === "ano" ? " Toque numa obra para ver o ano dela mês a mês." : ""}
        </span>
      </p>
    </div>
  );
}

/** A linha miúda de origens: só as que tiveram gasto, cada uma com sua cor. */
function Origens({ conta }: { conta: Conta }) {
  const usadas = ORIGENS.filter((o) => conta[o.kind] !== 0);
  if (usadas.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
      {usadas.map((o) => (
        <span key={o.kind} className="inline-flex items-center gap-1">
          <span className={cn("w-1.5 h-1.5 rounded-full", o.cor)} />
          {o.label}{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {formatBRL(conta[o.kind])}
          </span>
        </span>
      ))}
    </div>
  );
}
