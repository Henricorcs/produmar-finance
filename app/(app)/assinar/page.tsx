import { getProfile } from "@/lib/auth";
import { AssinarDigitalmenteClient } from "@/components/assinar/assinar-digitalmente-client";
import { listarArquivoAssinado, listarCertificados } from "@/app/(app)/configuracoes/certificados-actions";

export const dynamic = "force-dynamic";

/**
 * ASSINAR DIGITALMENTE — anexar qualquer PDF, assinar com os certificados A1
 * guardados e compartilhar; embaixo, o arquivo de tudo que foi assinado, numa
 * pasta por certificado. Só para administradores: assinar com o certificado
 * de alguém é assinar por essa pessoa.
 */
export default async function AssinarPage() {
  const profile = await getProfile();
  const admin = profile?.role === "admin";

  const [certs, arquivo] = admin
    ? await Promise.all([listarCertificados(), listarArquivoAssinado()])
    : [null, null];

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Assinar digitalmente</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Anexe um PDF, assine com certificado e compartilhe — tudo fica guardado por certificado
        </p>
      </div>

      {!admin ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Só administradores assinam com certificado digital.
        </p>
      ) : (
        <AssinarDigitalmenteClient
          certificados={certs?.lista ?? []}
          itens={arquivo?.itens ?? []}
          erro={certs?.erro ?? arquivo?.erro}
        />
      )}
    </div>
  );
}
