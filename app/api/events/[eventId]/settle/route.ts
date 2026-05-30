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
  const { agent_fee_rate: AGENT_FEE_RATE } = await getFeeConfig();

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

  // オーガナイザーの Stripe Connect ID
  const { data: organizerProfile } = await admin
    .from("profiles")
    .select("stripe_connect_id")
    .eq("profile_id", event.organizer_profile_id)
    .single();
  const organizerConnectId = organizerProfile?.stripe_connect_id ?? null;

  // 確定済みアーティスト（出演承認済みのみ分配対象）
  const { data: confirmedArtists } = await admin
    .from("event_artists")
    .select("artist_profile_id")
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .is("deleted_at", null);
  const confirmedArtistIds = new Set((confirmedArtists ?? []).map((ea) => ea.artist_profile_id));

  // このイベントに紐づく qr_configs を取得
  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("event_id", eventId)
    .is("deleted_at", null);

  const qrConfigIds = (qrConfigs ?? []).map((q) => q.qr_config_id);

  if (qrConfigIds.length === 0)
    return NextResponse.json({ error: "No QR configs for this event" }, { status: 400 });

  // トランザクション取得（招待は精算対象外）
  const { data: transactions } = await admin
    .from("transactions")
    .select("transaction_id, qr_config_id, total_gross_amount, net_amount, status, stripe_payment_intent_id")
    .in("qr_config_id", qrConfigIds)
    .eq("status", "completed")
    .neq("transaction_type", "invitation");

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

  // profile ごとの合計分配額を集計（Transfer 用）
  const profileAmounts = new Map<string, { amount: number; role: string; stripe_connect_id: string | null }>();

  // トランザクションごと・プロフィールごとの確定額（UPDATE/INSERT 用）
  type DistEntry = { txId: string; profileId: string; role: string; amount: number; connectId: string | null };
  const desiredDists = new Map<string, DistEntry>();

  for (const tx of transactions) {
    const net = (tx as any).net_amount ?? 0;
    const txTargets = targetsByQr.get(tx.qr_config_id ?? "") ?? [];

    for (const target of txTargets) {
      const amount = Math.floor(net * Number(target.distribution_ratio));
      if (amount <= 0) continue;

      const profileRole = (target.profile as any)?.role ?? "artist";
      const distRole = ["artist", "organizer", "agent"].includes(profileRole)
        ? profileRole
        : "artist";

      const isUnconfirmedArtist =
        profileRole === "artist" && !confirmedArtistIds.has(target.profile_id);
      const effectiveProfileId = isUnconfirmedArtist
        ? event.organizer_profile_id
        : target.profile_id;
      const effectiveRole = isUnconfirmedArtist ? "organizer" : distRole;
      const effectiveConnectId = isUnconfirmedArtist
        ? organizerConnectId
        : ((target.profile as any)?.stripe_connect_id ?? null);

      const key = `${tx.transaction_id}/${effectiveProfileId}/${effectiveRole}`;
      const prev = desiredDists.get(key);
      desiredDists.set(key, {
        txId: tx.transaction_id,
        profileId: effectiveProfileId,
        role: effectiveRole,
        amount: (prev?.amount ?? 0) + amount,
        connectId: prev?.connectId ?? effectiveConnectId,
      });

      const existingAmt = profileAmounts.get(effectiveProfileId);
      profileAmounts.set(effectiveProfileId, {
        amount: (existingAmt?.amount ?? 0) + amount,
        role: effectiveRole,
        stripe_connect_id: existingAmt?.stripe_connect_id ?? effectiveConnectId,
      });
    }
  }

  // 既存の artist/org 分配行を取得（支払時に RPC が作成済み）
  const txIds = transactions.map((t) => t.transaction_id);
  const { data: existingArtistOrgDists } = await admin
    .from("transaction_distributions")
    .select("transaction_distribution_id, transaction_id, profile_id, distribution_role, actual_amount")
    .in("transaction_id", txIds)
    .in("distribution_role", ["artist", "organizer"]);

  const existingMap = new Map<string, string>();
  for (const d of existingArtistOrgDists ?? []) {
    const key = `${d.transaction_id}/${d.profile_id}/${d.distribution_role}`;
    existingMap.set(key, d.transaction_distribution_id);
  }

  const distInsertRows: {
    transaction_id: string; event_id: string; profile_id: string;
    distribution_role: string; actual_amount: number; distribution_status: string;
  }[] = [];

  const distUpdatePromises: Promise<any>[] = [];
  for (const [key, entry] of desiredDists.entries()) {
    const existingId = existingMap.get(key);
    if (existingId) {
      distUpdatePromises.push(
        admin
          .from("transaction_distributions")
          .update({ actual_amount: entry.amount })
          .eq("transaction_distribution_id", existingId) as unknown as Promise<any>
      );
    } else {
      distInsertRows.push({
        transaction_id: entry.txId,
        event_id: eventId,
        profile_id: entry.profileId,
        distribution_role: entry.role,
        actual_amount: entry.amount,
        distribution_status: "accrued",
      });
    }
  }

  const zeroUpdatePromises = (existingArtistOrgDists ?? [])
    .filter((d) => {
      const key = `${d.transaction_id}/${d.profile_id}/${d.distribution_role}`;
      return !desiredDists.has(key) && d.actual_amount !== 0;
    })
    .map((d) =>
      admin
        .from("transaction_distributions")
        .update({ actual_amount: 0 })
        .eq("transaction_distribution_id", d.transaction_distribution_id) as unknown as Promise<any>
    );

  await Promise.all([...distUpdatePromises, ...zeroUpdatePromises]);

  const distributionRows = distInsertRows;

  // エージェント手数料
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

  if (distributionRows.length > 0) {
    const { error: distErr } = await admin
      .from("transaction_distributions")
      .insert(distributionRows);
    if (distErr)
      return NextResponse.json({ error: distErr.message }, { status: 500 });
  }

  // Payment Intent をキャプチャ
  function parsePiId(raw: string | null): string | null {
    if (!raw) return null;
    if (raw.startsWith("{")) {
      try { const p = JSON.parse(raw); if (p?.id) return p.id; } catch {}
    }
    return raw;
  }

  // pi_id → transaction_id マップ（destination_transfer_id 更新用）
  const txByPiId = new Map<string, string>();
  for (const tx of transactions) {
    const piId = parsePiId((tx as any).stripe_payment_intent_id);
    if (piId) txByPiId.set(piId, tx.transaction_id);
  }

  const allPaymentIntentIds = new Set(
    transactions
      .map((tx) => parsePiId(tx.stripe_payment_intent_id))
      .filter((id): id is string => !!id)
  );

  // 入場チケット決済（qr_config_id を持たない Type A / C）
  const { data: ticketTxIds } = await admin
    .from("tickets")
    .select("transaction_id")
    .eq("event_id", eventId)
    .not("transaction_id", "is", null);
  if (ticketTxIds && ticketTxIds.length > 0) {
    const { data: entranceTxs } = await admin
      .from("transactions")
      .select("transaction_id, stripe_payment_intent_id")
      .in("transaction_id", ticketTxIds.map((t) => t.transaction_id as string))
      .eq("status", "completed")
      .not("stripe_payment_intent_id", "is", null);
    for (const tx of entranceTxs ?? []) {
      const piId = parsePiId((tx as any).stripe_payment_intent_id);
      if (piId) {
        allPaymentIntentIds.add(piId);
        txByPiId.set(piId, (tx as any).transaction_id);
      }
    }
  }

  const captureResults: { pi_id: string; captured: boolean; error?: string }[] = await Promise.all(
    [...allPaymentIntentIds].map(async (piId) => {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        if (pi.status === "succeeded") {
          console.log(`[settle] skip (already captured) pi=${piId}`);
          return { pi_id: piId, captured: true };
        }
        if (pi.status !== "requires_capture") {
          console.error(`[settle] uncapturable pi=${piId} status=${pi.status}`);
          return { pi_id: piId, captured: false, error: `キャプチャ不可: status=${pi.status}` };
        }
        await stripe.paymentIntents.capture(piId);
        console.log(`[settle] captured pi=${piId}`);
        return { pi_id: piId, captured: true };
      } catch (err: any) {
        console.error(`[settle] capture failed pi=${piId} error=${err.message}`);
        return { pi_id: piId, captured: false, error: err.message };
      }
    })
  );

  const captureFailures = captureResults.filter((r) => !r.captured);
  if (captureFailures.length > 0) {
    console.error(`[settle] ${captureFailures.length} capture(s) failed for event=${eventId}`, captureFailures);
  }

  // キャプチャ済み PI から destination_transfer_id を取得して transactions に記録
  // destination charge の場合、capture 時に Stripe が自動で organizer への Transfer を作成する
  const capturedPiIds = captureResults.filter((r) => r.captured).map((r) => r.pi_id);
  const destTransferByPiId = new Map<string, string>();

  await Promise.all(
    capturedPiIds.map(async (piId) => {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
        const charge = pi.latest_charge as Stripe.Charge | null;
        const transfer = charge?.transfer;
        if (!transfer) return;
        const transferId = typeof transfer === "string" ? transfer : (transfer as any).id;
        if (transferId) destTransferByPiId.set(piId, transferId);
      } catch (err: any) {
        console.error(`[settle] destination_transfer_id 取得失敗 pi=${piId}:`, err.message);
      }
    })
  );

  if (destTransferByPiId.size > 0) {
    await Promise.all(
      [...destTransferByPiId.entries()].map(([piId, transferId]) => {
        const txId = txByPiId.get(piId);
        if (!txId) return Promise.resolve();
        return admin
          .from("transactions")
          .update({ destination_transfer_id: transferId })
          .eq("transaction_id", txId) as unknown as Promise<any>;
      })
    );
  }

  const isDestinationChargeFlow = destTransferByPiId.size > 0;

  // Transfer 実行
  // - organizer: destination charge で自動 transfer 済み → スキップ（新フロー）
  // - artist: organizer の Connect アカウントから sub-transfer（新フロー）
  // - agent: platform → agent transfer（常に platform から）
  // - 旧フロー（destination charge なし）: 全ロールとも platform から直接 transfer
  const transferResults: { profile_id: string; amount: number; transfer_id: string | null; error?: string }[] = [];

  for (const [profileId, info] of profileAmounts.entries()) {
    if (!info.stripe_connect_id || info.amount <= 0) {
      transferResults.push({ profile_id: profileId, amount: info.amount, transfer_id: null });
      continue;
    }

    // 新フロー: organizer は destination transfer で自動送金済み
    if (info.role === "organizer" && isDestinationChargeFlow) {
      continue;
    }

    // 新フロー: artist は organizer の Connect アカウントから sub-transfer
    if (info.role === "artist" && isDestinationChargeFlow && organizerConnectId) {
      try {
        const transfer = await stripe.transfers.create(
          {
            amount: info.amount,
            currency: "jpy",
            destination: info.stripe_connect_id,
            metadata: { event_id: eventId, profile_id: profileId },
          },
          { stripeAccount: organizerConnectId }
        );
        await admin.from("settle_transfers").insert({
          event_id: eventId,
          profile_id: profileId,
          stripe_transfer_id: transfer.id,
          amount: info.amount,
        });
        transferResults.push({ profile_id: profileId, amount: info.amount, transfer_id: transfer.id });
      } catch (err: any) {
        transferResults.push({ profile_id: profileId, amount: info.amount, transfer_id: null, error: err.message });
      }
      continue;
    }

    // agent（常に platform から）& 旧フローの organizer/artist
    try {
      const transfer = await stripe.transfers.create({
        amount: info.amount,
        currency: "jpy",
        destination: info.stripe_connect_id,
        metadata: { event_id: eventId, profile_id: profileId },
      });
      await admin.from("settle_transfers").insert({
        event_id: eventId,
        profile_id: profileId,
        stripe_transfer_id: transfer.id,
        amount: info.amount,
      });
      transferResults.push({ profile_id: profileId, amount: info.amount, transfer_id: transfer.id });
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

  // 通知を既読化
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
  await admin
    .from("notifications")
    .update({ is_read: true })
    .eq("type", "evidence_submitted")
    .filter("metadata->>event_id", "eq", eventId);

  return NextResponse.json({
    success: true,
    total_gross: totalGross,
    distributions: distributionRows.length,
    captures: captureResults,
    capture_failures: captureFailures.length,
    transfers: transferResults,
    destination_charge_flow: isDestinationChargeFlow,
  });
}
