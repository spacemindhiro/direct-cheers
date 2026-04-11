import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const TRANSFER_FEE = 500; // 振込手数料 ¥500
const HOLD_DAYS = 14;     // 出金可能になるまでの日数

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

  const { requested_amount } = await req.json() as { requested_amount: number };

  if (!requested_amount || requested_amount <= TRANSFER_FEE)
    return NextResponse.json(
      { error: `出金額は振込手数料 ¥${TRANSFER_FEE} より大きくしてください` },
      { status: 400 }
    );

  // 出金可能残高を取得（14日以上前のトランザクションに紐づく accrued distributions）
  const cutoff = new Date(Date.now() - HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: availableDists } = await admin
    .from("transaction_distributions")
    .select("transaction_distribution_id, actual_amount, transaction:transactions!transaction_id(created_at)")
    .eq("profile_id", user.id)
    .eq("distribution_status", "accrued")
    .eq("is_frozen", false)
    .is("deleted_at", null);

  // 14日経過分のみ
  const eligibleDists = (availableDists ?? []).filter((d) => {
    const txDate = (d.transaction as any)?.created_at;
    return txDate && txDate < cutoff;
  });

  const availableTotal = eligibleDists.reduce((s, d) => s + (d.actual_amount ?? 0), 0);

  if (requested_amount > availableTotal)
    return NextResponse.json(
      { error: `出金可能額（¥${availableTotal.toLocaleString()}）を超えています` },
      { status: 400 }
    );

  const netPayout = requested_amount - TRANSFER_FEE;

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

  // payout_requests を作成
  const { data: payoutReq, error: prErr } = await admin
    .from("payout_requests")
    .insert({
      profile_id: user.id,
      requested_amount,
      stripe_fee_deducted: TRANSFER_FEE,
      net_payout_amount: netPayout,
      status: "completed",
      stripe_transfer_id: stripeTransferId,
    })
    .select("request_id")
    .single();

  if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });

  // 使用した distributions を paid に更新
  // 要求額に達するまで古い順に充当
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

  const cutoff = new Date(Date.now() - HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: dists } = await admin
    .from("transaction_distributions")
    .select("actual_amount, distribution_status, is_frozen, transaction:transactions!transaction_id(created_at)")
    .eq("profile_id", user.id)
    .eq("distribution_status", "accrued")
    .is("deleted_at", null);

  let available = 0;
  let pending = 0;
  let frozen = 0;

  for (const d of dists ?? []) {
    const txDate = (d.transaction as any)?.created_at;
    const amt = d.actual_amount ?? 0;
    if (d.is_frozen) {
      frozen += amt;
    } else if (txDate && txDate < cutoff) {
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
    pending,
    frozen,
    transfer_fee: TRANSFER_FEE,
    hold_days: HOLD_DAYS,
    history: history ?? [],
  });
}
