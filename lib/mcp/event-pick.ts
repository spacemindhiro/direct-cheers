// イベントを名前の一部で探して1件に決める（MCP のツールは内部IDを受け取らない・返さない）。
// 対象は本人が操作できるイベント（主催者・担当エージェント。admin は全イベント）。lib/event-access.ts の canOperate で確かめる。
// 代理作成で未送信の下書きは主催者から見えない。
import { getEventAccess } from "@/lib/event-access";
import { hiddenProxyDraftIds } from "@/lib/proxy-draft";
import type { DcMcpContext } from "./context";
import { LIFECYCLE_LABEL, jstDateTime } from "./format";

export type EventRow = { event_id: string; title: string; start_at: string | null; lifecycle_status: string };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function findOperableEvents(ctx: DcMcpContext, query: string): Promise<EventRow[]> {
  let q = ctx.admin.from("events").select("event_id, title, start_at, lifecycle_status").is("deleted_at", null).ilike("title", `%${escapeLike(query)}%`);
  if (ctx.role !== "admin") {
    q = q.or(`organizer_profile_id.eq.${ctx.userId},agent_id.eq.${ctx.userId}`);
    const hidden = await hiddenProxyDraftIds(ctx.admin as never, ctx.userId);
    if (hidden.length > 0) q = q.not("event_id", "in", `(${hidden.join(",")})`);
  }
  const { data, error } = await q.order("start_at", { ascending: false }).limit(20);
  if (error) throw new Error("events");
  // 画面と同じ判定で最終確認（操作できるイベントだけ）
  const out: EventRow[] = [];
  for (const e of (data ?? []) as EventRow[]) {
    const access = await getEventAccess(ctx.admin as never, e.event_id, ctx.userId, ctx.role);
    if (access?.canOperate) out.push(e);
  }
  return out;
}

// 名前の一部から、本人が操作できるイベントを1件に決める。決まらなければ AI に返す文を返す（event_detail・evidence_status 等で共用）
export async function pickOperableEvent(ctx: DcMcpContext, rawQuery: string): Promise<{ event: EventRow } | { message: string }> {
  const query = rawQuery.trim();
  const found = await findOperableEvents(ctx, query);
  if (found.length === 0) return { message: `「${query}」に当てはまる、あなたが主催・担当するイベントは見つかりませんでした。` };
  const exact = found.filter((e) => e.title === query);
  const picked = exact.length === 1 ? exact[0] : found.length === 1 ? found[0] : null;
  if (picked) return { event: picked };
  return {
    message: [
      `「${query}」に当てはまるイベントが${found.length}件あります。どれか分かる名前で指定してください。`,
      ...found.slice(0, 5).map((e, i) => `${i + 1}. ${e.title}（${jstDateTime(e.start_at)}・${LIFECYCLE_LABEL[e.lifecycle_status] ?? e.lifecycle_status}）`),
    ].join("\n"),
  };
}

