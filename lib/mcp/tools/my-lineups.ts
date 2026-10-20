// my_lineups：本人への出演依頼（返事待ち）と出演予定（ダッシュボードと同じ見せ方 lib/lineup-invites.ts）。
// 主催者が下書きの間に選んだだけで、まだ依頼が届いていないもの（依頼予定）は出さない。
// 返さないもの：主催者の連絡先・内部ID
import { fetchLineupRows, visibleLineupInvites, type LineupRow } from "@/lib/lineup-invites";
import type { DcMcpContext } from "../context";
import { jstDateTime, lines } from "../format";

export const MY_LINEUPS = {
  name: "my_lineups",
  minRole: "artist",
  title: "出演依頼・出演予定",
  description: "この人に届いている出演依頼（返事待ち）と、出演が確定しているこれからのイベントを返す。ダッシュボードの「出演」と同じ範囲。",
  inputSchema: {},
} as const;

export async function myLineups(ctx: DcMcpContext): Promise<string> {
  const now = (ctx.now ?? new Date()).toISOString();
  const { data, error } = await fetchLineupRows(ctx.admin, ctx.userId);
  if (error) throw new Error("lineups");
  const list = await visibleLineupInvites(ctx.admin, ctx.userId, (data as LineupRow[] | null) ?? [], now);
  if (list.length === 0) return "出演依頼・出演予定はありません。";
  const pending = list.filter((l) => l.status === "pending");
  const confirmed = list.filter((l) => l.status === "confirmed");
  const fmt = (l: (typeof list)[number], i: number) =>
    lines(`${i + 1}. ${l.event?.title ?? "（イベント不明）"}`, [
      ["開催", jstDateTime(l.event?.start_at)],
      ["会場", l.event?.venue],
      ["主催者", l.event?.organizer_name],
      ["依頼メッセージ", l.status === "pending" ? l.invite_message || null : null],
    ]);
  return [
    `返事待ちの出演依頼 ${pending.length}件（ダッシュボードの「出演」から承認・辞退できます）`,
    ...pending.map(fmt),
    `出演予定 ${confirmed.length}件`,
    ...confirmed.map(fmt),
  ].join("\n");
}
