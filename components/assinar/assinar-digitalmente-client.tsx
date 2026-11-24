"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  ExternalLink,
  FileUp,
  Folder,
  FolderOpen,
  Loader2,
  MapPin,
  PenLine,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import { VisualizarPdf, paginasComoImagens } from "@/components/ui/visualizar-pdf";
import { cn } from "@/lib/utils";
import {
  apagarDoArquivo,
  assinarPdfAnexado,
  type ItemDoArquivo,
} from "@/app/(app)/configuracoes/certificados-actions";
import type { CertificadoResumo } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// ASSINAR DIGITALMENTE — qualquer PDF, e o arquivo de tudo que foi assinado
// ─────────────────────────────────────────────────────────────────────────────
// Anexa o PDF, ele aparece na tela; marca quem assina e TOCA na página no
// lugar da assinatura — ali sai o carimbo "Assinado digitalmente". Assinado,
// mostra o resultado para conferir e só então compartilha. Tudo fica no
// ARQUIVO, numa pasta por certificado (com os contratos de Aluguéis também).
// ─────────────────────────────────────────────────────────────────────────────

type Ponto = { pagina: number; x: number; y: number };

const ORIGEM: Record<string, string> = {
  avulso: "PDF anexado",
  aluguel: "Contrato de aluguel",
  compra_venda: "Compra e venda",
  procuracao: "Procuração",
  confissao_divida: "Confissão de dívida",
  anexo_mobilia: "Anexo de mobília",
};

