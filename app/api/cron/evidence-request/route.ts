import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveCronReport, type FailureDetail } from "@/lib/cron-report";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { fmtDateTime } from "@/lib/display-tz";
import { POST_EVENT_GRACE_MS, RUNNING_LIFECYCLES } from "@/lib/purchase-window";
import {
  EVIDENCE_NOTIFICATION,
  evidenceReminderAt,
  settlementDeadline,
} from "@/lib/evidence-request";
import { sendEvidenceRequestEmail } from "@/lib/email/notification";

// GitHub Actions から毎時呼ばれる。Authorization ヘッダーで保護。
// 締め時刻を過ぎて証跡が未提出のイベントに、提出依頼（主催者）とフォロー依頼（担当エージェント、
// 自主催のイベントは admin）をメールとアプリ内のお知らせで送る。期限の2日前に未提出なら催促する。
// 決まりごとは lib/evidence-request.ts。送信済みの記録は notifications の行で兼ねる（二重送信しない）
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const closedBeforeIso = new Date(now.getTime() - POST_EVENT_GRACE_MS).toISOString();

  type TargetEvent = {
    event_id: string;
    title: string;
    start_at: string;
    end_at: string;
    organizer_profile_id: string;
    agent_id: string;
  };

  // 締め時刻を過ぎた、公開後〜精算前のイベント
  const events = await fetchAllPages<TargetEvent>(
    admin,
    "events",
    "event_id, title, start_at, end_at, organizer_profile_id, agent_id",
    (q) => q.in("lifecycle_status", [...RUNNING_LIFECYCLES]).lt("end_at", closedBeforeIso).is("deleted_at", null),
  );

  let adminId: string | null = null;
  const emailCache = new Map<string, string | null>();
  const nameCache = new Map<string, string>();
  async function emailOf(profileId: string): Promise<string | null> {
    if (!emailCache.has(profileId)) {
      const { data } = await admin.auth.admin.getUserById(profileId);
      emailCache.set(profileId, data.user?.email ?? null);
    }
    return emailCache.get(profileId) ?? null;
  }
  async function nameOf(profileId: string): Promise<string> {
    if (!nameCache.has(profileId)) {
      const { data } = await admin.from("profiles").select("organizer_name, display_name").eq("profile_id", profileId).maybeSingle();
      nameCache.set(profileId, (data as any)?.organizer_name ?? (data as any)?.display_name ?? "オーガナイザー");
    }
    return nameCache.get(profileId)!;
  }

  let sent = 0;
  let targetEvents = 0;
  const failures: FailureDetail[] = [];

  for (const event of events) {
    const deadline = settlementDeadline(event.start_at);
    // 期限を過ぎたイベントは未精算の自動キャンセルの対象。今さら依頼しても間に合わない
    if (now >= deadline) continue;

    // 証跡が提出済みなら依頼も催促も不要
    const { count: evidenceCount } = await admin
      .from("event_evidences")
      .select("evidence_id", { count: "exact", head: true })
      .eq("event_id", event.event_id);
    if ((evidenceCount ?? 0) > 0) continue;

    // 決済が1件も無いイベントは精算するものが無い（精算管理の画面も売上0円は対象外）
    const { data: qrConfigs } = await admin.from("qr_configs").select("qr_config_id").eq("event_id", event.event_id);
    const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
    if (qrIds.length === 0) continue;
    const { count: txCount } = await admin
      .from("transactions")
      .select("transaction_id", { count: "exact", head: true })
      .in("qr_config_id", qrIds)
      .eq("status", "completed")
      .neq("transaction_type", "invitation");
    if ((txCount ?? 0) === 0) continue;

    // 主催者としての送信記録で、この回（依頼／催促）を送ったかを判定する
    const { data: sentRows } = await admin
      .from("notifications")
      .select("type, created_at")
      .eq("profile_id", event.organizer_profile_id)
      .in("type", [EVIDENCE_NOTIFICATION.request, EVIDENCE_NOTIFICATION.reminder])
      .filter("metadata->>event_id", "eq", event.event_id);
    const requestRow = (sentRows ?? []).find((r) => r.type === EVIDENCE_NOTIFICATION.request);
    const reminderSent = (sentRows ?? []).some((r) => r.type === EVIDENCE_NOTIFICATION.reminder);
    const reminderAt = evidenceReminderAt(event.start_at);

    let kind: "request" | "reminder" | null = null;
    if (!requestRow) {
      kind = "request";
    } else if (!reminderSent && now >= reminderAt && new Date(requestRow.created_at) < reminderAt) {
      // 依頼が催促の時刻より後に届いた（長期開催など）場合は、依頼の時点で期限が近いことを伝えているので催促しない
      kind = "reminder";
    }
    if (!kind) continue;
    targetEvents++;

    // フォロー依頼の相手：担当エージェント。エージェント自身が主催するイベントは admin
    const isSelfOrganized = event.agent_id === event.organizer_profile_id;
    if (isSelfOrganized && !adminId) {
      // admin は運営（オーナー）1人の想定。複数いても毎回同じ相手に送るよう、いちばん古いアカウントに固定する
      const { data: admins } = await admin.from("profiles").select("profile_id").eq("role", "admin")
        .order("created_at", { ascending: true }).limit(1);
      adminId = admins?.[0]?.profile_id ?? null;
    }
    const followerId = isSelfOrganized ? adminId : event.agent_id;

    const deadlineLabel = fmtDateTime(deadline, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const organizerName = await nameOf(event.organizer_profile_id);
    const isReminder = kind === "reminder";

    const recipients: { profileId: string; audience: "organizer" | "follow"; type: string; title: string; body: string }[] = [
      {
        profileId: event.organizer_profile_id,
        audience: "organizer",
        type: isReminder ? EVIDENCE_NOTIFICATION.reminder : EVIDENCE_NOTIFICATION.request,
        title: isReminder ? "開催証跡の提出期限が近づいています" : "開催証跡を提出してください",
        body: `「${event.title}」の開催証跡（写真・動員数）を提出してください。${deadlineLabel}までに精算が完了しないと、決済はすべて自動で取り消されます。`,
      },
    ];
    if (followerId) {
      recipients.push({
        profileId: followerId,
        audience: "follow",
        type: isReminder ? EVIDENCE_NOTIFICATION.reminderFollow : EVIDENCE_NOTIFICATION.requestFollow,
        title: isReminder ? "開催証跡がまだ提出されていません" : "開催証跡の提出をフォローしてください",
        body: `${organizerName} さんの「${event.title}」の開催証跡が未提出です。${deadlineLabel}までに精算が完了しないと、決済はすべて自動で取り消されます。`,
      });
    } else {
      failures.push({ eventName: event.title, amount: 0, failureReason: "フォロー依頼の送り先（admin）が見つからない" });
    }

    for (const r of recipients) {
      // アプリ内のお知らせ（送信済みの記録を兼ねる）を先に残す。メールが失敗しても次回に二重送信しない
      const { error: insErr } = await admin.from("notifications").insert({
        profile_id: r.profileId,
        type: r.type,
        title: r.title,
        body: r.body,
        metadata: { event_id: event.event_id, deadline: deadline.toISOString(), organizer_name: organizerName },
      });
      if (insErr) {
        failures.push({ eventName: event.title, amount: 0, failureReason: `お知らせの記録に失敗: ${insErr.message.slice(0, 60)}` });
        continue;
      }
      const to = await emailOf(r.profileId);
      if (!to) {
        failures.push({ eventName: event.title, amount: 0, failureReason: "メールアドレスが無いためメール未送信（お知らせのみ）" });
        continue;
      }
      try {
        await sendEvidenceRequestEmail({
          to,
          eventId: event.event_id,
          eventTitle: event.title,
          organizerName,
          deadlineLabel,
          kind,
          audience: r.audience,
        });
        sent++;
      } catch (err: any) {
        console.error(`[evidence-request] email failed event=${event.event_id} to=${r.profileId}:`, err?.message);
        failures.push({ eventName: event.title, amount: 0, failureReason: `メール送信に失敗: ${(err?.message ?? "").slice(0, 60)}` });
      }
    }
  }

  await saveCronReport({
    taskName: "開催証跡の提出依頼バッチ",
    totalEvents: events.length,
    targetCount: targetEvents,
    targetAmount: 0,
    successCount: sent,
    successAmount: 0,
    failedCount: failures.length,
    failedAmount: 0,
    failures,
  });

  return NextResponse.json({ success: true, events: targetEvents, sent, failed: failures.length });
}
