import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { VaqueiroClient } from "@/components/vaqueiro/vaqueiro-client";

export const dynamic = "force-dynamic";

export default async function VaqueiroPage() {
  // Perfil já carregado pelo layout nesta mesma requisição — vem do cache, sem
  // nova consulta e sem segurar as buscas da tela.
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Tela fechada: só o vaqueiro (e o admin, para conferir/testar).
  if (profile?.role !== "vaqueiro" && profile?.role !== "admin") redirect("/inicio");

  // A cópia da tela para abrir sem rede vai SÓ para o celular do vaqueiro. O
  // admin abre esta tela de vez em quando para conferir e anda pelo resto do
  // sistema no mesmo aparelho — guardar tela no dele é tela velha reaparecendo
  // onde ninguém pediu.
  return <VaqueiroClient podeOffline={profile.role === "vaqueiro"} />;
}
