import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettlementReportClient } from "@/components/settlement-report-client";
import { computeSettlementReport } from "@/lib/settlement-report";
export type { EventRecipientRow, DistributionRow, QRGroupRow, DebtClaimRow } from "@/lib/settlement-report";
import { Loader2 } from "lucide-react";

export type MessageRow = {
  transaction_id: string;
  sender_name: string | null;
  sender_comment: string | null;
  total_gross_amount: number;
  created_at: string;
  recipient_profile_id: string | null;
  recipient_name: string | null;
};


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

  // 集計はチアリー(AI) の settlement_report と共用（lib/settlement-report.ts）
  const {
    approvedAtStr, reportVersion, lastCbAt,
    totalGross, totalStripeFee, totalPlatformFee, totalNet, totalTaxAmount,
    eventRecipients, qrGroups, debtClaims, activeClaims,
    cbFeeTotal, cbFeeShortage, frozenDistTotal, totalHold,
  } = await computeSettlementReport(admin, eventId);

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
      const msgTxsRaw: { transaction_id: string; sender_name: string | null; sender_comment: string | null; total_gross_amount: number; created_at: string; qr_config_id: string }[] = [];
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
