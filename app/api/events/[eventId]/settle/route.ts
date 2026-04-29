import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { getFeeConfig } from "@/lib/fee-config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const { net_rate: NET_RATE, agent_fee_rate: AGENT_FEE_RATE } = await getFeeConfig();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (me?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // イベント取得
  const { data: event } = await admin
    .from("events")
    .select("event_id, title, organizer_profile_id, agent_id, end_at, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.lifecycle_status === "settled")
    return NextResponse.json({ error: "Already settled" }, { status: 400 });

  // エビデンス確認
  const { data: evidence } = await admin
    .from("event_evidences")
    .select("evidence_id")
    .eq("event_id", eventId)
    .limit(1)
    .maybeSingle();

  if (!evidence)
    return NextResponse.json({ error: "No evidence submitted" }, { status: 400 });

  // 既存 settlement_summary チェック（冪等）
  const { data: existingSummary } = await admin
    .from("settlement_summaries")
    .select("summary_id, is_approved_for_payout")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingSummary?.is_approved_for_payout)
    return NextResponse.json({ error: "Already approved" }, { status: 400 });

  // このイベントに紐づく qr_configs を取得
  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("event_id", eventId)
    .is("deleted_at", null);

  const qrConfigIds = (qrConfigs ?? []).map((q) => q.qr_config_id);

  if (qrConfigIds.length === 0)
    return NextResponse.json({ error: "No QR configs for this event" }, { status: 400 });

  // トランザクション取得
  const { data: transactions } = await admin
    .from("transactions")
    .select("transaction_id, qr_config_id, total_gross_amount, status")
    .in("qr_config_id", qrConfigIds)
    .eq("status", "completed");

  if (!transactions || transactions.length === 0)
    return NextResponse.json({ error: "No completed transactions" }, { status: 400 });

  const totalGross = transactions.reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);

  // qr_config_targets（分配先・比率）を取得
  const { data: targets } = await admin
    .from("qr_config_targets")
    .select(`
      qr_config_id,
      profile_id,
      distribution_ratio,
      profile:profiles!profile_id(role, stripe_connect_id)
    `)
    .in("qr_config_id", qrConfigIds)
    .is("deleted_at", null);

  // qr_config_id ごとにターゲットをマップ
  const targetsByQr = new Map<string, typeof targets>();
  for (const t of targets ?? []) {
    const list = targetsByQr.get(t.qr_config_id) ?? [];
    list.push(t);
    targetsByQr.set(t.qr_config_id, list);
  }

  // profile ごとの合計分配額を集計
  const profileAmounts = new Map<string, { amount: number; role: string; stripe_connect_id: string | null }>();
  const distributionRows: {
    transaction_id: string;
    event_id: string;
    profile_id: string;
    distribution_role: string;
    actual_amount: number;
    distribution_status: string;
  }[] = [];

  for (const tx of transactions) {
    const net = Math.floor((tx.total_gross_amount ?? 0) * NET_RATE);
    const txTargets = targetsByQr.get(tx.qr_config_id ?? "") ?? [];

    for (const target of txTargets) {
      const amount = Math.floor(net * Number(target.distribution_ratio));
      if (amount <= 0) continue;

      const profileRole = (target.profile as any)?.role ?? "artist";
      const distRole = ["artist", "organizer", "agent"].includes(profileRole)
        ? profileRole
        : "artist";

      distributionRows.push({
        transaction_id: tx.transaction_id,
        event_id: eventId,
        profile_id: target.profile_id,
        distribution_role: distRole,
        actual_amount: amount,
        distribution_status: "accrued",
      });

      const existing = profileAmounts.get(target.profile_id);
      profileAmounts.set(target.profile_id, {
        amount: (existing?.amount ?? 0) + amount,
        role: distRole,
        stripe_connect_id: (target.profile as any)?.stripe_connect_id ?? null,
      });
    }
  }

  // エージェント手数料 — pay/complete で積み上げ済みのレコードを Transfer 対象に加算し、
  // 未作成（コード変更前の古いトランザクション等）は補完作成する
  if (event.agent_id) {
    const [{ data: agentProfile }, { data: existingAgentDists }] = await Promise.all([
      admin.from("profiles").select("stripe_connect_id").eq("profile_id", event.agent_id).single(),
      admin.from("transaction_distributions")
        .select("transaction_id, actual_amount")
        .eq("event_id", eventId)
        .eq("profile_id", event.agent_id)
        .eq("distribution_role", "agent"),
    ]);

    const existingByTxId = new Map(
      (existingAgentDists ?? []).map((d) => [d.transaction_id, d.actual_amount])
    );

    let totalAgentAmount = 0;

    for (const tx of transactions) {
      const agentFee = existingByTxId.has(tx.transaction_id)
        ? (existingByTxId.get(tx.transaction_id) ?? 0)
        : Math.floor((tx.total_gross_amount ?? 0) * AGENT_FEE_RATE);

      if (agentFee <= 0) continue;

      if (!existingByTxId.has(tx.transaction_id)) {
        distributionRows.push({
          transaction_id: tx.transaction_id,
          event_id: eventId,
          profile_id: event.agent_id,
          distribution_role: "agent",
          actual_amount: agentFee,
          distribution_status: "accrued",
        });
      }

      totalAgentAmount += agentFee;
    }

    if (totalAgentAmount > 0) {
      profileAmounts.set(event.agent_id, {
        amount: totalAgentAmount,
        role: "agent",
        stripe_connect_id: agentProfile?.stripe_connect_id ?? null,
      });
    }
  }

  // transaction_distributions を一括挿入
  if (distributionRows.length > 0) {
    const { error: distErr } = await admin
      .from("transaction_distributions")
      .insert(distributionRows);
    if (distErr)
      return NextResponse.json({ error: distErr.message }, { status: 500 });
  }

  // Stripe transfers（Connect アカウントへ送金）
  const transferResults: { profile_id: string; amount: number; transfer_id: string | null; error?: string }[] = [];
  for (const [profileId, info] of profileAmounts.entries()) {
    if (!info.stripe_connect_id || info.amount <= 0) {
      transferResults.push({ profile_id: profileId, amount: info.amount, transfer_id: null });
      continue;
    }
    try {
      const transfer = await stripe.transfers.create({
        amount: info.amount,
        currency: "jpy",
        destination: info.stripe_connect_id,
        metadata: { event_id: eventId, profile_id: profileId },
      });
      transferResults.push({ profile_id: profileId, amount: info.amount, transfer_id: transfer.id });
      await admin.from("settle_transfers").insert({
        event_id: eventId,
        profile_id: profileId,
        stripe_transfer_id: transfer.id,
        amount: info.amount,
      });
    } catch (err: any) {
      transferResults.push({ profile_id: profileId, amount: info.amount, transfer_id: null, error: err.message });
    }
  }

  // settlement_summary を upsert
  if (existingSummary) {
    await admin
      .from("settlement_summaries")
      .update({
        is_approved_for_payout: true,
        approved_at: new Date().toISOString(),
        approved_by_profile_id: user.id,
        total_gross_amount: totalGross,
      })
      .eq("summary_id", existingSummary.summary_id);
  } else {
    await admin.from("settlement_summaries").insert({
      event_id: eventId,
      is_approved_for_payout: true,
      approved_at: new Date().toISOString(),
      approved_by_profile_id: user.id,
      total_gross_amount: totalGross,
    });
  }

  // イベントを settled に更新
  await admin
    .from("events")
    .update({ lifecycle_status: "settled" })
    .eq("event_id", eventId);

  // オーガナイザーの差戻し通知 + adminの証跡提出通知を既読化
  const { data: ev } = await admin
    .from("events")
    .select("organizer_profile_id")
    .eq("event_id", eventId)
    .single();
  if (ev?.organizer_profile_id) {
    await admin
      .from("notifications")
      .update({ is_read: true })
      .eq("profile_id", ev.organizer_profile_id)
      .eq("type", "evidence_rejected")
      .filter("metadata->>event_id", "eq", eventId);
  }
  // adminへの証跡提出通知を既読化
  await admin
    .from("notifications")
    .update({ is_read: true })
    .eq("type", "evidence_submitted")
    .filter("metadata->>event_id", "eq", eventId);

  return NextResponse.json({
    success: true,
    total_gross: totalGross,
    distributions: distributionRows.length,
    transfers: transferResults,
  });
}
