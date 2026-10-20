// my_income：本人の収支レポート（月次）。収支レポートAPIと同じ集計 lib/income-summary.ts。
// 区分と表示条件は画面（components/income-summary-client.tsx）と同じ：ダイレクト着金は全員、エージェント報酬は agent・admin、プラットフォーム純利は admin
import { z } from "zod";
import { getIncomeSummary } from "@/lib/income-summary";
import { roleRank } from "@/lib/role-rank";
import type { DcMcpContext } from "../context";
import { lines, yen } from "../format";

export const MY_INCOME = {
  name: "my_income",
  minRole: "artist",
  title: "収支レポート（月次）",
  description:
    "この人の月ごとの収入（着金日基準・確定申告用の収支レポートと同じ集計）を返す。year・month を省略すると前月。着金額・取消額・差し引き・未出金残高を含む。",
  inputSchema: {
    year: z.number().int().min(2026).max(2100).optional().describe("年（例 2026）"),
    month: z.number().int().min(1).max(12).optional().describe("月（1〜12）"),
  },
} as const;

export async function myIncome(ctx: DcMcpContext, input: { year?: number; month?: number }): Promise<string> {
  if ((input.year === undefined) !== (input.month === undefined)) return "year と month は両方指定するか、両方省略してください。";
  const { bounds, summary, error } = await getIncomeSummary(ctx.admin, ctx.userId, ctx.role, input.year, input.month);
  if (error || !summary) throw new Error("income");
  const parts = [
    lines(`${bounds.label}の収支（着金日基準。未出金の残高は収入に含まない）`, []),
    lines("ダイレクト着金（出演・主催の受取）", [
      ["着金", yen(summary.organizer_artist.gross)],
      ["取消", summary.organizer_artist.reversed ? yen(summary.organizer_artist.reversed) : null],
      ["差し引き", yen(summary.organizer_artist.net)],
      ["未出金のStripe残高（今時点）", yen(summary.organizer_artist.outstanding_balance)],
    ]),
  ];
  if (roleRank(ctx.role) >= roleRank("agent")) {
    parts.push(lines("エージェント報酬", [
      ["着金", yen(summary.agent.gross)],
      ["取消", summary.agent.reversed ? yen(summary.agent.reversed) : null],
      ["差し引き", yen(summary.agent.net)],
      ["未出金のStripe残高（今時点）", yen(summary.agent.outstanding_balance)],
    ]));
  }
  if (ctx.role === "admin") {
    parts.push(lines("プラットフォーム純利", [
      ["受取", yen(summary.platform.gross)],
      ["取消", summary.platform.reversed ? yen(summary.platform.reversed) : null],
      ["差し引き", yen(summary.platform.net)],
    ]));
  }
  parts.push(`合計（差し引き）: ${yen(summary.total_net)}`);
  return parts.join("\n");
}
