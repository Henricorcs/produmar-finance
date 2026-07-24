import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isModuleBlocked } from "@/lib/module-access";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // IMPORTANTE: getUser deve vir logo após criar o cliente.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicRoute =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path === "/";

  // Usuário não autenticado → login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Usuário autenticado acessando login → hub de módulos
  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/inicio";
    return NextResponse.redirect(url);
  }

  // Roles com acesso restrito
  if (user) {
    const role = user.user_metadata?.role as string | undefined;

    if (role === "visualizador" && !path.startsWith("/visualizador") && !isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/visualizador";
      return NextResponse.redirect(url);
    }

    // Operador: acessa apenas /operador e /imprimir (comprovantes)
    if (
      role === "operador" &&
      !path.startsWith("/operador") &&
      !path.startsWith("/imprimir") &&
      !isPublicRoute
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/operador";
      return NextResponse.redirect(url);
    }

    // Módulos liberados por usuário — admin/operador/visualizador não se aplicam
    // (admin vê tudo; os outros já foram tratados acima). Vazio = sem restrição.
    if (role !== "admin" && role !== "operador" && role !== "visualizador" && !isPublicRoute) {
      const allowedModules = user.user_metadata?.allowed_modules as string[] | undefined;
      if (isModuleBlocked(path, allowedModules)) {
        const url = request.nextUrl.clone();
        url.pathname = "/inicio";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
