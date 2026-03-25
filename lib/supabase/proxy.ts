import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. 【デモ用・最強ホワイトリスト】
  // ここに含まれるパスは、ログインの有無を「確認すらしない」で即座に通します。
  // これにより Safari の Cookie 判定に左右されず /demo ページと決済APIが動きます。
  const isPublicPath = 
    path === "/" ||
    path === "/law" ||
    path === "/terms" ||
    path === "/privacy" ||
    path.startsWith("/demo") ||     // ページ遷移用
    path.startsWith("/api/pay") || // 決済API用
    path.startsWith("/concept") ||
    path.startsWith("/login") ||
    path.startsWith("/auth");

  // 🌟 ホワイトリスト対象なら、Supabaseの処理を一切せずに「放流」
  if (isPublicPath) {
    return NextResponse.next({ request });
  }

  // --- これ以降は「認証が必須なページ（管理画面など）」のみが通る ---

  let supabaseResponse = NextResponse.next({ request });

  // 環境変数チェック
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
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

  // セッション確認
  const { data: { user } } = await supabase.auth.getUser();

  // 認証必須エリアで user がいなければログインへ
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};