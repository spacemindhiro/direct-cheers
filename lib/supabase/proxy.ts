import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

export async function updateSession(request: NextRequest) {
  // 1. 初期レスポンス作成（ここでの request 渡しが重要）
  let supabaseResponse = NextResponse.next({
    request,
  });

  if (!hasEnvVars) return supabaseResponse;

  // 2. Supabaseクライアント作成
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    },
  );

  // 3. ユーザー情報の取得（getClaims ではなく getUser の方が確実な場合があります）
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // --- 🕵️‍♂️ ホワイトリスト（ログイン不要で通すパス）の定義 ---
  const isPublicPath = 
    path === "/" ||
    path === "/law" ||
    path === "/terms" ||
    path === "/privacy" ||
    path.startsWith("/demo") || // これで /api/demo/pay も /demo/success もカバー
    path.startsWith("/concept") ||
    path.startsWith("/login") ||
    path.startsWith("/auth");

  // 4. 判定ロジック
  if (!user && !isPublicPath) {
    // ログインしていない、かつ公開ページでもない場合のみリダイレクト
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // 5. 【重要】全てのケースでこの supabaseResponse を返す
  // これにより、APIコール時も正しくCookie（セッション）が維持されます
  return supabaseResponse;
}