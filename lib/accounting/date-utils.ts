/**
 * JST（UTC+9）月次境界計算
 *
 * 設計原則:
 * - サーバーのTZ環境変数に一切依存しない（`new Date(isoWithOffset)` のみ使用）
 * - DB queryは [startUtc, endUtc) の半開区間 exclusive upper bound で扱う
 *   → 月末 23:59:59.999 をミリ秒の取りこぼしなく確実に「当月」に含める
 * - getTime() の整数演算のみ使用（Intl.DateTimeFormat のロケール依存を排除）
 */

/** JSTオフセット（ミリ秒） */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type MonthBounds = {
  /** 月初 00:00:00 JST をUTCで表現した Date（DB query: created_at >= startUtc） */
  startUtc: Date;
  /** 翌月初 00:00:00 JST をUTCで表現した Date（DB query: created_at < endUtc） */
  endUtc: Date;
  targetYear: number;
  targetMonth: number;
  /** 表示用ラベル例: "2026年5月度" */
  label: string;
};

/**
 * 指定年月の UTC 境界を返す。
 *
 * 例: getMonthBoundsUtc(2026, 5)
 *   startUtc = 2026-04-30T15:00:00.000Z  (= 2026-05-01T00:00:00+09:00)
 *   endUtc   = 2026-05-31T15:00:00.000Z  (= 2026-06-01T00:00:00+09:00)
 */
export function getMonthBoundsUtc(year: number, month: number): MonthBounds {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`月は 1〜12 で指定してください: ${month}`);
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new RangeError(`年が範囲外です: ${year}`);
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  // ISO 8601 タイムゾーン付きでパース → Date は常に UTC 内部表現
  const startUtc = new Date(`${year}-${pad(month)}-01T00:00:00+09:00`);

  const nextYear  = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endUtc    = new Date(`${nextYear}-${pad(nextMonth)}-01T00:00:00+09:00`);

  return { startUtc, endUtc, targetYear: year, targetMonth: month, label: `${year}年${month}月度` };
}

/**
 * 実行時刻（now）から「先月度」の境界を返す。
 *
 * Cronが JST 1日 11:00 に起動する場合: now は JST の当月内 → prev = 先月。
 * UTC 15:00 = JST 00:00 境界でも正しく動作する。
 */
export function getPreviousMonthBounds(now: Date = new Date()): MonthBounds {
  // サーバーTZに依存しないよう getTime() + JST_OFFSET_MS で JST の年月を算出
  const nowJstMs  = now.getTime() + JST_OFFSET_MS;
  const nowJstDate = new Date(nowJstMs);
  const jstYear  = nowJstDate.getUTCFullYear();
  const jstMonth = nowJstDate.getUTCMonth() + 1; // 1-12

  const prevYear  = jstMonth === 1 ? jstYear - 1 : jstYear;
  const prevMonth = jstMonth === 1 ? 12 : jstMonth - 1;

  return getMonthBoundsUtc(prevYear, prevMonth);
}

/**
 * 月末の最終瞬間（23:59:59.999 JST）を UTC Date として返す。
 * DB queryには使わず確認・表示用。DB queryは endUtc で十分。
 */
export function getMonthEndInstant(year: number, month: number): Date {
  const { endUtc } = getMonthBoundsUtc(year, month);
  return new Date(endUtc.getTime() - 1);
}

/**
 * 月末日の日付文字列を返す（YYYY/MM/DD、Yayoi CSV 取引日として使用）。
 */
export function getMonthLastDay(year: number, month: number): string {
  // 翌月初から 1ms 引いた JST 日付
  const lastInstantJst = new Date(getMonthEndInstant(year, month).getTime() + JST_OFFSET_MS);
  const y = lastInstantJst.getUTCFullYear();
  const m = String(lastInstantJst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(lastInstantJst.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}
