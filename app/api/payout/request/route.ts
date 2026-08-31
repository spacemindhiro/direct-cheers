import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRANSFER_FEE, HOLD_DAYS, FEE_WAIVER_DAYS } from "@/lib/payout-config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type PayoutPool = "free" | "fee";

type ReversalRecord = {
  sourceTransferId: string;
  stripeReversalId: string;
  amount: number;
  taxAmount: number; // floor(amount × 10/110) — 明細確定時に計算・保存する
};

// 複数 transfer から targetAmount 分を Reversal してプラットフォームに回収
// 各 reversal の結果を返す（DB記録用）
const collectFeeByReversal = async (
  transferIds: string[],
  targetAmount: number,
): Promise<{ collected: number; reversals: ReversalRecord[] }> => {
  let remaining = targetAmount;
  const reversals: ReversalRecord[] = [];
  for (const transferId of transferIds) {
    if (remaining <= 0) break;
    try {
      const tr = await stripe.transfers.retrieve(transferId);
      const reversible = tr.amount - tr.amount_reversed;
      if (reversible <= 0) continue;
      const toReverse = Math.min(reversible, remaining);
      const reversal = await stripe.transfers.createReversal(transferId, { amount: toReverse });
      reversals.push({
        sourceTransferId: transferId,
        stripeReversalId: reversal.id,
        amount: toReverse,
        taxAmount: Math.floor(toReverse * 10 / 110),
      });
      remaining -= toReverse;
    } catch (err: any) {
      console.error(`[payout/request] reversal失敗 transfer=${transferId}:`, err.message);
    }
  }
  return { collected: targetAmount - remaining, reversals };
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, balance_frozen, stripe_connect_id")
    .eq("profile_id", user.id)
    .single();

  if (profile?.balance_frozen)
    return NextResponse.json({ error: "残高が凍結されています" }, { status: 403 });

  if (!profile?.stripe_connect_id)
    return NextResponse.json({ error: "Stripe Connectアカウントが未設定です" }, { status: 400 });

  const { requested_amount, bypass_event_id, pool: rawPool } = await req.json() as {
    requested_amount: number;
    bypass_event_id?: string;
    pool?: PayoutPool;
  };
  // 省略時は従来通り手数料枠（後方互換）
  const pool: PayoutPool = rawPool === "free" ? "free" : "fee";

  if (pool === "fee" && (!requested_amount || requested_amount <= TRANSFER_FEE))
    return NextResponse.json(
      { error: `出金額は振込手数料 ¥${TRANSFER_FEE} より大きくしてください` },
      { status: 400 }
    );
  if (pool === "free" && !(requested_amount > 0))
    return NextResponse.json({ error: "出金額を入力してください" }, { status: 400 });

  const isAdmin = profile?.role === "admin";
  const useBypass = !!bypass_event_id && isAdmin;

  const holdCutoff = new Date(Date.now() - HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const freeCutoff = new Date(Date.now() - FEE_WAIVER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: availableDists } = await admin
    .from("transaction_distributions")
    .select(`
      transaction_distribution_id,
      actual_amount,
      event_id,
      hold_released,
      transaction:transactions!transaction_id(
        transaction_id,
        created_at,
        reconciled_at,
        amount_verified,
        amount_mismatch
      )
    `)
    .eq("profile_id", user.id)
    .eq("distribution_status", "accrued")
    .eq("is_frozen", false)
    .is("deleted_at", null);

  // 120日超過分は無料枠、14〜120日は手数料枠。無料枠と手数料枠は別出金として扱い、
  // 一回の出金申請が両枠にまたがらないようにする（枠ごとにeligibleDistsを絞り込む）。
  const eligibleDists = (availableDists ?? []).filter((d) => {
    const tx = d.transaction as any;
    if (!tx) return false;
    const isFree = !!tx.created_at && tx.created_at < freeCutoff;
    if (pool === "free") {
      if (!isFree) return false;
    } else {
      if (isFree) return false;
      const skipHold = (d as any).hold_released || (useBypass && (d as any).event_id === bypass_event_id);
      if (!skipHold && (!tx.created_at || tx.created_at >= holdCutoff)) return false;
    }
    if (!tx.reconciled_at) return false;
    if (tx.amount_verified === false || (tx.amount_mismatch ?? 0) !== 0) return false;
    return true;
  });

  // 照合待ちの件数は「出金可能額に含めない理由」の案内にのみ使う。
  // 特定のイベントが照合待ちのまま長期間停滞していても、他の照合済み売上の
  // 出金自体をブロックしない（eligibleDistsの算出時点で既に個別に除外済み）
  const unreconciledCount = (availableDists ?? []).filter((d) => {
    const tx = d.transaction as any;
    const isFree = !!tx?.created_at && tx.created_at < freeCutoff;
    if (pool === "free") {
      return isFree && !tx?.reconciled_at;
    }
    if (isFree) return false;
    if ((d as any).hold_released) return false;
    if (useBypass && (d as any).event_id === bypass_event_id) return false;
    return tx?.created_at && tx.created_at < holdCutoff && !tx.reconciled_at;
  }).length;

  const availableTotal = eligibleDists.reduce((s, d) => s + (d.actual_amount ?? 0), 0);

  if (requested_amount > availableTotal) {
    const pendingNote = unreconciledCount > 0
      ? `（うち ${unreconciledCount} 件は照合待ちのため対象外です。イベントの開催承認状況をご確認ください）`
      : "";
    const poolLabel = pool === "free" ? "無料出金可能額" : "出金可能額";
    return NextResponse.json(
      { error: `${poolLabel}（¥${availableTotal.toLocaleString()}）を超えています${pendingNote}` },
      { status: 400 }
    );
  }

  const netPayout = pool === "free" ? requested_amount : requested_amount - TRANSFER_FEE;

  // Stripe payout（Connect アカウント → 銀行口座）
  let stripeTransferId: string | null = null;
  try {
    const payout = await stripe.payouts.create(
      { amount: netPayout, currency: "jpy" },
      { stripeAccount: profile.stripe_connect_id }
    );
    stripeTransferId = payout.id;
  } catch (err: any) {
    return NextResponse.json({ error: `Stripe payout 失敗: ${err.message}` }, { status: 500 });
  }

  // 振込手数料をプラットフォームへ回収（全ロール共通: settle_transfers の Transfer を Reversal）
  // source_transaction Transfer も通常の Transfer も同じ Reversal API で回収できる。
  // 無料枠（120日超過）の出金は手数料自体が発生しないため回収処理を行わない。
  let reversalRecords: ReversalRecord[] = [];
  if (pool === "fee") {
    const payoutEventIds = [...new Set(
      (eligibleDists as any[]).map((d: any) => d.event_id).filter(Boolean) as string[]
    )];
    try {
      const { data: trs } = await admin
        .from("settle_transfers")
        .select("stripe_transfer_id")
        .eq("profile_id", user.id)
        .in("event_id", payoutEventIds)
        .order("created_at", { ascending: false });
      const ids = (trs ?? []).map((t) => t.stripe_transfer_id);
      const result = await collectFeeByReversal(ids, TRANSFER_FEE);
      reversalRecords = result.reversals;
    } catch (err: any) {
      console.error("[payout/request] 振込手数料回収失敗:", err.message);
    }
  }

  // payout_requests を作成
  const { data: payoutReq, error: prErr } = await admin
    .from("payout_requests")
    .insert({
      profile_id: user.id,
      requested_amount,
      stripe_fee_deducted: pool === "free" ? 0 : TRANSFER_FEE,
      net_payout_amount: netPayout,
      status: "completed",
      stripe_transfer_id: stripeTransferId,
    })
    .select("request_id")
    .single();

  if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });

  // 手数料回収ログを保存（Stripe 成功分のみ・1円単位で追跡可能）
  if (reversalRecords.length > 0) {
    await admin.from("transfer_fee_reversals").insert(
      reversalRecords.map((r) => ({
        payout_request_id: payoutReq.request_id,
        source_transfer_id: r.sourceTransferId,
        stripe_reversal_id: r.stripeReversalId,
        amount: r.amount,
        tax_amount: r.taxAmount,
        status: "succeeded",
      }))
    );
  }

  // 使用した distributions を paid に更新
  let remaining = requested_amount;
  const toMarkPaid: string[] = [];
  const sorted = [...eligibleDists].sort((a, b) =>
    ((a.transaction as any)?.created_at ?? "") < ((b.transaction as any)?.created_at ?? "") ? -1 : 1
  );
  for (const d of sorted) {
    if (remaining <= 0) break;
    toMarkPaid.push(d.transaction_distribution_id);
    remaining -= d.actual_amount ?? 0;
  }

  await admin
    .from("transaction_distributions")
    .update({ distribution_status: "paid" })
    .in("transaction_distribution_id", toMarkPaid);

  return NextResponse.json({
    success: true,
    request_id: payoutReq.request_id,
    net_payout: netPayout,
    stripe_transfer_id: stripeTransferId,
  });
}

