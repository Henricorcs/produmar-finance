import { OperadorNav } from "@/components/operador/operador-nav";

/**
 * O painel de quem está na rua tem duas telas — a OS que mandaram para ele e o
 * material que ele levou para a obra — e a troca entre elas fica aqui em cima,
 * igual nas duas.
 */
export default function OperadorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OperadorNav />
      {children}
    </>
  );
}
