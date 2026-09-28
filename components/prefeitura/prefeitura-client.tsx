"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Landmark,
  CheckCheck,
  Settings2,
  Search,
  X,
  LayoutList,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type Totais = { qtd: number; pendentes: number; emitido: number; recebido: number; aReceber: number };

/** Nota cancelada não entra em conta nenhuma. */
function somar(notas: PrefeituraNota[]): Totais {
  const t: Totais = { qtd: 0, pendentes: 0, emitido: 0, recebido: 0, aReceber: 0 };
  for (const n of notas) {
    if (n.situacao === "cancelada") continue;
    const v = Number(n.valor);
    t.qtd++;
    t.emitido += v;
    if (n.situacao === "pago") t.recebido += v;
    else {
      t.aReceber += v;
      t.pendentes++;
    }
  }
  return t;
}

/** Número da nota para ordenar: "7373" vem depois de "845". */
function numeroDe(n: PrefeituraNota): number {
  const v = parseInt(n.numero.replace(/\D/g, ""), 10);
  return isNaN(v) ? 0 : v;
}

/** Sem acento e em minúsculas — "saude" acha "SAÚDE". */
function normaliza(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * O próximo número de nota, para já vir preenchido. Cada grupo tem a SUA
 * numeração (a da INTERNET vai pelos 7 mil, a das NF de monitoramento recomeçou
 * do 1): pega a nota mais recente do grupo e soma um.
 */
function proximoNumero(notas: PrefeituraNota[]): string {
  if (notas.length === 0) return "";
  const ultimaData = notas.reduce((m, n) => (n.data_emissao > m ? n.data_emissao : m), "");
  const maior = Math.max(...notas.filter((n) => n.data_emissao === ultimaData).map(numeroDe));
  return maior > 0 ? String(maior + 1) : "";
}

export function PrefeituraClient({ secretarias, notas }: Props) {
  const [aba, setAba] = useState<string>(RESUMO);
  const [filtro, setFiltro] = useState<Filtro>("");
  const [busca, setBusca] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  // No celular o menu das secretarias fica recolhido atrás de um botão
  const [menuAberto, setMenuAberto] = useState(false);
  const [verArquivadas, setVerArquivadas] = useState(false);

  const [notaAberta, setNotaAberta] = useState(false);
  const [notaEditando, setNotaEditando] = useState<PrefeituraNota | null>(null);
  const [secAberta, setSecAberta] = useState(false);
  const [secEditando, setSecEditando] = useState<PrefeituraSecretaria | null>(null);
  const [baixaAberta, setBaixaAberta] = useState(false);

  // Cada aba da planilha (INTERNET, NF...) é um grupo, com as secretarias dela
  const grupos = useMemo(
    () => Array.from(new Set(secretarias.map((s) => s.grupo))),
    [secretarias]
  );
  const secretaria = secretarias.find((s) => s.id === aba) ?? null;
  const secPorId = useMemo(() => new Map(secretarias.map((s) => [s.id, s])), [secretarias]);

  const notasPorSecretaria = useMemo(() => {
    const m = new Map<string, PrefeituraNota[]>();
    for (const n of notas) {
      const lista = m.get(n.secretaria_id) ?? [];
      lista.push(n);
      m.set(n.secretaria_id, lista);
    }
    return m;
  }, [notas]);

  const totaisPorSecretaria = useMemo(() => {
    const m = new Map<string, Totais>();
    for (const s of secretarias) m.set(s.id, somar(notasPorSecretaria.get(s.id) ?? []));
    return m;
  }, [secretarias, notasPorSecretaria]);

  const notasDoGrupo = (grupo: string) =>
    secretarias
      .filter((s) => s.grupo === grupo)
      .flatMap((s) => notasPorSecretaria.get(s.id) ?? []);

  // ── A busca ────────────────────────────────────────────────────────────
  // Com número, ela procura a NOTA em todas as secretarias; com letra, filtra
  // o menu pelo nome da secretaria.
  const termo = busca.trim();
  const buscaPorNumero = /\d/.test(termo);
  const resultadoBusca = useMemo(() => {
    if (!buscaPorNumero) return [];
    const q = termo.replace(/\D/g, "");
    const digitos = (n: PrefeituraNota) => n.numero.replace(/\D/g, "");
    // o número exato primeiro ("36" acha a 36 antes da 4736), depois os que
    // começam com ele, depois o resto — e, dentro de cada, a mais nova em cima
    const peso = (n: PrefeituraNota) =>
      digitos(n) === q ? 0 : digitos(n).startsWith(q) ? 1 : 2;
    return notas
      .filter((n) => digitos(n).includes(q))
      .sort((a, b) => peso(a) - peso(b) || b.data_emissao.localeCompare(a.data_emissao));
  }, [notas, termo, buscaPorNumero]);

  const secretariasDoMenu = secretarias.filter((s) => {
    if (!s.ativa && !verArquivadas) return false;
    if (!termo || buscaPorNumero) return true;
    return normaliza(s.nome).includes(normaliza(termo));
  });

  // ── A tabela da secretaria escolhida ──────────────────────────────────
  const notasDaAba = useMemo(() => {
    const base = secretaria ? notasPorSecretaria.get(secretaria.id) ?? [] : [];
    // igual à planilha: a mais antiga em cima, a mais nova embaixo
    return [...base].sort(
      (a, b) => a.data_emissao.localeCompare(b.data_emissao) || numeroDe(a) - numeroDe(b)
    );
  }, [secretaria, notasPorSecretaria]);

  const visiveis = (buscaPorNumero ? resultadoBusca : notasDaAba).filter(
    (n) => !filtro || n.situacao === filtro
  );

  // Os números do topo: da secretaria escolhida, ou de tudo no resumo
  const totais = useMemo(
    () => (secretaria ? totaisPorSecretaria.get(secretaria.id)! : somar(notas)),
    [secretaria, totaisPorSecretaria, notas]
  );

  // Só nota pendente pode ser marcada para a baixa em lote
  const pendentesVisiveis = visiveis.filter((n) => n.situacao === "pendente");
  const todasMarcadas =
    pendentesVisiveis.length > 0 && pendentesVisiveis.every((n) => selecionadas.has(n.id));
  const valorSelecionado = notas
    .filter((n) => selecionadas.has(n.id))
    .reduce((s, n) => s + Number(n.valor), 0);

  function escolher(id: string) {
    setAba(id);
    setSelecionadas(new Set());
    setMenuAberto(false);
    // escolher no menu sai da busca por número (senão a tabela não muda)
    if (buscaPorNumero) setBusca("");
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

  const ativas = secretarias.filter((s) => s.ativa);
  const secretariaDaNova = secretaria?.ativa ? secretaria : ativas[0];
  const grupoDaNova = secretariaDaNova?.grupo ?? grupos[0] ?? "INTERNET";

  const titulo = buscaPorNumero
    ? `Notas com nº "${termo}"`
    : secretaria
      ? secretaria.nome
      : "Resumo geral";

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
        <Button onClick={novaNota} disabled={ativas.length === 0}>
          <Plus className="w-4 h-4" />
          Nova nota
        </Button>
      </div>

      <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5 lg:items-start space-y-4 lg:space-y-0">
        {/* ── MENU DA ESQUERDA: busca + secretarias por grupo ───────────── */}
        <aside className="lg:sticky lg:top-4 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Secretaria ou nº da nota"
              className="pl-9 pr-9"
              semDitado
              autoComplete="off"
            />
            {busca && (
              <button
                onClick={() => setBusca("")}
                title="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* No celular: um botão mostra qual secretaria está aberta e abre o menu */}
          <button
            onClick={() => setMenuAberto((v) => !v)}
            className="lg:hidden w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <span className="truncate">{secretaria ? secretaria.nome : "Resumo geral"}</span>
            <span className="flex items-center gap-1 text-xs text-produmar-600 flex-shrink-0">
              Trocar secretaria
              <ChevronDown className={`w-4 h-4 transition-transform ${menuAberto ? "rotate-180" : ""}`} />
            </span>
          </button>

          <Card
            className={`${menuAberto || (termo && !buscaPorNumero) ? "block" : "hidden"} lg:block overflow-hidden`}
          >
            <nav className="max-h-[70vh] overflow-y-auto py-1">
              <ItemMenu
                ativo={aba === RESUMO && !buscaPorNumero}
                onClick={() => escolher(RESUMO)}
                nome="Resumo geral"
                icone={<LayoutList className="w-4 h-4" />}
                aReceber={somar(notas).aReceber}
              />
              {grupos.map((g) => {
                const doGrupo = secretariasDoMenu.filter((s) => s.grupo === g);
                if (doGrupo.length === 0) return null;
                return (
                  <div key={g} className="mt-1">
                    <div className="flex items-center justify-between px-3 pt-3 pb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {g}
                      </span>
                      <span className="text-[11px] tabular-nums text-amber-600 dark:text-amber-400">
                        {formatBRL(somar(notasDoGrupo(g)).aReceber)}
                      </span>
                    </div>
                    {doGrupo.map((s) => {
                      const t = totaisPorSecretaria.get(s.id)!;
                      return (
                        <ItemMenu
                          key={s.id}
                          ativo={aba === s.id && !buscaPorNumero}
                          onClick={() => escolher(s.id)}
                          nome={s.nome}
                          pendentes={t.pendentes}
                          aReceber={t.aReceber}
                          arquivada={!s.ativa}
                        />
                      );
                    })}
                  </div>
                );
              })}
              {secretariasDoMenu.length === 0 && (
                <p className="px-3 py-4 text-sm text-slate-400">Nenhuma secretaria com esse nome</p>
              )}
            </nav>
            <div className="border-t border-slate-100 dark:border-slate-800 p-2 flex items-center justify-between gap-2">
              <button
                onClick={novaSecretaria}
                className="flex items-center gap-1 text-xs font-medium text-produmar-600 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                Secretaria
              </button>
              {secretarias.some((s) => !s.ativa) && (
                <button
                  onClick={() => setVerArquivadas((v) => !v)}
                  className="text-xs text-slate-500 hover:text-produmar-600"
                >
                  {verArquivadas ? "Esconder arquivadas" : "Ver arquivadas"}
                </button>
              )}
            </div>
          </Card>
        </aside>

        {/* ── A SECRETARIA ESCOLHIDA ───────────────────────────────────── */}
        <section className="space-y-4 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{titulo}</h2>
              {secretaria && !buscaPorNumero && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {secretaria.grupo} · {totais.qtd} {totais.qtd === 1 ? "nota" : "notas"}
                  {secretaria.valor_padrao != null &&
                    ` · nota de ${formatBRL(Number(secretaria.valor_padrao))}`}
                </p>
              )}
            </div>
            {secretaria && !buscaPorNumero && (
              <button
                onClick={() => editarSecretaria(secretaria)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-produmar-600"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Editar secretaria
              </button>
            )}
          </div>

          {!buscaPorNumero && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Resumo label="Emitido" value={totais.emitido} tone="slate" />
              <Resumo label="Recebido" value={totais.recebido} tone="emerald" />
              <Resumo label="A receber" value={totais.aReceber} tone="amber" />
            </div>
          )}

          {secretaria || buscaPorNumero ? (
            <>
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

              <TabelaNotas
                notas={visiveis}
                mostrarSecretaria={buscaPorNumero}
                secPorId={secPorId}
                selecionadas={selecionadas}
                todasMarcadas={todasMarcadas}
                podeMarcarTodas={pendentesVisiveis.length > 0}
                onMarcar={marcar}
                onMarcarTodas={marcarTodas}
                onEditar={editarNota}
                onNova={buscaPorNumero ? undefined : novaNota}
              />
            </>
          ) : (
            <TabelaResumo
              grupos={grupos}
              secretarias={secretarias.filter((s) => s.ativa || verArquivadas)}
              totaisPorSecretaria={totaisPorSecretaria}
              onAbrir={escolher}
            />
          )}
        </section>
      </div>

      <NotaDialog
        open={notaAberta}
        onClose={() => setNotaAberta(false)}
        nota={notaEditando}
        secretarias={ativas}
        secretariaInicial={secretariaDaNova?.id ?? ""}
        numeroSugerido={proximoNumero(notasDoGrupo(grupoDaNova))}
        numeroPorGrupo={Object.fromEntries(
          grupos.map((g) => [g, proximoNumero(notasDoGrupo(g))])
        )}
      />
      <SecretariaDialog
        open={secAberta}
        onClose={() => setSecAberta(false)}
        secretaria={secEditando}
        onArquivada={() => escolher(RESUMO)}
        grupos={grupos}
        grupoAtual={secretaria?.grupo ?? grupos[0] ?? "INTERNET"}
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

function ItemMenu({
  ativo,
  onClick,
  nome,
  icone,
  pendentes,
  aReceber,
  arquivada,
}: {
  ativo: boolean;
  onClick: () => void;
  nome: string;
  icone?: React.ReactNode;
  pendentes?: number;
  aReceber: number;
  arquivada?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 flex items-start gap-2 border-l-2 transition-colors ${
        ativo
          ? "border-produmar-600 bg-produmar-50 dark:bg-produmar-950/40"
          : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60"
      } ${arquivada ? "opacity-50" : ""}`}
    >
      {icone && <span className="mt-0.5 text-slate-400">{icone}</span>}
      <span className="flex-1 min-w-0">
        <span
          className={`block text-xs leading-snug ${
            ativo
              ? "font-semibold text-produmar-700 dark:text-produmar-300"
              : "font-medium text-slate-700 dark:text-slate-200"
          }`}
        >
          {nome}
          {arquivada && <span className="ml-1 text-[10px] text-slate-400">(arquivada)</span>}
        </span>
        <span className="flex items-center gap-2 mt-0.5">
          <span
            className={`text-[11px] tabular-nums ${
              aReceber > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400"
            }`}
          >
            {aReceber > 0 ? `${formatBRL(aReceber)} a receber` : "tudo recebido"}
          </span>
        </span>
      </span>
      {pendentes != null && pendentes > 0 && (
        <span className="mt-0.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-amber-100 dark:bg-amber-900/60 px-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
          {pendentes}
        </span>
      )}
    </button>
  );
}

function TabelaNotas({
  notas,
  mostrarSecretaria,
  secPorId,
  selecionadas,
  todasMarcadas,
  podeMarcarTodas,
  onMarcar,
  onMarcarTodas,
  onEditar,
  onNova,
}: {
  notas: PrefeituraNota[];
  mostrarSecretaria: boolean;
  secPorId: Map<string, PrefeituraSecretaria>;
  selecionadas: Set<string>;
  todasMarcadas: boolean;
  podeMarcarTodas: boolean;
  onMarcar: (id: string) => void;
  onMarcarTodas: () => void;
  onEditar: (n: PrefeituraNota) => void;
  onNova?: () => void;
}) {
  if (notas.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Landmark className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">Nenhuma nota aqui</p>
          {onNova && (
            <button onClick={onNova} className="mt-3 text-xs text-produmar-600 hover:underline">
              + Lançar nota
            </button>
          )}
        </div>
      </Card>
    );
  }

  const total = notas
    .filter((n) => n.situacao !== "cancelada")
    .reduce((s, n) => s + Number(n.valor), 0);

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="w-8 px-2 py-2 text-center">
                <input
                  type="checkbox"
                  checked={todasMarcadas}
                  onChange={onMarcarTodas}
                  disabled={!podeMarcarTodas}
                  title="Marcar todas as pendentes"
                  className="w-4 h-4 accent-produmar-600"
                />
              </th>
              <th className="px-2 py-2 text-left">Nº</th>
              {mostrarSecretaria && <th className="px-2 py-2 text-left">Secretaria</th>}
              <th className="px-2 py-2 text-left">Emissão</th>
              <th className="px-2 py-2 text-right">Valor</th>
              <th className="px-2 py-2 text-left">Situação</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Data da baixa</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {notas.map((n) => (
              <LinhaNota
                key={n.id}
                nota={n}
                secretaria={mostrarSecretaria ? secPorId.get(n.secretaria_id)?.nome ?? "—" : null}
                marcada={selecionadas.has(n.id)}
                onMarcar={() => onMarcar(n.id)}
                onEditar={() => onEditar(n)}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-200">
              <td />
              <td colSpan={mostrarSecretaria ? 3 : 2} className="px-2 py-2 text-xs uppercase">
                Total
              </td>
              <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{formatBRL(total)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function LinhaNota({
  nota,
  secretaria,
  marcada,
  onMarcar,
  onEditar,
}: {
  nota: PrefeituraNota;
  secretaria: string | null;
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
      {secretaria !== null && (
        <td className="px-2 py-2 text-xs text-slate-600 dark:text-slate-300 min-w-[10rem]">{secretaria}</td>
      )}
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

/** O resumo geral: uma tabela por grupo, cada secretaria numa linha. */
function TabelaResumo({
  grupos,
  secretarias,
  totaisPorSecretaria,
  onAbrir,
}: {
  grupos: string[];
  secretarias: PrefeituraSecretaria[];
  totaisPorSecretaria: Map<string, Totais>;
  onAbrir: (id: string) => void;
}) {
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
    <div className="space-y-4">
      {grupos.map((g) => {
        const lista = secretarias.filter((s) => s.grupo === g);
        if (lista.length === 0) return null;
        return (
          <Card key={g} className="overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
              {g}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2 text-left">Secretaria</th>
                    <th className="px-2 py-2 text-right">Notas</th>
                    <th className="px-2 py-2 text-right">Emitido</th>
                    <th className="px-2 py-2 text-right">Recebido</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">A receber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lista.map((s) => {
                    const t = totaisPorSecretaria.get(s.id)!;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => onAbrir(s.id)}
                        className={`cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/60 ${
                          s.ativa ? "" : "opacity-50"
                        }`}
                      >
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200 min-w-[12rem]">
                          {s.nome}
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
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
