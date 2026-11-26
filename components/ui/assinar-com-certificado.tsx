"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Download, Loader2, PenLine, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { assinarComCertificados, listarCertificados } from "@/app/(app)/configuracoes/certificados-actions";
import { carimboDoCertificado, linhaDoCertificado, nomeNoCarimbo } from "@/lib/certificado-na-folha";
import { VisualizarPdf } from "@/components/ui/visualizar-pdf";
import { useCompartilharArquivo } from "@/components/ui/aviso-compartilhado";
import type { CertificadoResumo, TipoDocumentoAssinavel } from "@/lib/types";

/**
 * ASSINAR COM CERTIFICADO A1 — o botão da barra da impressão.
 *
 * Só aparece para admin e com certificado guardado (Configurações). Escolhe
 * os certificados (já vêm marcados os de quem está nas linhas de assinatura),
 * o PDF é gerado com o carimbo "Assinado digitalmente" acima de cada linha,
 * o servidor assina e devolve. Depois disso o PDF ainda aceita a assinatura
 * gov.br da outra parte.
 */
export function AssinarComCertificado({
  assinaturas,
  gerar,
  testemunhas = true,
  documento,
  variante = "barra",
}: {
  /** O contrato/procuração: o PDF assinado fica guardado no lugar do que faltava assinar. */
  documento?: { tipo: TipoDocumentoAssinavel; id: string };
  assinaturas: { nome: string; detalhe?: string }[];
  /** Gera o PDF com os carimbos (um por lugar de assinatura, na ordem; depois as testemunhas). */
  gerar: (carimbos: (string[] | null)[]) => Promise<File>;
  /** O documento tem as duas testemunhas no fim (a procuração não tem). */
  testemunhas?: boolean;
  variante?: "barra" | "bloco";
}) {
  const [certs, setCerts] = useState<CertificadoResumo[] | null>(null);
  const [aberto, setAberto] = useState(false);
  /** Quem assina e ONDE: id do certificado → lugar na folha (-1 = só no arquivo, sem carimbo). */
  const [locais, setLocais] = useState<Map<string, number>>(new Map());
  const [assinando, setAssinando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<{ arquivo: File; url: string } | null>(null);
  /** O PDF assinado ficou guardado no sistema? (e, se não, por quê) */
  const [guardado, setGuardado] = useState(false);
  const [avisoGuardar, setAvisoGuardar] = useState<string | null>(null);
  // depois de compartilhar o PDF assinado, o aviso "Documento compartilhado"
  const { compartilhar, aviso: avisoCompartilhado } = useCompartilharArquivo();
  const router = useRouter();

  function fechar() {
    setAberto(false);
    // assinado e guardado: a página recarrega já mostrando "Assinado digitalmente"
    if (guardado) router.refresh();
  }

  /** Só admin assina com certificado — para os outros, o botão nem aparece. */
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    listarCertificados()
      .then((r) => {
        setAdmin(r.admin);
        setCerts(r.lista);
        if (r.erro) setErro(r.erro);
      })
      .catch(() => setCerts([]));
  }, []);

  useEffect(() => () => {
    if (pronto) URL.revokeObjectURL(pronto.url);
  }, [pronto]);

  // quem não é admin não assina por ninguém: o botão nem aparece
  if (!certs || !admin) return null;

  const vencido = (c: CertificadoResumo) => !!c.validoAte && new Date(c.validoAte) < new Date();

  /** Os lugares de assinatura da folha: as linhas das partes e, no contrato, as duas testemunhas. */
  const lugares = [
    ...assinaturas.map((a, i) => ({ i, rotulo: a.nome, sub: a.detalhe })),
    ...(testemunhas
      ? [
          { i: assinaturas.length, rotulo: "1ª testemunha", sub: undefined },
          { i: assinaturas.length + 1, rotulo: "2ª testemunha", sub: undefined },
        ]
      : []),
  ];

  /** O lugar que já vem marcado: a linha de quem é o certificado; senão, o primeiro livre. */
  function lugarSugerido(c: CertificadoResumo, ocupados: Set<number>): number {
    const proprio = linhaDoCertificado(assinaturas, c);
    if (proprio >= 0 && !ocupados.has(proprio)) return proprio;
    return lugares.find((l) => !ocupados.has(l.i))?.i ?? -1;
  }

  function abrir() {
    // marcados de saída: os certificados de quem está nas linhas de assinatura
    const novo = new Map<string, number>();
    for (const c of certs!) {
      const i = linhaDoCertificado(assinaturas, c);
      if (!vencido(c) && i >= 0 && ![...novo.values()].includes(i)) novo.set(c.id, i);
    }
    setLocais(novo);
    // o erro de leitura da lista (ex.: migration) fica à mostra; o da última assinatura, não
    if (certs!.length > 0) setErro(null);
    setPronto(null);
    setAberto(true);
  }

  function alternar(c: CertificadoResumo) {
    setLocais((m) => {
      const novo = new Map(m);
      if (novo.has(c.id)) novo.delete(c.id);
      else novo.set(c.id, lugarSugerido(c, new Set([...m.values()].filter((i) => i >= 0))));
      return novo;
    });
  }

  function escolherLugar(id: string, i: number) {
    setLocais((m) => new Map(m).set(id, i));
  }

  async function assinar() {
    const lista = certs!.filter((c) => locais.has(c.id));
    if (lista.length === 0) {
      setErro("Marque pelo menos um certificado");
      return;
    }
    setErro(null);
    setAssinando(true);
    try {
      const agora = new Date();
      const carimbos: (string[] | null)[] = lugares.map(() => null);
      for (const c of lista) {
        const i = locais.get(c.id) ?? -1;
        if (i >= 0 && !carimbos[i]) carimbos[i] = carimboDoCertificado(c, agora, assinaturas[i]?.nome);
      }
      const pdf = await gerar(carimbos);
      const r = await assinarComCertificados(
        paraBase64(await pdf.arrayBuffer()),
        lista.map((c) => c.id),
        documento && {
          ...documento,
          nomeArquivo: pdf.name,
          nomes: lista.map((c) => nomeNoCarimbo(c, assinaturas[locais.get(c.id) ?? -1]?.nome)),
        }
      );
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setAvisoGuardar(r.avisoGuardar ?? null);
      setGuardado(!!r.guardado);
      const arquivo = new File([deBase64(r.pdf)], pdf.name.replace(/\.pdf$/i, "") + "-assinado.pdf", {
        type: "application/pdf",
      });
      setPronto({ arquivo, url: URL.createObjectURL(arquivo) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível assinar");
    } finally {
      setAssinando(false);
    }
  }

  const podeCompartilhar =
    !!pronto &&
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [pronto.arquivo] });

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 transition-colors",
          variante === "barra"
            ? "bg-white text-produmar-700 font-semibold text-sm px-3 py-1.5 rounded-lg shadow hover:bg-produmar-50"
            : "w-full h-12 rounded-md border border-produmar-200 text-base font-medium text-produmar-700 hover:bg-produmar-50 dark:border-slate-700 dark:text-produmar-300"
        )}
      >
        <PenLine className="w-4 h-4" />
        Assinar
      </button>

      <Dialog open={aberto} onOpenChange={(v) => !v && !assinando && fechar()}>
        <DialogContent className={cn("font-sans max-h-[92vh] overflow-y-auto", pronto ? "max-w-2xl" : "max-w-md")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
              <BadgeCheck className="w-5 h-5 text-produmar-600" />
              {pronto ? "PDF assinado" : "Assinar com certificado"}
            </DialogTitle>
          </DialogHeader>

          {certs.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Nenhum certificado guardado ainda. Guarde os certificados A1 (arquivo .pfx e senha) em{" "}
                <strong>Configurações → Certificados digitais</strong> — depois é só voltar aqui e
                tocar em Assinar.
              </p>
              {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
              <a
                href="/configuracoes"
                className="flex items-center justify-center gap-2 w-full h-12 rounded-md bg-produmar-600 text-white font-medium hover:bg-produmar-700"
              >
                Ir para Configurações
              </a>
            </div>
          ) : pronto ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Confira o PDF assinado abaixo — o carimbo fica acima da linha de quem assinou. A
                outra parte ainda pode assinar este mesmo arquivo pelo gov.br.
              </p>
              <VisualizarPdf arquivo={pronto.arquivo} />
              {guardado && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  ✓ Guardado no sistema no lugar do que faltava assinar.
                </p>
              )}
              {avisoGuardar && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Assinado, mas não ficou guardado no sistema ({avisoGuardar}) — compartilhe agora
                  para não perder.
                </p>
              )}
              {podeCompartilhar ? (
                <Button
                  type="button"
                  className="w-full h-12"
                  onClick={() => void compartilhar(pronto.arquivo)}
                >
                  <Share2 className="w-4 h-4" />
                  Compartilhar PDF assinado
                </Button>
              ) : null}
              {avisoCompartilhado}
              {podeCompartilhar ? null : (
                <a
                  href={pronto.url}
                  download={pronto.arquivo.name}
                  className="flex items-center justify-center gap-2 w-full h-12 rounded-md bg-produmar-600 text-white font-medium hover:bg-produmar-700"
                >
                  <Download className="w-4 h-4" />
                  Baixar PDF assinado
                </a>
              )}
              <Button type="button" variant="outline" className="w-full h-11" onClick={fechar}>
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Toque em quem assina e escolha o lugar da assinatura na folha. O carimbo
                &quot;Assinado digitalmente&quot; sai acima da linha escolhida.
              </p>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {certs.map((c) => {
                  const venceu = vencido(c);
                  const marcado = locais.has(c.id);
                  const meu = locais.get(c.id);
                  // lugares já escolhidos por OUTRO certificado
                  const ocupados = new Set(
                    [...locais.entries()].filter(([id, i]) => id !== c.id && i >= 0).map(([, i]) => i)
                  );
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "rounded-xl border px-3 py-2.5",
                        venceu
                          ? "opacity-50 border-slate-200 dark:border-slate-700"
                          : marcado
                            ? "border-produmar-600 bg-produmar-50 dark:bg-produmar-900/20"
                            : "border-slate-200 dark:border-slate-700"
                      )}
                    >
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 w-4 h-4"
                          checked={marcado}
                          disabled={venceu || assinando}
                          onChange={() => alternar(c)}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {nomeNoCarimbo(c, assinaturas[linhaDoCertificado(assinaturas, c)]?.nome)}
                          </span>
                          {venceu && (
                            <span className="block text-[11px] text-red-600 dark:text-red-400">
                              Venceu em {new Date(c.validoAte!).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </span>
                      </label>

                      {marcado && (
                        <div className="mt-2 pl-7 space-y-1.5">
                          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            Onde assina?
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {[...lugares, { i: -1, rotulo: "Só no arquivo, sem carimbo", sub: undefined }].map((l) => {
                              const ocupado = ocupados.has(l.i);
                              return (
                                <button
                                  key={l.i}
                                  type="button"
                                  disabled={ocupado || assinando}
                                  onClick={() => escolherLugar(c.id, l.i)}
                                  className={cn(
                                    "text-left rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight max-w-full",
                                    meu === l.i
                                      ? "border-produmar-600 bg-produmar-600 text-white"
                                      : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200",
                                    ocupado && "opacity-40 line-through"
                                  )}
                                >
                                  <span className="block font-semibold">{l.rotulo}</span>
                                  {l.sub && (
                                    <span className={cn("block", meu === l.i ? "text-white/80" : "text-slate-500")}>
                                      {l.sub}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {erro && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                  {erro}
                </p>
              )}

              <Button type="button" className="w-full h-12" onClick={assinar} disabled={assinando}>
                {assinando ? (
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function paraBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function deBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
