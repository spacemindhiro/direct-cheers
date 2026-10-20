// my_payout_balance：本人の出金残高（出金管理画面と同じ計算 lib/payout-balance.ts）。
// 返さないもの：口座情報・決済ID・内部ID
import { computePayoutBalances, isFreePayoutUsedThisMonth } from "@/lib/payout-balance";
import { HOLD_DAYS, TRANSFER_FEE, FREE_POOL_MONTHLY_LIMIT } from "@/lib/payout-config";
import type { DcMcpContext } from "../context";
import { LIFECYCLE_LABEL, jstDateTime, lines, yen } from "../format";

export const MY_PAYOUT_BALANCE = {
  name: "my_payout_balance",
  minRole: "artist",
  title: "出金残高",
  description:
    "この人の出金残高（出金可能・振込手数料無料で出金可能・保留中・凍結中）と、イベント別の内訳、保留中の分が出金できるようになる見込みの日を返す。出金管理画面と同じ計算。",
  inputSchema: {},
} as const;

export async function myPayoutBalance(ctx: DcMcpContext): Promise<string> {
  const now = ctx.now ?? new Date();
  const [b, freeUsed, { data: profile }] = await Promise.all([
    computePayoutBalances(ctx.admin, ctx.userId, now),
    isFreePayoutUsedThisMonth(ctx.admin, ctx.userId, now),
    ctx.admin.from("profiles").select("balance_frozen, stripe_connect_id").eq("profile_id", ctx.userId).maybeSingle(),
  ]);

  const head = lines("出金残高（出金管理画面と同じ計算）", [
    ["出金可能", `${yen(b.available)}（出金のたびに振込手数料${yen(TRANSFER_FEE)}）`],
    ["振込手数料無料で出金可能", `${yen(b.freeAvailable)}（月${FREE_POOL_MONTHLY_LIMIT}回まで。今月は${freeUsed ? "使用済み" : "未使用"}）`],
    ["保留中", yen(b.pending)],
    ["凍結中（チャージバック対応中）", yen(b.frozen)],
    ["出金の停止", profile?.balance_frozen ? "口座が凍結されているため、今は出金できません" : null],
    ["口座登録", profile?.stripe_connect_id ? null : "受取口座が未登録です（出金には口座登録と審査完了が必要）"],
  ]);

  const rows = b.eventRows.map((r, i) => {
    let release: string | null = null;
    if (r.pending > 0) {
      const settled = r.lifecycle_status === "settled" && r.reconciled_at !== null;
      const date = r.latestTxDate ? new Date(new Date(r.latestTxDate).getTime() + HOLD_DAYS * 24 * 60 * 60 * 1000) : null;
      if (!settled) release = "イベントの精算・照合が済んでから（済んだあと、決済から" + HOLD_DAYS + "日たった分から出金可能）";
      else if (date && date > now) release = `${jstDateTime(date.toISOString())} 以降`;
      else release = "まもなく（反映待ち）";
    }
    return lines(`${i + 1}. ${r.title}`, [
      ["イベントの状態", LIFECYCLE_LABEL[r.lifecycle_status] ?? r.lifecycle_status],
      ["照合", r.reconciled_at ? "照合済み" : "照合待ち"],
      ["出金可能", r.available > 0 ? yen(r.available) : null],
      ["無料で出金可能", r.freeAvailable > 0 ? yen(r.freeAvailable) : null],
      ["保留中", r.pending > 0 ? yen(r.pending) : null],
      ["凍結中", r.frozen > 0 ? yen(r.frozen) : null],
      ["保留中の分が出金できる見込み", release],
    ]);
  });
  return rows.length > 0 ? [head, "イベント別の内訳", ...rows].join("\n") : head;
}
