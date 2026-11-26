"use client";

import { useState } from "react";
import { CheckCircle2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * COMPARTILHAR UM ARQUIVO E DIZER QUE DEU CERTO.
 *
 * Depois que o menu do celular (WhatsApp, e-mail, Arquivos) fechava, a tela
 * ficava igualzinha — e não dava para saber se o documento tinha ido. Agora,
 * quando o compartilhamento termina, aparece "Documento compartilhado" com a
 * pergunta "Deseja compartilhar novamente?".
 *
 * Só aparece quando foi mesmo compartilhado: se a pessoa fechou o menu sem
 * escolher nada, o aparelho avisa que cancelou e a tela segue como estava.
 *
 * O "Compartilhar novamente" chama o menu dentro do próprio toque — o iPhone
 * só deixa compartilhar arquivo assim.
 */
export function useCompartilharArquivo() {
  const [compartilhado, setCompartilhado] = useState<File | null>(null);

  async function compartilhar(arquivo: File) {
    try {
      await navigator.share({ files: [arquivo], title: arquivo.name });
      setCompartilhado(arquivo);
    } catch {
      // cancelou o menu, ou o aparelho recusou: nada foi mandado, nada a avisar
    }
  }

  const aviso = (
    <Dialog open={!!compartilhado} onOpenChange={(v) => !v && setCompartilhado(null)}>
      <DialogContent className="font-sans max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Documento compartilhado
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {compartilhado?.name ? (
            <>
              <strong className="break-all">{compartilhado.name}</strong> foi compartilhado.{" "}
            </>
          ) : null}
          Deseja compartilhar novamente?
        </p>
        <div className="space-y-2 pt-1">
          <Button
            type="button"
            className="w-full h-12 text-base"
            onClick={() => {
              const f = compartilhado;
              setCompartilhado(null);
              if (f) void compartilhar(f);
            }}
          >
            <Share2 className="w-4 h-4" />
            Compartilhar novamente
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={() => setCompartilhado(null)}
          >
            Não, pronto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { compartilhar, aviso };
}
