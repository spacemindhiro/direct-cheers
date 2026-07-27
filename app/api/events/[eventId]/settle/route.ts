import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { getFeeConfig } from "@/lib/fee-config";
import { queuePendingTransfer } from "@/lib/pending-transfers";

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
    .select("qr_config_id, recipient_name_context")
    .eq("event_id", eventId)
    .is("deleted_at", null);

  const qrConfigIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
  // qr_config_id -> recipient_name_context（'organizer' | 'artist'）
  // distribution_role は受取人プロフィールのグローバルroleではなく、この
  // QR自体の文脈（organizer名義/artist名義）で決める（詳細は
  // supabase/migrations/20260727010000_fix_distribution_role_context.sql 参照）。
  const qrContextMap = new Map(
    (qrConfigs ?? []).map((q) => [q.qr_config_id, (q as any).recipient_name_context === "organizer" ? "organizer" : "artist"])
  );

  if (qrConfigIds.length === 0)
    return NextResponse.json({ error: "No QR configs for this event" }, { status: 400 });

  // トランザクション取得（招待は精算対象外）
  const { data: transactions } = await admin
    .from("transactions")
    .select("transaction_id, qr_config_id, total_gross_amount, net_amount, platform_fee, stripe_net_actual, status, stripe_payment_intent_id, reconciled_at, amount_verified")
    .in("qr_config_id", qrConfigIds)
    .eq("status", "completed")
    .neq("transaction_type", "invitation");

  if (!transactions || transactions.length === 0)
    return NextResponse.json({ error: "No completed transactions" }, { status: 400 });

  const totalGross = transactions.reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);

  // 未照合の決済が残っている場合は送金を中断する。
  // 開催承認(/api/admin/events/[eventId]/capture-all)でキャプチャ済みである
  // ことが前提。このエンドポイントは照合ロジックを一切持たず、「全件照合済みか」
  // を確認するだけにとどめる（照合は cron/reconcile・管理者手動 reconcile が
  // 別途担う）。
  const unreconciled = transactions.filter(
    (t) => !(t as any).reconciled_at || (t as any).amount_verified === false
  );
  if (unreconciled.length > 0) {
    return NextResponse.json({
      error: "未照合の決済が残っているため送金できません。照合完了後に再度実行してください。",
      unreconciled_count: unreconciled.length,
      unreconciled_transaction_ids: unreconciled.map((t) => t.transaction_id),
    }, { status: 409 });
  }

  function parsePiId(raw: string | null): string | null {
    if (!raw) return null;
    if (raw.startsWith("{")) {
      try { const p = JSON.parse(raw); if (p?.id) return p.id; } catch {}
    }
    return raw;
  }

  // pi_id → transaction_id[] マップ（chargeId 反映用）
  // ウェルカムチアにより同一PIに複数transactions行（1階・2階）が紐づくことがあるため、
  // 1PI=1txを前提にせず配列で持つ。
  const txByPiId = new Map<string, string[]>();
  for (const tx of transactions) {
    const piId = parsePiId((tx as any).stripe_payment_intent_id);
    if (piId) txByPiId.set(piId, [...(txByPiId.get(piId) ?? []), tx.transaction_id]);
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
        const txId = (tx as any).transaction_id as string;
        txByPiId.set(piId, [...(txByPiId.get(piId) ?? []), txId]);
      }
    }
  }

  // chargeId を取得して txId → chargeId マップを作成
  // source_transaction による Transfer に使う（platform available 残高に依存しない）。
  // ここでキャプチャは行わない — 未照合ならこの手前で既に中断しており、照合が
  // 完了している以上、対象PIは開催承認(capture route)で必ずキャプチャ済みのはず。
  const chargeIdByTxId = new Map<string, string>();

  await Promise.all(
    [...allPaymentIntentIds].map(async (piId) => {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
        const charge = pi.latest_charge as Stripe.Charge | null;
        if (!charge?.id) return;
        // 同一PIに複数transaction（1階・2階）が紐づく場合、全行に同じchargeIdを反映する
        for (const txId of txByPiId.get(piId) ?? []) {
          chargeIdByTxId.set(txId, charge.id);
        }
      } catch (err: any) {
        console.error(`[settle] charge 取得失敗 pi=${piId}:`, err.message);
      }
    })
  );

  // qr_config_targets（分配先・比率）を取得
  const { data: targets } = await admin
    .from("qr_config_targets")
    .select(`
      qr_config_id,
      profile_id,
      distribution_ratio,
      profile:profiles!profile_id(stripe_connect_id)
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
    // チェックを通過している以上、全transactionはstripe_net_actualが入っているはず。
    // 推定値(net_amount)ではなく照合済みの実額を使う。
    const net = (tx as any).stripe_net_actual != null
      ? (tx as any).stripe_net_actual - ((tx as any).platform_fee ?? 0)
      : (tx as any).net_amount ?? 0;
    const txTargets = targetsByQr.get(tx.qr_config_id ?? "") ?? [];

    for (const target of txTargets) {
      const amount = Math.floor(net * Number(target.distribution_ratio));
      if (amount <= 0) continue;

      const profileRole = qrContextMap.get(target.qr_config_id) ?? "artist";
      const distRole = profileRole;

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

  const agentAmountByTxId = new Map<string, { amount: number; connectId: string | null }>();

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
      agentAmountByTxId.set(tx.transaction_id, { amount: agentFee, connectId: agentProfile?.stripe_connect_id ?? null });
    }
  }

  if (distributionRows.length > 0) {
    const { error: distErr } = await admin
      .from("transaction_distributions")
      .insert(distributionRows);
    if (distErr)
      return NextResponse.json({ error: distErr.message }, { status: 500 });
  }

  // Transfer 実行
  // - organizer/artist: source_transaction でチャージ単位 Transfer（platform available 残高不要）
  //   Stripe は Destination Charge の Reversal 資金を available に即時反映しない場合があるため、
  //   transfer_data.destination を使わず source_transaction を用いる設計に変更した。
  // - agent: platform available 残高から Transfer（app fee 収入が原資）
  const transferResults: { profile_id: string; amount: number; transfer_id: string | null; error?: string }[] = [];
  const profilesHandledBySourceTx = new Set<string>();

  // organizer と artist: desiredDists をチャージ単位で回して source_transaction Transfer
  for (const [, entry] of desiredDists.entries()) {
    if (entry.role !== "organizer" && entry.role !== "artist") continue;
    if (entry.amount <= 0) continue;
    if (!entry.connectId) {
      // Connectアカウント未発行（オンボーディング未開始）→ プールして
      // account.updated webhook / セーフティネットcronで自動リトライする
      await queuePendingTransfer(admin, {
        eventId, profileId: entry.profileId, txId: entry.txId, role: entry.role,
        amount: entry.amount, chargeId: chargeIdByTxId.get(entry.txId) ?? null,
        reason: "stripe_connect_id が未設定（オンボーディング未開始）",
      });
      transferResults.push({ profile_id: entry.profileId, amount: entry.amount, transfer_id: null, error: "pending_onboarding" });
      // キューイング済み → 後段の旧フロー（Block 3）で二重に処理させない
      profilesHandledBySourceTx.add(entry.profileId);
      continue;
    }

    const chargeId = chargeIdByTxId.get(entry.txId);
    if (chargeId) {
      // source_transaction フロー
      try {
        const transfer = await stripe.transfers.create({
          amount: entry.amount,
          currency: "jpy",
          destination: entry.connectId,
          source_transaction: chargeId,
          metadata: { event_id: eventId, profile_id: entry.profileId },
        });
        const { error: insertErr } = await admin.from("settle_transfers").insert({
          event_id: eventId,
          profile_id: entry.profileId,
          stripe_transfer_id: transfer.id,
          amount: entry.amount,
        });
        if (insertErr) {
          // Stripe側のTransferは既に実行済み（取消不可）。DB記録の失敗を
          // 握り潰すと運用側が資金移動を追跡できなくなるため、必ずログに残す。
          console.error(`[settle] settle_transfers insert failed (transfer済みtransfer_id=${transfer.id}) profile=${entry.profileId} amount=${entry.amount} error=${insertErr.message}`);
        }
        transferResults.push({ profile_id: entry.profileId, amount: entry.amount, transfer_id: transfer.id });
        profilesHandledBySourceTx.add(entry.profileId);
      } catch (err: any) {
        console.error(`[settle] source_transaction transfer failed role=${entry.role} profile=${entry.profileId} amount=${entry.amount} error=${err.message}`);
        // Connectアカウントの capability 不足（オンボーディング未完了）でTransferが
        // rejectされるケースをプールして自動リトライ対象にする
        await queuePendingTransfer(admin, {
          eventId, profileId: entry.profileId, txId: entry.txId, role: entry.role,
          amount: entry.amount, chargeId, reason: err.message,
        });
        transferResults.push({ profile_id: entry.profileId, amount: entry.amount, transfer_id: null, error: err.message });
        // キューイング済み → 後段の旧フロー（Block 3）で二重に処理させない
        profilesHandledBySourceTx.add(entry.profileId);
      }
    } else {
      // chargeId なし → 旧フロー（platform balance から、後段で処理）
    }
  }

  // agent: source_transaction Transfer（tx 単位）
  if (event.agent_id) {
    for (const [txId, { amount: agentAmt, connectId: agentConnectId }] of agentAmountByTxId.entries()) {
      if (agentAmt <= 0) continue;
      const chargeId = chargeIdByTxId.get(txId);
      if (!agentConnectId) {
        await queuePendingTransfer(admin, {
          eventId, profileId: event.agent_id, txId, role: "agent",
          amount: agentAmt, chargeId: chargeId ?? null,
          reason: "stripe_connect_id が未設定（オンボーディング未開始）",
        });
        transferResults.push({ profile_id: event.agent_id, amount: agentAmt, transfer_id: null, error: "pending_onboarding" });
        continue;
      }
      if (!chargeId) continue;
      try {
        const transfer = await stripe.transfers.create({
          amount: agentAmt,
          currency: "jpy",
          destination: agentConnectId,
          source_transaction: chargeId,
          metadata: { event_id: eventId, profile_id: event.agent_id },
        });
        await admin.from("settle_transfers").insert({
          event_id: eventId,
          profile_id: event.agent_id,
          stripe_transfer_id: transfer.id,
          amount: agentAmt,
        });
        transferResults.push({ profile_id: event.agent_id, amount: agentAmt, transfer_id: transfer.id });
      } catch (err: any) {
        console.error(`[settle] agent source_transaction transfer failed txId=${txId}:`, err.message);
        await queuePendingTransfer(admin, {
          eventId, profileId: event.agent_id, txId, role: "agent",
          amount: agentAmt, chargeId, reason: err.message,
        });
        transferResults.push({ profile_id: event.agent_id, amount: agentAmt, transfer_id: null, error: err.message });
      }
    }
  }

  // 旧フロー（chargeId なし）の organizer/artist: platform available 残高から Transfer
  for (const [profileId, info] of profileAmounts.entries()) {
    if (profilesHandledBySourceTx.has(profileId)) continue;
    if (info.amount <= 0) continue;
    if (!info.stripe_connect_id) {
      await queuePendingTransfer(admin, {
        eventId, profileId, role: info.role, amount: info.amount, chargeId: null,
        reason: "stripe_connect_id が未設定（オンボーディング未開始）",
      });
      transferResults.push({ profile_id: profileId, amount: info.amount, transfer_id: null, error: "pending_onboarding" });
      continue;
    }
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
      console.error(`[settle] platform transfer failed role=${info.role} profile=${profileId} amount=${info.amount} error=${err.message}`);
      await queuePendingTransfer(admin, {
        eventId, profileId, role: info.role, amount: info.amount, chargeId: null, reason: err.message,
      });
      transferResults.push({ profile_id: profileId, amount: info.amount, transfer_id: null, error: err.message });
    }
  }

  const isDestinationChargeFlow = chargeIdByTxId.size > 0;

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
    transfers: transferResults,
    destination_charge_flow: isDestinationChargeFlow,
  });
}
