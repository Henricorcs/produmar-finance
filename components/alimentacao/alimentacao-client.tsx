"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actionError } from "@/lib/action-result";
import { cn, formatBRL, localDateISO, paraBusca } from "@/lib/utils";
import {
  WEEKDAY_INITIALS,
  longDay,
  monthCells,
  monthLabel,
} from "@/components/diaristas/diarista-shared";
import { marcarRefeicao, marcarVarios } from "@/app/(app)/alimentacao/actions";
import { PessoaDialog } from "./pessoa-dialog";
import { ValorDialog } from "./valor-dialog";
import type { AlimentacaoPessoa, AlimentacaoRefeicao } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// ALIMENTAÇÃO — quem comeu o bandeco em cada dia (migration 154)
// ─────────────────────────────────────────────────────────────────────────────
// DIA: a lista de quem come; um toque no nome marca que a pessoa comeu naquele
// dia, outro toque desmarca. A marcação aparece na hora e vai para o banco por
// trás — se o banco recusar, volta como estava e avisa.
// MÊS: quantas refeições saíram, dia a dia e por pessoa — a base para medir o
// custo da comida no mês.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = "dia" | "mes";

interface Props {
  pessoas: AlimentacaoPessoa[];
  /** As refeições do mês do dia da tela. */
  refeicoes: AlimentacaoRefeicao[];
  diaInicial: string;
  /** Hoje no horário daqui, vindo do servidor. */
  hoje: string;
  abaInicial: Aba;
  podeMarcar: boolean;
  migrationPendente: boolean;
  /** O valor de cada refeição hoje (155) — o que entra na marcação nova. */
  valorRefeicao: number;
}

const chave = (pessoaId: string, data: string) => `${pessoaId}|${data}`;

function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return localDateISO(new Date(y, m - 1, d + n));
}

function somarMeses(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  return localDateISO(new Date(y, m - 1 + n, 1));
}

