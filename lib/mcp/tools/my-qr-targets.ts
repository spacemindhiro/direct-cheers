// my_qr_targets：本人が配分先に入っているQRと、その中での本人の比率。
//   - QR詳細画面と同じく、イベントの関係者（lib/event-access.ts の canView）か、そのQRの宛先の本人に見えるものだけ
//     （辞退した出演者・依頼予定・代理作成で未送信の下書きは出さない）
//   - 比率は画面の「✦ 配分設定」と同じく「あなた」と「その他（合計）」だけ。他の人の名前と個別の比率は出さない
// 返さないもの：他の配分先の名前と比率・内部ID・売上
import { z } from "zod";
import { getEventAccess } from "@/lib/event-access";
import type { DcMcpContext } from "../context";
import { LIFECYCLE_LABEL, jstDateTime, lines } from "../format";

export const MY_QR_TARGETS = {
  name: "my_qr_targets",
  minRole: "artist",
  title: "自分が配分先のQR",
  description:
    "この人が配分先（チアの受け取り先）に入っているQRを、イベントの新しい順に返す。イベント名・状態・開催日時・QRの種類と名前・宛先が自分か・自分の比率と他の配分先の合計比率。",
  inputSchema: {
    limit: z.number().int().min(1).max(20).optional().describe("返す件数（既定10）"),
  },
} as const;

const TYPE_LABEL: Record<string, string> = { standard: "スタンダード", message: "メッセージ", entrance: "エントランス", custom: "カスタム" };
const pct = (r: number) => `${Math.round(r * 100)}%`;

type QrRow = {
  qr_config_id: string;
  event_id: string;
  label: string | null;
  recipient_profile_id: string | null;
  product: { type: string; name: string | null } | null;
  event: { title: string; start_at: string | null; lifecycle_status: string; deleted_at: string | null } | null;
};

export async function myQrTargets(ctx: DcMcpContext, input: { limit?: number }): Promise<string> {
  const limit = input.limit ?? 10;
  const { data: mine, error } = await ctx.admin
    .from("qr_config_targets")
    .select("qr_config_id, distribution_ratio")
    .eq("profile_id", ctx.userId)
    .is("deleted_at", null);
  if (error) throw new Error("targets");
  if (!mine?.length) return "配分先に入っているQRはありません。";

  const myRatio = new Map(mine.map((t) => [t.qr_config_id as string, Number(t.distribution_ratio)]));
  const { data: qrRows } = await ctx.admin
    .from("qr_configs")
    .select("qr_config_id, event_id, label, recipient_profile_id, product:products!product_id(type, name), event:events!event_id(title, start_at, lifecycle_status, deleted_at)")
    .in("qr_config_id", [...myRatio.keys()])
    .is("deleted_at", null);
  const qrs = ((qrRows ?? []) as unknown as QrRow[]).filter((q) => q.event && !q.event.deleted_at);

  // QR詳細画面と同じ判定（イベントごとに1回）
  const canView = new Map<string, boolean>();
  for (const eventId of new Set(qrs.map((q) => q.event_id))) {
    const access = await getEventAccess(ctx.admin as never, eventId, ctx.userId, ctx.role);
    canView.set(eventId, !!access?.canView);
  }
  const visible = qrs
    .filter((q) => canView.get(q.event_id) || q.recipient_profile_id === ctx.userId)
    .sort((a, b) => (b.event!.start_at ?? "").localeCompare(a.event!.start_at ?? "") || a.qr_config_id.localeCompare(b.qr_config_id));
  if (visible.length === 0) return "配分先に入っているQRはありません。";

  const shown = visible.slice(0, limit);
  const { data: all } = await ctx.admin
    .from("qr_config_targets")
    .select("qr_config_id, profile_id, distribution_ratio")
    .in("qr_config_id", shown.map((q) => q.qr_config_id))
    .is("deleted_at", null);
  const others = new Map<string, number>();
  for (const t of all ?? []) {
    if (t.profile_id === ctx.userId) continue;
    others.set(t.qr_config_id, (others.get(t.qr_config_id) ?? 0) + Number(t.distribution_ratio));
  }

  const body = shown.map((q, i) => {
    const e = q.event!;
    const name = q.product?.name || q.label;
    return lines(`${i + 1}. ${e.title}`, [
      ["イベントの状態", LIFECYCLE_LABEL[e.lifecycle_status] ?? e.lifecycle_status],
      ["開催", jstDateTime(e.start_at)],
      ["QR", `${TYPE_LABEL[q.product?.type ?? ""] ?? "QR"}${name ? `「${name}」` : ""}`],
      ["宛先", q.recipient_profile_id === ctx.userId ? "あなた" : "あなた以外"],
      ["あなたの比率", pct(myRatio.get(q.qr_config_id) ?? 0)],
      ["その他の配分先（合計）", (others.get(q.qr_config_id) ?? 0) > 0 ? pct(others.get(q.qr_config_id)!) : null],
    ]);
  });
  return [`配分先に入っているQR ${visible.length}件（${shown.length}件を表示）`, ...body].join("\n");
}
