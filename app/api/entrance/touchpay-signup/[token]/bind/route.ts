import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIGNUP_DEVICE_COOKIE, bindTouchpaySignupToken, claimFailureMessage } from "@/lib/touchpay-signup-token";

// POST /api/entrance/touchpay-signup/[token]/bind  body: { email }
// QRを開いたブラウザでメールを入力したとき。ログインリンク（別ブラウザで開かれうる）から
// 戻ってきた人を、このメールで照合できるようにする。この後 send-magic-link を呼ぶ。
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { email } = await req.json().catch(() => ({})) as { email?: string };
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "メールアドレスを入力してください" }, { status: 400 });
  }

  const deviceKey = (await cookies()).get(SIGNUP_DEVICE_COOKIE)?.value ?? null;
  const result = await bindTouchpaySignupToken(createAdminClient(), token, email, deviceKey);
  if (!result.ok) {
    return NextResponse.json({ error: claimFailureMessage(result.reason), reason: result.reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
