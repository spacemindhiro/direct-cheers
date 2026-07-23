import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function parsePiId(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      const p = JSON.parse(raw);
      if (p?.id) return p.id;
    } catch {}
  }
  return raw;
}

// POST /api/events/[eventId]/transactions/[transactionId]/cancel
//
// 現場での決済取り消し（誤操作・誤販売対応）。settle前のイベントに限定。
//   - カード（requires_capture）: PI cancel。資金移動ゼロで損害なし。
//   - PayPay等（succeeded）    : refund + debt_claims(stripe_fee) をorganizerに記録。
// settle後の返金はadmin返金画面（/api/admin/refund）でのみ対応する。
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; transactionId: string }> }
) {
  const { eventId, transactionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  const role = profile?.role ?? "user";

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("event_id, organizer_profile_id, agent_id, lifecycle_status")
    .eq("event_id", eventId)
    .single();
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = role === "admin";
  const isEventOrganizer = role === "organizer" && event.organizer_profile_id === user.id;
  const isEventAgent = role === "agent" && event.agent_id === user.id;
  if (!isAdmin && !isEventOrganizer && !isEventAgent) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (event.lifecycle_status === "settled") {
    return NextResponse.json(
      { error: "精算済みのイベントの決済は取り消せません。管理者の返金画面で対応してください。" },
      { status: 400 }
    );
  }

  // トランザクション取得＋このイベントに属するかを検証
  const { data: tx } = await admin
    .from("transactions")
    .select("transaction_id, stripe_payment_intent_id, status, total_gross_amount, stripe_fee, qr_config_id")
    .eq("transaction_id", transactionId)
    .single();
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: qrConfig } = await admin
    .from("qr_configs")
    .select("event_id")
    .eq("qr_config_id", tx.qr_config_id)
    .single();
  if (qrConfig?.event_id !== eventId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (tx.status !== "completed") {
    return NextResponse.json(
      { error: `この決済は取り消せない状態です（status: ${tx.status}）` },
      { status: 400 }
    );
  }

  // settle_transfers が既にある場合も現場取消は不可（按分逆転はadmin返金画面のみ）
  const { count: settleCount } = await admin
    .from("settle_transfers")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);
  if ((settleCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "精算送金が始まっているため取り消せません。管理者の返金画面で対応してください。" },
      { status: 400 }
    );
  }

  const piId = parsePiId(tx.stripe_payment_intent_id);
  if (!piId) return NextResponse.json({ error: "PaymentIntentが見つかりません" }, { status: 500 });

  // ウェルカムチアにより同一PIに兄弟transaction行（1階・2階）が紐づくことがあるため、
  // 対象のtxに加えて同じPIを持つ全行を巻き込んで取消・返金を反映する。
  const { data: siblingTxs } = await admin
    .from("transactions")
    .select("transaction_id, stripe_fee")
    .eq("stripe_payment_intent_id", tx.stripe_payment_intent_id);
  const allTxs = siblingTxs && siblingTxs.length > 0 ? siblingTxs : [{ transaction_id: tx.transaction_id, stripe_fee: tx.stripe_fee }];
  const allTxIds = allTxs.map((t) => t.transaction_id);

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(piId);
  } catch (err) {
    const message = err instanceof Stripe.errors.StripeError ? err.message : "Stripeエラー";
    return NextResponse.json({ error: `Stripe エラー: ${message}` }, { status: 404 });
  }

  // ── カード（オーソリ中）: PI cancel。資金移動ゼロ。
  if (pi.status === "requires_capture") {
    await stripe.paymentIntents.cancel(piId);
    await admin
      .from("transactions")
      .update({ status: "cancelled" })
      .in("transaction_id", allTxIds);

    return NextResponse.json({
      success: true,
      mode: "cancel",
      message: "決済を取り消しました。お客様のカード利用枠は解放されます。",
    });
  }

  // ── PayPay等（キャプチャ済み）: refund + 決済手数料をorganizerのdebt_claimsに記録。
  if (pi.status === "succeeded") {
    const refund = await stripe.refunds.create({
      payment_intent: piId,
      metadata: { reason: "onsite_cancel", cancelled_by: user.id },
    });

    // 兄弟行（1階・2階）それぞれの決済手数料を個別にdebt_claims計上する
    let totalStripeFee = 0;
    if (event.organizer_profile_id) {
      for (const t of allTxs) {
        const feeAmount = t.stripe_fee ?? 0;
        if (feeAmount <= 0) continue;
        totalStripeFee += feeAmount;
        await admin.from("debt_claims").insert({
          profile_id: event.organizer_profile_id,
          original_transaction_id: t.transaction_id,
          claim_amount: feeAmount,
          description: `現場取消（settle前）: 決済手数料 PI:${piId}`,
        });
      }
    }

    await admin
      .from("transactions")
      .update({ status: "refunded" })
      .in("transaction_id", allTxIds);

    return NextResponse.json({
      success: true,
      mode: "refund",
      refundId: refund.id,
      debtAmount: totalStripeFee,
      message: `決済を返金しました。決済手数料 ${totalStripeFee.toLocaleString("ja-JP")}円は精算時にオーガナイザー負担となります。`,
    });
  }

  return NextResponse.json(
    { error: `取り消せないステータスです（${pi.status}）` },
    { status: 400 }
  );
}
