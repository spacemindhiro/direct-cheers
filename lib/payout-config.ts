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

/**
 * 出金額スライダーの値を、実際に申請できる額へ寄せる。
 *
 * HTML の input[type=range] は min を基点に step 刻みで値を取るため、
 * 刻みがちょうど max に乗らないと「一番右まで動かしても全額にならない」。
 * 配分額は端数を含む（例 7,743円）ので、min=501 / step=100 だと最大 7,701 までしか
 * 選べず、42円が出金できないまま残っていた。
 * 一番右（＝次の刻みが available を超える位置）まで動かしたら available ちょうどにする。
 */
export function snapPayoutAmount(value: number, available: number, step: number): number {
  if (value + step > available) return available;
  return value;
}

/**
 * 申請から銀行に着金するまでの目安。
 *
 * 出金申請は押した瞬間に Stripe の payout（Connectアカウント → 銀行口座）を作るので、
 * 待ち時間は丸ごと Stripe → 銀行の振込時間。Stripe の手動入金は「通常1〜4営業日」で、
 * 同日入金が使えるのは米国・英国・ユーロ圏のみ（日本は対象外）。
 * 1件ごとの正確な予定日は payout.arrival_date に入るので、取れたときはそちらを優先して出す。
 */
export const ARRIVAL_NOTE = "銀行への着金まで1〜4営業日（土日祝を除く）";

/**
 * payout.arrival_date（UNIX秒）を「10月14日」の形にする。
 *
 * Stripe が返すのは日付だけの意味を持つタイムスタンプ（その日の 00:00 UTC）なので、
 * サーバーのタイムゾーンで解釈すると日付がずれる（JSTで見ると9時間進んで同日、
 * 米国のサーバーで見ると前日になる）。JST固定で組み立てる。
 * arrival_date は Stripe 側で土日・銀行休業日を織り込んだ値。
 */
export function formatArrivalDate(arrivalDateUnixSec: number): string {
  const jst = new Date(arrivalDateUnixSec * 1000 + 9 * 60 * 60 * 1000);
  return `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
}
