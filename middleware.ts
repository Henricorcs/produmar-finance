import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Ícones e manifest são públicos (o iOS/PWA busca sem sessão) — ficam de fora
  // da proteção de login, senão o "Adicionar à Tela de Início" não pega a logo.
  //
  // O sw.js sai junto, e por um motivo mais sério: o vaqueiro é mandado para
  // /vaqueiro venha ele de onde vier, e isso valia até para o pedido do sw.js.
  // O celular dele recebia a PÁGINA no lugar do script e recusava a instalação
  // — o aparelho que mais precisa abrir sem rede era o único que nunca ia
  // conseguir. Ele é arquivo estático de programa e não carrega dado nenhum.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|pdf.worker-|apple-icon|icon-192|icon-512|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
