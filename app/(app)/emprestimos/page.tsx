import { redirect } from "next/navigation";

/**
 * O ENDEREÇO VELHO DA TELA. Ela era uma aba de Finanças (/emprestimos) e virou
 * módulo próprio, Devedores. Quem tem o link salvo no celular, o atalho na tela
 * inicial ou o costume de digitar o endereço cai aqui e é levado para o lugar
 * novo — em vez de bater numa página que não existe mais.
 */
export default function EmprestimosRedirect() {
  redirect("/devedores");
}
