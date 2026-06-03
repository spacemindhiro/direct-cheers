import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArtistSettlementClient } from "@/components/artist-settlement-client";
import { Loader2 } from "lucide-react";

async function ArtistSettlementContent({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const supabase  = await createClient();
  const user      = await getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();

  // イベント基本情報
  const { data: event } = await admin
    .from("events")
    .select("event_id, title, venue, start_at, end_at, lifecycle_status, organizer_profile_id")
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();
  if (event.lifecycle_status !== "settled") redirect(`/dashboard/events/${eventId}`);

  // アーティスト本人確認（event_artists に confirmed で存在すること）
  const { data: membership } = await admin
    .from("event_artists")
    .select("artist_profile_id, status")
    .eq("event_id", eventId)
    .eq("artist_profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership) redirect(`/dashboard/events/${eventId}`);

  // 本人プロフィール
  const { data: artistProfile } = await admin
    .from("profiles")
    .select("display_name, artist_name, credit_name, role")
    .eq("profile_id", user.id)
    .single();

  const artistName =
    artistProfile?.credit_name ??
    artistProfile?.artist_name ??
    artistProfile?.display_name ??
    "アーティスト";

  // ── 本人の配分明細のみ取得 ────────────────────────────────────────
  const { data: myDists } = await admin
    .from("transaction_distributions")
    .select(
      "transaction_distribution_id, transaction_id, actual_amount, is_frozen, hold_released, distribution_status"
    )
    .eq("event_id", eventId)
    .eq("profile_id", user.id);

  const dists = myDists ?? [];

  // 各トランザクションの stripe_fee を引くために transaction を取得
  const txIds = [...new Set(dists.map((d) => d.transaction_id))];
  const { data: txs } = txIds.length > 0
    ? await admin
        .from("transactions")
        .select("transaction_id, stripe_fee, total_gross_amount, stripe_payment_intent_id")
        .in("transaction_id", txIds)
    : { data: [] };

  const txMap = new Map((txs ?? []).map((t) => [t.transaction_id, t]));

  // ── 本人の振込実績 ────────────────────────────────────────────────
  const { data: settleTransfers } = await admin
    .from("settle_transfers")
    .select("amount")
    .eq("event_id", eventId)
    .eq("profile_id", user.id);

  const settledAmount = (settleTransfers ?? []).reduce(
    (s, t) => s + (t.amount ?? 0),
    0
  );

  // ── 本人が直接 CB を受けた請求のみ取得 ──────────────────────────
  // debt_claims.profile_id = 自身 → 自身のConnect口座が宛先だったCB
  const { data: myRawClaims } = await admin
    .from("debt_claims")
    .select(
      "claim_id, original_transaction_id, claim_amount, stripe_dispute_fee, stripe_processing_fee, status, stripe_dispute_id, created_at"
    )
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });

  // 勝訴（closed_won）は除外
  const myClaims = (myRawClaims ?? []).filter((c) => c.status !== "closed_won");

  // ── 精算サマリー ──────────────────────────────────────────────────
  const { data: summary } = await admin
    .from("settlement_summaries")
    .select("approved_at")
    .eq("event_id", eventId)
    .maybeSingle();

  // ── 集計 ──────────────────────────────────────────────────────────
  const totalDistAmount = dists.reduce((s, d) => s + (d.actual_amount ?? 0), 0);
  const frozenDists     = dists.filter((d) => d.is_frozen);
  const frozenDistTotal = frozenDists.reduce((s, d) => s + (d.actual_amount ?? 0), 0);

  // 本人への直接CBによるグロスホールド
  const myCbFeeTotal    = myClaims.reduce((s, c) => s + (c.stripe_dispute_fee  ?? 1500), 0);
  const myProcFeeTotal  = myClaims.reduce((s, c) => s + (c.stripe_processing_fee ?? 0), 0);
  const grossHoldTotal  = myCbFeeTotal + myProcFeeTotal;

  // 総ホールド = 明細凍結 + グロスホールド
  const totalHold       = frozenDistTotal + grossHoldTotal;
  const confirmedAmount = totalDistAmount - totalHold;

  // バージョン（精算確定後のCB件数のみカウント）
  const approvedAtDate  = summary?.approved_at ? new Date(summary.approved_at) : null;
  const cbAfterSettlement = myClaims.filter(
    (c) => !approvedAtDate || new Date(c.created_at) > approvedAtDate
  );
  const reportVersion = `v1.${cbAfterSettlement.length}`;

  const approvedAtStr = summary?.approved_at
    ? new Date(summary.approved_at).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  const eventStartStr = event.start_at
    ? new Date(event.start_at).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric", month: "long", day: "numeric", weekday: "short",
      })
    : "";

  // 凍結明細にトランザクション情報を付加（表示用）
  const frozenDistsWithTx = frozenDists.map((d) => ({
    ...d,
    tx: txMap.get(d.transaction_id) ?? null,
  }));

  return (
    <ArtistSettlementClient
      event={{ ...event, startStr: eventStartStr }}
      artistName={artistName}
      reportVersion={reportVersion}
      approvedAtStr={approvedAtStr}
      totalDistAmount={totalDistAmount}
      frozenDistTotal={frozenDistTotal}
      grossHoldTotal={grossHoldTotal}
      myCbFeeTotal={myCbFeeTotal}
      myProcFeeTotal={myProcFeeTotal}
      totalHold={totalHold}
      confirmedAmount={confirmedAmount}
      settledAmount={settledAmount}
      myClaims={myClaims}
      frozenDists={frozenDistsWithTx}
    />
  );
}

export default function ArtistSettlementPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <Loader2 className="animate-spin text-slate-600" size={28} />
        </div>
      }
    >
      <ArtistSettlementContent params={params} />
    </Suspense>
  );
}
