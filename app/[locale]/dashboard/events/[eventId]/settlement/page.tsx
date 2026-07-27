import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettlementReportClient } from "@/components/settlement-report-client";
import { Loader2 } from "lucide-react";

// 受取人ごとのイベント全体合計（QR横断）
export type EventRecipientRow = {
  profile_id: string;
  display_name: string;
  role: string;
  total_amount: number;
  frozen_amount: number;   // CBで凍結中の金額（total_amountの内数）
  hold_released: boolean;  // 全QR横断でホールド解除済みか（1つでも未解除ならfalse）
  settle_amount: number | null;
};

// QR内の受取人行
export type DistributionRow = {
  profile_id: string;
  display_name: string;
  role: string;
  actual_amount: number;
  frozen_amount: number;   // このQRでCBにより凍結中の金額（actual_amountの内数）
  hold_released: boolean;
  settle_amount: number | null;
};

export type QRGroupRow = {
  qr_config_id: string;
  label: string;
  txCount: number;
  totalQuantity: number;   // ticketsのquantity合算（まとめ買い等で1決済=複数人分のケースを含む実人数）
  totalGross: number;
  totalStripeFee: number;
  totalPlatformFee: number;
  totalNet: number;
  totalTaxAmount: number;
  distributions: DistributionRow[];
};

export type MessageRow = {
  transaction_id: string;
  sender_name: string | null;
  sender_comment: string | null;
  total_gross_amount: number;
  created_at: string;
  recipient_profile_id: string | null;
  recipient_name: string | null;
};

export type DebtClaimRow = {
  claim_id: string; original_transaction_id: string;
  claim_amount: number; stripe_dispute_fee: number | null;
  stripe_processing_fee: number | null; status: string;
  stripe_dispute_id: string | null; created_at: string;
};

