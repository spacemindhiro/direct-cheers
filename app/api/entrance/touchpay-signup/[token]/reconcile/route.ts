import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { SIGNUP_DEVICE_COOKIE, claimFailureMessage, claimTouchpaySignupToken } from "@/lib/touchpay-signup-token";

// POST /api/entrance/touchpay-signup/[token]/reconcile
// ログイン済みユーザーが、タッチ決済のサインアップQRから直接（既にログイン済みの状態で）
// 訪れた場合に、その場で名寄せを行う。QRの合言葉は最初に開いたブラウザ専用・30日有効（lib/touchpay-signup-token.ts）。
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deviceKey = (await cookies()).get(SIGNUP_DEVICE_COOKIE)?.value ?? null;
  const result = await claimTouchpaySignupToken(createAdminClient(), token, user, deviceKey);
  if (!result.ok) {
    return NextResponse.json({ error: claimFailureMessage(result.reason), reason: result.reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true, ticket_id: result.ticketId, reconciled: result.reconciled });
}
