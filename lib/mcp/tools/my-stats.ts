// my_stats：統計タブと同じ累計（送ったチア・受け取りチア・受取配分）。集計は lib/profile-stats.ts を画面と共用。
// 運営（admin）は統計タブを開けない（画面がダッシュボードへ戻す）ので、ツールも登録しない。
// 返さないもの：個々の決済・相手の名前（件数と合計だけ）
import type { DcMcpContext } from "../context";
import { computeProfileStats } from "@/lib/profile-stats";
import { lines, yen } from "../format";

export const MY_STATS = {
  name: "my_stats",
  minRole: "user",
  title: "統計（累計）",
  description:
    "統計タブと同じ累計を返す。送ったチアの件数と合計、アーティストとして受け取ったチアの件数・総流通額・手数料控除後の受取額（概算）、オーガナイザー・エージェントの受取配分の件数と合計。月ごとの内訳は my_income、出金できる額は my_payout_balance を使う。",
  inputSchema: {},
} as const;

export const STATS_HIDDEN_ROLES = ["admin"];

export async function myStats(ctx: DcMcpContext): Promise<string> {
  const s = await computeProfileStats(ctx.admin, ctx.supabase, { userId: ctx.userId, email: ctx.email, role: ctx.role });
  const out = [lines("送ったチア（累計）", [["件数", `${s.sent.count}件`], ["合計金額", yen(s.sent.amount)]])];
  if (s.artist) {
    out.push(lines("受け取りチア（累計・アーティストとして）", [
      ["チア件数", `${s.artist.count}件`],
      ["総流通額", yen(s.artist.gross)],
      ["手数料控除後の受取額（概算）", yen(s.artist.netEstimate)],
    ]));
  }
  if (s.received && ["organizer", "agent"].includes(ctx.role)) {
    out.push(lines("受取配分（累計）", [["配分件数", `${s.received.count}件`], ["受取総額", yen(s.received.amount)]]));
  }
  out.push("※ 金額はシステム計上ベースの参考値。税務申告等には正式な精算レポートを使う（統計タブと同じ注記）。");
  return out.join("\n");
}
