import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarExtratoCora } from "@/lib/cora/sync-extrato";

/**
 * Porta de entrada pra um cron externo (EasyPanel ou outro) disparar a
 * sincronização do extrato Cora sem precisar de sessão de usuário.
 *
 * Mesmo esquema de segurança de app/api/backup/route.ts:
 *   · Sem CORA_SYNC_TOKEN definido, a rota não existe: responde 404.
 *   · Token precisa ter 32 caracteres ou mais.
 *   · Comparação em tempo constante, pra não vazar a senha por timing.
 *
 * GET /api/cora/sync-extrato   com header Authorization: Bearer <token>
 */

// Sem isto o Next congela o 404 desta rota no build (CORA_SYNC_TOKEN ainda
// não existe nesse momento) — mesma armadilha documentada em app/api/backup.
export const dynamic = "force-dynamic";

const TAMANHO_MINIMO_DO_TOKEN = 32;

function tokenConfigurado(): string | null {
  const t = process.env.CORA_SYNC_TOKEN;
  if (!t) return null;
  if (t.length < TAMANHO_MINIMO_DO_TOKEN) {
    console.warn(
      `[cora/sync-extrato] CORA_SYNC_TOKEN tem ${t.length} caracteres; o mínimo é ` +
        `${TAMANHO_MINIMO_DO_TOKEN}. A rota fica DESLIGADA até trocar.`
    );
    return null;
  }
  return t;
}

function senhaConfere(recebida: string, esperada: string): boolean {
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const token = tokenConfigurado();

  if (!token) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const cabecalho = request.headers.get("authorization") ?? "";
  const recebida = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";

  if (!senhaConfere(recebida, token)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const resultado = await sincronizarExtratoCora(createAdminClient());
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
