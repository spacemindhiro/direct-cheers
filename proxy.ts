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
    path.endsWith(".svg") ||
    path === "/manifest.json" || // 未ログイン時に/auth/loginへリダイレクトされ、PWAのmanifest取得が失敗するため除外
    path === "/sw.js";

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
    normalizedPath.startsWith("/display") || // 子機(PWA)起動時、未ログインでも/auth/loginへリダイレクトしない（認可は画面側で実施）
    path.startsWith("/account/"); // アカウント復旧・統合確認（ロケールなし）

  // /c/・/entrance/・/r/ は [locale] の外にあるルート — intl middleware を通さない
  // /r/ はNFCタップ（未ログイン前提）からのアクセスのため認証チェックも不可
  if (path.startsWith("/c/") || path.startsWith("/entrance/") || path.startsWith("/r/")) {
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
    // ロケールを保持してログインへリダイレクト。元のパス（クエリ含む）を
    // redirect パラメータとして渡す（login-form.tsx が読み取り、ログイン後に
    // 元の画面へ戻す）。これが無いとログイン後は常にデフォルトの /dashboard
    // に固定されてしまい、Stripeオンボーディング完了直後にセッション検証が
    // 一瞬すれ違った場合、connect-return 等の戻り先を見失う。
    const locale = locales.includes(maybeLocale) ? maybeLocale : "ja";
    const loginPath = locale === "ja" ? "/auth/login" : `/${locale}/auth/login`;
    const originalPath = `${path}${request.nextUrl.search}`;
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    url.search = `?redirect=${encodeURIComponent(originalPath)}`;
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