export async function GET(_req: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holdCutoff = new Date(Date.now() - HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const freeCutoff = new Date(Date.now() - FEE_WAIVER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: dists } = await admin
    .from("transaction_distributions")
    .select(`
      actual_amount,
      distribution_status,
      is_frozen,
      hold_released,
      transaction:transactions!transaction_id(
        created_at,
        reconciled_at,
        amount_verified,
        amount_mismatch
      )
    `)
    .eq("profile_id", user.id)
    .eq("distribution_status", "accrued")
    .is("deleted_at", null);

  let available = 0;     // 手数料枠（14〜120日）
  let freeAvailable = 0; // 無料枠（120日超過）
  let pending = 0;
  let frozen = 0;

  for (const d of dists ?? []) {
    const tx = d.transaction as any;
    const amt = d.actual_amount ?? 0;
    if (d.is_frozen) {
      frozen += amt;
      continue;
    }
    const reconciled = !!tx?.reconciled_at;
    const verified = tx?.amount_verified !== false && (tx?.amount_mismatch ?? 0) === 0;
    if (!reconciled || !verified) {
      pending += amt;
      continue;
    }
    const isFree = !!tx?.created_at && tx.created_at < freeCutoff;
    const holdOk = (d as any).hold_released || (tx?.created_at && tx.created_at < holdCutoff);
    if (isFree) {
      freeAvailable += amt;
    } else if (holdOk) {
      available += amt;
    } else {
      pending += amt;
    }
  }

  const { data: history } = await admin
    .from("payout_requests")
    .select("request_id, requested_amount, net_payout_amount, stripe_fee_deducted, status, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    available,
    free_available: freeAvailable,
    pending,
    frozen,
    transfer_fee: TRANSFER_FEE,
    hold_days: HOLD_DAYS,
    fee_waiver_days: FEE_WAIVER_DAYS,
    history: history ?? [],
  });
}
