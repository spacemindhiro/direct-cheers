// my_tickets：本人のチケット（マイチケット画面と同じ持ち主の条件）。
// 返さないもの：チケットのコード（入場用QRの値）・内部ID・購入時のメールアドレス
import { z } from "zod";
import { ticketOwnershipFilter } from "@/lib/ticket-ownership";
import type { DcMcpContext } from "../context";
import { jstDateTime, lines } from "../format";

export const MY_TICKETS = {
  name: "my_tickets",
  minRole: "user",
  title: "マイチケット",
  description: "この人が持っているチケット（入場券・バウチャー・ドリンクチケット）を、開催日が新しい順に返す。状態（有効・入場済み・キャンセル済みなど）と枚数を含む。",
  inputSchema: { limit: z.number().int().min(1).max(20).optional().describe("返す件数（既定10）") },
} as const;

const STATUS_LABEL: Record<string, string> = {
  valid: "有効",
  used: "入場済み（使用済み）",
  cancelled: "キャンセル済み",
  suspended: "利用停止中（カードの確認が必要）",
};

type Row = {
  status: string;
  quantity: number | null;
  checked_in_at: string | null;
  product: { name: string | null } | null;
  event: { title: string | null; venue: string | null; start_at: string | null } | null;
};

export async function myTickets(ctx: DcMcpContext, input: { limit?: number }): Promise<string> {
  const limit = input.limit ?? 10;
  const { data, count, error } = await ctx.admin
    .from("tickets")
    .select("status, quantity, checked_in_at, product:products(name), event:events(title, venue, start_at)", { count: "exact" })
    .or(ticketOwnershipFilter(ctx.userId, ctx.email))
    .order("event(start_at)", { ascending: false })
    .order("ticket_id", { ascending: true })
    .range(0, limit - 1);
  if (error) throw new Error("tickets");
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return "チケットはありません。";
  const body = rows.map((t, i) =>
    lines(`${i + 1}. ${t.event?.title ?? "（イベント不明）"}`, [
      ["開催", jstDateTime(t.event?.start_at)],
      ["会場", t.event?.venue],
      ["商品", t.product?.name],
      ["枚数", t.quantity ?? 1],
      ["状態", STATUS_LABEL[t.status] ?? t.status],
      ["入場・使用日時", t.checked_in_at ? jstDateTime(t.checked_in_at) : null],
    ]),
  );
  return [`チケット ${count ?? rows.length}件（新しい順に${rows.length}件）`, ...body].join("\n");
}
