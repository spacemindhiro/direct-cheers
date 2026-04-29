import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const TRANSFER_FEE = 500;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
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

  // 精算済みイベントのみ対象
  const { data: event } = await admin
    .from("events")
    .select("event_id, title, lifecycle_status")
    .eq("event_id", eventId)
    .single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.lifecycle_status !== "settled")
    return NextResponse.json({ error: "精算済みのイベントのみ強制出金できます" }, { status: 400 });

  // このイベントの accrued distributions を全員分取得
  const { data: dists } = await admin
    .from("transaction_distributions")
    .select(`
      transaction_distribution_id,
      profile_id,
      actual_amount,
      transaction:transactions!transaction_id(
        created_at,
        reconciled_at,
        amount_verified,
        amount_mismatch
      )
    `)
    .eq("event_id", eventId)
    .eq("distribution_status", "accrued")
    .eq("is_frozen", false)
    .is("deleted_at", null);

  if (!dists || dists.length === 0)
    return NextResponse.json({ error: "出金対象の残高がありません" }, { status: 400 });

  // profile_id ごとに集計（通常出金と同じ照合・金額チェックを適用、14日チェックのみスキップ）
  const profileMap = new Map<string, { distIds: string[]; amount: number }>();
  for (const d of dists) {
    const tx = d.transaction as any;
    if (!tx?.reconciled_at) continue;
    if (tx.amount_verified === false || (tx.amount_mismatch ?? 0) !== 0) continue;

    const existing = profileMap.get(d.profile_id) ?? { distIds: [], amount: 0 };
    existing.distIds.push(d.transaction_distribution_id);
    existing.amount += d.actual_amount ?? 0;
    profileMap.set(d.profile_id, existing);
  }

  if (profileMap.size === 0)
    return NextResponse.json({ error: "照合完了済みの残高がありません" }, { status: 400 });

  // stripe_connect_id を一括取得
  const profileIds = Array.from(profileMap.keys());
  const { data: profiles } = await admin
    .from("profiles")
    .select("profile_id, stripe_connect_id, balance_frozen")
    .in("profile_id", profileIds);

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.profile_id, p])
  );

  // 各プロファイルへ Stripe Payout + レコード更新
  const results: { profile_id: string; amount: number; status: string; error?: string }[] = [];

  for (const [profileId, info] of profileMap.entries()) {
    const profile = profileById.get(profileId);

    if (profile?.balance_frozen) {
      results.push({ profile_id: profileId, amount: info.amount, status: "skipped", error: "残高凍結中" });
      continue;
    }
    if (!profile?.stripe_connect_id) {
      results.push({ profile_id: profileId, amount: info.amount, status: "skipped", error: "Stripe Connect未設定" });
      continue;
    }
    if (info.amount <= TRANSFER_FEE) {
      results.push({ profile_id: profileId, amount: info.amount, status: "skipped", error: "残高が振込手数料以下" });
      continue;
    }

    const netPayout = info.amount - TRANSFER_FEE;

    try {
      const payout = await stripe.payouts.create(
        { amount: netPayout, currency: "jpy" },
        { stripeAccount: profile.stripe_connect_id }
      );

      await Promise.all([
        admin.from("payout_requests").insert({
          profile_id: profileId,
          requested_amount: info.amount,
          stripe_fee_deducted: TRANSFER_FEE,
          net_payout_amount: netPayout,
          status: "completed",
          stripe_transfer_id: payout.id,
        }),
        admin.from("transaction_distributions")
          .update({ distribution_status: "paid" })
          .in("transaction_distribution_id", info.distIds),
      ]);

      results.push({ profile_id: profileId, amount: info.amount, status: "paid" });
    } catch (err: any) {
      results.push({ profile_id: profileId, amount: info.amount, status: "error", error: err.message });
    }
  }

  return NextResponse.json({ success: true, results });
}
