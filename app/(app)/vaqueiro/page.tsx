import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VaqueiroClient } from "@/components/vaqueiro/vaqueiro-client";
import type { ProtocoloNascimentoItem, ProtocoloPendencia } from "@/lib/types";

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
  // O protocolo do nascimento que o dono montou (migration 095). Vem dentro da
  // própria página: a cópia que o celular guarda para abrir sem rede leva a
  // lista junto, e o vaqueiro vê o que aplicar mesmo no mato. Sem a migration a
  // consulta falha e a tela segue como era, sem protocolo.
  const supabase = createClient();
  const [{ data: protocolo }, { data: pendencias }] = await Promise.all([
    supabase
      .from("animal_protocolo_nascimento")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    // O que ELE deixou de aplicar no nascimento e ainda não deu baixa
    // (migration 138 — sem ela a consulta falha e a lista vem vazia).
    supabase
      .from("animal_protocolo_pendencias")
      .select("*")
      .eq("created_by", profile.id)
      .is("applied_at", null)
      .order("birth_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  return (
    <VaqueiroClient
      podeOffline={profile.role === "vaqueiro"}
      protocolo={(protocolo as ProtocoloNascimentoItem[] | null) ?? []}
      pendencias={(pendencias as ProtocoloPendencia[] | null) ?? []}
    />
  );
}
