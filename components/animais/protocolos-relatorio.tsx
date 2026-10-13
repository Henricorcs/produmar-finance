"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, Search } from "lucide-react";
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
import { formatDate, localDateISO } from "@/lib/utils";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER, formatMl } from "./animal-shared";
import { Chip, diaLabel } from "./protocolos-cadastro";
import type { EtapaFeita } from "./protocolos-tab";
import type { AnimalProtocolo, AnimalProtocoloAplicacao, AnimalWithInfo } from "@/lib/types";

/** "9,1 ML" → 9.1 (a dose fica gravada como texto na ficha). */
function mlDe(dose: string | null): number {
  if (!dose) return 0;
  const n = parseFloat(dose.replace(/[^\d,.-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateISO(d);
}

/** Um animal numa etapa: o nº, o dia em que tomou e as doses de cada remédio. */
interface Linha {
  key: string;
  animalId: string;
  tag: string;
  data: string;
  dia: number;
  doses: { medicine: string; dose: string | null }[];
}

interface Grupo {
  /** Chave do protocolo (id do modelo, ou o nome quando o modelo foi apagado). */
  key: string;
  nome: string;
  linhas: Linha[];
  animais: number;
  totais: { medicine: string; ml: number; doses: number }[];
}

/**
 * RELATÓRIO DOS APLICADOS — quem tomou cada protocolo, em que dia e quanto.
 * Sai das doses que estão na ficha de cada animal (as que vieram do
 * protocolo), filtrado por protocolo, período e nº do animal. Imprime.
 */
export function RelatorioProtocolosDialog({
  open,
  onClose,
  protocolos,
  aplicacoes,
  etapasFeitas,
  animals,
}: {
  open: boolean;
  onClose: () => void;
  protocolos: AnimalProtocolo[];
  aplicacoes: AnimalProtocoloAplicacao[];
  etapasFeitas: EtapaFeita[];
  animals: AnimalWithInfo[];
}) {
  const [protocoloKey, setProtocoloKey] = useState("todos");
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(localDateISO());
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!open) return;
    setProtocoloKey("todos");
    setDe(diasAtras(30));
    setAte(localDateISO());
    setBusca("");
  }, [open]);

  const animalById = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);
  const apById = useMemo(() => new Map(aplicacoes.map((a) => [a.id, a])), [aplicacoes]);

  /** Todas as linhas (animal × etapa), já com o protocolo de cada uma. */
  const todas = useMemo(() => {
    const m = new Map<string, Linha & { protoKey: string; protoNome: string }>();
    for (const f of etapasFeitas) {
      const ap = apById.get(f.protocolo_aplicacao_id);
      const key = `${f.protocolo_aplicacao_id}|${f.protocolo_dia}|${f.animal_id}`;
      let l = m.get(key);
      if (!l) {
        l = {
          key,
          animalId: f.animal_id,
          tag: animalById.get(f.animal_id)?.tag ?? "?",
          data: f.applied_at,
          dia: f.protocolo_dia,
          doses: [],
          protoKey: ap?.protocolo_id ?? `nome:${ap?.name ?? "?"}`,
          protoNome: ap?.name ?? "PROTOCOLO",
        };
        m.set(key, l);
      }
      l.doses.push({ medicine: f.medicine ?? "?", dose: f.dose });
    }
    return Array.from(m.values());
  }, [etapasFeitas, apById, animalById]);

  /** Os protocolos que aparecem nos chips: os cadastrados + os que só existem no histórico. */
  const opcoes = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of protocolos) m.set(p.id, p.name);
    for (const l of todas) if (!m.has(l.protoKey)) m.set(l.protoKey, l.protoNome);
    return Array.from(m.entries()).map(([key, nome]) => ({ key, nome }));
  }, [protocolos, todas]);

  const grupos = useMemo(() => {
    const q = busca.trim().toUpperCase();
    const filtradas = todas.filter(
      (l) =>
        (protocoloKey === "todos" || l.protoKey === protocoloKey) &&
        (!de || l.data >= de) &&
        (!ate || l.data <= ate) &&
        (!q || l.tag.toUpperCase().includes(q))
    );
    const porProto = new Map<string, Grupo>();
    for (const l of filtradas) {
      let g = porProto.get(l.protoKey);
      if (!g) {
        g = { key: l.protoKey, nome: l.protoNome, linhas: [], animais: 0, totais: [] };
        porProto.set(l.protoKey, g);
      }
      g.linhas.push(l);
    }
    const out = Array.from(porProto.values());
    for (const g of out) {
      g.linhas.sort(
        (a, b) =>
          b.data.localeCompare(a.data) || a.tag.localeCompare(b.tag, "pt-BR", { numeric: true })
      );
      g.animais = new Set(g.linhas.map((l) => l.animalId)).size;
      const t = new Map<string, { ml: number; doses: number }>();
      for (const l of g.linhas)
        for (const d of l.doses) {
          const x = t.get(d.medicine) ?? { ml: 0, doses: 0 };
          x.ml += mlDe(d.dose);
          x.doses += 1;
          t.set(d.medicine, x);
        }
      g.totais = Array.from(t.entries()).map(([medicine, x]) => ({ medicine, ...x }));
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [todas, protocoloKey, de, ate, busca]);

  const totalAnimais = new Set(grupos.flatMap((g) => g.linhas.map((l) => l.animalId))).size;
  const totalLinhas = grupos.reduce((s, g) => s + g.linhas.length, 0);
  const periodo = `${de ? formatDate(de) : "início"} a ${ate ? formatDate(ate) : "hoje"}`;

  function imprimir() {
    const esc = (s: string) =>
      s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const blocos = grupos
      .map((g) => {
        const rows = g.linhas
          .map(
            (l) =>
              `<tr><td><b>${esc(l.tag)}</b></td><td>${esc(formatDate(l.data))}</td><td>${esc(
                diaLabel(l.dia)
              )}</td><td>${l.doses
                .map((d) => `${esc(d.medicine)} <b>${esc(d.dose ?? "—")}</b>`)
                .join("<br>")}</td></tr>`
          )
          .join("");
        const totais = g.totais
          .map((t) => `${esc(t.medicine)}: <b>${esc(formatMl(Math.round(t.ml * 10) / 10))}</b> (${t.doses} doses)`)
          .join(" · ");
        return `<h2>${esc(g.nome)}</h2><p>${g.animais} animais · ${totais}</p><table><thead><tr><th>Nº</th><th>Data</th><th>Etapa</th><th>Doses</th></tr></thead><tbody>${rows}</tbody></table>`;
      })
      .join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Protocolos aplicados</title><style>
      body{font-family:system-ui,sans-serif;margin:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px} p{margin:0 0 10px;color:#555;font-size:13px}
      h2{font-size:15px;margin:22px 0 4px;page-break-after:avoid}
      table{border-collapse:collapse;width:100%;max-width:640px;font-size:13px}
      th,td{border:1px solid #bbb;padding:5px 8px;text-align:left;vertical-align:top}
      th{background:#f1f5f9} tr{page-break-inside:avoid}
      </style></head><body><h1>Protocolos aplicados</h1><p>${esc(periodo)} · ${totalAnimais} animais</p>${
        blocos || "<p>Nada aplicado no período.</p>"
      }<script>window.onload=()=>window.print()</script></body></html>`
    );
    w.document.close();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Relatório dos aplicados</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Protocolo</Label>
            <div className="grid grid-cols-2 gap-1.5">
              <Chip active={protocoloKey === "todos"} onClick={() => setProtocoloKey("todos")}>
                Todos
              </Chip>
              {opcoes.map((o) => (
                <Chip
                  key={o.key}
                  active={protocoloKey === o.key}
                  onClick={() => setProtocoloKey(o.key)}
                  className="truncate"
                >
                  {o.nome}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Período</Label>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ["30 dias", diasAtras(30)],
                  ["90 dias", diasAtras(90)],
                  ["Tudo", ""],
                ] as const
              ).map(([l, d]) => (
                <Chip
                  key={l}
                  active={de === d && ate === localDateISO()}
                  onClick={() => {
                    setDe(d);
                    setAte(localDateISO());
                  }}
                  className="text-[12px]"
                >
                  {l}
                </Chip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Input
                type="date"
                value={de}
                onChange={(e) => setDe(e.target.value)}
                aria-label="De"
                className="h-10"
              />
              <Input
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
                aria-label="Até"
                className="h-10"
              />
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 z-[1]" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nº do animal"
              className="h-10 pl-8"
              inputMode="search"
            />
          </div>

          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            {periodo} ·{" "}
            <strong className="text-slate-800 dark:text-slate-100">
              {totalAnimais} {totalAnimais === 1 ? "animal" : "animais"}
            </strong>{" "}
            · {totalLinhas} {totalLinhas === 1 ? "aplicação" : "aplicações"}
          </p>

          {grupos.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              Nada aplicado {busca ? "nesse animal " : ""}no período.
            </p>
          ) : (
            <div className="space-y-4">
              {grupos.map((g) => (
                <section key={g.key} className="space-y-1.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {g.nome}{" "}
                      <span className="text-[12px] font-normal text-slate-500">
                        · {g.animais} {g.animais === 1 ? "animal" : "animais"}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {g.totais.map((t, i) => (
                        <span key={t.medicine}>
                          {i > 0 && " · "}
                          {t.medicine}:{" "}
                          <strong className="text-produmar-700 dark:text-produmar-300">
                            {formatMl(Math.round(t.ml * 10) / 10)}
                          </strong>
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-500 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5">Nº</th>
                          <th className="text-left px-2 py-1.5">Data</th>
                          <th className="text-left px-2 py-1.5">Doses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.linhas.map((l) => (
                          <tr key={l.key} className="border-t border-slate-100 dark:border-slate-800 align-top">
                            <td className="px-2 py-1.5 font-bold tabular-nums">{l.tag}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <span className="tabular-nums">{formatDate(l.data)}</span>
                              <span className="block text-[10px] text-slate-400">{diaLabel(l.dia)}</span>
                            </td>
                            <td className="px-2 py-1.5 text-[12px] text-slate-600 dark:text-slate-300">
                              {l.doses.map((d, i) => (
                                <span key={i} className="block">
                                  {d.medicine}{" "}
                                  <strong className="tabular-nums text-produmar-700 dark:text-produmar-300">
                                    {d.dose ?? "—"}
                                  </strong>
                                </span>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            <Button type="button" variant="outline" onClick={onClose} className={FOOTER_CANCEL}>
              Fechar
            </Button>
            <Button
              type="button"
              onClick={imprimir}
              disabled={grupos.length === 0}
              className={FOOTER_SUBMIT}
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
