"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, BadgeCheck, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apagarCertificado, enviarCertificado } from "@/app/(app)/configuracoes/certificados-actions";
import type { CertificadoResumo } from "@/lib/types";

function documentoFormatado(d: string | null): string {
  if (!d) return "";
  if (d.length === 11) return `CPF ${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

/**
 * CERTIFICADOS DIGITAIS A1 — os que assinam os contratos e procurações.
 *
 * Envia o .pfx com a senha; o servidor confere a senha, lê de quem é e guarda
 * os dois cifrados. O mesmo titular enviado de novo (certificado renovado)
 * troca o antigo. A senha não volta mais para a tela.
 */
export function CertificadosConfig({ iniciais, erroInicial }: { iniciais: CertificadoResumo[]; erroInicial?: string }) {
  const [lista, setLista] = useState(iniciais);
  const [erro, setErro] = useState<string | null>(erroInicial ?? null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  function enviar(formData: FormData) {
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const r = await enviarCertificado(formData);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setLista((l) =>
        [...l.filter((c) => c.id !== r.certificado.id && (!r.certificado.documento || c.documento !== r.certificado.documento)), r.certificado].sort(
          (a, b) => a.nome.localeCompare(b.nome)
        )
      );
      setAviso(`Certificado de ${r.certificado.nome} guardado.`);
      form.current?.reset();
    });
  }

  function apagar(c: CertificadoResumo) {
    if (!confirm(`Apagar o certificado de ${c.nome}? Para assinar com ele de novo, vai precisar enviar o arquivo e a senha outra vez.`)) return;
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const r = await apagarCertificado(c.id);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setLista((l) => l.filter((x) => x.id !== c.id));
    });
  }

  return (
    <div className="space-y-4">
      {lista.length > 0 ? (
        <div className="space-y-2">
          {lista.map((c) => {
            const venceu = !!c.validoAte && new Date(c.validoAte) < new Date();
            const venceLogo =
              !venceu && !!c.validoAte && new Date(c.validoAte).getTime() - Date.now() < 30 * 864e5;
            return (
              <div
                key={c.id}
                className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5"
              >
                <BadgeCheck className={`w-5 h-5 flex-shrink-0 mt-0.5 ${venceu ? "text-slate-300" : "text-emerald-500"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{c.nome}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {[documentoFormatado(c.documento), c.emissor].filter(Boolean).join(" · ")}
                  </p>
                  {c.validoAte && (
                    <p
                      className={`text-[11px] ${
                        venceu
                          ? "text-red-600 dark:text-red-400 font-semibold"
                          : venceLogo
                            ? "text-amber-600 dark:text-amber-400 font-semibold"
                            : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {venceu ? "Venceu em " : "Vale até "}
                      {new Date(c.validoAte).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => apagar(c)}
                  disabled={isPending}
                  aria-label={`Apagar certificado de ${c.nome}`}
                  className="p-2 text-slate-400 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nenhum certificado guardado ainda.
        </p>
      )}

      <form ref={form} action={enviar} className="space-y-2 rounded-xl border border-dashed border-produmar-200 dark:border-slate-700 p-3">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Guardar um certificado A1</p>
        <input
          type="file"
          name="arquivo"
          accept=".pfx,.p12,application/x-pkcs12"
          required
          className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-produmar-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-produmar-700"
        />
        <input
          type="password"
          name="senha"
          required
          autoComplete="off"
          placeholder="Senha do certificado"
          className="w-full h-11 sm:h-10 px-3 rounded-lg border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-produmar-500"
        />
        <Button type="submit" disabled={isPending} className="w-full h-11 sm:h-10">
          <Upload className="w-4 h-4" />
          {isPending ? "Conferindo..." : "Guardar certificado"}
        </Button>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          O arquivo (.pfx ou .p12) e a senha são guardados cifrados — ninguém consegue baixá-los
          de volta, nem ver a senha. Só administradores assinam com eles.
        </p>
      </form>

      {erro && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {erro}
        </p>
      )}
      {aviso && (
        <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-400">
          {aviso}
        </p>
      )}
    </div>
  );
}
