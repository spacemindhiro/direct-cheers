// agent_handoffs：代打（担当エージェントの引き継ぎ）の依頼状況。本人が依頼した／本人に来た依頼だけ。
//   返事待ちを先に、そのあと新しい順。相手の名前はイベント詳細画面の代打欄と同じ（主催者名があればそれ、無ければ表示名）
// 返さないもの：相手の連絡先・内部ID
import { z } from "zod";
import type { DcMcpContext } from "../context";
import { LIFECYCLE_LABEL, jstDateTime, lines } from "../format";

export const AGENT_HANDOFFS = {
  name: "agent_handoffs",
  minRole: "agent",
  title: "代打の依頼状況",
  description:
    "代打（イベントの担当を別のエージェントに引き継ぐ依頼）のうち、この人が依頼したもの・この人に来たものを返す。返事待ちを先に新しい順。イベント名・開催日時・イベントの状態・向き（あなた→相手／相手→あなた）・相手のエージェント名・状況（返事待ち／承諾／辞退／取り下げ）・依頼日時・返事の日時。依頼や返事はイベント詳細画面で行う。",
  inputSchema: {
    limit: z.number().int().min(1).max(20).optional().describe("返す件数（既定10）"),
  },
} as const;

const STATUS: Record<string, string> = { pending: "返事待ち", accepted: "承諾", rejected: "辞退", cancelled: "取り下げ" };

type Row = {
  status: string;
  requested_at: string;
  responded_at: string | null;
  from_agent_id: string;
  event: { title: string; start_at: string | null; lifecycle_status: string } | null;
  from_agent: { display_name: string | null; organizer_name: string | null } | null;
  to_agent: { display_name: string | null; organizer_name: string | null } | null;
};

export async function agentHandoffs(ctx: DcMcpContext, input: { limit?: number }): Promise<string> {
  const limit = input.limit ?? 10;
  const { data, error } = await ctx.admin
    .from("event_agent_handoffs")
    .select("status, requested_at, responded_at, from_agent_id, event:events!event_id(title, start_at, lifecycle_status), from_agent:profiles!from_agent_id(display_name, organizer_name), to_agent:profiles!to_agent_id(display_name, organizer_name)")
    .or(`from_agent_id.eq.${ctx.userId},to_agent_id.eq.${ctx.userId}`)
    .order("requested_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("handoffs");
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
  if (rows.length === 0) return "代打の依頼はありません。";

  const name = (p: Row["from_agent"]) => p?.organizer_name ?? p?.display_name ?? "—";
  const pending = rows.filter((r) => r.status === "pending");
  const body = rows.slice(0, limit).map((r, i) => {
    const mine = r.from_agent_id === ctx.userId;
    return lines(`${i + 1}. ${r.event?.title ?? "（イベント不明）"}`, [
      ["開催", jstDateTime(r.event?.start_at)],
      ["イベントの状態", r.event ? LIFECYCLE_LABEL[r.event.lifecycle_status] ?? r.event.lifecycle_status : null],
      ["向き", mine ? `あなた → ${name(r.to_agent)}` : `${name(r.from_agent)} → あなた`],
      ["状況", STATUS[r.status] ?? r.status],
      ["依頼日時", jstDateTime(r.requested_at)],
      ["返事の日時", r.responded_at ? jstDateTime(r.responded_at) : null],
    ]);
  });
  const toMe = pending.filter((r) => r.from_agent_id !== ctx.userId).length;
  return [`代打の依頼 ${rows.length}件（返事待ち ${pending.length}件・うちあなた宛て ${toMe}件。${Math.min(limit, rows.length)}件を表示）`, ...body].join("\n");
}
