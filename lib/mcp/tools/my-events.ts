// my_events：本人が主催するイベントと、エージェントとして担当するイベント（イベント一覧画面と同じ範囲）。
//   - 本人のセッションで読む（RLS）うえで、主催者 or 担当エージェントが本人のものに絞る
//   - 代理作成でまだ主催者に送っていない下書きは、主催者には出さない（2026-10-16 本番障害の再発防止）
//   - 売上・証跡は、上で本人に見せてよいと確かめたイベントについてだけ集計する
// 返さないもの：お客様の名前・メールアドレス・決済ID・内部ID
import { z } from "zod";
import { hiddenProxyDraftIds } from "@/lib/proxy-draft";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { AUTH_EXPIRE_DAYS } from "@/lib/settlement-deadline";
import type { DcMcpContext } from "../context";
import { LIFECYCLE_LABEL, jstDateTime, lines, yen } from "../format";

export const MY_EVENTS = {
  name: "my_events",
  minRole: "organizer",
  title: "自分のイベント",
  description:
    "この人が主催するイベントと、エージェントとして担当するイベントを返す。状態・開催日時・会場・売上（件数と金額）・開催証跡の提出状況・精算期限までの日数を含む。scope=upcoming はこれから・対応中、past は終了したもの。",
  inputSchema: {
    scope: z.enum(["upcoming", "past"]).optional().describe("upcoming（既定）か past"),
    limit: z.number().int().min(1).max(20).optional().describe("返す件数（既定10）"),
  },
} as const;

// イベント一覧画面と同じ区切り（app/[locale]/dashboard/events/page.tsx）
const CLOSED_STATUSES = ["settled", "cancelled"];
const SETTLEMENT_GRACE_DAYS = AUTH_EXPIRE_DAYS;
// 精算期限の対象（決済を受け付けた・受け付けうる状態）
const DEADLINE_STATUSES = ["published", "ongoing", "ended", "cancellation_requested"];

type EventRow = {
  event_id: string;
  title: string;
  venue: string | null;
  start_at: string | null;
  end_at: string | null;
  lifecycle_status: string;
  organizer_profile_id: string;
  agent_id: string | null;
};

export async function myEvents(ctx: DcMcpContext, input: { scope?: "upcoming" | "past"; limit?: number }): Promise<string> {
  const scope = input.scope ?? "upcoming";
  const limit = input.limit ?? 10;
  const now = ctx.now ?? new Date();
  const cutoff = new Date(now.getTime() - SETTLEMENT_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const closedList = `(${CLOSED_STATUSES.join(",")})`;
  const hidden = await hiddenProxyDraftIds(ctx.admin as never, ctx.userId);

  let q = ctx.supabase
    .from("events")
    .select("event_id, title, venue, start_at, end_at, lifecycle_status, organizer_profile_id, agent_id", { count: "exact" })
    .is("deleted_at", null)
    .or(`organizer_profile_id.eq.${ctx.userId},agent_id.eq.${ctx.userId}`);
  if (hidden.length > 0) q = q.not("event_id", "in", `(${hidden.join(",")})`);
  q = scope === "past"
    ? q.or(`lifecycle_status.in.${closedList},end_at.lt."${cutoff}"`)
    : q.not("lifecycle_status", "in", closedList).gte("end_at", cutoff);
  const { data, count, error } = await q
    .order("start_at", { ascending: scope === "upcoming" })
    .order("event_id", { ascending: true })
    .range(0, limit - 1);
  if (error) throw new Error("events");
  const events = (data ?? []) as EventRow[];
  if (events.length === 0) return scope === "upcoming" ? "これから・対応中のイベントはありません。" : "終了したイベントはありません。";

  const ids = events.map((e) => e.event_id);
  const [{ data: qrs }, { data: evidences }] = await Promise.all([
    ctx.admin.from("qr_configs").select("qr_config_id, event_id").in("event_id", ids),
    ctx.admin.from("event_evidences").select("event_id").in("event_id", ids),
  ]);
  const eventOfQr = new Map((qrs ?? []).map((r) => [r.qr_config_id as string, r.event_id as string]));
  const sales = new Map<string, { count: number; gross: number }>();
  if (eventOfQr.size > 0) {
    const txs = await fetchAllPages<{ qr_config_id: string; total_gross_amount: number }>(
      ctx.admin as never, "transactions", "qr_config_id, total_gross_amount",
      (tq) => tq.in("qr_config_id", [...eventOfQr.keys()]).eq("status", "completed"),
    );
    for (const t of txs) {
      const eid = eventOfQr.get(t.qr_config_id);
      if (!eid) continue;
      const s = sales.get(eid) ?? { count: 0, gross: 0 };
      s.count += 1;
      s.gross += Number(t.total_gross_amount ?? 0);
      sales.set(eid, s);
    }
  }
  const hasEvidence = new Set((evidences ?? []).map((r) => r.event_id as string));

  const body = events.map((e, i) => {
    const s = sales.get(e.event_id) ?? { count: 0, gross: 0 };
    let deadline: string | null = null;
    if (DEADLINE_STATUSES.includes(e.lifecycle_status) && e.start_at) {
      const due = new Date(new Date(e.start_at).getTime() + AUTH_EXPIRE_DAYS * 24 * 60 * 60 * 1000);
      const days = Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      deadline = `${jstDateTime(due.toISOString())}（${days >= 0 ? `あと${days}日` : "期限切れ"}）`;
    }
    const relation = e.organizer_profile_id === ctx.userId ? "主催" : "担当エージェント";
    return lines(`${i + 1}. ${e.title}`, [
      ["あなたとの関係", relation],
      ["状態", LIFECYCLE_LABEL[e.lifecycle_status] ?? e.lifecycle_status],
      ["開催", `${jstDateTime(e.start_at)} 〜 ${jstDateTime(e.end_at)}`],
      ["会場", e.venue],
      ["売上", `${s.count}件 ${yen(s.gross)}（お客様の支払額の合計）`],
      ["開催証跡", hasEvidence.has(e.event_id) ? "提出済み" : "未提出"],
      ["精算期限", deadline],
    ]);
  });
  const label = scope === "upcoming" ? "これから・対応中" : "終了";
  return [`${label}のイベント ${count ?? events.length}件（${events.length}件を表示）`, ...body].join("\n");
}
