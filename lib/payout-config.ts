// 出金まわりの共通定数。route.ts / payout page / payout-form で重複していたハードコードを集約する。
export const HOLD_DAYS = 14;        // 出金可能になるまでの日数
export const FEE_WAIVER_DAYS = 120; // これを超えて経過した分はチャージバックリスクが極小化するため振込手数料を免除する
export const TRANSFER_FEE = 500;    // 振込手数料（無料枠の出金には適用しない）
export const FREE_POOL_MONTHLY_LIMIT = 1; // 無料枠の出金はカレンダー月あたりこの回数まで

// JSTのカレンダー月初（毎月1日 00:00 JST）に対応するUTC ISO文字列を返す。
// 無料枠の「月1回」判定はJSTの暦月で行うため、UTCのまま月初を計算すると
// 日本時間の月初〜9時間はズレる（例: 9/1 00:00 JST = 8/31 15:00 UTC）。
export function getJstMonthStartIso(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  return new Date(Date.UTC(year, month, 1) - 9 * 60 * 60 * 1000).toISOString();
}
