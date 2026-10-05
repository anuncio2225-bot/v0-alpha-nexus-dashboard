import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  "/",
  "/auth/login",
  "/auth/callback",
  "/auth/error",
  "/api/webhook",
  "/api/webhooks",
  "/api/cron",
  "/api/meta/config",
];

// O que a atendente pode abrir (o resto redireciona para a Cobrança / 403).
const PAGINAS_ATENDENTE = [
  "/dashboard/collections",
  "/dashboard/attendants",
  "/dashboard/settings",
];
const APIS_ATENDENTE = [
  "/api/collections",
  "/api/attendants",
  "/api/push",
  "/api/team/me",
  "/api/profile",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  // Skip auth check for public routes to avoid unnecessary getUser() calls
  if (isPublicRoute(pathname)) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users from protected routes
  if (pathname.startsWith("/dashboard") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Atendente (membro vinculado a um atendente): só Cobrança, Atendentes e a
  // parte de notificações de Configurações. O resto é fechado aqui, no
  // servidor — esconder o menu não basta.
  if (user && (pathname.startsWith("/dashboard") || pathname.startsWith("/api/"))) {
    const liberadaPagina = PAGINAS_ATENDENTE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    const liberadaApi = APIS_ATENDENTE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!liberadaPagina && !liberadaApi) {
      const { data: vinculo } = await supabase
        .from("team_members")
        .select("scope_mode, attendant_src")
        .eq("member_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (vinculo?.scope_mode === "attendant" && vinculo.attendant_src) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Acesso restrito à Cobrança e Atendentes" }, { status: 403 });
        }
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard/collections";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
