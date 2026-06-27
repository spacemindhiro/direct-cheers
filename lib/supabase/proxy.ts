import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const STEP_UP_TTL_MS = 480 * 60 * 1000; // 480分

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 【ホワイトリスト】ログイン確認なしで通すパス
  const isPublicPath =
    path === "/" ||
    path === "/law" ||
    path === "/terms" ||
    path === "/privacy" ||
    path === "/about" ||
    path === "/safety" ||
    path.startsWith("/demo") ||
    path.startsWith("/api/pay") ||
    path.startsWith("/api/get-session") ||
    path.startsWith("/concept") ||
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/invite") ||
    path.startsWith("/join") ||
    path.endsWith(".pdf") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path.endsWith(".svg");

  if (isPublicPath) {
    return NextResponse.next({ request });
  }

  // --- 認証必須エリア ---

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // x-pathname を request headers にセット（server layout/page が現在パスを読める）
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", path);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => requestHeaders.set(name, value));
        supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  // 未認証 → ログインページへ（元のパスを redirect パラメータで保持）
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  // /admin/* はステップアップ認証（dc_stepup クッキー）が必須
  const isAdminPath =
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path === "/en/admin" ||
    path.startsWith("/en/admin/");

  if (isAdminPath) {
    const stepUpAt = request.cookies.get("dc_stepup")?.value;
    const isFresh = !!stepUpAt && Date.now() - parseInt(stepUpAt) < STEP_UP_TTL_MS;
    if (!isFresh) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/step-up";
      url.searchParams.set("redirect", path);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