export function AlimentacaoClient({
  pessoas,
  refeicoes,
  diaInicial,
  hoje,
  abaInicial,
  podeMarcar,
  migrationPendente,
  valorRefeicao,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [navegando, startNav] = useTransition();

  const [aba, setAba] = useState<Aba>(abaInicial);
  const [dia, setDia] = useState(diaInicial);
  const [busca, setBusca] = useState("");
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<AlimentacaoPessoa | null>(null);
  const [valorOpen, setValorOpen] = useState(false);

  /**
   * O que foi tocado nesta tela e ainda pode não ter voltado do banco: vale
   * por cima do que veio do servidor, para a marcação aparecer na hora.
   */
  const [ajustes, setAjustes] = useState<Map<string, boolean>>(new Map());

  /** Quem comeu em cada dia → quanto custou a refeição (155). */
  const marcadas = useMemo(() => {
    const m = new Map(refeicoes.map((r) => [chave(r.pessoa_id, r.data), Number(r.valor)]));
    ajustes.forEach((comeu, k) => {
      // a marcação nova leva o valor de hoje, como o servidor grava
      if (comeu) m.set(k, m.get(k) ?? valorRefeicao);
      else m.delete(k);
    });
    return m;
  }, [refeicoes, ajustes, valorRefeicao]);

  const [ano, mes] = dia.split("-").map(Number);
  const mesDaTela = dia.slice(0, 7);

  // ── navegação ──────────────────────────────────────────────────────────────

  /** Troca o dia: no mesmo mês é só na tela; outro mês busca no servidor. */
  function irParaDia(novo: string, novaAba: Aba = aba) {
    setErro(null);
    if (novo.slice(0, 7) !== mesDaTela) {
      startNav(() =>
        router.push(`${pathname}?d=${novo}${novaAba === "mes" ? "&v=mes" : ""}`, {
          scroll: false,
        })
      );
      return;
    }
    setDia(novo);
    setAba(novaAba);
    try {
      window.history.replaceState(
        null,
        "",
        `${pathname}?d=${novo}${novaAba === "mes" ? "&v=mes" : ""}`
      );
    } catch {
      // sem o endereço atualizado a tela segue igual
    }
  }

  function trocarAba(nova: Aba) {
    irParaDia(dia, nova);
  }

  function trocarMes(delta: number) {
    const primeiro = somarMeses(dia, delta);
    // voltando ao mês de hoje, abre em hoje
    irParaDia(primeiro.slice(0, 7) === hoje.slice(0, 7) ? hoje : primeiro, "mes");
  }

  // ── marcação ───────────────────────────────────────────────────────────────

  function alternar(p: AlimentacaoPessoa) {
    if (!podeMarcar) return;
    const k = chave(p.id, dia);
    const comeu = !marcadas.has(k);
    setErro(null);
    setAjustes((m) => new Map(m).set(k, comeu));
    marcarRefeicao(p.id, dia, comeu)
      .then((r) => {
        const falha = actionError(r);
        if (falha) desfazer([k], falha);
      })
      .catch(() => desfazer([k], "Não deu para salvar a marcação. Confira a internet."));
  }

  function marcarTodos(lista: AlimentacaoPessoa[]) {
    const faltam = lista.filter((p) => !marcadas.has(chave(p.id, dia)));
    if (faltam.length === 0) return;
    const ks = faltam.map((p) => chave(p.id, dia));
    setErro(null);
    setAjustes((m) => {
      const n = new Map(m);
      ks.forEach((k) => n.set(k, true));
      return n;
    });
    marcarVarios(
      faltam.map((p) => p.id),
      dia
    )
      .then((r) => {
        const falha = actionError(r);
        if (falha) desfazer(ks, falha);
      })
      .catch(() => desfazer(ks, "Não deu para salvar as marcações. Confira a internet."));
  }

  /** O banco recusou: a marcação volta a ser a do servidor. */
  function desfazer(ks: string[], mensagem: string) {
    setAjustes((m) => {
      const n = new Map(m);
      ks.forEach((k) => n.delete(k));
      return n;
    });
    setErro(mensagem);
  }

  function novaPessoa() {
    setEditando(null);
    setDialogOpen(true);
  }

  function editar(p: AlimentacaoPessoa) {
    setEditando(p);
    setDialogOpen(true);
  }

  // ── o dia ──────────────────────────────────────────────────────────────────

  const ativos = pessoas.filter((p) => p.ativo);
  const arquivados = pessoas.length - ativos.length;

  /** Quem está na lista do dia: os ativos, e o arquivado que comeu nesse dia. */
  const listaDoDia = useMemo(() => {
    const q = paraBusca(busca.trim());
    return pessoas
      .filter(
        (p) => p.ativo || mostrarArquivados || marcadas.has(chave(p.id, dia))
      )
      .filter((p) => (q ? paraBusca(`${p.nome} ${p.observacao ?? ""}`).includes(q) : true));
  }, [pessoas, busca, mostrarArquivados, marcadas, dia]);

  const comeramNoDia = pessoas.filter((p) => marcadas.has(chave(p.id, dia))).length;
  const custoDoDia = pessoas.reduce((s, p) => s + (marcadas.get(chave(p.id, dia)) ?? 0), 0);
  const faltamNoDia = ativos.filter((p) => !marcadas.has(chave(p.id, dia)));

  // ── o mês ──────────────────────────────────────────────────────────────────

  const doMes = useMemo(() => {
    const porDia = new Map<string, number>();
    const porPessoa = new Map<string, { datas: string[]; custo: number }>();
    let custo = 0;
    marcadas.forEach((valor, k) => {
      const [pessoaId, data] = k.split("|");
      if (!data?.startsWith(mesDaTela)) return;
      porDia.set(data, (porDia.get(data) ?? 0) + 1);
      const p = porPessoa.get(pessoaId) ?? { datas: [], custo: 0 };
      p.datas.push(data);
      p.custo += valor;
      porPessoa.set(pessoaId, p);
      custo += valor;
    });
    const nomePorId = new Map(pessoas.map((p) => [p.id, p]));
    const pessoasDoMes = [...porPessoa.entries()]
      .map(([id, p]) => ({
        id,
        pessoa: nomePorId.get(id),
        datas: p.datas.sort(),
        custo: p.custo,
      }))
      .sort(
        (a, b) =>
          b.datas.length - a.datas.length ||
          (a.pessoa?.nome ?? "").localeCompare(b.pessoa?.nome ?? "")
      );
    const total = [...porDia.values()].reduce((s, n) => s + n, 0);
    return { porDia, pessoasDoMes, total, custo, diasComComida: porDia.size };
  }, [marcadas, mesDaTela, pessoas]);

  const celulas = monthCells(ano, mes - 1);
  const maiorDia = Math.max(1, ...doMes.porDia.values());

  return (
    <div className={cn("space-y-5 animate-fade-in", navegando && "opacity-60")}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Alimentação</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            Quem comeu o bandeco em cada dia
          </p>
        </div>
        {podeMarcar && (
          <Button onClick={novaPessoa} className="flex-shrink-0">
            <Plus className="w-4 h-4" />
            Pessoa
          </Button>
        )}
      </div>

      {migrationPendente && (
        <p className="text-sm text-amber-800 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-300">
          Falta rodar a migration 154 no Supabase para a Alimentação guardar as marcações.
        </p>
      )}

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {(
          [
            { value: "dia", label: "Dia", icon: UtensilsCrossed },
            { value: "mes", label: "Mês", icon: CalendarDays },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => trocarAba(t.value)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-md text-sm font-medium transition-colors",
                aba === t.value
                  ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {erro && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
          {erro}
        </p>
      )}

      {aba === "dia" ? (
        <div className="space-y-3">
          {/* O dia: setas, e um toque no nome do dia abre o calendário do celular */}
          <div className="rounded-xl border border-produmar-100/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Seta lado="esq" onClick={() => irParaDia(somarDias(dia, -1))} label="Dia anterior" />
              <label className="relative flex-1 min-w-0 text-center cursor-pointer">
                <span className="block text-sm font-semibold text-produmar-800 dark:text-slate-100 truncate">
                  {dia === hoje ? "Hoje · " : ""}
                  {longDay(dia)}
                </span>
                <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                  toque para escolher o dia
                </span>
                <input
                  type="date"
                  value={dia}
                  onChange={(e) => e.target.value && irParaDia(e.target.value)}
                  aria-label="Escolher o dia"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </label>
              <Seta lado="dir" onClick={() => irParaDia(somarDias(dia, 1))} label="Próximo dia" />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="text-2xl font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                  {comeramNoDia}
                </span>{" "}
                {comeramNoDia === 1 ? "comeu" : "comeram"}
                <span className="text-slate-400 dark:text-slate-500">
                  {" "}
                  · {ativos.length} na lista
                </span>
                {custoDoDia > 0 && (
                  <span className="block text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatBRL(custoDoDia)} no dia
                  </span>
                )}
              </p>
              {dia !== hoje && (
                <button
                  type="button"
                  onClick={() => irParaDia(hoje)}
                  className="text-xs font-semibold text-produmar-600 dark:text-produmar-400 hover:underline"
                >
                  Ir para hoje
                </button>
              )}
            </div>
          </div>

          {pessoas.length > 8 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar pelo nome..."
                className="pl-9"
                autoComplete="off"
              />
            </div>
          )}

          {podeMarcar && faltamNoDia.length > 0 && comeramNoDia > 0 && !busca && (
            <button
              type="button"
              onClick={() => marcarTodos(faltamNoDia)}
              className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-dashed border-orange-300 dark:border-orange-900/60 text-sm font-medium text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              Marcar os outros {faltamNoDia.length}
            </button>
          )}
          {podeMarcar && ativos.length > 1 && comeramNoDia === 0 && !busca && (
            <button
              type="button"
              onClick={() => marcarTodos(ativos)}
              className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-dashed border-orange-300 dark:border-orange-900/60 text-sm font-medium text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              Todos comeram
            </button>
          )}

          {pessoas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-10 px-4 text-center space-y-2">
              <UtensilsCrossed className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Ninguém na lista ainda.</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
                Ponha aqui quem come o bandeco. A lista é só da comida — quem veio fazer uma
                diária ou outro serviço também entra, sem virar colaborador.
              </p>
              {podeMarcar && (
                <Button size="sm" onClick={novaPessoa}>
                  <Plus className="w-4 h-4" /> Nova pessoa
                </Button>
              )}
            </div>
          ) : listaDoDia.length === 0 ? (
            <p className="text-sm text-center text-slate-400 dark:text-slate-500 py-6">
              Ninguém encontrado com esse nome.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {listaDoDia.map((p) => {
                const comeu = marcadas.has(chave(p.id, dia));
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-stretch rounded-xl border overflow-hidden transition-colors",
                      comeu
                        ? "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30"
                        : "border-produmar-100/60 bg-white dark:border-slate-800 dark:bg-slate-900",
                      !p.ativo && "border-dashed opacity-75"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => alternar(p)}
                      disabled={!podeMarcar}
                      aria-pressed={comeu}
                      className="flex-1 min-w-0 flex items-center gap-3 p-3 min-h-[60px] text-left disabled:cursor-default"
                    >
                      <span
                        className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors",
                          comeu
                            ? "bg-orange-500 border-orange-500 text-white"
                            : "border-slate-300 dark:border-slate-600 text-transparent"
                        )}
                      >
                        <Check className="w-5 h-5" strokeWidth={3} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {p.nome}
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {comeu ? "comeu" : "não marcado"}
                          {!p.ativo ? " · arquivado" : ""}
                          {p.observacao ? ` · ${p.observacao}` : ""}
                        </span>
                      </span>
                    </button>
                    {podeMarcar && (
                      <button
                        type="button"
                        onClick={() => editar(p)}
                        aria-label={`Editar ${p.nome}`}
                        className="w-12 flex items-center justify-center border-l border-slate-100 dark:border-slate-800 text-slate-400 hover:text-produmar-600 dark:hover:text-produmar-400 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {arquivados > 0 && (
            <button
              type="button"
              onClick={() => setMostrarArquivados((v) => !v)}
              className="text-xs font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
            >
              {mostrarArquivados ? "Esconder os arquivados" : `Mostrar ${arquivados} arquivado(s)`}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* O mês: quantas refeições saíram */}
          <div className="rounded-xl border border-produmar-100/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Seta lado="esq" onClick={() => trocarMes(-1)} label="Mês anterior" />
              <span className="text-sm font-semibold text-produmar-800 dark:text-slate-100 capitalize">
                {monthLabel(ano, mes - 1)}
              </span>
              <Seta lado="dir" onClick={() => trocarMes(1)} label="Próximo mês" />
            </div>
            <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 px-3 py-2.5 text-center">
              <p className="text-2xl font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                {formatBRL(doMes.custo)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">custo da alimentação no mês</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Numero label="refeições no mês" value={String(doMes.total)} />
              <Numero label="pessoas comeram" value={String(doMes.pessoasDoMes.length)} />
              <Numero label="dias com comida" value={String(doMes.diasComComida)} />
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="tabular-nums">{formatBRL(valorRefeicao)} por refeição</span>
              {podeMarcar && (
                <button
                  type="button"
                  onClick={() => setValorOpen(true)}
                  className="font-semibold text-produmar-600 dark:text-produmar-400 hover:underline"
                >
                  Trocar valor
                </button>
              )}
            </div>
          </div>

          {/* Dia a dia: quantos comeram; um toque abre o dia */}
          <div className="rounded-xl border border-produmar-100/60 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAY_INITIALS.map((w, i) => (
                <span key={i} className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                  {w}
                </span>
              ))}
              {celulas.map((c, i) => {
                if (!c) return <span key={`v${i}`} />;
                const n = doMes.porDia.get(c) ?? 0;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => irParaDia(c, "dia")}
                    className={cn(
                      "aspect-square rounded-lg flex flex-col items-center justify-center text-[11px] leading-tight transition-colors",
                      c === hoje && "ring-2 ring-produmar-400",
                      n > 0
                        ? "text-orange-900 dark:text-orange-100"
                        : "text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                    style={
                      n > 0
                        ? { backgroundColor: `rgba(249, 115, 22, ${0.15 + 0.45 * (n / maiorDia)})` }
                        : undefined
                    }
                    aria-label={`${longDay(c)}: ${n} ${n === 1 ? "refeição" : "refeições"}`}
                  >
                    <span>{Number(c.slice(8))}</span>
                    {n > 0 && <span className="font-bold tabular-nums">{n}</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-2">
              O número embaixo do dia é quantos comeram. Toque no dia para marcar.
            </p>
          </div>

          {/* Por pessoa */}
          {doMes.pessoasDoMes.length === 0 ? (
            <p className="text-sm text-center text-slate-400 dark:text-slate-500 py-6">
              Nenhuma refeição marcada neste mês.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-produmar-100/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {doMes.pessoasDoMes.map(({ id, pessoa, datas, custo }) => (
                <div key={id} className="flex items-start gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {pessoa?.nome ?? "—"}
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      dias {datas.map((d) => Number(d.slice(8))).join(", ")}
                    </span>
                  </span>
                  <span className="text-right flex-shrink-0">
                    <span className="block text-lg font-semibold tabular-nums text-orange-600 dark:text-orange-400 leading-none">
                      {datas.length}
                    </span>
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                      {datas.length === 1 ? "refeição" : "refeições"}
                    </span>
                    <span className="block text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
                      {formatBRL(custo)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <PessoaDialog open={dialogOpen} onClose={() => setDialogOpen(false)} pessoa={editando} />
      <ValorDialog
        open={valorOpen}
        onClose={() => setValorOpen(false)}
        valorAtual={valorRefeicao}
      />
    </div>
  );
}

function Seta({ lado, onClick, label }: { lado: "esq" | "dir"; onClick: () => void; label: string }) {
  const Icon = lado === "esq" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}

function Numero({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2 py-2">
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          destaque ? "text-orange-600 dark:text-orange-400" : "text-slate-800 dark:text-slate-100"
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
    </div>
  );
}