function documentoFormatado(d: string | null): string {
  if (!d) return "";
  if (d.length === 11) return `CPF ${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

const quandoFoi = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  });

async function baixar(url: string, nome: string): Promise<File> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error("PDF não encontrado");
  return new File([await r.blob()], nome, { type: "application/pdf" });
}

export function AssinarDigitalmenteClient({
  certificados,
  itens,
  erro: erroInicial,
}: {
  certificados: CertificadoResumo[];
  itens: ItemDoArquivo[];
  erro?: string;
}) {
  return (
    <div className="space-y-6">
      {erroInicial && (
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400">
          {erroInicial}
        </p>
      )}
      <AssinarUmPdf certificados={certificados} />
      <Pastas certificados={certificados} itens={itens} />
    </div>
  );
}

// ── 1. Assinar um PDF ───────────────────────────────────────────────────────

function AssinarUmPdf({ certificados }: { certificados: CertificadoResumo[] }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [paginas, setPaginas] = useState<{ src: string; proporcao: number }[] | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  /** quem assina → onde (null = ainda sem lugar / sem carimbo) */
  const [escolhidos, setEscolhidos] = useState<Map<string, Ponto | null>>(new Map());
  /** o certificado que está esperando o toque na página */
  const [ativo, setAtivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ url: string; nome: string; aviso?: string } | null>(null);

  const validos = certificados.filter((c) => !c.validoAte || new Date(c.validoAte) >= new Date());
  const nomeDe = (id: string) => certificados.find((c) => c.id === id)?.nome ?? "";

  async function anexar(f: File | undefined) {
    if (!f) return;
    setErro(null);
    setResultado(null);
    setArquivo(f);
    setPaginas(null);
    setEscolhidos(new Map());
    setAtivo(null);
    setAbrindo(true);
    try {
      const largura = Math.min(caixa.current?.clientWidth || 700, 900);
      setPaginas(await paginasComoImagens(new Uint8Array(await f.arrayBuffer()), largura));
    } catch {
      setErro("Não foi possível abrir esse PDF — ele pode estar protegido por senha ou danificado.");
      setArquivo(null);
    } finally {
      setAbrindo(false);
    }
  }

  function alternar(id: string) {
    const novo = new Map(escolhidos);
    if (novo.has(id)) {
      novo.delete(id);
      if (ativo === id) setAtivo(null);
    } else {
      novo.set(id, null);
      setAtivo(id); // já pede o toque na página
    }
    setEscolhidos(novo);
  }

  function tocar(pagina: number, e: React.MouseEvent<HTMLDivElement>) {
    if (!ativo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ponto = { pagina, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    setEscolhidos((m) => new Map(m).set(ativo, ponto));
    // o próximo marcado que ainda não tem lugar passa a esperar o toque
    const proximo = [...escolhidos.entries()].find(([id, p]) => id !== ativo && p === null)?.[0] ?? null;
    setAtivo(proximo);
  }

  function assinar() {
    if (!arquivo) return;
    if (escolhidos.size === 0) {
      setErro("Marque pelo menos um certificado");
      return;
    }
    setErro(null);
    const ids = [...escolhidos.keys()];
    const carimbos = [...escolhidos.entries()]
      .filter(([, p]) => p)
      .map(([certId, p]) => ({ certId, ...(p as Ponto) }));
    const fd = new FormData();
    fd.set("arquivo", arquivo);
    fd.set("ids", JSON.stringify(ids));
    fd.set("carimbos", JSON.stringify(carimbos));
    startTransition(async () => {
      const r = await assinarPdfAnexado(fd);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setResultado(r);
      router.refresh(); // a pasta já mostra o novo
    });
  }

  function recomecar() {
    setArquivo(null);
    setPaginas(null);
    setEscolhidos(new Map());
    setAtivo(null);
    setResultado(null);
    setErro(null);
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <PenLine className="w-4 h-4 text-produmar-600" />
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Assinar um PDF</h2>
      </div>

      {certificados.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Nenhum certificado guardado ainda. Guarde os certificados A1 em{" "}
          <a href="/configuracoes" className="font-semibold underline">
            Configurações → Certificados digitais
          </a>
          .
        </p>
      ) : resultado ? (
        <Resultado resultado={resultado} onOutro={recomecar} />
      ) : (
        <>
          <input
            ref={entrada}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => anexar(e.target.files?.[0])}
          />
          {!arquivo ? (
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-produmar-200 dark:border-slate-600 py-10 text-produmar-700 dark:text-produmar-300 hover:bg-produmar-50 dark:hover:bg-slate-800"
            >
              <FileUp className="w-8 h-8" />
              <span className="text-sm font-semibold">Anexar o PDF para assinar</span>
              <span className="text-[11px] text-slate-500">até 9 MB</span>
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium text-slate-700 dark:text-slate-200">{arquivo.name}</span>
              <button type="button" onClick={recomecar} className="flex items-center gap-1 text-xs text-slate-500 underline">
                <RotateCcw className="w-3.5 h-3.5" />
                Trocar
              </button>
            </div>
          )}

          {arquivo && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Marque quem assina e toque na página no lugar da assinatura de cada um.
              </p>
              {validos.map((c) => {
                const marcado = escolhidos.has(c.id);
                const ponto = escolhidos.get(c.id);
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2",
                      marcado ? "border-produmar-600 bg-produmar-50 dark:bg-produmar-900/20" : "border-slate-200 dark:border-slate-700"
                    )}
                  >
                    <label className="flex items-center gap-2 min-w-0 flex-1">
                      <input type="checkbox" className="w-4 h-4" checked={marcado} onChange={() => alternar(c.id)} disabled={isPending} />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{c.nome}</span>
                    </label>
                    {marcado && (
                      <span className="flex items-center gap-2 text-[11px]">
                        {ativo === c.id ? (
                          <span className="font-semibold text-produmar-700 dark:text-produmar-300 animate-pulse">
                            ↓ Toque na página…
                          </span>
                        ) : ponto ? (
                          <span className="text-emerald-700 dark:text-emerald-400">✓ Página {ponto.pagina}</span>
                        ) : (
                          <span className="text-slate-500">Sem carimbo na folha</span>
                        )}
                        {ativo !== c.id && (
                          <button type="button" className="underline text-produmar-700 dark:text-produmar-300" onClick={() => setAtivo(c.id)}>
                            {ponto ? "Mudar lugar" : "Escolher lugar"}
                          </button>
                        )}
                        {(ponto || ativo === c.id) && (
                          <button
                            type="button"
                            className="underline text-slate-500"
                            onClick={() => {
                              setEscolhidos((m) => new Map(m).set(c.id, null));
                              if (ativo === c.id) setAtivo(null);
                            }}
                          >
                            Sem carimbo
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div ref={caixa}>
            {abrindo && (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Abrindo o PDF…
              </p>
            )}
            {paginas && (
              <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2 space-y-3 max-h-[75vh] overflow-y-auto">
                {paginas.map((p, i) => (
                  <div
                    key={i}
                    onClick={(e) => tocar(i + 1, e)}
                    className={cn("relative bg-white shadow select-none", ativo ? "cursor-crosshair ring-2 ring-produmar-400" : "")}
                    style={{ aspectRatio: `1 / ${p.proporcao}` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={`Página ${i + 1}`} className="absolute inset-0 w-full h-full" draggable={false} />
                    <span className="absolute top-1 right-2 text-[10px] text-slate-400">pág. {i + 1}</span>
                    {[...escolhidos.entries()]
                      .filter(([, pt]) => pt?.pagina === i + 1)
                      .map(([id, pt]) => (
                        <span
                          key={id}
                          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1 rounded bg-produmar-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap shadow"
                          style={{ left: `${pt!.x * 100}%`, top: `${pt!.y * 100}%` }}
                        >
                          <MapPin className="w-3 h-3" />
                          {nomeDe(id)}
                        </span>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}

          {arquivo && paginas && (
            <Button type="button" className="w-full h-12" onClick={assinar} disabled={isPending || escolhidos.size === 0}>
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Assinando…
                </>
              ) : (
                <>
                  <PenLine className="w-4 h-4" />
                  Assinar PDF
                </>
              )}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

/** Assinado: o PDF para conferir e, embaixo, o compartilhar. */
function Resultado({
  resultado,
  onOutro,
}: {
  resultado: { url: string; nome: string; aviso?: string };
  onOutro: () => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  useEffect(() => {
    baixar(resultado.url, resultado.nome).then(setArquivo).catch(() => setArquivo(null));
  }, [resultado]);

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
        <BadgeCheck className="w-4 h-4" />
        Assinado e guardado no arquivo. Confira abaixo antes de compartilhar.
      </p>
      {resultado.aviso && <p className="text-xs text-amber-700 dark:text-amber-400">{resultado.aviso}</p>}
      {arquivo ? (
        <VisualizarPdf arquivo={arquivo} />
      ) : (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Abrindo o PDF assinado…
        </p>
      )}
      <CompartilharPdf chave={resultado.url} gerar={() => baixar(resultado.url, resultado.nome)} />
      <Button type="button" variant="outline" className="w-full h-11" onClick={onOutro}>
        Assinar outro PDF
      </Button>
    </div>
  );
}

// ── 2. O arquivo: uma pasta por certificado ─────────────────────────────────

function Pastas({ certificados, itens }: { certificados: CertificadoResumo[]; itens: ItemDoArquivo[] }) {
  /** Pasta = CPF/CNPJ do certificado (não muda quando ele é renovado); sem ele, o nome. */
  const pastas = useMemo(() => {
    const mapa = new Map<string, { nome: string; documento: string | null; itens: ItemDoArquivo[] }>();
    for (const c of certificados) {
      mapa.set(c.documento || c.nome, { nome: c.nome, documento: c.documento, itens: [] });
    }
    for (const i of itens) {
      const chave = i.certificadoDocumento || i.certificadoNome;
      if (!mapa.has(chave)) mapa.set(chave, { nome: i.certificadoNome, documento: i.certificadoDocumento, itens: [] });
      mapa.get(chave)!.itens.push(i);
    }
    return [...mapa.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  }, [certificados, itens]);

  const [aberta, setAberta] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Folder className="w-4 h-4 text-produmar-600" />
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Documentos assinados</h2>
      </div>
      {pastas.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum documento assinado ainda.</p>
      ) : (
        <div className="space-y-2">
          {pastas.map(([chave, p]) => {
            const abre = aberta === chave;
            return (
              <div key={chave} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setAberta(abre ? null : chave)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                >
                  {abre ? (
                    <FolderOpen className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  ) : (
                    <Folder className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.nome}</span>
                    <span className="block text-[11px] text-slate-500">{documentoFormatado(p.documento)}</span>
                  </span>
                  <span className="text-xs font-semibold text-slate-500 tabular-nums">
                    {p.itens.length} {p.itens.length === 1 ? "documento" : "documentos"}
                  </span>
                </button>
                {abre && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {p.itens.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-slate-500">Nada assinado com este certificado ainda.</p>
                    ) : (
                      p.itens.map((i) => <ItemDaPasta key={i.id} item={i} />)
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ItemDaPasta({ item }: { item: ItemDoArquivo }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function apagar() {
    if (!confirm(`Tirar "${item.nome}" desta pasta? Isso não tem volta.`)) return;
    startTransition(async () => {
      const r = await apagarDoArquivo(item.id);
      if ("error" in r) setErro(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="px-3 py-2 border-b last:border-b-0 border-slate-100 dark:border-slate-800">
      <button type="button" onClick={() => setAberto((v) => !v)} className="w-full text-left">
        <span className="block text-sm text-slate-800 dark:text-slate-100 truncate">{item.nome}</span>
        <span className="block text-[11px] text-slate-500">
          {quandoFoi(item.assinadoEm)} · {ORIGEM[item.origem] ?? item.origem}
        </span>
      </button>
      {aberto && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-produmar-200 text-sm font-medium text-produmar-700 dark:border-slate-700 dark:text-produmar-300"
          >
            <ExternalLink className="w-4 h-4" />
            Ver
          </a>
          <div className="flex-1 min-w-[180px]">
            <CompartilharPdf chave={item.url} gerar={() => baixar(item.url, item.nome)} />
          </div>
          <button
            type="button"
            onClick={apagar}
            disabled={isPending}
            aria-label="Tirar da pasta"
            className="h-10 px-3 rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900/50 dark:text-red-400"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {erro && <p className="w-full text-xs text-red-600">{erro}</p>}
        </div>
      )}
    </div>
  );
}
