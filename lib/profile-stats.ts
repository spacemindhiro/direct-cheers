// 統計タブ（app/[locale]/dashboard/statistics）の集計。画面とチアリー(AI) の my_stats で共用する。
//
// 以前は画面の中で .limit() なしに取得しており、PostgREST の既定の上限（1000件）を超えた分が黙って落ちていた。
// 切り出しにあわせて全件をページ送りで取る（fetchAllPages）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { getFeeConfig } from "@/lib/fee-config";

export type ProfileStats = {
  sent: { count: number; amount: number };
  // 受け取りチア（商品のアーティストが本人の決済）。ロールが上がった後もアーティスト時代の実績を出す
  artist: { count: number; gross: number; netEstimate: number } | null;
  // 受取配分（配分の明細で本人に割り当てられた分）
  received: { count: number; amount: number } | null;
};

export const EARNER_ROLES = ["artist", "organizer", "agent"];

export async function computeProfileStats(
  admin: SupabaseClient,
  supabase: SupabaseClient,
  me: { userId: string; email: string | null; role: string },
): Promise<ProfileStats> {
  // 送ったチア：本人のアカウントで送ったものと、ログイン前に同じメールアドレスで送ったもの（重複は除く）
  const sentCols = "transaction_id, total_gross_amount";
  const [byProfile, byEmail] = await Promise.all([
    fetchAllPages<{ transaction_id: string; total_gross_amount: number | null }>(admin as never, "transactions", sentCols,
      (q) => q.eq("sender_profile_id", me.userId).eq("status", "completed").neq("transaction_type", "invitation")),
    me.email
      ? fetchAllPages<{ transaction_id: string; total_gross_amount: number | null }>(admin as never, "transactions", sentCols,
          (q) => q.eq("sender_email", me.email).eq("status", "completed").neq("transaction_type", "invitation"))
      : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  let sentAmount = 0;
  for (const tx of [...byProfile, ...byEmail]) {
    if (seen.has(tx.transaction_id)) continue;
    seen.add(tx.transaction_id);
    sentAmount += tx.total_gross_amount ?? 0;
  }
  const stats: ProfileStats = { sent: { count: seen.size, amount: sentAmount }, artist: null, received: null };
  if (!EARNER_ROLES.includes(me.role)) return stats;

  const dists = await fetchAllPages<{ actual_amount: number | null; transaction: { status: string } | null }>(
    admin as never, "transaction_distributions", "actual_amount, transaction:transactions!transaction_id(status)",
    (q) => q.eq("profile_id", me.userId).is("deleted_at", null),
  );
  const completed = dists.filter((d) => d.transaction?.status === "completed");
  stats.received = { count: completed.length, amount: completed.reduce((s, d) => s + (d.actual_amount ?? 0), 0) };

  // 本人のセッション（RLS）で読む。商品のアーティストが本人のものだけを DB 側で絞る
  const sales = await fetchAllPages<{ total_gross_amount: number | null }>(
    supabase as never, "transactions", "total_gross_amount, product:products!product_id!inner(artist_id)",
    (q) => q.eq("status", "completed").eq("product.artist_id", me.userId),
  );
  if (sales.length > 0) {
    const { net_rate } = await getFeeConfig();
    const gross = sales.reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);
    stats.artist = { count: sales.length, gross, netEstimate: Math.floor(gross * net_rate) };
  }
  return stats;
}
