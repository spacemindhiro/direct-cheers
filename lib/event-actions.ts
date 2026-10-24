// イベント詳細画面で「この人が今できる操作」の判定。画面（app/[locale]/dashboard/events/[eventId]/page.tsx）と
// チアリー(AI) の event_detail で共用する。ボタンを出すかどうかの判定で、実際の権限は各 API が改めて確かめる。
import { isEventClosed, isEventEditable, RUNNING_LIFECYCLES } from "@/lib/purchase-window";

export type EventActionInput = {
  userId: string;
  role: string | null | undefined;
  event: { organizer_profile_id: string; agent_id: string; lifecycle_status: string; end_at: string };
  isLineupArtist: boolean;
  pendingHandoff: { to_agent_id: string } | null;
  now?: Date;
};

export const HANDOFF_ELIGIBLE_STATUSES = ["review_requested", "published", "ongoing"];
const CANCELLABLE_STATUSES = ["draft", "review_requested", "published", "ongoing"];

export function eventActions(i: EventActionInput) {
  const { event, userId } = i;
  const isAdmin = i.role === "admin";
  // ロールではなく「このイベントとの関係」で判定する
  const isEventOrganizer = event.organizer_profile_id === userId;
  const isEventAgent = event.agent_id === userId && (i.role === "agent" || isAdmin);
  const isSelfOrganized = event.agent_id === event.organizer_profile_id;
  const status = event.lifecycle_status;
  // 証跡は締め時刻（終了3時間後＝当日決済の受付終了）を過ぎてから。決済を受け付けている最中に
  // 承認まで進まないようにする（lib/purchase-window.ts）。終了ボタンは2026-10-22に廃止
  const hasEnded = isEventClosed(event.end_at, i.now) && (RUNNING_LIFECYCLES as readonly string[]).includes(status);
  return {
    isAdmin,
    isEventOrganizer,
    isEventAgent,
    isLineupArtist: i.isLineupArtist,
    isSelfOrganized,
    hasEnded,
    canRequestReview: isEventOrganizer && status === "draft",
    // 担当エージェント（またはadmin）が主催者名義の下書きを主催者に送る（代理作成の確認依頼）
    canProxyNotify: (isEventAgent || isAdmin) && status === "draft" && !isSelfOrganized && event.organizer_profile_id !== userId,
    canApprove: (isEventAgent || isAdmin) && status === "review_requested" && (!isSelfOrganized || isAdmin),
    // 終わった（締め時刻後）・中止申請中・中止のイベントには QR を作らない・編集しない（API と同じ）
    canCreateQR: (isEventOrganizer || isEventAgent) && isEventEditable(status, event.end_at, i.now),
    canSubmitEvidence: (isEventOrganizer || isEventAgent) && hasEnded,
    canRequestCancel: isEventOrganizer && CANCELLABLE_STATUSES.includes(status),
    canApproveCancellation: (isEventAgent || isAdmin) && status === "cancellation_requested",
    isHandoffCandidate: i.pendingHandoff?.to_agent_id === userId,
    // 自主開催（エージェント自身が主催者）のイベントは承認がadminルートのため代打の対象外
    canRequestHandoff: isEventAgent && !isAdmin && !isSelfOrganized && !i.pendingHandoff && HANDOFF_ELIGIBLE_STATUSES.includes(status),
    canEdit: (isEventOrganizer || isEventAgent) && isEventEditable(status, event.end_at, i.now),
  };
}

// QR一覧の商品タイプ表示ラベル（type + entrance/customのpayment_type）
const CUSTOM_SUBTYPE_LABELS: Record<string, string> = {
  V: "バウチャー",
  D: "ドリンクチケット",
};

export function qrProductTypeLabel(type: string | undefined, paymentType: string | null | undefined): string {
  if (!type) return "";
  if (type === "standard") return "スタンダード";
  if (type === "message") return "メッセージ";
  if (type === "entrance") return `エントランス（${paymentType ?? "?"}）`;
  if (type === "custom") return `カスタム（${CUSTOM_SUBTYPE_LABELS[paymentType ?? "V"] ?? paymentType ?? "V"}）`;
  return type;
}
