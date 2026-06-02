/**
 * GET /api/cron/entrance-auth
 * 5日前オーソリ cron（毎日実行）
 *
 * reservation.status = "reserved" かつ event.start_at が5日後（±12h窓）の予約に対して
 * off_session PaymentIntent を作成してオーソリを実行する。
 *
 * 成功: reservation → charged、transaction 作成（settle で後キャプチャ）
 * 失敗: ticket → suspended、reservation → card_error、予約者メール通知
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeConfig } from "@/lib/fee-config";
import { sendCardSuspendedEmail } from "@/lib/email/notification";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();

  // 対象ウィンドウ: 4日後〜6日後（毎日実行なので5日前前後を捕捉）
  const windowStart = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

  // Supabase の joined フィルタは信頼できないため、
  // 先にウィンドウ内イベントを取得してから reservations を絞り込む
  const { data: targetEvents } = await admin
    .from("events")
    .select("event_id")
    .gte("start_at", windowStart.toISOString())
    .lte("start_at", windowEnd.toISOString())
    .not("lifecycle_status", "in", '("settled","cancelled","ended")');

  const targetEventIds = (targetEvents ?? []).map((e) => e.event_id);
  if (targetEventIds.length === 0) {
    return NextResponse.json({ success: true, processed: 0, succeeded: 0, failed: 0 });
  }

  const { data: reservations } = await admin
    .from("entrance_reservations")
    .select(`
      reservation_id, email, stripe_customer_id, stripe_payment_method_id,
      product_id, event_id, charge_amount,
      product:products(name),
      event:events(title, start_at)
    `)
    .eq("status", "reserved")
    .not("stripe_payment_method_id", "is", null)
    .is("stripe_payment_intent_id", null) // まだオーソリ未実施
    .in("event_id", targetEventIds);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  const feeConfig = await getFeeConfig();

  for (const rsv of reservations ?? []) {
    if (!rsv.stripe_payment_method_id || !rsv.stripe_customer_id) continue;
    processed++;

    try {
      // off_session オーソリ（capture は後ほど settle 時）
      const pi = await stripe.paymentIntents.create({
        amount: rsv.charge_amount,
        currency: "jpy",
        customer: rsv.stripe_customer_id,
        payment_method: rsv.stripe_payment_method_id,
        capture_method: "manual",
        confirm: true,
        off_session: true,
        metadata: {
          reservation_id: rsv.reservation_id,
          product_id: rsv.product_id,
          event_id: rsv.event_id,
          payment_type: "A",
          cron: "entrance-auth",
        },
      });

      if (pi.status !== "requires_capture") {
        throw new Error(`Unexpected PI status: ${pi.status}`);
      }

      const gross = rsv.charge_amount;
      const stripeFee   = Math.floor(gross * feeConfig.stripe_rate);
      const platformFee = Math.floor(gross * feeConfig.platform_rate);

      // transaction + reservation.status=charged をアトミックに更新
      const { error: rpcError } = await admin.rpc("complete_entrance_typea_charge", {
        p_stripe_payment_intent_id: pi.id,
        p_product_id:               rsv.product_id,
        p_event_id:                 rsv.event_id,
        p_email:                    rsv.email,
        p_gross:                    gross,
        p_stripe_fee:               stripeFee,
        p_platform_fee:             platformFee,
        p_net_amount:               gross - stripeFee - platformFee,
        p_reservation_id:           rsv.reservation_id,
      });

      if (rpcError) throw new Error(rpcError.message);

      succeeded++;
    } catch (err: any) {
      failed++;
      const errMsg: string = err?.message ?? String(err);
      console.error(`[entrance-auth] オーソリ失敗 reservation=${rsv.reservation_id}:`, errMsg);

      // カードエラー → ticket を suspended、reservation を card_error
      await admin
        .from("entrance_reservations")
        .update({ status: "card_error", card_error_message: errMsg })
        .eq("reservation_id", rsv.reservation_id);

      await admin
        .from("tickets")
        .update({ status: "suspended" })
        .eq("reservation_id", rsv.reservation_id)
        .eq("status", "valid");

      // 予約者に通知
      if (rsv.email) {
        sendCardSuspendedEmail({
          to: rsv.email,
          eventTitle: (rsv.event as any)?.title ?? "",
          productName: (rsv.product as any)?.name ?? "",
          reservationId: rsv.reservation_id,
          reason: "card_error",
        }).catch(() => {});
      }
    }
  }

  return NextResponse.json({ success: true, processed, succeeded, failed });
}
