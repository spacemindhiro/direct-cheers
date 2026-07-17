import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("scanner_qr_tokens")
    .select("action_link, expires_at")
    .eq("token", token)
    .single();

  if (error || !data) {
    return NextResponse.redirect(
      new URL("/auth/error?error=qr_invalid", process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com")
    );
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.redirect(
      new URL("/auth/error?error=otp_expired", process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com")
    );
  }

  // QRログインはstep-up相当として扱い、dc_stepupを同時発行する。
  // 根拠: このQRを生成できるのはstep-up認証済みスタッフのみ（/dashboard/scanner-qr は
  // step-up壁の内側）で、トークンは1時間期限かつaction_linkはSupabase側でワンタイム消費される。
  // これにより親機・子機などWebAuthnが使えない端末（CapacitorのWebView等）でも
  // チェックイン/タッチ決済画面へ到達できる。
  const res = NextResponse.redirect(data.action_link);
  res.cookies.set("dc_stepup", String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 480 * 60,
    path: "/",
  });
  return res;
}
