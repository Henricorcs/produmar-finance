import { cn, splitBRL } from "@/lib/utils";

/**
 * DINHEIRO COM CENTAVOS SEM PERDER A LEITURA.
 *
 * Nos cards e nos números grandes, escrever o valor todo do mesmo tamanho
 * ("R$ 44.587,38") faz o olho tropeçar no centavo e ainda estoura a largura no
 * celular — foi por isso que esses lugares mostravam o valor arredondado.
 *
 * Aqui o centavo aparece sempre, só que menor e mais apagado: o número que
 * importa continua saltando aos olhos e o centavo fica lá, para quem for
 * conferir. É o mesmo jeito que o extrato do banco escreve.
 *
 * E o número CABE. Quanto mais longo o valor, um pouco menor ele fica — de
 * "R$ 44.587,38" para cima —, o suficiente para não vazar do card de 3 colunas
 * do celular (medido em tela de 390 px, que é o iPhone). Até "R$ 44.587,38"
 * nada muda: o tamanho é o do card.
 *
 * Em listas, diálogos e tooltips continue com `formatBRL` — lá o valor tem a
 * linha inteira e não precisa desse cuidado.
 */
export function Money({
  value,
  className,
  centsClassName,
}: {
  value: number;
  /** Classe extra no número todo. */
  className?: string;
  /** Classe extra só nos centavos (ex.: clarear mais sobre fundo colorido). */
  centsClassName?: string;
}) {
  const { reais, centavos } = splitBRL(value);

  // Encolhe pelo tamanho do texto, em "em" — assim vale para o card grande do
  // saldo e para o cardzinho de estoque com a mesma conta.
  const largura = reais.length + centavos.length + 1;
  const escala = largura > 11 ? Math.max(0.7, 11.5 / largura) : 1;

  return (
    <span
      className={cn("tabular-nums whitespace-nowrap", className)}
      style={escala < 1 ? { fontSize: `${escala.toFixed(3)}em` } : undefined}
    >
      {reais}
      {centavos && (
        <span className={cn("text-[0.62em] font-normal opacity-70", centsClassName)}>
          ,{centavos}
        </span>
      )}
    </span>
  );
}
