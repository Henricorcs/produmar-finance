import Link from "next/link";
import { Eye, X } from "lucide-react";

/**
 * A FAIXA DA VISUALIZAÇÃO — "você está vendo a tela de fulano".
 *
 * O admin abre a tela do operador ou do técnico para conferir se está tudo
 * certo antes de ligar para a pessoa. É SÓ LEITURA: o conteúdo abaixo desta
 * faixa não aceita toque, para ninguém iniciar ou finalizar serviço no lugar de
 * quem está na rua.
 *
 * (Mesmo se aceitasse, não adiantaria: iniciar e finalizar só mexem na OS que
 * foi enviada para o próprio usuário logado — a trava de verdade está no
 * servidor. Esta faixa é para não confundir quem está olhando.)
 */
export function PreviewBanner({ nome, tela }: { nome: string; tela: string }) {
  return (
    <div className="mb-4 rounded-xl border-2 border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <Eye className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Você está vendo {tela} de {nome}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            É só para conferir: nada aqui pode ser tocado.
          </p>
        </div>
      </div>
      <Link
        href="/configuracoes"
        className="flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:opacity-80 flex-shrink-0"
      >
        <X className="w-4 h-4" />
        Sair
      </Link>
    </div>
  );
}