const ROLE_ORDER = { admin: 0, agent: 1, organizer: 2, artist: 3 };
const BATCH = 50;

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

  const { data: summary } = await admin
    .from("settlement_summaries").select("approved_at").eq("event_id", eventId).maybeSingle();

  const { data: qrConfigsRaw } = await admin
    .from("qr_configs")
    .select("qr_config_id, label")
    .eq("event_id", eventId).is("deleted_at", null).order("created_at", { ascending: true });
  const qrConfigs = qrConfigsRaw ?? [];
  const qrIds = qrConfigs.map(q => q.qr_config_id);

  // トランザクション
  // stripe_fee/net_amount は決済時点の見積り。stripe_fee_actual/stripe_net_actual は
  // 照合(reconcile)後の実測値で、照合済みならこちらを優先する（見積りのまま
  // レポートを表示すると、照合による訂正がサマリーに反映されず古い数値のまま
  // になってしまうため）。
  let allTxs: any[] = [];
  for (let i = 0; i < qrIds.length; i += BATCH) {
    const { data } = await admin.from("transactions")
      .select("transaction_id, qr_config_id, total_gross_amount, stripe_fee, platform_fee, net_amount, stripe_fee_actual, stripe_net_actual")
      .in("qr_config_id", qrIds.slice(i, i + BATCH))
      .eq("status", "completed").neq("transaction_type", "invitation");
    allTxs.push(...(data ?? []));
  }
  const txIds = allTxs.map(t => t.transaction_id);
  const txToQr = new Map(allTxs.map(t => [t.transaction_id, t.qr_config_id as string]));

  // まとめ買い（当日現地QR決済で複数人分を1決済にまとめるケース）は
  // tickets.quantityに実人数が入る。1決済=1チアとしてtxCountを数えるだけでは
  // 実際に何人分/何枚分だったかが分からないため、QR別にquantity合計も出す。
  let ticketQtys: { transaction_id: string; quantity: number }[] = [];
  for (let i = 0; i < txIds.length; i += BATCH) {
    const { data } = await admin.from("tickets")
      .select("transaction_id, quantity")
      .in("transaction_id", txIds.slice(i, i + BATCH));
    ticketQtys.push(...(data ?? []));
  }
  const qtyByTxId = new Map(ticketQtys.map(t => [t.transaction_id, t.quantity ?? 1]));

  const qrGrossMap      = new Map<string, number>();
  const qrStripeFeeMap  = new Map<string, number>();
  const qrPlatformFeeMap = new Map<string, number>();
  const qrNetMap        = new Map<string, number>();
  const qrTxCountMap    = new Map<string, number>();
  const qrQuantityMap   = new Map<string, number>();
  for (const tx of allTxs) {
    const q = tx.qr_config_id;
    const platformFee = tx.platform_fee ?? 0;
    const stripeFee = tx.stripe_fee_actual ?? tx.stripe_fee ?? 0;
    const netAmount = tx.stripe_net_actual != null
      ? tx.stripe_net_actual - platformFee
      : (tx.net_amount ?? 0);
    qrGrossMap.set(q,      (qrGrossMap.get(q)      ?? 0) + (tx.total_gross_amount ?? 0));
    qrStripeFeeMap.set(q,  (qrStripeFeeMap.get(q)  ?? 0) + stripeFee);
    qrPlatformFeeMap.set(q,(qrPlatformFeeMap.get(q) ?? 0) + platformFee);
    qrNetMap.set(q,        (qrNetMap.get(q)         ?? 0) + netAmount);
    qrTxCountMap.set(q,    (qrTxCountMap.get(q)     ?? 0) + 1);
    qrQuantityMap.set(q,   (qrQuantityMap.get(q)    ?? 0) + (qtyByTxId.get(tx.transaction_id) ?? 1));
  }

  // 配分明細（is_frozen を金額で追跡）
  let allDists: any[] = [];
  for (let i = 0; i < txIds.length; i += BATCH) {
    const { data } = await admin.from("transaction_distributions")
      .select("transaction_id, profile_id, distribution_role, actual_amount, tax_amount, is_frozen, hold_released")
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

  // プロフィール名
  const profileIds = [...new Set(allDists.map(d => d.profile_id))];
  const { data: profiles } = profileIds.length > 0
    ? await admin.from("profiles").select("profile_id, display_name, artist_name, organizer_name, role").in("profile_id", profileIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [
    p.profile_id,
    { name: p.organizer_name ?? p.artist_name ?? p.display_name ?? p.profile_id, role: p.role },
  ]));

  // QR別・プロフィール別集計
  // 同一人物が同一QRで複数ロール（例: オーガナイザー兼エージェント）を持つ場合、
  // 役割ごとの配分額は別物のため、profile_idだけでなくdistribution_roleも
  // キーに含めて集計する（roleを無視すると別ロール分が1行に合算され、金額が
  // 実態より膨らんで見える）。
  // frozen_amount = is_frozen な行の actual_amount の合計（人単位での部分凍結を正確に追跡）
  type ProfDist = {
    profile_id: string;
    actual_amount: number; frozen_amount: number;
    tax_amount: number; hold_released: boolean; role: string;
  };
  const qrProfileDist = new Map<string, Map<string, ProfDist>>();
  for (const d of allDists) {
    const qid = txToQr.get(d.transaction_id);
    if (!qid) continue;
    if (!qrProfileDist.has(qid)) qrProfileDist.set(qid, new Map());
    const map = qrProfileDist.get(qid)!;
    const key = `${d.profile_id}::${d.distribution_role}`;
    const prev = map.get(key);
    map.set(key, {
      profile_id:     d.profile_id,
      actual_amount:  (prev?.actual_amount  ?? 0) + (d.actual_amount ?? 0),
      frozen_amount:  (prev?.frozen_amount  ?? 0) + (d.is_frozen ? (d.actual_amount ?? 0) : 0),
      tax_amount:     (prev?.tax_amount     ?? 0) + (d.tax_amount ?? 0),
      hold_released:  d.hold_released && (prev?.hold_released ?? true),
      role:           d.distribution_role,
    });
  }

  // QRグループ構築
  const qrGroups: QRGroupRow[] = qrConfigs.map(qr => {
    const profMap = qrProfileDist.get(qr.qr_config_id) ?? new Map();
    const distributions: DistributionRow[] = [...profMap.values()]
      .map((d) => ({
        profile_id:    d.profile_id,
        display_name:  profileMap.get(d.profile_id)?.name ?? d.profile_id,
        role:          d.role,
        actual_amount: d.actual_amount,
        frozen_amount: d.frozen_amount,
        hold_released: d.hold_released,
        settle_amount: settleByProfile.get(d.profile_id) ?? null,
      }))
      .sort((a, b) => (ROLE_ORDER[a.role as keyof typeof ROLE_ORDER] ?? 4) - (ROLE_ORDER[b.role as keyof typeof ROLE_ORDER] ?? 4));

    return {
      qr_config_id:     qr.qr_config_id,
      label:            qr.label ?? "QR設定",
      txCount:          qrTxCountMap.get(qr.qr_config_id) ?? 0,
      totalQuantity:    qrQuantityMap.get(qr.qr_config_id) ?? 0,
      totalGross:       qrGrossMap.get(qr.qr_config_id) ?? 0,
      totalStripeFee:   qrStripeFeeMap.get(qr.qr_config_id) ?? 0,
      totalPlatformFee: qrPlatformFeeMap.get(qr.qr_config_id) ?? 0,
      totalNet:         qrNetMap.get(qr.qr_config_id) ?? 0,
      totalTaxAmount:   [...profMap.values()].reduce((s, d) => s + d.tax_amount, 0),
      distributions,
    };
  }).filter(g => g.totalGross > 0 || g.distributions.length > 0);

  // ── イベント全体の受取人サマリー（QR横断で合算、ロール単位）────────────
  const eventRecipientMap = new Map<string, EventRecipientRow>();
  for (const qr of qrGroups) {
    for (const d of qr.distributions) {
      const key = `${d.profile_id}::${d.role}`;
      const prev = eventRecipientMap.get(key);
      eventRecipientMap.set(key, {
        profile_id:    d.profile_id,
        display_name:  d.display_name,
        role:          d.role,
        total_amount:  (prev?.total_amount  ?? 0) + d.actual_amount,
        frozen_amount: (prev?.frozen_amount ?? 0) + d.frozen_amount,
        hold_released: d.hold_released && (prev?.hold_released ?? true),
        settle_amount: null, // 下でロール行ごとに配分し直す
      });
    }
  }
  const eventRecipients: EventRecipientRow[] = [...eventRecipientMap.values()]
    .sort((a, b) => (ROLE_ORDER[a.role as keyof typeof ROLE_ORDER] ?? 4) - (ROLE_ORDER[b.role as keyof typeof ROLE_ORDER] ?? 4));

  // 振込実績(settle_transfers)はプロフィール単位の合計しか記録されておらず、
  // ロール別の内訳を持たない。そのため同一人物が複数ロール(organizer兼agent等)を
  // 持つ場合、各ロール行に同じプロフィール合計をそのまま出すと二重に振り込まれた
  // ように見えてしまう。ロール行ごとに「自分の合計配分額(total_amount)を上限」
  // として、未消化分から順に割り当てる。
  const remainingSettleByProfile = new Map(settleByProfile);
  for (const r of eventRecipients) {
    const remaining = remainingSettleByProfile.get(r.profile_id);
    if (remaining === undefined) continue; // settle_transfers記録なし → 未振込のまま
    const allocated = Math.max(0, Math.min(remaining, r.total_amount));
    r.settle_amount = allocated;
    remainingSettleByProfile.set(r.profile_id, remaining - allocated);
  }

  // イベント全体集計
  const totalGross       = qrGroups.reduce((s, g) => s + g.totalGross, 0);
  const totalStripeFee   = qrGroups.reduce((s, g) => s + g.totalStripeFee, 0);
  const totalPlatformFee = qrGroups.reduce((s, g) => s + g.totalPlatformFee, 0);
  const totalNet         = totalGross - totalStripeFee - totalPlatformFee;
  const totalTaxAmount   = qrGroups.reduce((s, g) => s + g.totalTaxAmount, 0);

  // 凍結合計 = 各受取人のfrozen_amountの合算（重複なし）
  const frozenDistTotal = eventRecipients.reduce((s, r) => s + r.frozen_amount, 0);

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
  const totalHold     = frozenDistTotal + cbFeeTotal + cbFeeShortage;

  // バージョン
  const approvedAtDate    = summary?.approved_at ? new Date(summary.approved_at) : null;
  const cbAfterSettlement = debtClaims.filter(c => !approvedAtDate || new Date(c.created_at) > approvedAtDate);
  const reportVersion     = `v1.${cbAfterSettlement.length}`;
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

  // メッセージ受信一覧
  const { data: msgProducts } = await admin
    .from("products").select("product_id")
    .eq("event_id", eventId).eq("type", "message").is("deleted_at", null);
  const msgProductIds = (msgProducts ?? []).map(p => p.product_id);
  let messageRows: MessageRow[] = [];
  if (msgProductIds.length > 0) {
    const { data: msgQrs } = await admin
      .from("qr_configs").select("qr_config_id, recipient_profile_id")
      .in("product_id", msgProductIds).is("deleted_at", null);
    const msgQrIds = (msgQrs ?? []).map(q => q.qr_config_id);
    const qrToRecipient = new Map((msgQrs ?? []).map(q => [q.qr_config_id, q.recipient_profile_id as string | null]));
    if (msgQrIds.length > 0) {
      let msgTxsRaw: { transaction_id: string; sender_name: string | null; sender_comment: string | null; total_gross_amount: number; created_at: string; qr_config_id: string }[] = [];
      for (let i = 0; i < msgQrIds.length; i += BATCH) {
        const { data } = await admin.from("transactions")
          .select("transaction_id, sender_name, sender_comment, total_gross_amount, created_at, qr_config_id")
          .in("qr_config_id", msgQrIds.slice(i, i + BATCH))
          .eq("status", "completed").order("created_at", { ascending: true });
        msgTxsRaw.push(...(data ?? []));
      }
      const recipientIds = [...new Set([...qrToRecipient.values()].filter((v): v is string => v !== null))];
      const { data: recipientProfs } = recipientIds.length > 0
        ? await admin.from("profiles").select("profile_id, display_name, artist_name, credit_name").in("profile_id", recipientIds)
        : { data: [] };
      const recipientMap = new Map((recipientProfs ?? []).map(p => [
        p.profile_id, p.credit_name ?? p.artist_name ?? p.display_name ?? "不明",
      ]));
      messageRows = msgTxsRaw.map(tx => {
        const rid = qrToRecipient.get(tx.qr_config_id) ?? null;
        return {
          transaction_id:     tx.transaction_id,
          sender_name:        tx.sender_name,
          sender_comment:     tx.sender_comment,
          total_gross_amount: tx.total_gross_amount,
          created_at:         tx.created_at,
          recipient_profile_id: rid,
          recipient_name:     rid ? (recipientMap.get(rid) ?? null) : null,
        };
      });
    }
  }

  const { data: riskReports } = await admin
    .from("daily_business_reports")
    .select("failed_count, failed_amount, task_name, process_date")
    .eq("status", "要確認・未回収あり").order("created_at", { ascending: false }).limit(5);

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
      eventRecipients={eventRecipients}
      qrGroups={qrGroups}
      debtClaims={debtClaims}
      activeClaims={activeClaims}
      cbFeeTotal={cbFeeTotal}
      cbFeeShortage={cbFeeShortage}
      frozenDistTotal={frozenDistTotal}
      totalHold={totalHold}
      riskReports={riskReports ?? []}
      messageRows={messageRows}
      isInsider={isAdmin || isAgent}
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
