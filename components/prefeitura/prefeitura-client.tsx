"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Landmark, CheckCheck, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatBRL, formatDate, daysUntil } from "@/lib/utils";
import type { PrefeituraNota, PrefeituraSecretaria } from "@/lib/types";
import { NotaDialog } from "./nota-dialog";
import { SecretariaDialog } from "./secretaria-dialog";
import { BaixaDialog } from "./baixa-dialog";

interface Props {
  secretarias: PrefeituraSecretaria[];
  notas: PrefeituraNota[];
}

const RESUMO = "resumo";

const FILTROS = [
  { label: "Todas", value: "" },
  { label: "A receber", value: "pendente" },
  { label: "Pagas", value: "pago" },
] as const;
type Filtro = (typeof FILTROS)[number]["value"];

type Totais = { qtd: number; emitido: number; recebido: number; aReceber: number };

/** Nota cancelada não entra em conta nenhuma. */
function somar(notas: PrefeituraNota[]): Totais {
  const t: Totais = { qtd: 0, emitido: 0, recebido: 0, aReceber: 0 };
  for (const n of notas) {
    if (n.situacao === "cancelada") continue;
    const v = Number(n.valor);
    t.qtd++;
    t.emitido += v;
    if (n.situacao === "pago") t.recebido += v;
    else t.aReceber += v;
  }
  return t;
}

/** Número da nota para ordenar: "7373" vem depois de "845". */
function numeroDe(n: PrefeituraNota): number {
  const v = parseInt(n.numero.replace(/\D/g, ""), 10);
  return isNaN(v) ? 0 : v;
}

/**
 * O próximo número de nota, para já vir preenchido. A numeração é da EMPRESA,
 * não da secretaria: a última nota emitida, de qualquer uma, mais um.
 */
function proximoNumero(notas: PrefeituraNota[]): string {
  if (notas.length === 0) return "";
  const ultima = [...notas].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  )[0];
  const n = numeroDe(ultima);
  return n > 0 ? String(n + 1) : "";
}

