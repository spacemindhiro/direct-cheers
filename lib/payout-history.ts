// 出金履歴（直近20件）と着金予定日。出金管理画面とチアリー(AI) の MCP ツールで共用する（画面から切り出したまま）。
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PayoutHistoryRow = {
  request_id: string;
  requested_amount: number;
  net_payout_amount: number;
  stripe_fee_deducted: number;
  status: string;
  created_at: string;
  stripe_transfer_id: string | null;
};

// Stripe の payout を引く関数（テストで差し替えられるようにする）
export type RetrievePayout = (payoutId: string, stripeAccount: string) => Promise<{ arrival_date: number | null }>;

let stripeClient: Stripe | null = null;
const defaultRetrieve: RetrievePayout = async (payoutId, stripeAccount) => {
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return stripeClient.payouts.retrieve(payoutId, { stripeAccount });
};

// admin は service_role。profileId の本人分だけを読む
export async function getPayoutHistory(
  admin: SupabaseClient,
  profileId: string,
  stripeConnectId: string | null,
  now: Date = new Date(),
  retrieve: RetrievePayout = defaultRetrieve,
): Promise<{ history: PayoutHistoryRow[]; arrivalDates: Map<string, number> }> {
  // 出金履歴
  const { data: history } = await admin
    .from("payout_requests")
    .select("request_id, requested_amount, net_payout_amount, stripe_fee_deducted, status, created_at, stripe_transfer_id")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(20);

  // 着金予定日は Stripe の payout.arrival_date（土日・銀行休業日を織り込んだ値）が正。
  // DBには持っていないので、まだ着金していない可能性がある分だけ payout を引く
  // （着金の目安は最大4営業日なので、暦日で10日前までを対象にすれば足りる）。
  // 履歴20件ぶん全部引くとページ表示のたびに Stripe へ20回叩くことになるため絞る。
  const arrivalLookbackIso = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const arrivalDates = new Map<string, number>();
  if (stripeConnectId) {
    const recent = (history ?? []).filter(
      (h) => h.stripe_transfer_id && h.created_at >= arrivalLookbackIso
    );
    await Promise.all(
      recent.map(async (h) => {
        try {
          const payout = await retrieve(h.stripe_transfer_id!, stripeConnectId);
          if (payout.arrival_date) arrivalDates.set(h.request_id, payout.arrival_date);
        } catch (err) {
          // 予定日が出ないだけで履歴自体は見せる（Stripe障害・テスト/本番キーの食い違いなど）
          console.error(`[payout] arrival_date取得失敗 payout=${h.stripe_transfer_id}:`, (err as Error).message);
        }
      })
    );
  }
  return { history: (history ?? []) as PayoutHistoryRow[], arrivalDates };
}
