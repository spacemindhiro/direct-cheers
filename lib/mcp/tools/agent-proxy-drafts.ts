// agent_proxy_drafts：担当イベントの下書きと、代理作成した下書きを主催者に送ったかどうか。
//   - 範囲はイベント詳細画面の「主催者に確認を依頼する」ボタンの条件と同じ：本人が担当（agent_id）で、主催者が別の人の下書き
//   - 未送信＝作成者宛ての目印（lib/proxy-draft.ts）が残っている。送信済み＝主催者へ proxy_event_created の通知がある
// 返さないもの：主催者の連絡先・内部ID
import { z } from "zod";
import { PROXY_DRAFT_MARKER } from "@/lib/proxy-draft";
import type { DcMcpContext } from "../context";
import { jstDateTime, lines } from "../format";

export const AGENT_PROXY_DRAFTS = {
  name: "agent_proxy_drafts",
  minRole: "agent",
  title: "代理下書きの送信状況",
  description:
    "この人が担当するイベントのうち、主催者が別の人でまだ下書きのものを返す。代理で作った下書きを主催者に送ったか（未送信／送信済みと最後に送った日時）、主催者が自分で作った下書きか。送信済みなら、主催者が内容を確認して承認依頼を送るのを待っている状態。送信はイベント詳細画面の「主催者に確認を依頼する」で行う。",
  inputSchema: {
    limit: z.number().int().min(1).max(20).optional().describe("返す件数（既定10）"),
  },
} as const;

type Row = {
  event_id: string;
  title: string;
  start_at: string | null;
  created_at: string;
  organizer_profile_id: string;
  organizer: { display_name: string | null; organizer_name: string | null } | null;
};

export async function agentProxyDrafts(ctx: DcMcpContext, input: { limit?: number }): Promise<string> {
  const limit = input.limit ?? 10;
  const { data, error } = await ctx.admin
    .from("events")
    .select("event_id, title, start_at, created_at, organizer_profile_id, organizer:profiles!organizer_profile_id(display_name, organizer_name)")
    .eq("agent_id", ctx.userId)
    .neq("organizer_profile_id", ctx.userId)
    .eq("lifecycle_status", "draft")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error("drafts");
  const events = (data ?? []) as unknown as Row[];
  if (events.length === 0) return "担当イベントの下書き（主催者が別の人のもの）はありません。";

  const ids = events.map((e) => e.event_id);
  const [{ data: markers }, { data: sent }] = await Promise.all([
    ctx.admin.from("notifications").select("metadata").eq("type", PROXY_DRAFT_MARKER).in("metadata->>event_id", ids),
    ctx.admin.from("notifications").select("created_at, metadata").eq("type", "proxy_event_created").in("metadata->>event_id", ids).order("created_at", { ascending: false }),
  ]);
  const unsent = new Set((markers ?? []).map((m) => (m.metadata as { event_id?: string } | null)?.event_id));
  const lastSent = new Map<string, string>();
  for (const n of sent ?? []) {
    const id = (n.metadata as { event_id?: string } | null)?.event_id;
    if (id && !lastSent.has(id)) lastSent.set(id, n.created_at as string);
  }

  const state = (e: Row) => unsent.has(e.event_id) ? "代理作成・主催者に未送信（主催者からはまだ見えない）"
    : lastSent.has(e.event_id) ? `代理作成・主催者に送信済み（${jstDateTime(lastSent.get(e.event_id))}）。主催者の承認依頼待ち`
    : "主催者が作成中の下書き";
  const counts = { unsent: events.filter((e) => unsent.has(e.event_id)).length, sent: events.filter((e) => !unsent.has(e.event_id) && lastSent.has(e.event_id)).length };
  const body = events.slice(0, limit).map((e, i) => lines(`${i + 1}. ${e.title}`, [
    ["主催者", e.organizer?.organizer_name ?? e.organizer?.display_name ?? "—"],
    ["開催", jstDateTime(e.start_at)],
    ["状況", state(e)],
  ]));
  return [`担当イベントの下書き ${events.length}件（代理作成の未送信 ${counts.unsent}件・送信済み ${counts.sent}件。${Math.min(limit, events.length)}件を表示）`, ...body].join("\n");
}
