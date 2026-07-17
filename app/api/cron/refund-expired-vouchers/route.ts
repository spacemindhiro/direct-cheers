/**
 * GET /api/cron/refund-expired-vouchers
 *
 * GitHub Actions Cron: "0 * * * *" (毎時実行)
 *
 * イベント終了後の未消込バウチャー（products.type='custom', products.payment_type='V',
 * events.end_at < now(), tickets.status='valid'）を検出し Stripe 返金を実行する。
 *
 * 返金後: tickets.status='cancelled', transactions.status='refunded'
 *
 * 認証: Authorization: Bearer $CRON_SECRET
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  // 未消込バウチャーチケットを取得。
  // かつては「全バウチャー商品ID」「全終了済みイベントID」を先に取得して .in() で
  // 渡していたが、IDリストがURLクエリに展開されるため、イベント・商品の蓄積に伴い
  // 「URI too long」で恒常的に500になる時限爆弾だった（cron/reconcileの
  // PostgREST 1000件上限バグと同族）。!inner JOINの1クエリに書き換え、
  // URLサイズをデータ量から独立させる。
  // ※PostgRESTのデフォルト上限により1回の実行で処理するのは最大1000件。
  //   毎時実行のため、超過分は次回以降のcronで順次処理される。
  const { data: expiredVouchers, error: fetchErr } = await admin
    .from("tickets")
    .select(`
      ticket_id, transaction_id, event_id, product_id,
      product:products!product_id!inner(type, payment_type),
      event:events!event_id!inner(end_at)
    `)
    .eq("status", "valid")
    .eq("product.type", "custom")
    .eq("product.payment_type", "V")
    .lt("event.end_at", now.toISOString());

  if (fetchErr) {
    console.error("[refund-expired-vouchers] fetch error:", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!expiredVouchers || expiredVouchers.length === 0) {
    console.log("[refund-expired-vouchers] 返金対象バウチャーなし");
    return NextResponse.json({ success: true, processed: 0, refunded: 0, failed: 0 });
  }

  console.log(`[refund-expired-vouchers] 対象: ${expiredVouchers.length}件`);

  let refunded = 0;
  let failed = 0;

  for (const voucher of expiredVouchers) {
    if (!voucher.transaction_id) {
      console.warn(`[refund-expired-vouchers] ticket=${voucher.ticket_id} transaction_id なし`);
      failed++;
      continue;
    }

    const { data: tx } = await admin
      .from("transactions")
      .select("stripe_payment_intent_id, total_gross_amount")
      .eq("transaction_id", voucher.transaction_id)
      .single();

    if (!tx?.stripe_payment_intent_id) {
      console.warn(`[refund-expired-vouchers] ticket=${voucher.ticket_id} PI なし`);
      failed++;
      continue;
    }

    let piId = tx.stripe_payment_intent_id as string;
    if (piId.startsWith("{")) {
      try { const p = JSON.parse(piId); if (p?.id) piId = p.id; } catch {}
    }

    try {
      await stripe.refunds.create({
        payment_intent: piId,
        metadata: {
          reason: "イベント終了後の未消込バウチャー自動返金",
          ticket_id: voucher.ticket_id,
        },
      });

      await Promise.all([
        admin
          .from("tickets")
          .update({ status: "cancelled" })
          .eq("ticket_id", voucher.ticket_id),
        admin
          .from("transactions")
          .update({ status: "refunded" })
          .eq("transaction_id", voucher.transaction_id),
      ]);

      console.log(`[refund-expired-vouchers] 返金完了 ticket=${voucher.ticket_id} pi=${piId} amount=${tx.total_gross_amount}`);
      refunded++;
    } catch (err: any) {
      console.error(`[refund-expired-vouchers] 返金失敗 ticket=${voucher.ticket_id} pi=${piId}:`, err.message);
      failed++;
    }
  }

  console.log(`[refund-expired-vouchers] 完了: processed=${expiredVouchers.length} refunded=${refunded} failed=${failed}`);
  return NextResponse.json({ success: true, processed: expiredVouchers.length, refunded, failed });
}
