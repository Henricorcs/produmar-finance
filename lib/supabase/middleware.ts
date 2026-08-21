import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isModuleBlocked, moduleSlugForPath } from "@/lib/module-access";
import { USER_ID_HEADER } from "@/lib/auth-header";

export async function updateSession(request: NextRequest) {
  // Cookies que o Supabase pediu para gravar (renovação de sessão). Ficam
  // guardados e entram em TODA resposta — inclusive nos redirecionamentos.
  // Antes o redirect saía sem eles e a sessão renovada se perdia, obrigando
  // uma nova renovação no request seguinte.
  const pendingCookies: {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }[] = [];

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
          pendingCookies.push(...cookiesToSet);
        }
      }
    }
  );

  // IMPORTANTE: getUser deve vir logo após criar o cliente.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Headers repassados ao render. Montados DEPOIS do getUser para levarem os
  // cookies já renovados. Apagamos o nosso header antes de escrever: o que o
  // cliente mandar com esse nome é descartado, só o middleware preenche.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(USER_ID_HEADER);
  if (user) requestHeaders.set(USER_ID_HEADER, user.id);

  const withCookies = <T extends NextResponse>(response: T): T => {
    pendingCookies.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options)
    );
    return response;
  };

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    return withCookies(NextResponse.redirect(url));
  };

  const path = request.nextUrl.pathname;
  const isPublicRoute =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path === "/";

  // Usuário não autenticado → login
  if (!user && !isPublicRoute) return redirectTo("/login");

  // Usuário autenticado acessando login → hub de módulos
  if (user && path.startsWith("/login")) return redirectTo("/inicio");

  // Roles com acesso restrito
  if (user) {
    const role = user.user_metadata?.role as string | undefined;

    if (role === "visualizador" && !path.startsWith("/visualizador") && !isPublicRoute) {
      return redirectTo("/visualizador");
    }

    // Vaqueiro: só a tela de nascimento de bezerro. Nada de hub, módulos ou
    // configurações — perfil fechado, sem exceção.
    if (role === "vaqueiro" && !path.startsWith("/vaqueiro") && !isPublicRoute) {
      return redirectTo("/vaqueiro");
    }

    // Técnico: só a tela de "usei este material". Ele avisa o que gastou na
    // obra; o saldo só cai quando o chefe dá baixa. Nada de hub nem módulos.
    if (role === "tecnico" && !path.startsWith("/tecnico") && !isPublicRoute) {
      return redirectTo("/tecnico");
    }

    // Operador: sempre acessa /operador e /imprimir (comprovantes). Se tiver
    // módulos liberados, também acessa o hub, as configurações e esses módulos.
    if (role === "operador" && !isPublicRoute) {
      const allowedModules = (user.user_metadata?.allowed_modules as string[] | undefined) ?? [];
      const hasModules = allowedModules.length > 0;
      const slug = moduleSlugForPath(path);
      const canAccess =
        path.startsWith("/operador") ||
        path.startsWith("/imprimir") ||
        (hasModules &&
          (path.startsWith("/inicio") ||
            path.startsWith("/configuracoes") ||
            (slug !== null && allowedModules.includes(slug))));

      if (!canAccess) return redirectTo(hasModules ? "/inicio" : "/operador");
    }

    // Módulos liberados por usuário — admin/operador/visualizador/vaqueiro/tecnico
    // não se aplicam (admin vê tudo; os outros já foram tratados acima).
    // Vazio = sem restrição.
    if (
      role !== "admin" &&
      role !== "operador" &&
      role !== "visualizador" &&
      role !== "vaqueiro" &&
      role !== "tecnico" &&
      !isPublicRoute
    ) {
      const allowedModules = user.user_metadata?.allowed_modules as string[] | undefined;
      if (isModuleBlocked(path, allowedModules)) return redirectTo("/inicio");
    }
  }

  return withCookies(NextResponse.next({ request: { headers: requestHeaders } }));
}
