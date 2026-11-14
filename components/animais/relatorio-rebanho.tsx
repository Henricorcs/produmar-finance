"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, FileSpreadsheet, Info, Printer, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import { SPECIES_META, speciesOf } from "./animal-shared";
import { animalNaEscolha, nomeDaEscolha, type EscolhaRaca } from "./menu-racas";
import type { AnimalBreed, AnimalSpecies, AnimalWithInfo } from "@/lib/types";

/** Quem é filho de quem, pelo parto lançado (animal_births). */
export interface Filiacao {
  calf_animal_id: string | null;
  mother_id: string;
}

/** Só o rebanho de hoje, ou também quem já saiu (vendido ou morto). */
export type Situacao = "rebanho" | "todos";
/** Ordem da lista. */
export type Ordem = "numero" | "nascimento" | "mae";

const ORDENS: { value: Ordem; label: string }[] = [
  { value: "numero", label: "Nº do animal" },
  { value: "nascimento", label: "Mais novos primeiro" },
  { value: "mae", label: "Juntar pela mãe" },
];

/** Uma linha do relatório. */
interface Linha {
  id: string;
  tag: string;
  /** Número de antes do código de compra (gado PO). */
  tagAntigo: string | null;
  /** Número da mãe — do parto lançado ou, no gado PO, o que foi escrito na ficha. */
  mae: string | null;
  nascimento: string | null;
  raca: string | null;
  species: AnimalSpecies;
  ativo: boolean;
}

const porNumero = (a: string, b: string) =>
  a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });

/**
 * Monta as linhas: número, mãe, nascimento e raça de cada animal da escolha.
 *
 * A mãe vem de dois lugares:
 *   • o parto lançado no sistema (o bezerro virou cadastro) — é o número da
 *     vaca que pariu;
 *   • o campo "Mãe" da ficha do gado PO (migration 137) — texto livre, quase
 *     sempre um animal de fora (nome ou registro).
 * O parto manda: é a ligação de verdade com um animal do rebanho.
 */
function montarLinhas(
  animals: AnimalWithInfo[],
  todos: AnimalWithInfo[],
  filiacao: Filiacao[],
  situacao: Situacao,
  busca: string,
  ordem: Ordem
): Linha[] {
  const tagPorId = new Map(todos.map((a) => [a.id, a.tag]));
  const maePorCria = new Map<string, string>();
  for (const f of filiacao) {
    if (!f.calf_animal_id) continue;
    const tag = tagPorId.get(f.mother_id);
    if (tag) maePorCria.set(f.calf_animal_id, tag);
  }

  const q = busca.trim().toUpperCase();
  const linhas: Linha[] = animals
    .filter((a) => situacao === "todos" || a.active !== false)
    .map((a) => ({
      id: a.id,
      tag: a.tag,
      tagAntigo: a.tag_antigo?.trim() || null,
      mae: maePorCria.get(a.id) ?? (a.mae?.trim() || null),
      nascimento: a.birth_date ?? null,
      raca: a.breed_name ?? null,
      species: speciesOf(a.species),
      ativo: a.active !== false,
    }))
    .filter((l) =>
      q
        ? [l.tag, l.tagAntigo, l.mae, l.raca].some((v) => (v ?? "").toUpperCase().includes(q))
        : true
    );

  return linhas.sort((a, b) => {
    if (ordem === "nascimento") {
      // sem data vai para o fim
      if (a.nascimento !== b.nascimento) {
        if (!a.nascimento) return 1;
        if (!b.nascimento) return -1;
        return a.nascimento < b.nascimento ? 1 : -1;
      }
    } else if (ordem === "mae") {
      // os filhos da mesma mãe ficam juntos; quem não tem mãe vai para o fim
      if (a.mae !== b.mae) {
        if (!a.mae) return 1;
        if (!b.mae) return -1;
        return porNumero(a.mae, b.mae);
      }
      if (a.nascimento !== b.nascimento) {
        if (!a.nascimento) return 1;
        if (!b.nascimento) return -1;
        return a.nascimento < b.nascimento ? -1 : 1;
      }
    }
    return porNumero(a.tag, b.tag);
  });
}

