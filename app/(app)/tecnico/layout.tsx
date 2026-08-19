import { TecnicoNav } from "@/components/tecnico/tecnico-nav";

/**
 * O técnico tem duas telas — o material que gastou e os diaristas que vieram —
 * e a troca entre elas fica aqui em cima, igual nas duas.
 */
export default function TecnicoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TecnicoNav />
      {children}
    </>
  );
}
