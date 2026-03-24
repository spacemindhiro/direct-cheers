import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  if (!hasEnvVars) return supabaseResponse;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    },
  );

  // --- 【最優先】ログインチェックを完全にバイパスするパス ---
  // APIや特定の公開ページは、user判定の前にスルーさせる
  if (
    request.nextUrl.pathname.startsWith('/api/demo/pay') ||
    request.nextUrl.pathname.startsWith('/demo/success') // もしあれば
  ) {
    return supabaseResponse;
  }

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // --- 制限エリアの判定 ---
  if (
    request.nextUrl.pathname !== "/" &&
    request.nextUrl.pathname !== "/law" &&
    request.nextUrl.pathname !== "/terms" &&
    request.nextUrl.pathname !== "/privacy" &&
    !request.nextUrl.pathname.startsWith("/demo") && 
    !request.nextUrl.pathname.startsWith("/concept") &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !user // 最後にuserチェック
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}