import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (me?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { eventId } = await req.json() as { eventId: string };
  if (!eventId)
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });

  // イベントのQR取得
  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("event_id", eventId);
  const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
  if (qrIds.length === 0)
    return NextResponse.json({ checked: 0, reconciled: 0, errors: 0 });

  // 未照合 OR エラー済み（再試行対象）のトランザクション取得
  const { data: transactions } = await admin
    .from("transactions")
    .select(`
      transaction_id, stripe_payment_intent_id, total_gross_amount, platform_fee, qr_config_id,
      transaction_distributions(transaction_distribution_id, profile_id, distribution_role, actual_amount, amount_before_reconcile, distribution_status)
    `)
    .in("qr_config_id", qrIds)
    .eq("status", "completed")
    .or("reconciled_at.is.null,reconcile_error.not.is.null,amount_verified.eq.false");

  const now = new Date();
  let matched = 0;
  let mismatched = 0;
  let errors = 0;
  const errorDetails: Array<{ transaction_id: string; stripe_pi_id: string | null; error: string }> = [];
  const mismatchDetails: Array<{ transaction_id: string; stripe_pi_id: string | null; expected: number; actual: number; diff: number }> = [];

  const targets = transactions ?? [];

  // stripe_payment_intent_id が空の行を先に弾く（PIグループ化の対象外）
  const groupableTargets: any[] = [];
  for (const tx of targets) {
    if (!tx.stripe_payment_intent_id) {
      errors++;
      console.error(`[reconcile] tx=${tx.transaction_id} stripe_payment_intent_id が空です`);
      errorDetails.push({
        transaction_id: tx.transaction_id,
        stripe_pi_id: null,
        error: "stripe_payment_intent_id が空です（照合不可）",
      });
      continue;
    }
    groupableTargets.push(tx);
  }

  // ウェルカムチア導入により同一PIに複数transaction行（1階・2階）が紐づくことが
  // あるため、PI単位でグループ化し、Stripe取得・金額突合をグループ全体で1回だけ行う。
  const piGroups = new Map<string, any[]>();
  for (const tx of groupableTargets) {
    let piId = tx.stripe_payment_intent_id as string;
    if (piId?.startsWith("{")) {
      try { const p = JSON.parse(piId); if (p?.id) piId = p.id; } catch {}
    }
    piGroups.set(piId, [...(piGroups.get(piId) ?? []), tx]);
  }

  for (const [piId, groupTxs] of piGroups.entries()) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId, {
        expand: ["latest_charge.balance_transaction"],
      });

      // requires_capture（未キャプチャ）はサイレントスキップせず、資金未回収のエラーとして記録する
      if (pi.status === "requires_capture") {
        const errMsg = "未キャプチャ：イベント終了後に資金が未回収のままです";
        for (const tx of groupTxs) {
          console.warn(`[reconcile] UNCAPTURED tx=${tx.transaction_id} pi=${piId} gross_db=${tx.total_gross_amount}`);
          errors++;
          errorDetails.push({ transaction_id: tx.transaction_id, stripe_pi_id: tx.stripe_payment_intent_id, error: errMsg });
          await admin
            .from("transactions")
            .update({ reconcile_error: errMsg })
            .eq("transaction_id", tx.transaction_id);
        }
        continue;
      }

      const charge = pi.latest_charge as Stripe.Charge | null;
      const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;

      const stripeGross = pi.amount_received ?? 0;
      const stripeFee = bt?.fee ?? null;
      const stripeNet = bt?.net ?? null;

      // 同一PIを持つ全completed行（reconcile対象外の兄弟行も含む）の合計と突合する。
      const { data: allGroupTxs } = await admin
        .from("transactions")
        .select("transaction_id, total_gross_amount")
        .eq("stripe_payment_intent_id", piId)
        .eq("status", "completed");
      const groupDbGross = (allGroupTxs ?? []).reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);
      const isFullGroupPresent = (allGroupTxs?.length ?? 0) === groupTxs.length;

      const grossDiff = stripeGross - groupDbGross;
      const grossMatch = grossDiff === 0;

      console.log(
        `[reconcile] pi=${piId} rows=${groupTxs.length}` +
        ` stripe_gross=${stripeGross} db_gross=${groupDbGross} diff=${grossDiff} match=${grossMatch}` +
        ` stripe_fee=${stripeFee} stripe_net=${stripeNet}`
      );

      // stripeFee/stripeNetを各行のgross比率で按分する。対象行がグループ全体を
      // 網羅している場合は端数を最後の1行に寄せて過不足なく配分する。
      const sortedGroupTxs = [...groupTxs].sort(
        (a, b) => (b.total_gross_amount ?? 0) - (a.total_gross_amount ?? 0)
      );
      let allocatedFee = 0;
      let allocatedNet = 0;

      for (let i = 0; i < sortedGroupTxs.length; i++) {
        const tx = sortedGroupTxs[i];
        const isLast = i === sortedGroupTxs.length - 1;
        const rowGross = tx.total_gross_amount ?? 0;

        let rowStripeFee: number | null = null;
        if (stripeFee !== null) {
          rowStripeFee = isLast && isFullGroupPresent
            ? stripeFee - allocatedFee
            : (groupDbGross > 0 ? Math.floor((stripeFee * rowGross) / groupDbGross) : stripeFee);
          allocatedFee += rowStripeFee;
        }
        let rowStripeNet: number | null = null;
        if (stripeNet !== null) {
          rowStripeNet = isLast && isFullGroupPresent
            ? stripeNet - allocatedNet
            : (groupDbGross > 0 ? Math.floor((stripeNet * rowGross) / groupDbGross) : stripeNet);
          allocatedNet += rowStripeNet;
        }

        if (grossMatch) {
          matched++;
        } else {
          mismatched++;
          mismatchDetails.push({
            transaction_id: tx.transaction_id,
            stripe_pi_id: tx.stripe_payment_intent_id,
            expected: groupDbGross,
            actual: stripeGross,
            diff: grossDiff,
          });
          console.warn(`[reconcile] MISMATCH pi=${piId} diff=${grossDiff}`);
        }

        // artist/orgのみこの行に按分されたstripe_net - platform_feeに調整。agentは固定。
        const allAccruedDists = ((tx.transaction_distributions ?? []) as any[]).filter(
          (d: any) => d.distribution_status === "accrued"
        );
        // agent・platform(運営取り分)はいずれもgross基準の固定額 → 按分対象外。
        // platformを除外し忘れると、platformの固定取り分までorganizer/artistの
        // 再分配プールに混ざり込み、organizer/artistの取り分が誤って圧縮される。
        const artistOrgDists = allAccruedDists.filter((d: any) => !["agent", "platform"].includes(d.distribution_role));
        const platformFee = (tx as any).platform_fee ?? 0;
        const artistOrgTarget = rowStripeNet !== null ? rowStripeNet - platformFee : null;
        const artistOrgEstimated = artistOrgDists.reduce((s: number, d: any) => s + (d.actual_amount ?? 0), 0);

        if (artistOrgTarget !== null && artistOrgEstimated > 0 && artistOrgTarget !== artistOrgEstimated) {
          const agentTotal = allAccruedDists
            .filter((d: any) => d.distribution_role === "agent")
            .reduce((s: number, d: any) => s + (d.actual_amount ?? 0), 0);
          console.log(
            `[reconcile] ADJUST_DIST tx=${tx.transaction_id}` +
            ` artist_org_estimated=${artistOrgEstimated} target=${artistOrgTarget} diff=${artistOrgTarget - artistOrgEstimated}` +
            ` agent(fixed)=${agentTotal} platform_fee=${platformFee} stripe_net(row)=${rowStripeNet}`
          );
          const sortedDists = [...artistOrgDists].sort((a: any, b: any) => b.actual_amount - a.actual_amount);
          let allocated = 0;
          for (let j = 0; j < sortedDists.length; j++) {
            const d = sortedDists[j] as any;
            const isLastDist = j === sortedDists.length - 1;
            const adjustedAmount = isLastDist
              ? artistOrgTarget - allocated
              : Math.floor((d.actual_amount / artistOrgEstimated) * artistOrgTarget);
            console.log(`[reconcile]   dist=${d.transaction_distribution_id} role=${d.distribution_role} profile=${d.profile_id} before=${d.actual_amount} after=${adjustedAmount}`);
            await admin
              .from("transaction_distributions")
              .update({
                actual_amount: adjustedAmount,
                // 初回調整時のみ記録（再実行で上書きしない）
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
            stripe_fee_actual: rowStripeFee,
            stripe_net_actual: rowStripeNet,
            reconciled_at: now.toISOString(),
            reconcile_error: null,
          })
          .eq("transaction_id", tx.transaction_id);
      }
    } catch (err: any) {
      const errMsg: string = err?.message ?? String(err);
      console.error("[reconcile] pi error:", piId, errMsg);
      for (const tx of groupTxs) {
        errors++;
        errorDetails.push({
          transaction_id: tx.transaction_id,
          stripe_pi_id: tx.stripe_payment_intent_id,
          error: errMsg,
        });
        // reconciled_at はセットしない → 次回実行で再試行される
        await admin
          .from("transactions")
          .update({ reconcile_error: errMsg })
          .eq("transaction_id", tx.transaction_id);
      }
    }
  }

  // 全照合済みならイベントフラグを更新
  const { count: remaining } = await admin
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .in("qr_config_id", qrIds)
    .eq("status", "completed")
    .is("reconciled_at", null);

  if (remaining === 0 && targets.length > 0) {
    await admin
      .from("events")
      .update({ reconciled_at: now.toISOString() })
      .eq("event_id", eventId)
      .is("reconciled_at", null);
  }

  const checked = targets.length;
  const reconciled = matched + mismatched;

  await admin.from("reconciliation_logs").insert({
    run_at: now.toISOString(),
    target_date: now.toISOString().slice(0, 10),
    total_checked: checked,
    total_matched: matched,
    total_mismatched: mismatched,
    total_errors: errors,
    // 実行時点のスナップショットとして明細を保存する（後続実行で transactions テーブルの
    // 状態が変わっても、このログ行が示す明細は変化しない）
    summary: {
      manual: true,
      event_id: eventId,
      event_reconciled: remaining === 0,
      mismatches: mismatchDetails,
      errors: errorDetails,
    },
  });

  return NextResponse.json({
    checked,
    reconciled,
    errors,
    mismatched,
    event_reconciled: remaining === 0,
    errorDetails,
    mismatchDetails,
  });
}
