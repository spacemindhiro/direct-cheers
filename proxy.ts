import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // API・静的ファイルは処理しない
  const isApiPath =
    path.startsWith("/api/") ||
    path.endsWith(".pdf") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path.endsWith(".svg");

  if (isApiPath) {
    return NextResponse.next({ request });
  }

  // ロケールプレフィックスを除いたパスを取得
  const segments = path.split("/");
  const maybeLocale = segments[1];
  const locales = ["ja", "en"];
  const normalizedPath = locales.includes(maybeLocale)
    ? "/" + segments.slice(2).join("/")
    : path;

  // パブリックパスの判定
  const isPublicPath =
    normalizedPath === "/" ||
    normalizedPath === "" ||
    normalizedPath === "/law" ||
    normalizedPath === "/terms" ||
    normalizedPath === "/privacy" ||
    normalizedPath === "/about" ||
    normalizedPath === "/safety" ||
    normalizedPath.startsWith("/demo") ||
    normalizedPath.startsWith("/concept") ||
    normalizedPath.startsWith("/auth") ||
    normalizedPath.startsWith("/invite") ||
    normalizedPath.startsWith("/join") ||
    normalizedPath.startsWith("/onboarding") ||
    normalizedPath.startsWith("/link-setup") ||
    path.startsWith("/account/"); // アカウント復旧・統合確認（ロケールなし）

  // /c/ と /entrance/ は [locale] の外にあるルート — intl middleware を通さない
  if (path.startsWith("/c/") || path.startsWith("/entrance/")) {
    return NextResponse.next({ request });
  }

  if (isPublicPath) {
    return intlMiddleware(request);
  }

  // 認証チェック
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return intlMiddleware(request);
  }

  const supabaseResponse = intlMiddleware(request);

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // ルーティング判定はセッションのローカル検証で十分（ネットワーク呼び出しなし）
  // 厳密なサーバー側検証は各ページのgetUser()が担う
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user) {
    // ロケールを保持してログインへリダイレクト
    const locale = locales.includes(maybeLocale) ? maybeLocale : "ja";
    const loginPath = locale === "ja" ? "/auth/login" : `/${locale}/auth/login`;
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    return NextResponse.redirect(url);
  }

  // supabaseResponse には intlMiddleware のロケール書き換えヘッダーが含まれている。
  // それを捨てると App Router が app/[locale]/dashboard を解決できず 404 になる。
  // x-middleware-request-* ヘッダーは Next.js がページリクエストヘッダーとして転送する
  // 規約なので、これで dashboard layout が x-pathname を読める。
  supabaseResponse.headers.set("x-middleware-request-x-pathname", path);
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
