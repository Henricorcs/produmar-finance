import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { AgendaChacarasClient } from "@/components/chacaras/agenda-chacaras-client";
import type { Chacara, ChacaraReserva } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * AGENDA DAS CHÁCARAS — o calendário do mês de cada chácara, com os dias
 * reservados e pagos, e a lista das reservas com o recebido e o a receber.
 *
 * Carrega tudo do mês da tela em diante (são duas chácaras: cabe numa leva).
 * Assim a escolha de dias da reserva nova já sabe quem ocupa os meses que vêm.
 */
export default async function ChacarasPage({ searchParams }: { searchParams: { m?: string } }) {
  const supabase = createClient();

  const hoje = new Date();
  const mes =
    searchParams.m && /^\d{4}-\d{2}$/.test(searchParams.m)
      ? searchParams.m
      : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  const [chacarasRes, reservasRes, profile] = await Promise.all([
    supabase.from("chacaras").select("*").eq("ativa", true).order("ordem"),
    supabase
      .from("chacara_reservas")
      .select("*")
      .gte("data_fim", `${mes}-01`)
      .order("data_inicio"),
    getProfile(),
  ]);

  const role = profile?.role as string | undefined;
  const podeGravar =
    role === "admin" ||
    role === "financeiro" ||
    ((role === "operador" || role === "encarregado") &&
      (profile?.allowed_modules ?? []).includes("chacaras"));

  return (
    <AgendaChacarasClient
      chacaras={(chacarasRes.data as Chacara[]) ?? []}
      reservas={(reservasRes.data as ChacaraReserva[]) ?? []}
      mes={mes}
      podeGravar={podeGravar}
      migrationPendente={!!chacarasRes.error}
    />
  );
}
