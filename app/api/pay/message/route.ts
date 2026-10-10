import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * メッセージプラン購入後、サンクス画面からアーティストへのメッセージを1回だけ書き込む。
 *
 * 取引は Checkout の session_id（決済した本人だけがサンクス画面のURLで持っている）から
 * サーバー側で特定する。以前は transaction_id をそのまま受け取っていたため、取引IDを
 * 知っていれば他人の取引に（メッセージプラン以外でも）書き込めた（2026-10-11修正）。
 */
export async function POST(req: Request) {
  const { session_id, nickname, comment } = await req.json() as {
    session_id?: string;
    nickname?: string;
    comment?: string;
  };

  if (!session_id) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  let piId: string | null = null;
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  if (!piId) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  const admin = createAdminClient();

  // stripe_pi_sequence=0 はアンカー行（ウェルカムチアの2階行ではない本体の取引）
  const { data: tx } = await admin
    .from("transactions")
    .select("transaction_id, product:products!product_id(type)")
    .eq("stripe_payment_intent_id", piId)
    .eq("stripe_pi_sequence", 0)
    .maybeSingle();

  if (!tx) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }
  // 画面と同じく、メッセージを添えられるのはメッセージプランだけ
  if ((tx.product as { type?: string } | null)?.type !== "message") {
    return NextResponse.json({ error: "この決済にはメッセージを添えられません" }, { status: 400 });
  }

  const { error } = await admin
    .from("transactions")
    .update({
      sender_name: nickname || null,
      sender_comment: comment || null,
    })
    .eq("transaction_id", tx.transaction_id)
    .is("sender_name", null)
    .is("sender_comment", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ウォレット登録済みデバイスに push（fire-and-forget）
  pushWalletUpdateBySerial(tx.transaction_id).catch((err) =>
    console.error("[pay/message] wallet push failed:", err)
  );

  return NextResponse.json({ ok: true });
}
