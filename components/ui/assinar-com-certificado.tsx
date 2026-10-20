"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Download, Loader2, PenLine, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { assinarComCertificados, listarCertificados } from "@/app/(app)/configuracoes/certificados-actions";
import { carimboDoCertificado, linhaDoCertificado } from "@/lib/certificado-na-folha";
import type { CertificadoResumo } from "@/lib/types";

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
  variante = "barra",
}: {
  assinaturas: { nome: string; detalhe?: string }[];
  /** Gera o PDF com os carimbos (um por linha de assinatura, na ordem). */
  gerar: (carimbos: (string[] | null)[]) => Promise<File>;
  variante?: "barra" | "bloco";
}) {
  const [certs, setCerts] = useState<CertificadoResumo[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [assinando, setAssinando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<{ arquivo: File; url: string } | null>(null);

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

  function abrir() {
    // marcados de saída: os certificados de quem está nas linhas de assinatura
    setEscolhidos(
      new Set(certs!.filter((c) => !vencido(c) && linhaDoCertificado(assinaturas, c) >= 0).map((c) => c.id))
    );
    // o erro de leitura da lista (ex.: migration) fica à mostra; o da última assinatura, não
    if (certs!.length > 0) setErro(null);
    setPronto(null);
    setAberto(true);
  }

  function alternar(id: string) {
    setEscolhidos((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function assinar() {
    const lista = certs!.filter((c) => escolhidos.has(c.id));
    if (lista.length === 0) {
      setErro("Marque pelo menos um certificado");
      return;
    }
    setErro(null);
    setAssinando(true);
    try {
      const agora = new Date();
      const carimbos: (string[] | null)[] = assinaturas.map(() => null);
      for (const c of lista) {
        const i = linhaDoCertificado(assinaturas, c);
        if (i >= 0 && !carimbos[i]) carimbos[i] = carimboDoCertificado(c, agora);
      }
      const pdf = await gerar(carimbos);
      const r = await assinarComCertificados(
        paraBase64(await pdf.arrayBuffer()),
        lista.map((c) => c.id)
      );
      if ("error" in r) {
        setErro(r.error);
        return;
      }
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

      <Dialog open={aberto} onOpenChange={(v) => !v && !assinando && setAberto(false)}>
        <DialogContent className="max-w-md font-sans">
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
                Assinado com certificado ICP-Brasil. A outra parte ainda pode assinar este mesmo
                arquivo pelo gov.br.
              </p>
              {podeCompartilhar ? (
                <Button
                  type="button"
                  className="w-full h-12"
                  onClick={() =>
                    navigator.share({ files: [pronto.arquivo], title: pronto.arquivo.name }).catch(() => {})
                  }
                >
                  <Share2 className="w-4 h-4" />
                  Compartilhar PDF assinado
                </Button>
              ) : (
                <a
                  href={pronto.url}
                  download={pronto.arquivo.name}
                  className="flex items-center justify-center gap-2 w-full h-12 rounded-md bg-produmar-600 text-white font-medium hover:bg-produmar-700"
                >
                  <Download className="w-4 h-4" />
                  Baixar PDF assinado
                </a>
              )}
              <Button type="button" variant="outline" className="w-full h-11" onClick={() => setAberto(false)}>
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Marque quem assina. O carimbo &quot;Assinado digitalmente&quot; sai acima da linha de
                cada um.
              </p>
              <div className="space-y-2">
                {certs.map((c) => {
                  const i = linhaDoCertificado(assinaturas, c);
                  const venceu = vencido(c);
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border px-3 py-2.5",
                        venceu
                          ? "opacity-50 border-slate-200 dark:border-slate-700"
                          : escolhidos.has(c.id)
                            ? "border-produmar-600 bg-produmar-50 dark:bg-produmar-900/20"
                            : "border-slate-200 dark:border-slate-700"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 w-4 h-4"
                        checked={escolhidos.has(c.id)}
                        disabled={venceu || assinando}
                        onChange={() => alternar(c.id)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {c.nome}
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          {venceu
                            ? `Venceu em ${new Date(c.validoAte!).toLocaleDateString("pt-BR")}`
                            : i >= 0
                              ? `Assina na linha de ${assinaturas[i].nome}`
                              : "Não está nas linhas de assinatura — assina sem carimbo na folha"}
                        </span>
                      </span>
                    </label>
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
