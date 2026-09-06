import { TesteTecladoClient } from "@/components/teste-teclado-client";

/**
 * TELA TEMPORÁRIA DE DIAGNÓSTICO — pode apagar depois.
 *
 * Existe para descobrir, no celular de verdade, ONDE a digitação trava:
 * no nosso código, no React, ou no diálogo. Cada campo aqui é uma variação
 * do que o app faz, e o registro embaixo mostra o que o teclado manda.
 */
export default function TesteTecladoPage() {
  return <TesteTecladoClient />;
}
