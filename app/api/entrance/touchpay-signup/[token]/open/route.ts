import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SIGNUP_DEVICE_COOKIE, claimFailureMessage, deviceKeyFrom, openTouchpaySignupToken, setDeviceKeyCookie,
} from "@/lib/touchpay-signup-token";

// POST /api/entrance/touchpay-signup/[token]/open
// サインアップQRのページを開いたとき。最初に開いたブラウザ専用にする（lib/touchpay-signup-token.ts）。
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { key, isNew } = deviceKeyFrom((await cookies()).get(SIGNUP_DEVICE_COOKIE)?.value);

  const result = await openTouchpaySignupToken(createAdminClient(), token, key);
  const response = result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: claimFailureMessage(result.reason), reason: result.reason }, { status: 409 });
  if (isNew && result.ok) setDeviceKeyCookie(response, key);
  return response;
}
