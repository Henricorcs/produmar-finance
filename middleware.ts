import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Ícones e manifest são públicos (o iOS/PWA busca sem sessão) — ficam de fora
  // da proteção de login, senão o "Adicionar à Tela de Início" não pega a logo.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|apple-icon|icon-192|icon-512|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
