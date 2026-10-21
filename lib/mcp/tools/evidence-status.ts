// evidence_status：イベント1件の開催証跡（エビデンス）の提出内容と確認状況・差し戻し理由。
//   - 対象は証跡の提出画面と同じ、本人が操作できるイベント（lib/event-access.ts の canOperate。探し方は ../event-pick.ts）
//   - 差し戻しの理由は主催者への通知（evidence_rejected）にだけ残る。画面で見られる主催者と運営にだけ返し、
//     担当エージェントには「差し戻し中」までを返す
// 返さないもの：写真そのもの・保存先のパス（枚数だけ）・内部ID
import { z } from "zod";
import { AUTH_EXPIRE_DAYS } from "@/lib/settlement-deadline";
import type { DcMcpContext } from "../context";
import { pickOperableEvent } from "../event-pick";
import { LIFECYCLE_LABEL, jstDateTime, lines } from "../format";

export const EVIDENCE_STATUS = {
  name: "evidence_status",
  minRole: "organizer",
  title: "開催証跡の状況",
  description:
    "この人が主催・担当するイベント1件の開催証跡（エビデンス）について、提出の有無・提出内容（説明・来場者数・写真の枚数）・運営の確認状況（確認待ち／差し戻し中／精算済み）・差し戻しの理由（主催者と運営のみ）・精算期限を返す。イベントは名前の一部で指定する。",
  inputSchema: {
    event: z.string().min(1).max(100).describe("イベント名の一部"),
  },
} as const;

export async function evidenceStatus(ctx: DcMcpContext, input: { event: string }): Promise<string> {
  const found = await pickOperableEvent(ctx, input.event);
  if ("message" in found) return found.message;
  const eventId = found.event.event_id;

  const { data: event } = await ctx.admin
    .from("events")
    .select("title, start_at, lifecycle_status, organizer_profile_id")
    .eq("event_id", eventId)
    .single();
  if (!event) throw new Error("event");
  const [{ data: evidences }, { data: rejectedSummary }] = await Promise.all([
    ctx.admin.from("event_evidences").select("description, photo_paths, attendance_count, created_at").eq("event_id", eventId).order("created_at", { ascending: false }),
    ctx.admin.from("settlement_summaries").select("summary_id").eq("event_id", eventId).eq("is_approved_for_payout", false).maybeSingle(),
  ]);
  const list = evidences ?? [];
  const latest = list[0];

  // 差し戻し中＝運営が差し戻し、まだ再提出していない（再提出すると差し戻しの印が消える：/api/events/[eventId]/evidence）
  const review = event.lifecycle_status === "settled" ? "精算済み"
    : rejectedSummary ? "差し戻し中（直して再提出が必要）"
    : list.length > 0 ? "運営の確認待ち"
    : "未提出";

  const canReadReason = ctx.role === "admin" || event.organizer_profile_id === ctx.userId;
  let reasons: string[] = [];
  if (canReadReason) {
    const { data: notes } = await ctx.admin
      .from("notifications")
      .select("created_at, metadata")
      .eq("profile_id", event.organizer_profile_id)
      .eq("type", "evidence_rejected")
      .filter("metadata->>event_id", "eq", eventId)
      .order("created_at", { ascending: false })
      .limit(3);
    reasons = (notes ?? []).map((n) => `  - ${jstDateTime(n.created_at)}：${(n.metadata as { comment?: string } | null)?.comment ?? "（理由の記録なし）"}`);
  }

  let deadline: string | null = null;
  if (event.start_at && !["settled", "cancelled"].includes(event.lifecycle_status)) {
    const due = new Date(new Date(event.start_at).getTime() + AUTH_EXPIRE_DAYS * 24 * 60 * 60 * 1000);
    const days = Math.ceil((due.getTime() - (ctx.now ?? new Date()).getTime()) / (24 * 60 * 60 * 1000));
    deadline = `${jstDateTime(due.toISOString())}（${days >= 0 ? `あと${days}日` : "期限切れ"}）`;
  }

  const out = [
    lines(`${event.title} の開催証跡`, [
      ["イベントの状態", LIFECYCLE_LABEL[event.lifecycle_status] ?? event.lifecycle_status],
      ["確認状況", review],
      ["提出", list.length > 0 ? `${list.length}回（最新 ${jstDateTime(latest.created_at)}）` : "まだありません"],
      ["最新の説明", latest?.description || null],
      ["最新の来場者数", latest?.attendance_count ?? null],
      ["最新の写真", latest ? `${(latest.photo_paths ?? []).length}枚` : null],
      ["精算期限（開催から" + AUTH_EXPIRE_DAYS + "日）", deadline],
    ]),
  ];
  if (rejectedSummary || reasons.length > 0) {
    if (canReadReason) out.push(reasons.length ? ["これまでの差し戻しの理由（新しい順）", ...reasons].join("\n") : "差し戻しの理由：記録がありません");
    else if (rejectedSummary) out.push("差し戻しの理由：主催者に通知されています（エージェントの画面には表示されません）");
  }
  return out.join("\n");
}