/** Excel em português: ponto e vírgula e o BOM para os acentos saírem certos. */
function baixarPlanilha(nome: string, cabecalho: string[], linhas: string[][]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const texto = [cabecalho, ...linhas].map((r) => r.map(esc).join(";")).join("\n");
  const blob = new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const dataBR = (d: string | null) => (d ? formatDate(d) : "");

interface TabProps {
  /** Os animais da escolha do menu (inclusive quem já saiu). */
  animals: AnimalWithInfo[];
  /** O rebanho inteiro — é dele que sai o número da mãe. */
  todos: AnimalWithInfo[];
  filiacao: Filiacao[];
  escolha: EscolhaRaca;
  breeds: AnimalBreed[];
  /** Toque na linha abre a ficha do animal. */
  onAbrir?: (id: string) => void;
}

/**
 * RELATÓRIO DO REBANHO — número do animal, número da mãe, data de nascimento
 * e raça, um animal por linha. Segue o menu de tipo e raça da tela; dá para
 * buscar, mudar a ordem, imprimir e baixar a planilha.
 */
export function RelatorioRebanho({ animals, todos, filiacao, escolha, breeds, onAbrir }: TabProps) {
  const [situacao, setSituacao] = useState<Situacao>("rebanho");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("numero");

  const linhas = useMemo(
    () => montarLinhas(animals, todos, filiacao, situacao, busca, ordem),
    [animals, todos, filiacao, situacao, busca, ordem]
  );
  const semMae = linhas.filter((l) => !l.mae).length;
  const semNascimento = linhas.filter((l) => !l.nascimento).length;
  const mostrarTipo = escolha.species === "todos" && new Set(linhas.map((l) => l.species)).size > 1;

  function imprimir() {
    const p = new URLSearchParams();
    if (escolha.species !== "todos") p.set("tipo", escolha.species);
    if (escolha.breedId) p.set("raca", escolha.breedId);
    if (situacao === "todos") p.set("situacao", "todos");
    if (ordem !== "numero") p.set("ordem", ordem);
    if (busca.trim()) p.set("q", busca.trim());
    const qs = p.toString();
    window.open(`/imprimir/animais/relatorio${qs ? `?${qs}` : ""}`, "_blank");
  }

  function planilha() {
    const nome = nomeDaEscolha(escolha, breeds)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_");
    baixarPlanilha(
      `Rebanho_${nome}.csv`,
      ["Nº do animal", "Nº da mãe", "Data de nascimento", "Raça", "Tipo", "Situação"],
      linhas.map((l) => [
        l.tag,
        l.mae ?? "",
        dataBR(l.nascimento),
        l.raca ?? "",
        SPECIES_META[l.species].label,
        l.ativo ? "No rebanho" : "Saiu",
      ])
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-2 space-y-2 dark:border-slate-700 dark:bg-slate-900">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pelo número, mãe ou raça..."
            className="pl-9 pr-10 h-11 rounded-xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"
            autoComplete="off"
            enterKeyHint="search"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar busca"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Só o rebanho de hoje ou também quem já saiu */}
          <div className="flex flex-1 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:flex-none dark:border-slate-700 dark:bg-slate-800/60">
            {(
              [
                ["rebanho", "No rebanho"],
                ["todos", "Com quem saiu"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setSituacao(v)}
                className={cn(
                  "flex-1 h-9 px-2.5 rounded-lg text-xs font-semibold transition-colors active:scale-[0.97] sm:flex-none",
                  situacao === v
                    ? "bg-white text-produmar-700 shadow-sm dark:bg-slate-900 dark:text-produmar-400"
                    : "text-slate-500 dark:text-slate-400"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 sm:flex-none">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as Ordem)}
              aria-label="Ordem da lista"
              className="w-full h-11 pl-9 pr-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-produmar-400"
            >
              {ORDENS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex w-full gap-2 sm:w-auto">
            <button
              type="button"
              onClick={imprimir}
              disabled={linhas.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 h-11 px-3 rounded-xl border border-produmar-200 bg-white text-xs font-semibold text-produmar-700 disabled:opacity-40 dark:bg-slate-900 dark:border-slate-700 dark:text-produmar-400 transition-colors active:scale-[0.97] sm:flex-none"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={planilha}
              disabled={linhas.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 h-11 px-3 rounded-xl border border-produmar-200 bg-white text-xs font-semibold text-produmar-700 disabled:opacity-40 dark:bg-slate-900 dark:border-slate-700 dark:text-produmar-400 transition-colors active:scale-[0.97] sm:flex-none"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Planilha
            </button>
          </div>
        </div>
      </div>

      <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          {linhas.length} {linhas.length === 1 ? "animal" : "animais"}
        </span>
        {" · "}
        {nomeDaEscolha(escolha, breeds)}
        {semMae > 0 && ` · ${semMae} sem mãe informada`}
        {semNascimento > 0 && ` · ${semNascimento} sem data de nascimento`}
      </p>

      {linhas.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
          {busca.trim() ? "Nenhum animal com essa busca." : "Nenhum animal nesta escolha."}
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <th className="py-2 pl-3 pr-2 font-semibold">Nº</th>
                <th className="py-2 px-2 font-semibold">Mãe</th>
                <th className="py-2 px-2 font-semibold">Nascimento</th>
                <th className="py-2 pl-2 pr-3 font-semibold">Raça</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {linhas.map((l) => (
                <tr
                  key={l.id}
                  onClick={onAbrir ? () => onAbrir(l.id) : undefined}
                  className={cn(
                    onAbrir && "cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/60",
                    !l.ativo && "text-slate-400 dark:text-slate-500"
                  )}
                >
                  <td className="py-2 pl-3 pr-2 align-top">
                    <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">
                      {l.tag}
                    </span>
                    {l.tagAntigo && (
                      <span className="block text-[10px] text-slate-400">nº antigo {l.tagAntigo}</span>
                    )}
                    {!l.ativo && (
                      <span className="block text-[10px] font-semibold uppercase text-rose-500">saiu</span>
                    )}
                  </td>
                  <td className="py-2 px-2 align-top tabular-nums">
                    {l.mae ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="py-2 px-2 align-top tabular-nums whitespace-nowrap">
                    {l.nascimento ? (
                      formatDate(l.nascimento)
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2 pl-2 pr-3 align-top">
                    {l.raca ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    {mostrarTipo && (
                      <span className="block text-[10px] text-slate-400">
                        {SPECIES_META[l.species].label}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
        <span>
          A mãe é a vaca do parto lançado no sistema; no gado PO, quando não há parto, vale a mãe
          escrita na ficha. O relatório segue o tipo e a raça escolhidos no menu. Toque num animal
          para abrir a ficha dele.
        </span>
      </p>
    </div>
  );
}

interface PrintProps {
  animals: AnimalWithInfo[];
  filiacao: Filiacao[];
  breeds: AnimalBreed[];
  tipo: string | null;
  raca: string | null;
  situacao: Situacao;
  ordem: Ordem;
  busca: string;
}

/** A folha impressa do relatório — os mesmos filtros da tela, vindos pela URL. */
export function RelatorioRebanhoPrint({
  animals,
  filiacao,
  breeds,
  tipo,
  raca,
  situacao,
  ordem,
  busca,
}: PrintProps) {
  const escolha: EscolhaRaca = {
    species: tipo && tipo in SPECIES_META ? (tipo as AnimalSpecies) : "todos",
    breedId: raca || null,
  };
  const daEscolha = animals.filter((a) => animalNaEscolha(a, escolha));
  const linhas = montarLinhas(daEscolha, animals, filiacao, situacao, busca, ordem);
  const mostrarTipo = escolha.species === "todos" && new Set(linhas.map((l) => l.species)).size > 1;

  const filtro = [
    nomeDaEscolha(escolha, breeds),
    situacao === "todos" ? "inclusive quem saiu" : null,
    busca.trim() ? `busca “${busca.trim()}”` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    document.title = "Relatório do rebanho";
  }, []);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          @page { size: A4 portrait; margin: 10mm; }
          .doc { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #0f172a; }
        .doc { background: white; }
        table { border-collapse: collapse; }
      `}</style>

      <div
        className="no-print fixed top-0 inset-x-0 z-50 bg-produmar-700 text-white flex items-center justify-between px-6 pb-3 shadow-lg"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <span className="font-semibold text-sm">Relatório do rebanho</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.close();
            }}
            className="text-sm opacity-80 hover:opacity-100 transition-opacity"
          >
            ← Voltar
          </button>
          <button
            onClick={() => window.print()}
            className="bg-white text-produmar-700 font-semibold text-sm px-4 py-1.5 rounded-lg shadow hover:bg-produmar-50 transition-colors"
          >
            🖨 Imprimir / Salvar PDF
          </button>
        </div>
      </div>
      <div className="no-print" style={{ height: "calc(3.5rem + env(safe-area-inset-top))" }} />

      <div className="doc max-w-[794px] mx-auto my-6 shadow-xl text-[12px] leading-relaxed text-slate-800">
        <div className="p-6 space-y-3">
          <div className="flex items-start justify-between border-b-2 border-produmar-600 pb-3">
            <div>
              <h1 className="text-[22px] font-black text-produmar-700 tracking-tight leading-none">
                PRODUMAR
              </h1>
              <p className="text-[10px] text-slate-500 mt-1">Controle de rebanho</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                Relatório do rebanho
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {linhas.length} {linhas.length === 1 ? "animal" : "animais"} · {filtro}
              </p>
              <p className="text-[11px] text-slate-500">{formatDate(new Date())}</p>
            </div>
          </div>

          {linhas.length === 0 ? (
            <p className="text-[12px] text-slate-500 py-6 text-center">Nenhum animal para listar.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="py-1.5 px-2 font-semibold border border-slate-200">Nº do animal</th>
                  <th className="py-1.5 px-2 font-semibold border border-slate-200">Nº da mãe</th>
                  <th className="py-1.5 px-2 font-semibold border border-slate-200">Nascimento</th>
                  <th className="py-1.5 px-2 font-semibold border border-slate-200">Raça</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td className="py-1.5 px-2 border border-slate-200 font-bold">
                      {l.tag}
                      {l.tagAntigo && (
                        <span className="font-normal text-[10px] text-slate-500"> (antigo {l.tagAntigo})</span>
                      )}
                      {!l.ativo && <span className="font-normal text-[10px] text-slate-500"> · saiu</span>}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-200">{l.mae ?? "—"}</td>
                    <td className="py-1.5 px-2 border border-slate-200 tabular-nums whitespace-nowrap">
                      {l.nascimento ? formatDate(l.nascimento) : "—"}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-200">
                      {l.raca ?? "—"}
                      {mostrarTipo && (
                        <span className="text-[10px] text-slate-500"> · {SPECIES_META[l.species].label}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="text-[10px] text-slate-500 pt-1">
            Mãe = a vaca do parto lançado no sistema; no gado PO, quando não há parto, a mãe escrita
            na ficha.
          </p>
        </div>
      </div>
    </>
  );
}
