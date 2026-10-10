import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * サンクス画面で Cheers カードが表示されたことを記録する（チャージバック時の閲覧証拠）。
 *
 * 証拠なので「決済した本人の画面で表示された」ことが前提。取引は Checkout の session_id
 * （本人だけがサンクス画面のURLで持っている）からサーバー側で特定する。以前は
 * transaction_id を受け取っていたため、取引IDさえあれば誰でも閲覧ログを追加できた
 * （2026-10-11修正）。
 */
export async function POST(req: Request) {
  const { session_id } = await req.json() as { session_id?: string };
  if (!session_id) return NextResponse.json({ ok: false });

  let piId: string | null = null;
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  } catch {
    return NextResponse.json({ ok: false });
  }
  if (!piId) return NextResponse.json({ ok: false });

  const admin = createAdminClient();

  const { data: tx } = await admin
    .from("transactions")
    .select("transaction_id")
    .eq("stripe_payment_intent_id", piId)
    .eq("stripe_pi_sequence", 0)
    .maybeSingle();

  if (!tx) return NextResponse.json({ ok: false });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  await admin.from("asset_access_logs").insert({
    transaction_id: tx.transaction_id,
    ip_address: ip,
    user_agent: userAgent,
  });

  return NextResponse.json({ ok: true });
}
