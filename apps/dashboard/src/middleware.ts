import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase-env";

// API paths that must stay public (no authenticated session yet). The Supabase
// auth callback lives at /auth/callback (outside /api), so it is already public
// via the matcher; these prefixes cover any public routes nested under /api.
const PUBLIC_API_PREFIXES = ["/api/auth/callback"];

// "/dashboard" only exists as a [locale]-prefixed App Router page
// (e.g. /en/dashboard) — "/onboarding" is not locale-prefixed — so the
// auth check must strip a locale segment before matching, otherwise it
// never fires for the real dashboard routes.
const LOCALES = ["en", "ar", "hi", "ru"];

function stripLocale(path: string): string {
  const [, first, ...rest] = path.split("/");
  if (LOCALES.includes(first)) {
    return `/${rest.join("/")}`;
  }
  return path;
}

function isProtectedPath(path: string): boolean {
  const unprefixed = stripLocale(path);
  if (unprefixed.startsWith("/dashboard") || unprefixed.startsWith("/onboarding")) {
    return true;
  }
  if (path.startsWith("/api/")) {
    return !PUBLIC_API_PREFIXES.some((prefix) => path.startsWith(prefix));
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!isProtectedPath(path)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // supabase.auth.getUser() has no built-in timeout — if Supabase is slow,
  // unreachable, or misconfigured (e.g. a placeholder URL), every protected
  // request would otherwise hang until the underlying fetch gives up. Bound
  // it so a Supabase outage degrades to "redirect to login", not a hang.
  const user = await Promise.race([
    supabase.auth.getUser().then(({ data }) => data.user),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
  ]);

  if (!user) {
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding",
    "/(en|ar|hi|ru)/dashboard/:path*",
    "/api/:path*",
  ],
};
