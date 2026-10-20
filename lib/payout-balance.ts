// 出金管理画面の残高（無料出金可能・出金可能・保留中・凍結中）とイベント別の内訳。
// 出金管理画面（app/[locale]/dashboard/payout/page.tsx）とチアリー(AI) の MCP ツールで共用する（計算は画面から切り出したまま）。
// 実際に出金できる額の最終判定は出金API（app/api/payout/request）側で行う。ここは表示用。
/* eslint-disable @typescript-eslint/no-explicit-any -- 埋め込み select の行を画面と同じ書き方で扱うため */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOLD_DAYS, FEE_WAIVER_DAYS, FREE_POOL_MONTHLY_LIMIT, getJstMonthStartIso } from "@/lib/payout-config";

export type PayoutEventRow = {
  event_id: string;
  title: string;
  lifecycle_status: string;
  reconciled_at: string | null;
  available: number;
  freeAvailable: number;
  pending: number;
  frozen: number;
  latestTxDate: string | null; // pending の中で最も新しい（＝最後に解放される）
};

export type PayoutBalances = {
  available: number;
  freeAvailable: number;
  pending: number;
  frozen: number;
  eventRows: PayoutEventRow[];
};

// admin は service_role。profileId の本人分だけを読む
export async function computePayoutBalances(admin: SupabaseClient, profileId: string, now: Date = new Date()): Promise<PayoutBalances> {
  const cutoff = new Date(now.getTime() - HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const freeCutoff = new Date(now.getTime() - FEE_WAIVER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 未精算（distributions未作成）の見込み保留額をイベント別に加算するため先に取得
  const { data: myTargets } = await admin
    .from("qr_config_targets")
    .select(`
      qr_config_id, distribution_ratio,
      qr_config:qr_configs!qr_config_id(
        event_id,
        event:events!event_id(event_id, title, lifecycle_status, reconciled_at)
      )
    `)
    .eq("profile_id", profileId)
    .is("deleted_at", null);

  // 配分済み: actual_amount を使用（照合調整済みの金額を反映）
  const { data: dists } = await admin
    .from("transaction_distributions")
    .select(`
      is_frozen, hold_released, transaction_id, actual_amount,
      transaction:transactions!transaction_id(
        created_at, qr_config_id, status,
        qr_config:qr_configs!qr_config_id(
          event_id,
          event:events!event_id(event_id, title, lifecycle_status, reconciled_at)
        )
      )
    `)
    .eq("profile_id", profileId)
    .eq("distribution_status", "accrued")
    .is("deleted_at", null);

  // distributions作成済み判定用: accrued/paid問わず、既に行が存在する取引は
  // 「distributions未作成」の見込み計算(下記)から除外する
  const { data: allDistTxRows } = await admin
    .from("transaction_distributions")
    .select("transaction_id")
    .eq("profile_id", profileId)
    .is("deleted_at", null);
  const distributedTxIds = new Set((allDistTxRows ?? []).map((d) => d.transaction_id));

  // イベント別集計
  const eventMap = new Map<string, PayoutEventRow>();

  let available = 0;
  let freeAvailable = 0;
  let pending = 0;
  let frozen = 0;

  for (const d of dists ?? []) {
    const tx = (d as any).transaction;
    // completedのトランザクションのみ集計（cancelled/failed/requires_captureは除外）
    if (tx?.status !== "completed") continue;

    const qrConfig = tx?.qr_config;
    const event = qrConfig?.event;
    const eventId: string = event?.event_id ?? "__unknown__";
    const txDate: string | null = tx?.created_at ?? null;
    // 照合調整済みの実績額を使用（formula再計算はしない）
    const amt = (d as any).actual_amount ?? 0;

    if (!eventMap.has(eventId)) {
      eventMap.set(eventId, {
        event_id: eventId,
        title: event?.title ?? "不明なイベント",
        lifecycle_status: event?.lifecycle_status ?? "",
        reconciled_at: event?.reconciled_at ?? null,
        available: 0, freeAvailable: 0, pending: 0, frozen: 0,
        latestTxDate: null,
      });
    }
    const row = eventMap.get(eventId)!;

    const isSettledAndReconciled = event?.lifecycle_status === "settled" && event?.reconciled_at !== null;
    const isFree = isSettledAndReconciled && !!txDate && txDate < freeCutoff;
    const holdCleared = (d as any).hold_released || (isSettledAndReconciled && txDate && txDate < cutoff);

    if (d.is_frozen) {
      frozen += amt;
      row.frozen += amt;
    } else if (isFree) {
      freeAvailable += amt;
      row.freeAvailable += amt;
    } else if (holdCleared) {
      available += amt;
      row.available += amt;
    } else {
      pending += amt;
      row.pending += amt;
      if (!row.latestTxDate || (txDate && txDate > row.latestTxDate)) {
        row.latestTxDate = txDate;
      }
    }
  }

  // 未精算（distributions未作成）の見込み保留額をイベント別に加算
  if ((myTargets ?? []).length > 0) {
    const qrConfigIds = myTargets!.map((t) => t.qr_config_id);
    const { data: unsettledTxs } = await admin
      .from("transactions")
      .select("transaction_id, qr_config_id, total_gross_amount, net_amount, created_at")
      .in("qr_config_id", qrConfigIds)
      .eq("status", "completed");

    for (const tx of unsettledTxs ?? []) {
      if (distributedTxIds.has(tx.transaction_id)) continue;
      const target = myTargets!.find((t) => t.qr_config_id === tx.qr_config_id);
      if (!target) continue;
      const ratio = Number(target.distribution_ratio ?? 0);
      if (ratio <= 0) continue;
      const amt = Math.floor(((tx as any).net_amount ?? 0) * ratio);
      if (amt <= 0) continue;

      const event = (target as any).qr_config?.event;
      const eventId: string = event?.event_id ?? "__unknown__";
      if (!eventMap.has(eventId)) {
        eventMap.set(eventId, {
          event_id: eventId,
          title: event?.title ?? "不明なイベント",
          lifecycle_status: event?.lifecycle_status ?? "",
          reconciled_at: event?.reconciled_at ?? null,
          available: 0, freeAvailable: 0, pending: 0, frozen: 0,
          latestTxDate: null,
        });
      }
      const row = eventMap.get(eventId)!;
      pending += amt;
      row.pending += amt;
      const txDate = tx.created_at ?? null;
      if (!row.latestTxDate || (txDate && txDate > row.latestTxDate)) {
        row.latestTxDate = txDate;
      }
    }
  }

  const eventRows = [...eventMap.values()]
    .filter((r) => r.available + r.freeAvailable + r.pending + r.frozen > 0)
    .sort((a, b) => (b.available + b.freeAvailable + b.pending) - (a.available + a.freeAvailable + a.pending));

  return { available, freeAvailable, pending, frozen, eventRows };
}

// 無料枠（120日超過分）の出金は月1回まで。今月分を使い切っているか
export async function isFreePayoutUsedThisMonth(admin: SupabaseClient, profileId: string, now: Date = new Date()): Promise<boolean> {
  const { count: freeCountThisMonth } = await admin
    .from("payout_requests")
    .select("request_id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("stripe_fee_deducted", 0)
    .eq("status", "completed")
    .gte("created_at", getJstMonthStartIso(now));
  return (freeCountThisMonth ?? 0) >= FREE_POOL_MONTHLY_LIMIT;
}
