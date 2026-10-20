// my_payout_history：本人の出金履歴（直近20件）と入金予定日（出金管理画面と同じ lib/payout-history.ts）。
// 返さないもの：振込ID・口座情報・内部ID
import { getPayoutHistory } from "@/lib/payout-history";
import { ARRIVAL_NOTE, formatArrivalDate } from "@/lib/payout-config";
import type { DcMcpContext } from "../context";
import { jstDateTime, lines, yen } from "../format";

export const MY_PAYOUT_HISTORY = {
  name: "my_payout_history",
  minRole: "artist",
  title: "出金履歴",
  description: "この人の出金申請の履歴（新しい順に最大20件）を返す。申請日時・申請額・振込手数料・振込額・状態・入金予定日（分かるもの）を含む。",
  inputSchema: {},
} as const;

export async function myPayoutHistory(ctx: DcMcpContext): Promise<string> {
  const { data: profile } = await ctx.admin.from("profiles").select("stripe_connect_id").eq("profile_id", ctx.userId).maybeSingle();
  const { history, arrivalDates } = await getPayoutHistory(ctx.admin, ctx.userId, profile?.stripe_connect_id ?? null, ctx.now);
  if (history.length === 0) return "出金の履歴はありません。";
  const body = history.map((h, i) =>
    lines(`${i + 1}. ${jstDateTime(h.created_at)} に申請`, [
      ["申請額", yen(h.requested_amount)],
      ["振込手数料", h.stripe_fee_deducted ? yen(h.stripe_fee_deducted) : "無料"],
      ["振込額", yen(h.net_payout_amount)],
      ["状態", h.status === "completed" ? "完了（振込手続き済み）" : "処理中"],
      ["入金予定日", arrivalDates.has(h.request_id) ? formatArrivalDate(arrivalDates.get(h.request_id)!) : null],
    ]),
  );
  return [`出金の履歴 ${history.length}件（新しい順）。${ARRIVAL_NOTE}`, ...body].join("\n");
}
