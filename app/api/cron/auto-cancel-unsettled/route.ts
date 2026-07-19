import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveCronReport, type FailureDetail } from "@/lib/cron-report";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// check-auth-expiry の警告基準(イベント開始から7日)と同じ締切。
// 警告だけで終わらせず、締切そのものに達したら自動でオーソリ取消・イベント中止まで実行する。
const AUTH_EXPIRE_DAYS = 7;

// Vercel Cron/GitHub Actions から呼ばれる。Authorization ヘッダーで保護。
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: events } = await admin
    .from("events")
    .select("event_id, title, start_at, organizer_profile_id, agent_id")
    .in("lifecycle_status", ["published", "ongoing", "ended"]);

  let cancelledEvents = 0;
  let cancelledTx = 0;
  let errors = 0;
  const failures: FailureDetail[] = [];

  for (const event of events ?? []) {
    const deadline = new Date(new Date(event.start_at).getTime() + AUTH_EXPIRE_DAYS * 24 * 60 * 60 * 1000);
    if (now < deadline) continue; // まだ締切前

    const { data: qrConfigs } = await admin
      .from("qr_configs")
      .select("qr_config_id")
      .eq("event_id", event.event_id)
      .is("deleted_at", null);
    const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
    if (qrIds.length === 0) continue;

    const { data: txs } = await admin
      .from("transactions")
      .select("transaction_id, stripe_payment_intent_id, total_gross_amount")
      .in("qr_config_id", qrIds)
      .eq("status", "completed");

    if (!txs || txs.length === 0) continue; // 決済が無いイベントは対象外(静かに終わっただけ)

    let eventErrors = 0;

    // ウェルカムチアにより同一PIに複数transaction行（1階・2階）が紐づくことがあるため、
    // Stripe側の操作（cancel/refund）はPI単位で1回だけ行い、DBステータス更新・
    // 集計は同じPIを持つ全transaction行に対して行う。
    const txsByPi = new Map<string, typeof txs>();
    const noPiTxs: typeof txs = [];
    for (const tx of txs) {
      if (!tx.stripe_payment_intent_id) { noPiTxs.push(tx); continue; }
      let piId = tx.stripe_payment_intent_id;
      if (piId.startsWith("{")) {
        try { const p = JSON.parse(piId); if (p?.id) piId = p.id; } catch {}
      }
      txsByPi.set(piId, [...(txsByPi.get(piId) ?? []), tx]);
    }

    for (const tx of noPiTxs) {
      eventErrors++;
      errors++;
      failures.push({
        eventName: event.title,
        amount: tx.total_gross_amount ?? 0,
        failureReason: "stripe_payment_intent_id が空のため自動キャンセル不可",
      });
    }

    for (const [piId, groupTxs] of txsByPi.entries()) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        const txIds = groupTxs.map((t) => t.transaction_id);

        if (pi.status === "requires_capture") {
          // オーソリ中(未キャプチャ) → cancelで資金移動ゼロのまま解放。想定される通常パターン
          await stripe.paymentIntents.cancel(piId);
          await admin.from("transactions").update({ status: "cancelled" }).in("transaction_id", txIds);
        } else if (pi.status === "succeeded") {
          // 想定外(通常はrequires_captureのはず)。安全側に倒して返金する
          await stripe.refunds.create({ payment_intent: piId });
          await admin.from("transactions").update({ status: "refunded" }).in("transaction_id", txIds);
        }
        // canceled/refunded 等は既に終端状態のため何もしない
        cancelledTx += groupTxs.length;
      } catch (err: any) {
        eventErrors++;
        errors++;
        console.error(`[auto-cancel-unsettled] pi=${piId} error:`, err.message);
        failures.push({
          eventName: event.title,
          amount: groupTxs.reduce((s, t) => s + (t.total_gross_amount ?? 0), 0),
          failureReason: `自動キャンセル失敗: ${(err.message ?? "").slice(0, 80)}`,
        });
      }
    }

    if (eventErrors === 0) {
      await admin.from("events").update({ lifecycle_status: "cancelled" }).eq("event_id", event.event_id);
      cancelledEvents++;

      const recipients = [...new Set([event.organizer_profile_id, event.agent_id].filter(Boolean))] as string[];
      for (const profileId of recipients) {
        await admin.from("notifications").insert({
          profile_id: profileId,
          type: "event_auto_cancelled",
          title: "イベントが自動的に中止となりました",
          body: `「${event.title}」は開催から${AUTH_EXPIRE_DAYS}日以内に精算が完了しなかったため、売上のオーソリを取り消し、イベントを自動的に中止扱いにしました。`,
          metadata: { event_id: event.event_id },
        });
      }
    }
  }

  await saveCronReport({
    taskName: "未精算イベント自動キャンセルバッチ",
    targetCount: cancelledTx + errors,
    targetAmount: 0,
    successCount: cancelledTx,
    successAmount: 0,
    failedCount: errors,
    failedAmount: 0,
    failures,
  });

  return NextResponse.json({ success: true, cancelledEvents, cancelledTx, errors });
}