export function PrefeituraClient({ secretarias, notas }: Props) {
  const [aba, setAba] = useState<string>(RESUMO);
  const [filtro, setFiltro] = useState<Filtro>("");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());

  const [notaAberta, setNotaAberta] = useState(false);
  const [notaEditando, setNotaEditando] = useState<PrefeituraNota | null>(null);
  const [secAberta, setSecAberta] = useState(false);
  const [secEditando, setSecEditando] = useState<PrefeituraSecretaria | null>(null);
  const [baixaAberta, setBaixaAberta] = useState(false);

  const ativas = secretarias.filter((s) => s.ativa);
  const secretaria = secretarias.find((s) => s.id === aba) ?? null;

  const notasPorSecretaria = useMemo(() => {
    const m = new Map<string, PrefeituraNota[]>();
    for (const n of notas) {
      const lista = m.get(n.secretaria_id) ?? [];
      lista.push(n);
      m.set(n.secretaria_id, lista);
    }
    return m;
  }, [notas]);

  const notasDaAba = useMemo(() => {
    const base = secretaria ? notasPorSecretaria.get(secretaria.id) ?? [] : notas;
    // igual à planilha: a mais antiga em cima, a mais nova embaixo
    return [...base].sort(
      (a, b) =>
        a.data_emissao.localeCompare(b.data_emissao) || numeroDe(a) - numeroDe(b)
    );
  }, [secretaria, notasPorSecretaria, notas]);

  const totais = useMemo(() => somar(notasDaAba), [notasDaAba]);

  const visiveis = notasDaAba.filter((n) => {
    if (!filtro) return true;
    if (filtro === "pendente") return n.situacao === "pendente";
    return n.situacao === filtro;
  });

  // Só nota pendente pode ser marcada para a baixa em lote
  const pendentesVisiveis = visiveis.filter((n) => n.situacao === "pendente");
  const todasMarcadas =
    pendentesVisiveis.length > 0 && pendentesVisiveis.every((n) => selecionadas.has(n.id));

  function trocarAba(id: string) {
    setAba(id);
    setSelecionadas(new Set());
  }
  function marcar(id: string) {
    setSelecionadas((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }
  function marcarTodas() {
    setSelecionadas(todasMarcadas ? new Set() : new Set(pendentesVisiveis.map((n) => n.id)));
  }

  function novaNota() {
    setNotaEditando(null);
    setNotaAberta(true);
  }
  function editarNota(n: PrefeituraNota) {
    setNotaEditando(n);
    setNotaAberta(true);
  }
  function novaSecretaria() {
    setSecEditando(null);
    setSecAberta(true);
  }
  function editarSecretaria(s: PrefeituraSecretaria) {
    setSecEditando(s);
    setSecAberta(true);
  }

  const valorSelecionado = notas
    .filter((n) => selecionadas.has(n.id))
    .reduce((s, n) => s + Number(n.valor), 0);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Prefeitura</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Notas emitidas para cada secretaria e a baixa do pagamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={novaSecretaria}>
            <Plus className="w-4 h-4" />
            Secretaria
          </Button>
          <Button onClick={novaNota} disabled={ativas.length === 0}>
            <Plus className="w-4 h-4" />
            Nova nota
          </Button>
        </div>
      </div>

      {/* Os números da aba: do resumo = tudo; da secretaria = só dela */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Resumo label="Emitido" value={totais.emitido} tone="slate" />
        <Resumo label="Recebido" value={totais.recebido} tone="emerald" />
        <Resumo label="A receber" value={totais.aReceber} tone="amber" />
      </div>

      {/* Uma aba por secretaria — a coluna da planilha */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 overflow-x-auto scrollbar-hide">
        <Aba ativa={aba === RESUMO} onClick={() => trocarAba(RESUMO)}>
          Resumo
        </Aba>
        {ativas.map((s) => {
          const pend = (notasPorSecretaria.get(s.id) ?? []).filter(
            (n) => n.situacao === "pendente"
          ).length;
          return (
            <Aba key={s.id} ativa={aba === s.id} onClick={() => trocarAba(s.id)}>
              {s.nome}
              {pend > 0 && (
                <span className="ml-1.5 inline-flex min-w-[1.1rem] justify-center rounded-full bg-amber-100 dark:bg-amber-900/60 px-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  {pend}
                </span>
              )}
            </Aba>
          );
        })}
      </div>

      {aba === RESUMO || !secretaria ? (
        <TabelaResumo
          secretarias={secretarias}
          notasPorSecretaria={notasPorSecretaria}
          onAbrir={trocarAba}
          onEditar={editarSecretaria}
        />
      ) : (
        <>
          {/* Cabeçalho da secretaria */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                {secretaria.nome}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {totais.qtd} {totais.qtd === 1 ? "nota" : "notas"}
                {secretaria.valor_contrato != null && (
                  <>
                    {" · "}contrato {formatBRL(Number(secretaria.valor_contrato))}
                    {" · "}saldo {formatBRL(Number(secretaria.valor_contrato) - totais.emitido)}
                  </>
                )}
              </p>
            </div>
            <button
              onClick={() => editarSecretaria(secretaria)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-produmar-600"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Editar secretaria
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {FILTROS.map((f) => (
                <Aba key={f.value} ativa={filtro === f.value} onClick={() => setFiltro(f.value)}>
                  {f.label}
                </Aba>
              ))}
            </div>
            {selecionadas.size > 0 && (
              <Button size="sm" onClick={() => setBaixaAberta(true)}>
                <CheckCheck className="w-4 h-4" />
                Dar baixa em {selecionadas.size} · {formatBRL(valorSelecionado)}
              </Button>
            )}
          </div>

          <Card className="overflow-hidden">
            {visiveis.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <Landmark className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">Nenhuma nota aqui</p>
                <button onClick={novaNota} className="mt-3 text-xs text-produmar-600 hover:underline">
                  + Lançar nota
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <th className="w-8 px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={todasMarcadas}
                          onChange={marcarTodas}
                          disabled={pendentesVisiveis.length === 0}
                          title="Marcar todas as pendentes"
                          className="w-4 h-4 accent-produmar-600"
                        />
                      </th>
                      <th className="px-2 py-2 text-left">Nº</th>
                      <th className="px-2 py-2 text-left">Emissão</th>
                      <th className="px-2 py-2 text-right">Valor</th>
                      <th className="px-2 py-2 text-left">Situação</th>
                      <th className="px-2 py-2 text-left whitespace-nowrap">Data da baixa</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visiveis.map((n) => (
                      <LinhaNota
                        key={n.id}
                        nota={n}
                        marcada={selecionadas.has(n.id)}
                        onMarcar={() => marcar(n.id)}
                        onEditar={() => editarNota(n)}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-200">
                      <td />
                      <td colSpan={2} className="px-2 py-2 text-xs uppercase">
                        Total
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                        {formatBRL(
                          visiveis
                            .filter((n) => n.situacao !== "cancelada")
                            .reduce((s, n) => s + Number(n.valor), 0)
                        )}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <NotaDialog
        open={notaAberta}
        onClose={() => setNotaAberta(false)}
        nota={notaEditando}
        secretarias={ativas}
        secretariaInicial={secretaria?.id ?? ativas[0]?.id ?? ""}
        numeroSugerido={proximoNumero(notas)}
      />
      <SecretariaDialog
        open={secAberta}
        onClose={() => setSecAberta(false)}
        secretaria={secEditando}
        onArquivada={() => trocarAba(RESUMO)}
      />
      <BaixaDialog
        open={baixaAberta}
        onClose={() => setBaixaAberta(false)}
        ids={Array.from(selecionadas)}
        valor={valorSelecionado}
        onFeito={() => setSelecionadas(new Set())}
      />
    </div>
  );
}

// ── Pedaços ───────────────────────────────────────────────────────────────

function LinhaNota({
  nota,
  marcada,
  onMarcar,
  onEditar,
}: {
  nota: PrefeituraNota;
  marcada: boolean;
  onMarcar: () => void;
  onEditar: () => void;
}) {
  const cancelada = nota.situacao === "cancelada";
  // há quanto tempo a prefeitura está com a nota sem pagar
  const dias = nota.situacao === "pendente" ? -daysUntil(nota.data_emissao) : 0;

  return (
    <tr
      className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/60 ${
        marcada ? "bg-produmar-50/60 dark:bg-produmar-950/30" : ""
      } ${cancelada ? "opacity-50" : ""}`}
    >
      <td className="px-2 py-2 text-center">
        {nota.situacao === "pendente" && (
          <input
            type="checkbox"
            checked={marcada}
            onChange={onMarcar}
            className="w-4 h-4 accent-produmar-600"
          />
        )}
      </td>
      <td className="px-2 py-2 font-medium text-slate-800 dark:text-slate-200 tabular-nums">
        <button onClick={onEditar} className="hover:underline text-left">
          {nota.numero}
        </button>
      </td>
      <td className="px-2 py-2 tabular-nums text-slate-600 dark:text-slate-300">
        {formatDate(nota.data_emissao)}
      </td>
      <td
        className={`px-2 py-2 text-right tabular-nums whitespace-nowrap text-slate-800 dark:text-slate-200 ${
          cancelada ? "line-through" : ""
        }`}
      >
        {formatBRL(Number(nota.valor))}
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        {nota.situacao === "pago" ? (
          <Badge variant="success">OK</Badge>
        ) : cancelada ? (
          <Badge variant="muted">Cancelada</Badge>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Badge variant="warning">Pendente</Badge>
            {dias > 0 && <span className="text-[11px] text-slate-400">{dias}d</span>}
          </span>
        )}
      </td>
      <td className="px-2 py-2 tabular-nums text-slate-600 dark:text-slate-300">
        {nota.data_baixa ? formatDate(nota.data_baixa) : "—"}
      </td>
      <td className="px-1 py-2">
        <button
          onClick={onEditar}
          title="Editar"
          className="p-1.5 rounded-lg text-slate-400 hover:text-produmar-600 hover:bg-produmar-50 dark:hover:bg-slate-700"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

function TabelaResumo({
  secretarias,
  notasPorSecretaria,
  onAbrir,
  onEditar,
}: {
  secretarias: PrefeituraSecretaria[];
  notasPorSecretaria: Map<string, PrefeituraNota[]>;
  onAbrir: (id: string) => void;
  onEditar: (s: PrefeituraSecretaria) => void;
}) {
  const [verArquivadas, setVerArquivadas] = useState(false);
  const lista = secretarias.filter((s) => s.ativa || verArquivadas);
  const temArquivadas = secretarias.some((s) => !s.ativa);

  if (secretarias.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Landmark className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">Nenhuma secretaria cadastrada</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2 text-left">Secretaria</th>
                <th className="px-2 py-2 text-right">Notas</th>
                <th className="px-2 py-2 text-right">Emitido</th>
                <th className="px-2 py-2 text-right">Recebido</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">A receber</th>
                <th className="px-2 py-2 text-right">Contrato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map((s) => {
                const t = somar(notasPorSecretaria.get(s.id) ?? []);
                return (
                  <tr
                    key={s.id}
                    onClick={() => (s.ativa ? onAbrir(s.id) : onEditar(s))}
                    className={`cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/60 ${
                      s.ativa ? "" : "opacity-50"
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200 min-w-[12rem]">
                      {s.nome}
                      {!s.ativa && <span className="ml-1 text-[10px] text-slate-400">(arquivada)</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.qtd}</td>
                    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                      {formatBRL(t.emitido)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                      {formatBRL(t.recebido)}
                    </td>
                    <td
                      className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${
                        t.aReceber > 0
                          ? "font-semibold text-amber-700 dark:text-amber-400"
                          : "text-slate-400"
                      }`}
                    >
                      {formatBRL(t.aReceber)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap text-slate-500">
                      {s.valor_contrato != null ? formatBRL(Number(s.valor_contrato)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {temArquivadas && (
        <button
          onClick={() => setVerArquivadas((v) => !v)}
          className="text-xs text-slate-500 hover:text-produmar-600"
        >
          {verArquivadas ? "Esconder arquivadas" : "Mostrar arquivadas"}
        </button>
      )}
    </div>
  );
}

function Aba({
  ativa,
  onClick,
  children,
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center ${
        ativa
          ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-400 shadow-sm"
          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function Resumo({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "amber" | "emerald";
}) {
  const styles = {
    slate: "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300",
    amber: "bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50 text-amber-700 dark:text-amber-400",
    emerald: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400",
  }[tone];
  return (
    <div className={`rounded-xl px-3 py-2.5 sm:p-4 border min-w-0 ${styles}`}>
      <p className="text-xs font-medium opacity-80 mb-0.5 sm:mb-1 truncate">{label}</p>
      <p className="text-sm sm:text-base font-semibold tabular-nums truncate">{formatBRL(value)}</p>
    </div>
  );
}
