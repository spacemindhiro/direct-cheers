import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArtistSettlementClient } from "@/components/artist-settlement-client";
import { Loader2 } from "lucide-react";

export type ArtistQRGroup = {
  qr_config_id: string;
  label: string;
  qrNet: number;
  myAmount: number;
  myRatio: number;       // 自分の配分比率（0〜1）
  othersRatio: number;   // その他の合計比率（0〜1）
  myIsFrozen: boolean;
  myTaxAmount: number;
};

async function ArtistSettlementContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const user     = await getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("event_id, title, venue, start_at, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();
  if (event.lifecycle_status !== "settled") redirect(`/dashboard/events/${eventId}`);

  // アーティスト本人確認
  const { data: membership } = await admin
    .from("event_artists")
    .select("artist_profile_id")
    .eq("event_id", eventId)
    .eq("artist_profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!membership) redirect(`/dashboard/events/${eventId}`);

  const { data: artistProfile } = await admin
    .from("profiles")
    .select("display_name, artist_name, credit_name")
    .eq("profile_id", user.id)
    .single();
  const artistName =
    artistProfile?.credit_name ?? artistProfile?.artist_name ?? artistProfile?.display_name ?? "アーティスト";

  const { data: summary } = await admin
    .from("settlement_summaries")
    .select("approved_at")
    .eq("event_id", eventId)
    .maybeSingle();

  // QR configs
  const { data: qrConfigsRaw } = await admin
    .from("qr_configs")
    .select("qr_config_id, label")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const qrConfigs = qrConfigsRaw ?? [];
  const qrIds = qrConfigs.map(q => q.qr_config_id);

  // トランザクション（qr_config_id付き）
  const BATCH = 50;
  let allTxs: any[] = [];
  for (let i = 0; i < qrIds.length; i += BATCH) {
    const { data } = await admin
      .from("transactions")
      .select("transaction_id, qr_config_id, net_amount")
      .in("qr_config_id", qrIds.slice(i, i + BATCH))
      .eq("status", "completed")
      .neq("transaction_type", "invitation");
    allTxs.push(...(data ?? []));
  }
  const txIds = allTxs.map(t => t.transaction_id);
  const txToQr = new Map(allTxs.map(t => [t.transaction_id, t.qr_config_id as string]));
  const qrNetMap = new Map<string, number>();
  for (const tx of allTxs) {
    qrNetMap.set(tx.qr_config_id, (qrNetMap.get(tx.qr_config_id) ?? 0) + (tx.net_amount ?? 0));
  }

  // 全配分（自分+他者）
  let allDists: any[] = [];
  for (let i = 0; i < txIds.length; i += BATCH) {
    const { data } = await admin
      .from("transaction_distributions")
      .select("transaction_id, profile_id, actual_amount, tax_amount, is_frozen")
      .in("transaction_id", txIds.slice(i, i + BATCH));
    allDists.push(...(data ?? []));
  }

  // QR別に集計：自分の金額 + QR全体の金額
  const qrMyAmount   = new Map<string, number>();
  const qrMyTax      = new Map<string, number>();
  const qrMyFrozen   = new Map<string, boolean>();
  const qrTotalDist  = new Map<string, number>();

  for (const d of allDists) {
    const qid = txToQr.get(d.transaction_id);
    if (!qid) continue;
    qrTotalDist.set(qid, (qrTotalDist.get(qid) ?? 0) + (d.actual_amount ?? 0));
    if (d.profile_id === user.id) {
      qrMyAmount.set(qid, (qrMyAmount.get(qid) ?? 0) + (d.actual_amount ?? 0));
      qrMyTax.set(qid,    (qrMyTax.get(qid) ?? 0)    + (d.tax_amount ?? 0));
      qrMyFrozen.set(qid, d.is_frozen || (qrMyFrozen.get(qid) ?? false));
    }
  }

  // qr_config_targets から自分の設定比率を取得
  const { data: myTargets } = qrIds.length > 0
    ? await admin
        .from("qr_config_targets")
        .select("qr_config_id, distribution_ratio")
        .in("qr_config_id", qrIds)
        .eq("profile_id", user.id)
        .is("deleted_at", null)
    : { data: [] };
  const myRatioMap = new Map((myTargets ?? []).map(t => [t.qr_config_id, t.distribution_ratio as number]));

  // 自分が配分対象のQRのみ対象
  const qrGroups: ArtistQRGroup[] = qrConfigs
    .filter(qr => (qrMyAmount.get(qr.qr_config_id) ?? 0) > 0 || myRatioMap.has(qr.qr_config_id))
    .map(qr => {
      const qid        = qr.qr_config_id;
      const qrNet      = qrNetMap.get(qid) ?? 0;
      const myAmount   = qrMyAmount.get(qid) ?? 0;
      const totalDist  = qrTotalDist.get(qid) ?? 0;
      const myRatio    = myRatioMap.get(qid) ?? (totalDist > 0 ? myAmount / totalDist : 0);
      const othersRatio = Math.max(0, 1 - myRatio);
      return {
        qr_config_id: qid,
        label:        qr.label ?? "QR設定",
        qrNet,
        myAmount,
        myRatio,
        othersRatio,
        myIsFrozen:   qrMyFrozen.get(qid) ?? false,
        myTaxAmount:  qrMyTax.get(qid) ?? 0,
      };
    });

  // 集計
  const totalDistAmount = qrGroups.reduce((s, g) => s + g.myAmount, 0);
  const totalTaxAmount  = qrGroups.reduce((s, g) => s + g.myTaxAmount, 0);
  const frozenDistTotal = qrGroups.filter(g => g.myIsFrozen).reduce((s, g) => s + g.myAmount, 0);

  // 自分への直接CB
  const { data: myRawClaims } = txIds.length > 0
    ? await admin
        .from("debt_claims")
        .select("claim_id, original_transaction_id, claim_amount, stripe_dispute_fee, stripe_processing_fee, status, stripe_dispute_id, created_at")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: true })
    : { data: [] };
  const myClaims = (myRawClaims ?? []).filter(c => c.status !== "closed_won");

  const myCbFeeTotal   = myClaims.reduce((s, c) => s + (c.stripe_dispute_fee  ?? 1500), 0);
  const myProcFeeTotal = myClaims.reduce((s, c) => s + (c.stripe_processing_fee ?? 0), 0);
  const grossHoldTotal = myCbFeeTotal + myProcFeeTotal;
  const totalHold      = frozenDistTotal + grossHoldTotal;
  const confirmedAmount = totalDistAmount - totalHold;

  const { data: settleTransfers } = await admin
    .from("settle_transfers").select("amount").eq("event_id", eventId).eq("profile_id", user.id);
  const settledAmount = (settleTransfers ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);

  const approvedAtDate = summary?.approved_at ? new Date(summary.approved_at) : null;
  const cbAfterSettlement = myClaims.filter(c => !approvedAtDate || new Date(c.created_at) > approvedAtDate);
  const reportVersion = `v1.${cbAfterSettlement.length}`;
  const approvedAtStr = summary?.approved_at
    ? new Date(summary.approved_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;
  const eventStartStr = event.start_at
    ? new Date(event.start_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" })
    : "";

  return (
    <ArtistSettlementClient
      event={{ ...event, startStr: eventStartStr }}
      artistName={artistName}
      reportVersion={reportVersion}
      approvedAtStr={approvedAtStr}
      totalDistAmount={totalDistAmount}
      totalTaxAmount={totalTaxAmount}
      frozenDistTotal={frozenDistTotal}
      grossHoldTotal={grossHoldTotal}
      myCbFeeTotal={myCbFeeTotal}
      myProcFeeTotal={myProcFeeTotal}
      totalHold={totalHold}
      confirmedAmount={confirmedAmount}
      settledAmount={settledAmount}
      qrGroups={qrGroups}
      myClaims={myClaims}
    />
  );
}

export default function ArtistSettlementPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-slate-600" size={28} /></div>}>
      <ArtistSettlementContent params={params} />
    </Suspense>
  );
}
