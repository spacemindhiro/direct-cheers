import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. 【最優先】ホワイトリスト（ログイン不要でアクセスできるパス）
  // /demo 配下や、そこから叩かれる /api/demo/pay を完全に「聖域化」します
  const isPublicPath = 
    path === "/" ||
    path === "/law" ||
    path === "/terms" ||
    path === "/privacy" ||
    path.startsWith("/demo") ||      // ページ遷移用
    path.startsWith("/api/demo") ||  // 決済API用
    path.startsWith("/concept") ||
    path.startsWith("/login") ||
    path.startsWith("/auth");

  // 公開パスであれば、Supabaseの初期化やUser判定を待たずに即座にスルー
  // これにより Safari がセッションを見失っていても API は叩けます
  if (isPublicPath) {
    return NextResponse.next({ request });
  }

  // 2. 認証が必要な領域（管理画面など）のためのレスポンス初期化
  let supabaseResponse = NextResponse.next({
    request,
  });

  // 環境変数のチェック（念のため）
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 3. セッション確認
  // getClaimsよりも getUser の方がセッション復旧能力が高いためこちらを採用
  const { data: { user } } = await supabase.auth.getUser();

  // 4. ログインしていない & 公開パスでもない場合はログインへ
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // 5. 認証済みレスポンスを返す（Cookie同期済み）
  return supabaseResponse;
}

// 適用範囲の設定
export const config = {
  matcher: [
    /*
     * 下記以外のすべてのパスにミドルウェアを適用:
     * - _next/static (静的ファイル)
     * - _next/image (画像最適化)
     * - favicon.ico (ファビコン)
     * - 公開画像ファイルなど
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};