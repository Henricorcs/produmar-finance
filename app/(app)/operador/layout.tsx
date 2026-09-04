import { getProfile } from "@/lib/auth";
import { OperadorNav } from "@/components/operador/operador-nav";
import { canAvisarMaterial } from "@/lib/module-access";

/**
 * O painel de quem está na rua. A OS que mandaram para ele está sempre aqui; a
 * aba do material que ele levou para a obra só aparece para quem recebeu a
 * permissão no cadastro — nem todo operador descarrega material.
 *
 * Sem a permissão nem existe barra de abas: a tela fica exatamente como era.
 */
export default async function OperadorLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  const podeMaterial = canAvisarMaterial(profile?.role, profile?.allowed_modules);

  return (
    <>
      {podeMaterial && <OperadorNav />}
      {children}
    </>
  );
}
