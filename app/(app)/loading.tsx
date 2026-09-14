/**
 * A TELA DE CARREGAMENTO — o que aparece no instante do toque.
 *
 * Sem este arquivo, tocar num link não fazia NADA visível até o servidor montar
 * a tela seguinte inteira, com todas as consultas ao banco: o celular parecia
 * travado por meio segundo, um segundo — e quem toca de novo, achando que não
 * pegou, só piora. Toda tela do sistema é montada na hora (force-dynamic),
 * então todas pagavam isso.
 *
 * Com ele, a troca é imediata: o topo e a barra de navegação ficam, o miolo vira
 * este esqueleto, e os dados entram assim que chegam. De quebra, o Next passa a
 * adiantar a parte fixa da próxima tela antes do toque — sem um loading, ele
 * não adianta nada das telas dinâmicas.
 *
 * Só HTML e CSS: nenhum JavaScript a mais para o celular carregar.
 */
export default function Carregando() {
  return (
    <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Carregando">
      {/* título e subtítulo */}
      <div className="space-y-2">
        <div className="h-6 w-44 rounded-md bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-64 max-w-full rounded-md bg-slate-100 dark:bg-slate-800/60" />
      </div>

      {/* faixa de abas / filtros */}
      <div className="h-10 w-full rounded-lg bg-slate-100 dark:bg-slate-800/60" />

      {/* os cartões de resumo */}
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
        ))}
      </div>

      {/* a lista */}
      <div className="rounded-xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex-shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="h-3.5 w-3/5 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-2/5 rounded bg-slate-100 dark:bg-slate-800/60" />
            </div>
            <div className="h-4 w-16 rounded bg-slate-100 dark:bg-slate-800/60 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
