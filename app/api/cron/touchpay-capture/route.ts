import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveCronReport, type FailureDetail } from "@/lib/cron-report";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { isEventClosed, RUNNING_LIFECYCLES, TOUCHPAY_CAPTURE_AFTER_MS } from "@/lib/purchase-window";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// GitHub Actions から毎時呼ばれる。Authorization ヘッダーで保護。
//
// タッチ決済（card_present）を、締め時刻（終了3時間後）かオーソリから24時間の早い方でキャプチャする。
// 日本のアカウントの円建てオーソリは多くのブランドで30日有効だが、Amex の対面オーソリだけは2日で切れる
// （2026-07 本番実データ）。開催承認（証跡確認）を待つと回収できないことがあるため、タッチ決済は
// ブランドを問わず「タッチ決済だから」で括って早めにキャプチャする（2026-10-22 決定）。
// キャプチャしても送金は開催承認の後なので、お金が出ていく関門は変わらない。キャプチャ後の取消・
// 中止は返金になり、決済手数料は主催者負担（PayPay と同じ扱い。現場取消・自動キャンセルは対応済み）。
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  // タッチ決済を許可したことのあるQR（決済後に削除・設定変更されたQRも拾う）と、そのイベント
  const qrs = await fetchAllPages<{ qr_config_id: string; event: { event_id: string; title: string; end_at: string; lifecycle_status: string } | null }>(
    admin,
    "qr_configs",
    "qr_config_id, event:events!event_id(event_id, title, end_at, lifecycle_status)",
    (q) => q.eq("touchpay_enabled", true),
  );
  const runningQrs = qrs.filter((q) => q.event && (RUNNING_LIFECYCLES as readonly string[]).includes(q.event.lifecycle_status));
  const eventByQr = new Map(runningQrs.map((q) => [q.qr_config_id, q.event!]));
  const qrIds = [...eventByQr.keys()];

  let captured = 0;
  let alreadyCaptured = 0;
  let targetCount = 0;
  let targetAmount = 0;
  let capturedAmount = 0;
  const failures: FailureDetail[] = [];

  const BATCH = 50;
  type Tx = { transaction_id: string; qr_config_id: string; stripe_payment_intent_id: string; total_gross_amount: number | null; created_at: string };
  const txs: Tx[] = [];
  for (let i = 0; i < qrIds.length; i += BATCH) {
    const batch = qrIds.slice(i, i + BATCH);
    const rows = await fetchAllPages<Tx>(
      admin,
      "transactions",
      "transaction_id, qr_config_id, stripe_payment_intent_id, total_gross_amount, created_at",
      (q) => q
        .in("qr_config_id", batch)
        .eq("status", "completed")
        .is("captured_at", null)
        .not("stripe_payment_intent_id", "is", null)
        .neq("transaction_type", "invitation"),
    );
    txs.push(...rows);
  }

  // 期限が来た行だけ：締め時刻を過ぎたイベント、またはオーソリから24時間経った決済
  const due = txs.filter((tx) => {
    const ev = eventByQr.get(tx.qr_config_id);
    if (!ev) return false;
    return isEventClosed(ev.end_at, now) || now.getTime() - new Date(tx.created_at).getTime() >= TOUCHPAY_CAPTURE_AFTER_MS;
  });

  // 同一PIに複数行（ウェルカムチアの1階・2階）が紐づくことがあるため、Stripe操作はPI単位で1回
  const byPi = new Map<string, Tx[]>();
  for (const tx of due) {
    let piId = tx.stripe_payment_intent_id;
    if (piId.startsWith("{")) {
      try { const p = JSON.parse(piId); if (p?.id) piId = p.id; } catch {}
    }
    byPi.set(piId, [...(byPi.get(piId) ?? []), tx]);
  }

  for (const [piId, group] of byPi.entries()) {
    const eventTitle = eventByQr.get(group[0].qr_config_id)?.title;
    const amount = group.reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      // タッチ決済以外（同じQRでのQR自己決済＝オンラインのカード決済）は対象外。開催承認まで待つ
      if (!pi.payment_method_types.includes("card_present")) continue;
      targetCount += group.length;
      targetAmount += amount;

      if (pi.status === "requires_capture") {
        await stripe.paymentIntents.capture(piId);
        captured += group.length;
        capturedAmount += amount;
        console.log(`[touchpay-capture] captured pi=${piId} amount=${amount}`);
      } else if (pi.status === "succeeded") {
        // 開催承認などで既にキャプチャ済み。記録だけ揃える
        alreadyCaptured += group.length;
      } else {
        failures.push({ eventName: eventTitle, amount, failureReason: `キャプチャ不可: status=${pi.status}` });
        console.error(`[touchpay-capture] uncapturable pi=${piId} status=${pi.status}`);
        continue;
      }
      await admin
        .from("transactions")
        .update({ captured_at: now.toISOString() })
        .in("transaction_id", group.map((t) => t.transaction_id))
        .is("captured_at", null);
    } catch (err: any) {
      console.error(`[touchpay-capture] failed pi=${piId}:`, err?.message);
      failures.push({ eventName: eventTitle, amount, failureReason: `キャプチャ失敗: ${(err?.message ?? "").slice(0, 80)}` });
    }
  }

  await saveCronReport({
    taskName: "タッチ決済の自動キャプチャバッチ",
    totalEvents: new Set(due.map((t) => eventByQr.get(t.qr_config_id)?.event_id)).size,
    targetCount,
    targetAmount,
    successCount: captured + alreadyCaptured,
    successAmount: capturedAmount,
    failedCount: failures.length,
    failedAmount: failures.reduce((s, f) => s + f.amount, 0),
    failures,
  });

  return NextResponse.json({ success: true, captured, already_captured: alreadyCaptured, failed: failures.length });
}
