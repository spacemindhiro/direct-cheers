import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveCronReport, type FailureDetail } from "@/lib/cron-report";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Vercel Cron から呼ばれる。Authorization ヘッダーで保護。
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const now = new Date();

    // settled 済みイベントを取得（settle = キャプチャ実行済み = 照合可能）
    const { data: settledEvents } = await admin
      .from("events")
      .select("event_id, title")
      .eq("lifecycle_status", "settled");

    const settledEventIds = (settledEvents ?? []).map((e) => e.event_id);
    const eventTitleMap = new Map((settledEvents ?? []).map((e) => [e.event_id, e.title as string]));
    if (settledEventIds.length === 0) {
      console.log("[reconcile] no settled events, skip");
      await saveCronReport({ taskName: "照合バッチ", targetCount: 0, targetAmount: 0, successCount: 0, successAmount: 0, failedCount: 0, failedAmount: 0, failures: [] });
      return NextResponse.json({ success: true, checked: 0, matched: 0, mismatched: 0, errors: 0 });
    }

    // settled イベントの qr_config_id を取得（URLが長すぎるため50件ずつバッチ）
    const BATCH = 50;
    const allQrConfigs: { qr_config_id: string; event_id: string }[] = [];
    for (let i = 0; i < settledEventIds.length; i += BATCH) {
      const batch = settledEventIds.slice(i, i + BATCH);
      const { data: batchQr } = await admin
        .from("qr_configs")
        .select("qr_config_id, event_id")
        .in("event_id", batch);
      allQrConfigs.push(...(batchQr ?? []));
    }

    const settledQrConfigIds = allQrConfigs.map((q) => q.qr_config_id);
    const qrToEventId = new Map<string, string>();
    for (const q of allQrConfigs) qrToEventId.set(q.qr_config_id, q.event_id);

    if (settledQrConfigIds.length === 0) {
      console.log("[reconcile] no qr_configs for settled events, skip");
      await saveCronReport({ taskName: "照合バッチ", targetCount: 0, targetAmount: 0, successCount: 0, successAmount: 0, failedCount: 0, failedAmount: 0, failures: [] });
      return NextResponse.json({ success: true, checked: 0, matched: 0, mismatched: 0, errors: 0 });
    }

    // settled イベントの未照合トランザクションを取得（URLが長すぎるため50件ずつバッチ）
    const allTransactions: any[] = [];
    let txErr: any = null;
    for (let i = 0; i < settledQrConfigIds.length; i += BATCH) {
      const batch = settledQrConfigIds.slice(i, i + BATCH);
      const { data: batchTx, error: batchErr } = await admin
        .from("transactions")
        .select(`
          transaction_id, stripe_payment_intent_id, total_gross_amount, platform_fee, qr_config_id,
          transaction_distributions(transaction_distribution_id, profile_id, distribution_role, actual_amount, amount_before_reconcile, distribution_status)
        `)
        .in("qr_config_id", batch)
        .eq("status", "completed")
        .or("reconciled_at.is.null,reconcile_error.not.is.null,amount_verified.eq.false")
        .not("stripe_payment_intent_id", "is", null)
        .neq("transaction_type", "invitation");
      if (batchErr) { txErr = batchErr; break; }
      allTransactions.push(...(batchTx ?? []));
    }
    const transactions = allTransactions;

    if (txErr) {
      console.error("[reconcile] fetch transactions error:", txErr.message);
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    const targets = transactions ?? [];
    let matched = 0;
    let mismatched = 0;
    let errors = 0;
    const reconcileFailures: FailureDetail[] = [];
    // バッチ実行ログ（reconciliation_logs.summary）用のスナップショット。
    // 後続実行で transactions テーブルの状態が変わっても、このログ行の明細は変化しない。
    const mismatchDetails: Array<{ transaction_id: string; stripe_pi_id: string | null; event_name?: string; expected: number; actual: number; diff: number }> = [];
    const errorDetails: Array<{ transaction_id: string; stripe_pi_id: string | null; event_name?: string; error: string }> = [];

    for (const tx of targets) {
      // stripe_payment_intent_id が空文字列（NULLではない）の場合、クエリの
      // not(is, null) フィルタを通過してしまう。サイレントスキップすると
      // total_checked（取得件数）と matched+mismatched+errors の合計がずれ、
      // 「件数1件/一致0/正常」という矛盾した表示になるため、必ずエラーとして記録する。
      if (!tx.stripe_payment_intent_id) {
        errors++;
        console.error(`[reconcile] tx=${tx.transaction_id} stripe_payment_intent_id が空です`);
        const eventId = qrToEventId.get(tx.qr_config_id!);
        const eventName = eventId ? (eventTitleMap.get(eventId) ?? eventId) : undefined;
        errorDetails.push({
          transaction_id: tx.transaction_id,
          stripe_pi_id: null,
          event_name: eventName,
          error: "stripe_payment_intent_id が空です（照合不可）",
        });
        reconcileFailures.push({
          eventName,
          amount: tx.total_gross_amount ?? 0,
          failureReason: "stripe_payment_intent_id が空のため照合不可",
        });
        continue;
      }
      try {
        let piId = tx.stripe_payment_intent_id as string;
        if (piId?.startsWith("{")) {
          try { const p = JSON.parse(piId); if (p?.id) piId = p.id; } catch {}
        }
        const pi = await stripe.paymentIntents.retrieve(piId, {
          expand: ["latest_charge.balance_transaction"],
        });

        // requires_capture（未キャプチャ）は settled イベントに存在してはならない
        // → 資金が回収されないまま残っているリスク。明細に記録して管理者に知らせる
        if (pi.status === "requires_capture") {
          const eventId = qrToEventId.get(tx.qr_config_id!);
          const eventName = eventId ? (eventTitleMap.get(eventId) ?? eventId) : undefined;
          console.warn(`[reconcile] UNCAPTURED PI tx=${tx.transaction_id} pi=${piId} event=${eventId}`);
          reconcileFailures.push({
            eventName,
            amount:       tx.total_gross_amount ?? 0,
            failureReason: "❌【未キャプチャ】イベント終了後に資金が未回収のままです",
          });
          errorDetails.push({
            transaction_id: tx.transaction_id,
            stripe_pi_id: tx.stripe_payment_intent_id,
            event_name: eventName,
            error: "未キャプチャ：イベント終了後に資金が未回収のままです",
          });
          errors++;
          continue;
        }

        const charge = pi.latest_charge as Stripe.Charge | null;
        const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;

        const stripeGross = pi.amount_received ?? 0;
        const stripeFee = bt?.fee ?? null;
        const stripeNet = bt?.net ?? null;

        const grossDiff = stripeGross - (tx.total_gross_amount ?? 0);
        const grossMatch = grossDiff === 0;

        if (!grossMatch) {
          mismatched++;
          console.error(`[reconcile] GROSS MISMATCH tx=${tx.transaction_id} expected=${tx.total_gross_amount} actual=${stripeGross} diff=${grossDiff}`);
          reconcileFailures.push({
            amount:        Math.abs(grossDiff),
            failureReason: `Stripe金額（¥${stripeGross.toLocaleString()}）とDB金額（¥${(tx.total_gross_amount ?? 0).toLocaleString()}）が不一致 差額¥${grossDiff}`,
          });
          mismatchDetails.push({
            transaction_id: tx.transaction_id,
            stripe_pi_id: tx.stripe_payment_intent_id,
            event_name: qrToEventId.get(tx.qr_config_id!) ? (eventTitleMap.get(qrToEventId.get(tx.qr_config_id!)!) ?? undefined) : undefined,
            expected: tx.total_gross_amount ?? 0,
            actual: stripeGross,
            diff: grossDiff,
          });
        } else {
          matched++;
        }

        // ADJUST_DIST: artist/orgのみstripe_net - platform_feeに調整。agentは固定。
        const allAccruedDists = ((tx.transaction_distributions ?? []) as any[]).filter(
          (d: any) => d.distribution_status === "accrued"
        );
        const artistOrgDists = allAccruedDists.filter((d: any) => d.distribution_role !== "agent");
        const platformFee = (tx as any).platform_fee ?? 0;
        const artistOrgTarget = stripeNet !== null ? stripeNet - platformFee : null;
        const artistOrgEstimated = artistOrgDists.reduce((s: number, d: any) => s + (d.actual_amount ?? 0), 0);

        if (artistOrgTarget !== null && artistOrgEstimated > 0 && artistOrgTarget !== artistOrgEstimated) {
          const agentTotal = allAccruedDists
            .filter((d: any) => d.distribution_role === "agent")
            .reduce((s: number, d: any) => s + (d.actual_amount ?? 0), 0);
          const adjustDiff = artistOrgTarget - artistOrgEstimated;
          const eventId = qrToEventId.get(tx.qr_config_id!);
          // 分配調整発生を明細に記録
          reconcileFailures.push({
            eventName:    eventId ? (eventTitleMap.get(eventId) ?? eventId) : undefined,
            amount:       Math.abs(adjustDiff),
            failureReason: `⚠️【分配調整】事後の金額調整が発生しています（差額¥${adjustDiff.toLocaleString()}）`,
          });
          console.log(
            `[reconcile] ADJUST_DIST tx=${tx.transaction_id}` +
            ` artist_org_estimated=${artistOrgEstimated} target=${artistOrgTarget} diff=${adjustDiff}` +
            ` agent(fixed)=${agentTotal} platform_fee=${platformFee} stripe_net=${stripeNet}`
          );
          const sortedDists = [...artistOrgDists].sort((a: any, b: any) => b.actual_amount - a.actual_amount);
          let allocated = 0;
          for (let i = 0; i < sortedDists.length; i++) {
            const d = sortedDists[i] as any;
            const isLast = i === sortedDists.length - 1;
            const adjustedAmount = isLast
              ? artistOrgTarget - allocated
              : Math.floor((d.actual_amount / artistOrgEstimated) * artistOrgTarget);
            console.log(`[reconcile]   dist=${d.transaction_distribution_id} role=${d.distribution_role} profile=${d.profile_id} before=${d.actual_amount} after=${adjustedAmount}`);
            await admin
              .from("transaction_distributions")
              .update({
                actual_amount: adjustedAmount,
                ...(d.amount_before_reconcile == null ? { amount_before_reconcile: d.actual_amount } : {}),
              })
              .eq("transaction_distribution_id", d.transaction_distribution_id);
            allocated += adjustedAmount;
          }
        }

        await admin
          .from("transactions")
          .update({
            amount_verified: grossMatch,
            amount_mismatch: grossDiff,
            stripe_fee_actual: stripeFee,
            stripe_net_actual: stripeNet,
            reconciled_at: now.toISOString(),
            reconcile_error: null,
          })
          .eq("transaction_id", tx.transaction_id);

      } catch (err: any) {
        errors++;
        console.error(`[reconcile] tx=${tx.transaction_id} error:`, err.message);
        reconcileFailures.push({
          amount:        tx.total_gross_amount ?? 0,
          failureReason: `照合エラー: ${(err.message ?? "").slice(0, 80)}`,
        });
        errorDetails.push({
          transaction_id: tx.transaction_id,
          stripe_pi_id: tx.stripe_payment_intent_id,
          event_name: qrToEventId.get(tx.qr_config_id!) ? (eventTitleMap.get(qrToEventId.get(tx.qr_config_id!)!) ?? undefined) : undefined,
          error: err.message,
        });
        // reconciled_at はセットしない → 翌日のCRONで再試行される
        await admin
          .from("transactions")
          .update({ reconcile_error: err.message })
          .eq("transaction_id", tx.transaction_id);
      }
    }

    // イベント単位で全件照合済みならフラグを立てる
    const touchedEventIds = [...new Set(
      targets.map((tx) => qrToEventId.get(tx.qr_config_id!)).filter(Boolean) as string[]
    )];

    for (const eventId of touchedEventIds) {
      const qrIds = allQrConfigs
        .filter((q) => q.event_id === eventId)
        .map((q) => q.qr_config_id);

      const { count: remaining } = await admin
        .from("transactions")
        .select("transaction_id", { count: "exact", head: true })
        .in("qr_config_id", qrIds)
        .eq("status", "completed")
        .is("reconciled_at", null);

      if (remaining === 0) {
        await admin
          .from("events")
          .update({ reconciled_at: now.toISOString() })
          .eq("event_id", eventId)
          .is("reconciled_at", null);
        console.log(`[reconcile] event reconciled: event_id=${eventId}`);
      }
    }

    const { error: logErr } = await admin.from("reconciliation_logs").insert({
      run_at: now.toISOString(),
      target_date: now.toISOString().slice(0, 10),
      total_checked: targets.length,
      total_matched: matched,
      total_mismatched: mismatched,
      total_errors: errors,
      summary: { mismatches: mismatchDetails, errors: errorDetails },
    });
    if (logErr) console.error("[reconcile] log insert error:", logErr.message);

    if (mismatched > 0) {
      console.error(`[reconcile] GROSS MISMATCH: ${mismatched} transactions — investigate immediately`);
    }

    console.log(`[reconcile] done: checked=${targets.length} matched=${matched} mismatched=${mismatched} errors=${errors}`);

    const totalAmount = targets.reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);
    const matchedAmount = targets
      .filter((_, i) => {
        // 簡易: mismatched/errors 以外は成功扱い
        return true;
      })
      .reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);

    await saveCronReport({
      taskName:      "Stripe-DB照合バッチ",
      totalEvents:   touchedEventIds.length,
      targetCount:   targets.length,
      targetAmount:  totalAmount,
      successCount:  matched,
      successAmount: totalAmount - reconcileFailures.reduce((s, f) => s + f.amount, 0),
      failedCount:   mismatched + errors,
      failedAmount:  reconcileFailures.reduce((s, f) => s + f.amount, 0),
      failures:      reconcileFailures,
    });

    return NextResponse.json({ success: true, checked: targets.length, matched, mismatched, errors });
  } catch (err: any) {
    console.error("[reconcile] unhandled error:", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "unexpected error" }, { status: 500 });
  }
}
