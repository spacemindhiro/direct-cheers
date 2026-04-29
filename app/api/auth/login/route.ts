import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function POST(req: Request) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  // setAll で受け取ったクッキーを手動でキャプチャし、
  // NextResponse に直接セットすることで確実に Set-Cookie に載せる
  const captured: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          // 既存クッキーはリクエストヘッダーから読む
          const raw = req.headers.get("cookie") ?? "";
          return raw.split(";").flatMap((part) => {
            const idx = part.indexOf("=");
            if (idx < 0) return [];
            return [{ name: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() }];
          });
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach((c) => captured.push(c));
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });

  // キャプチャしたセッションクッキーをレスポンスに明示的にセット
  captured.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });

  return response;
}
