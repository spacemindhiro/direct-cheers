import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettlementReportClient } from "@/components/settlement-report-client";
import { Loader2 } from "lucide-react";

// ── 型定義 ─────────────────────────────────────────────────────────────────
type DistributionRow = {
  profile_id: string;
  display_name: string;
  role: string;
  actual_amount: number;
  is_frozen: boolean;
  hold_released: boolean;
  distribution_status: string;
  settle_amount: number | null; // 実際に振込済みの金額
};

type DebtClaimRow = {
  claim_id: string;
  original_transaction_id: string;
  claim_amount: number;
  stripe_dispute_fee: number | null;
  stripe_processing_fee: number | null;
  status: string;
  stripe_dispute_id: string | null;
  created_at: string;
};

async function SettlementContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();

  // イベント基本情報
  const { data: event } = await admin
    .from("events")
    .select("event_id, title, venue, start_at, end_at, lifecycle_status, organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();

  const { data: me } = await supabase
    .from("profiles").select("role").eq("profile_id", user.id).single();

  const isOrganizer = event.organizer_profile_id === user.id;
  const isAgent     = event.agent_id === user.id;
  const isAdmin     = me?.role === "admin";

  if (!isOrganizer && !isAgent && !isAdmin) redirect("/dashboard");

  if (!["settled"].includes(event.lifecycle_status)) {
    redirect(`/dashboard/events/${eventId}`);
  }

  // 精算サマリー
  const { data: summary } = await admin
    .from("settlement_summaries")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  // QR config → トランザクション取得
  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("event_id", eventId)
    .is("deleted_at", null);
  const qrIds = (qrConfigs ?? []).map(q => q.qr_config_id);

  const { data: transactions } = qrIds.length > 0
    ? await admin
        .from("transactions")
        .select("transaction_id, total_gross_amount, stripe_fee, platform_fee, net_amount, stripe_payment_intent_id, status")
        .in("qr_config_id", qrIds)
        .eq("status", "completed")
        .neq("transaction_type", "invitation")
    : { data: [] };

  const txIds = (transactions ?? []).map(t => t.transaction_id);

  // 配分明細
  const { data: rawDists } = txIds.length > 0
    ? await admin
        .from("transaction_distributions")
        .select("profile_id, distribution_role, actual_amount, is_frozen, hold_released, distribution_status")
        .in("transaction_id", txIds)
    : { data: [] };

  // 振込実績
  const { data: settleTransfers } = await admin
    .from("settle_transfers")
    .select("profile_id, amount")
    .eq("event_id", eventId);

  // プロフィール名解決
  const profileIds = [...new Set([
    ...(rawDists ?? []).map(d => d.profile_id),
  ])];
  const { data: profiles } = profileIds.length > 0
    ? await admin
        .from("profiles")
        .select("profile_id, display_name, artist_name, organizer_name, role")
        .in("profile_id", profileIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map(p => [
    p.profile_id,
    {
      name: p.organizer_name ?? p.artist_name ?? p.display_name ?? p.profile_id,
      role: p.role,
    },
  ]));

  // 配分を profile_id ごとに集計
  const distByProfile = new Map<string, {
    actual_amount: number;
    is_frozen: boolean;
    hold_released: boolean;
    distribution_status: string;
    role: string;
  }>();

  for (const d of rawDists ?? []) {
    const prev = distByProfile.get(d.profile_id);
    distByProfile.set(d.profile_id, {
      actual_amount:       (prev?.actual_amount ?? 0) + (d.actual_amount ?? 0),
      is_frozen:           d.is_frozen || (prev?.is_frozen ?? false),
      hold_released:       d.hold_released && (prev?.hold_released ?? true),
      distribution_status: d.distribution_status,
      role:                d.distribution_role,
    });
  }

  const settleByProfile = new Map<string, number>();
  for (const t of settleTransfers ?? []) {
    settleByProfile.set(t.profile_id, (settleByProfile.get(t.profile_id) ?? 0) + t.amount);
  }

  const distributions: DistributionRow[] = [...distByProfile.entries()].map(([pid, d]) => ({
    profile_id:          pid,
    display_name:        profileMap.get(pid)?.name ?? pid,
    role:                d.role,
    actual_amount:       d.actual_amount,
    is_frozen:           d.is_frozen,
    hold_released:       d.hold_released,
    distribution_status: d.distribution_status,
    settle_amount:       settleByProfile.get(pid) ?? null,
  })).sort((a, b) => {
    const order = { admin: 0, agent: 1, organizer: 2, artist: 3 };
    return (order[a.role as keyof typeof order] ?? 4) - (order[b.role as keyof typeof order] ?? 4);
  });

  // チャージバック取得
  const { data: rawClaims } = txIds.length > 0
    ? await admin
        .from("debt_claims")
        .select("claim_id, original_transaction_id, claim_amount, stripe_dispute_fee, stripe_processing_fee, status, stripe_dispute_id, created_at")
        .in("original_transaction_id", txIds)
        .order("created_at", { ascending: true })
    : { data: [] };
  const debtClaims: DebtClaimRow[] = rawClaims ?? [];

  // 未回収リスク（バッチレポートの残額不足系）
  const { data: riskReports } = await admin
    .from("daily_business_reports")
    .select("failed_count, failed_amount, task_name, process_date")
    .eq("status", "要確認・未回収あり")
    .order("created_at", { ascending: false })
    .limit(5);

  // ── 集計 ───────────────────────────────────────────────────────────────
  const totalGross    = (transactions ?? []).reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);
  const totalStripeFee = (transactions ?? []).reduce((s, t) => s + (t.stripe_fee ?? 0), 0);
  const totalPlatformFee = (transactions ?? []).reduce((s, t) => s + (t.platform_fee ?? 0), 0);
  const totalNet      = totalGross - totalStripeFee - totalPlatformFee;

  // CB 関連ホールド
  // 勝訴（closed_won）は費用なし → 除外。係争中・敗訴（written_off）・回収済（recovered）は表示対象
  const activeClaims  = debtClaims.filter(c => c.status !== "closed_won");
  const cbFeeTotal    = activeClaims.reduce((s, c) => s + (c.stripe_dispute_fee ?? 1500), 0);
  const cbFeeShortage = activeClaims.reduce((s, c) => s + (c.stripe_processing_fee ?? 0), 0);
  const frozenDistTotal = distributions
    .filter(d => d.is_frozen)
    .reduce((s, d) => s + d.actual_amount, 0);
  const totalHold     = frozenDistTotal + cbFeeTotal + cbFeeShortage;

  // レポートバージョン
  // v1.0 = 精算確定時点（CBが先着していても初回は常に v1.0）
  // v1.1, v1.2... = 精算確定日（approved_at）以降に新たに発生したCB件数
  const approvedAtDate = summary?.approved_at ? new Date(summary.approved_at) : null;
  const cbAfterSettlement = debtClaims.filter(c =>
    !approvedAtDate || new Date(c.created_at) > approvedAtDate
  );
  const cbVersion     = cbAfterSettlement.length;
  const reportVersion = `v1.${cbVersion}`;
  const lastCbAt      = cbAfterSettlement.length > 0
    ? new Date(cbAfterSettlement[cbAfterSettlement.length - 1].created_at).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      })
    : null;
  const approvedAt    = summary?.approved_at
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

  return (
    <SettlementReportClient
      event={{ ...event, startStr: eventStartStr }}
      reportVersion={reportVersion}
      approvedAt={approvedAt}
      lastCbAt={lastCbAt}
      totalGross={totalGross}
      totalStripeFee={totalStripeFee}
      totalPlatformFee={totalPlatformFee}
      totalNet={totalNet}
      distributions={distributions}
      debtClaims={debtClaims}
      activeClaims={activeClaims}
      cbFeeTotal={cbFeeTotal}
      cbFeeShortage={cbFeeShortage}
      frozenDistTotal={frozenDistTotal}
      totalHold={totalHold}
      riskReports={riskReports ?? []}
      txCount={(transactions ?? []).length}
    />
  );
}

export default function SettlementPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <SettlementContent params={params} />
    </Suspense>
  );
}
