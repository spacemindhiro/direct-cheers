import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettlementReportClient } from "@/components/settlement-report-client";
import { Loader2 } from "lucide-react";

export type DistributionRow = {
  profile_id: string;
  display_name: string;
  role: string;
  actual_amount: number;
  is_frozen: boolean;
  hold_released: boolean;
  settle_amount: number | null;
};

export type QRGroupRow = {
  qr_config_id: string;
  label: string;
  totalGross: number;
  totalStripeFee: number;
  totalPlatformFee: number;
  totalNet: number;
  totalTaxAmount: number;
  distributions: DistributionRow[];
};

export type DebtClaimRow = {
  claim_id: string; original_transaction_id: string;
  claim_amount: number; stripe_dispute_fee: number | null;
  stripe_processing_fee: number | null; status: string;
  stripe_dispute_id: string | null; created_at: string;
};

async function SettlementContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const user     = await getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("event_id, title, venue, start_at, lifecycle_status, organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();
  if (event.lifecycle_status !== "settled") redirect(`/dashboard/events/${eventId}`);

  const { data: me } = await supabase
    .from("profiles").select("role").eq("profile_id", user.id).single();
  const isOrganizer = event.organizer_profile_id === user.id;
  const isAgent     = event.agent_id === user.id;
  const isAdmin     = me?.role === "admin";
  if (!isOrganizer && !isAgent && !isAdmin) redirect("/dashboard");

  // 精算サマリー
  const { data: summary } = await admin
    .from("settlement_summaries")
    .select("approved_at")
    .eq("event_id", eventId)
    .maybeSingle();

  // QR configs（ラベル付き）
  const { data: qrConfigsRaw } = await admin
    .from("qr_configs")
    .select("qr_config_id, label, recipient_profile_id")
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
      .select("transaction_id, qr_config_id, total_gross_amount, stripe_fee, platform_fee, net_amount")
      .in("qr_config_id", qrIds.slice(i, i + BATCH))
      .eq("status", "completed")
      .neq("transaction_type", "invitation");
    allTxs.push(...(data ?? []));
  }

  const txIds = allTxs.map(t => t.transaction_id);
  // transaction_id → qr_config_id マップ
  const txToQr = new Map(allTxs.map(t => [t.transaction_id, t.qr_config_id as string]));

  // 配分明細
  let allDists: any[] = [];
  for (let i = 0; i < txIds.length; i += BATCH) {
    const { data } = await admin
      .from("transaction_distributions")
      .select("transaction_id, profile_id, distribution_role, actual_amount, tax_amount, is_frozen, hold_released, distribution_status")
      .in("transaction_id", txIds.slice(i, i + BATCH));
    allDists.push(...(data ?? []));
  }

  // 振込実績
  const { data: settleTransfers } = await admin
    .from("settle_transfers").select("profile_id, amount").eq("event_id", eventId);
  const settleByProfile = new Map<string, number>();
  for (const t of settleTransfers ?? []) {
    settleByProfile.set(t.profile_id, (settleByProfile.get(t.profile_id) ?? 0) + t.amount);
  }

  // プロフィール名解決
  const profileIds = [...new Set(allDists.map(d => d.profile_id))];
  const { data: profiles } = profileIds.length > 0
    ? await admin.from("profiles").select("profile_id, display_name, artist_name, organizer_name, role").in("profile_id", profileIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [
    p.profile_id,
    { name: p.organizer_name ?? p.artist_name ?? p.display_name ?? p.profile_id, role: p.role },
  ]));

  // QR ごとにグルーピング
  const qrGrossMap    = new Map<string, number>();
  const qrStripeFeeMap = new Map<string, number>();
  const qrPlatformFeeMap = new Map<string, number>();
  const qrNetMap      = new Map<string, number>();

  for (const tx of allTxs) {
    const qid = tx.qr_config_id;
    qrGrossMap.set(qid,       (qrGrossMap.get(qid) ?? 0)       + (tx.total_gross_amount ?? 0));
    qrStripeFeeMap.set(qid,   (qrStripeFeeMap.get(qid) ?? 0)   + (tx.stripe_fee ?? 0));
    qrPlatformFeeMap.set(qid, (qrPlatformFeeMap.get(qid) ?? 0) + (tx.platform_fee ?? 0));
    qrNetMap.set(qid,         (qrNetMap.get(qid) ?? 0)         + (tx.net_amount ?? 0));
  }

  // QR別・プロフィール別に配分を集計
  type ProfDist = { actual_amount: number; tax_amount: number; is_frozen: boolean; hold_released: boolean; role: string };
  const qrProfileDist = new Map<string, Map<string, ProfDist>>();

  for (const d of allDists) {
    const qid = txToQr.get(d.transaction_id);
    if (!qid) continue;
    if (!qrProfileDist.has(qid)) qrProfileDist.set(qid, new Map());
    const map = qrProfileDist.get(qid)!;
    const prev = map.get(d.profile_id);
    map.set(d.profile_id, {
      actual_amount: (prev?.actual_amount ?? 0) + (d.actual_amount ?? 0),
      tax_amount:    (prev?.tax_amount ?? 0)    + (d.tax_amount ?? 0),
      is_frozen:     d.is_frozen || (prev?.is_frozen ?? false),
      hold_released: d.hold_released && (prev?.hold_released ?? true),
      role:          d.distribution_role,
    });
  }

  const ROLE_ORDER = { admin: 0, agent: 1, organizer: 2, artist: 3 };

  const qrGroups: QRGroupRow[] = qrConfigs.map(qr => {
    const profMap = qrProfileDist.get(qr.qr_config_id) ?? new Map();
    const distributions: DistributionRow[] = [...profMap.entries()]
      .map(([pid, d]) => ({
        profile_id:    pid,
        display_name:  profileMap.get(pid)?.name ?? pid,
        role:          d.role,
        actual_amount: d.actual_amount,
        is_frozen:     d.is_frozen,
        hold_released: d.hold_released,
        settle_amount: settleByProfile.get(pid) ?? null,
      }))
      .sort((a, b) => (ROLE_ORDER[a.role as keyof typeof ROLE_ORDER] ?? 4) - (ROLE_ORDER[b.role as keyof typeof ROLE_ORDER] ?? 4));

    const taxAmount = [...profMap.values()].reduce((s, d) => s + d.tax_amount, 0);

    return {
      qr_config_id:   qr.qr_config_id,
      label:          qr.label ?? `QR設定`,
      totalGross:     qrGrossMap.get(qr.qr_config_id) ?? 0,
      totalStripeFee: qrStripeFeeMap.get(qr.qr_config_id) ?? 0,
      totalPlatformFee: qrPlatformFeeMap.get(qr.qr_config_id) ?? 0,
      totalNet:       qrNetMap.get(qr.qr_config_id) ?? 0,
      totalTaxAmount: taxAmount,
      distributions,
    };
  }).filter(g => g.totalGross > 0 || g.distributions.length > 0);

  // イベント全体集計
  const totalGross       = qrGroups.reduce((s, g) => s + g.totalGross, 0);
  const totalStripeFee   = qrGroups.reduce((s, g) => s + g.totalStripeFee, 0);
  const totalPlatformFee = qrGroups.reduce((s, g) => s + g.totalPlatformFee, 0);
  const totalNet         = totalGross - totalStripeFee - totalPlatformFee;
  const totalTaxAmount   = qrGroups.reduce((s, g) => s + g.totalTaxAmount, 0);

  // チャージバック
  const { data: rawClaims } = txIds.length > 0
    ? await admin.from("debt_claims")
        .select("claim_id, original_transaction_id, claim_amount, stripe_dispute_fee, stripe_processing_fee, status, stripe_dispute_id, created_at")
        .in("original_transaction_id", txIds).order("created_at", { ascending: true })
    : { data: [] };
  const debtClaims: DebtClaimRow[] = rawClaims ?? [];
  const activeClaims = debtClaims.filter(c => c.status !== "closed_won");

  const cbFeeTotal    = activeClaims.reduce((s, c) => s + (c.stripe_dispute_fee  ?? 1500), 0);
  const cbFeeShortage = activeClaims.reduce((s, c) => s + (c.stripe_processing_fee ?? 0), 0);
  const frozenDistTotal = qrGroups.flatMap(g => g.distributions)
    .filter(d => d.is_frozen).reduce((s, d) => s + d.actual_amount, 0);
  const totalHold = frozenDistTotal + cbFeeTotal + cbFeeShortage;

  // バージョン
  const approvedAtDate = summary?.approved_at ? new Date(summary.approved_at) : null;
  const cbAfterSettlement = debtClaims.filter(c => !approvedAtDate || new Date(c.created_at) > approvedAtDate);
  const reportVersion = `v1.${cbAfterSettlement.length}`;
  const lastCbAt = cbAfterSettlement.length > 0
    ? new Date(cbAfterSettlement[cbAfterSettlement.length - 1].created_at)
        .toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;
  const approvedAtStr = summary?.approved_at
    ? new Date(summary.approved_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  const eventStartStr = event.start_at
    ? new Date(event.start_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" })
    : "";

  const { data: riskReports } = await admin
    .from("daily_business_reports")
    .select("failed_count, failed_amount, task_name, process_date")
    .eq("status", "要確認・未回収あり")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <SettlementReportClient
      event={{ ...event, startStr: eventStartStr }}
      reportVersion={reportVersion}
      approvedAtStr={approvedAtStr}
      lastCbAt={lastCbAt}
      totalGross={totalGross}
      totalStripeFee={totalStripeFee}
      totalPlatformFee={totalPlatformFee}
      totalNet={totalNet}
      totalTaxAmount={totalTaxAmount}
      qrGroups={qrGroups}
      debtClaims={debtClaims}
      activeClaims={activeClaims}
      cbFeeTotal={cbFeeTotal}
      cbFeeShortage={cbFeeShortage}
      frozenDistTotal={frozenDistTotal}
      totalHold={totalHold}
      riskReports={riskReports ?? []}
    />
  );
}

export default function SettlementPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-slate-600" size={28} /></div>}>
      <SettlementContent params={params} />
    </Suspense>
  );
}
