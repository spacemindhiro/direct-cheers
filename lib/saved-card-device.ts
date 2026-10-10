import type { NextResponse } from "next/server";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * 保存カード用の端末Cookie。中身は推測できないランダムな合言葉（saved_card_devices.token）で、
 * メールアドレスやカード情報は入れない。httpOnly でブラウザのスクリプトからは読めない。
 *
 * 保存カード（Stripe顧客）は以前フォームのメールで引いていたため、他人のメールを入れると
 * 他人の保存カードが出た（2026-10-11修正）。この Cookie を持つ端末＝その顧客で実際に
 * 決済を完了した端末、という証拠に置き換える。
 */
export const SAVED_CARD_COOKIE = "dc_sc";
const MAX_AGE_SEC = 60 * 60 * 24 * 365;

/**
 * 決済完了時に合言葉を発行して Cookie に載せる。決済（checkout_session_id）1回につき
 * 最初の1回だけ発行し、2回目以降（サンクス画面の再読込・URLの共有）は何もしない。
 */
export async function issueSavedCardCookie(
  admin: AdminClient,
  response: NextResponse,
  params: { checkoutSessionId: string; stripeCustomerId: string | null; email: string | null | undefined },
): Promise<void> {
  const { checkoutSessionId, stripeCustomerId, email } = params;
  if (!stripeCustomerId || !email) return;

  const { data, error } = await admin
    .from("saved_card_devices")
    .upsert(
      { checkout_session_id: checkoutSessionId, stripe_customer_id: stripeCustomerId, email: email.toLowerCase() },
      { onConflict: "checkout_session_id", ignoreDuplicates: true },
    )
    .select("token");

  // ignoreDuplicates のため、既に発行済みの決済では行が返らない
  const token = !error ? data?.[0]?.token : null;
  if (!token) return;

  response.cookies.set(SAVED_CARD_COOKIE, token, {
    maxAge: MAX_AGE_SEC,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * 決済開始時：この端末が実際に払った Stripe 顧客を返す。フォームのメールが発行時の
 * 決済メールと一致するときだけ（同じスマホで別の人が払うときに持ち主の顧客を使わない）。
 */
export async function resolveSavedCardCustomer(
  admin: AdminClient,
  token: string | null | undefined,
  email: string | null | undefined,
): Promise<string | null> {
  if (!token || !email) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return null;

  const { data } = await admin
    .from("saved_card_devices")
    .select("stripe_customer_id, email")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.email !== email.toLowerCase()) return null;

  await admin.from("saved_card_devices").update({ last_used_at: new Date().toISOString() }).eq("token", token);
  return data.stripe_customer_id;
}
