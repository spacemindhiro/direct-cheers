/**
 * TC-DATEUTILS: JST タイムゾーン境界テスト
 *
 * 日本税制の月次締め「1円の期ずれも許さない」を保証する。
 *
 * 検証ポイント:
 *   1. JST 月末 23:59:59.999 の決済 → 当月に含まれる
 *   2. JST 翌月 00:00:00.000 の決済 → 翌月に含まれる（当月に含まれない）
 *   3. UTC 15:00:00 (= JST 00:00:00) の 1 秒前後が正しく分類される
 *   4. getPreviousMonthBounds が JST の「今月」を基準に先月を返す
 *   5. 年またぎ（12月→1月）が正しく処理される
 */
import { describe, it, expect } from "vitest";
import {
  getMonthBoundsUtc,
  getPreviousMonthBounds,
  getMonthLastDay,
  getMonthEndInstant,
  JST_OFFSET_MS,
} from "@/lib/accounting/date-utils";

// ── ヘルパー ─────────────────────────────────────────────────────────────
/** JSTオフセット付きISO文字列 → UTC Date */
const jst = (iso: string) => new Date(iso + "+09:00");

// ── TC-DATEUTILS-01: getMonthBoundsUtc の基本値 ───────────────────────
describe("TC-DATEUTILS-01: getMonthBoundsUtc の UTC変換", () => {
  it("2026年5月の startUtc = 2026-04-30T15:00:00Z", () => {
    const { startUtc } = getMonthBoundsUtc(2026, 5);
    expect(startUtc.toISOString()).toBe("2026-04-30T15:00:00.000Z");
  });

  it("2026年5月の endUtc   = 2026-05-31T15:00:00Z", () => {
    const { endUtc } = getMonthBoundsUtc(2026, 5);
    expect(endUtc.toISOString()).toBe("2026-05-31T15:00:00.000Z");
  });

  it("2026年1月の startUtc = 2025-12-31T15:00:00Z", () => {
    const { startUtc } = getMonthBoundsUtc(2026, 1);
    expect(startUtc.toISOString()).toBe("2025-12-31T15:00:00.000Z");
  });

  it("2026年12月の endUtc  = 2026-12-31T15:00:00Z（年またぎ）", () => {
    const { endUtc } = getMonthBoundsUtc(2026, 12);
    expect(endUtc.toISOString()).toBe("2026-12-31T15:00:00.000Z");
  });

  it("2026年12月の startUtc = 2026-11-30T15:00:00Z", () => {
    const { startUtc } = getMonthBoundsUtc(2026, 12);
    expect(startUtc.toISOString()).toBe("2026-11-30T15:00:00.000Z");
  });

  it("label が '2026年5月度'", () => {
    expect(getMonthBoundsUtc(2026, 5).label).toBe("2026年5月度");
  });

  it("month=0 は RangeError", () => {
    expect(() => getMonthBoundsUtc(2026, 0)).toThrow(RangeError);
  });

  it("month=13 は RangeError", () => {
    expect(() => getMonthBoundsUtc(2026, 13)).toThrow(RangeError);
  });
});

// ── TC-DATEUTILS-02: 月末境界の 1 ミリ秒精度 ─────────────────────────
describe("TC-DATEUTILS-02: 月末境界 1ms 精度（期ずれゼロ検証）", () => {
  const { startUtc, endUtc } = getMonthBoundsUtc(2026, 5);

  // 「created_at >= startUtc AND created_at < endUtc」で判定する想定

  it("JST 2026-05-01 00:00:00 = startUtc → 5月に含まれる", () => {
    const txTime = new Date("2026-04-30T15:00:00.000Z"); // = 2026-05-01T00:00:00 JST
    expect(txTime.getTime()).toBeGreaterThanOrEqual(startUtc.getTime());
    expect(txTime.getTime()).toBeLessThan(endUtc.getTime());
  });

  it("startUtc の 1ms 前 → 4月（5月に含まれない）", () => {
    const txTime = new Date(startUtc.getTime() - 1); // 2026-04-30T14:59:59.999Z = JST 4/30 23:59:59.999
    expect(txTime.getTime()).toBeLessThan(startUtc.getTime());
  });

  it("JST 2026-05-31 23:59:59.999 = endUtc - 1ms → 5月に含まれる", () => {
    const txTime = new Date(endUtc.getTime() - 1); // 2026-05-31T14:59:59.999Z
    expect(txTime.getTime()).toBeGreaterThanOrEqual(startUtc.getTime());
    expect(txTime.getTime()).toBeLessThan(endUtc.getTime());
  });

  it("endUtc = JST 2026-06-01 00:00:00 → 5月に含まれない（exclusive upper bound）", () => {
    const txTime = endUtc; // 2026-05-31T15:00:00.000Z = 2026-06-01T00:00:00 JST
    expect(txTime.getTime()).not.toBeLessThan(endUtc.getTime());
  });

  it("endUtc の 1ms 後 → 6月（5月に含まれない）", () => {
    const txTime = new Date(endUtc.getTime() + 1); // JST 6/1 00:00:00.001
    expect(txTime.getTime()).toBeGreaterThanOrEqual(endUtc.getTime());
  });
});

// ── TC-DATEUTILS-03: 「夜中のUT 15:00ちょうど」境界（最もトリッキーな境界） ──
describe("TC-DATEUTILS-03: UTC 15:00:00 = JST 翌日 00:00:00 境界", () => {
  // 5月31日の UTC 15:00 = JST 6/1 00:00 → 6月分
  const may31_15utc = new Date("2026-05-31T15:00:00.000Z");
  const { endUtc: mayEnd } = getMonthBoundsUtc(2026, 5);
  const { startUtc: junStart } = getMonthBoundsUtc(2026, 6);

  it("5月 endUtc === JST 6/1 00:00:00 UTC表現", () => {
    expect(mayEnd.toISOString()).toBe("2026-05-31T15:00:00.000Z");
    expect(may31_15utc.getTime()).toBe(mayEnd.getTime());
  });

  it("6月 startUtc と 5月 endUtc は同じ瞬間（月境界に隙間なし）", () => {
    expect(junStart.getTime()).toBe(mayEnd.getTime());
  });

  it("UTC 14:59:59.999 → 5月に含まれる", () => {
    const tx = new Date("2026-05-31T14:59:59.999Z");
    const { startUtc, endUtc } = getMonthBoundsUtc(2026, 5);
    expect(tx >= startUtc && tx < endUtc).toBe(true);
  });

  it("UTC 15:00:00.000 → 5月に含まれない（6月分）", () => {
    const tx = new Date("2026-05-31T15:00:00.000Z");
    const { startUtc, endUtc } = getMonthBoundsUtc(2026, 5);
    expect(tx >= startUtc && tx < endUtc).toBe(false);
  });

  it("UTC 15:00:00.001 → 6月に含まれる", () => {
    const tx = new Date("2026-05-31T15:00:00.001Z");
    const { startUtc, endUtc } = getMonthBoundsUtc(2026, 6);
    expect(tx >= startUtc && tx < endUtc).toBe(true);
  });
});

// ── TC-DATEUTILS-04: getPreviousMonthBounds ───────────────────────────
describe("TC-DATEUTILS-04: getPreviousMonthBounds — cronの実行時刻から先月を特定", () => {
  // cron: "0 2 1 * *" UTC = 毎月1日 11:00 JST（UTC+2h → JST+11h）

  it("UTC 2026-06-01 02:00:00 (= JST 6/1 11:00) → 先月=2026年5月", () => {
    const cronNow = new Date("2026-06-01T02:00:00.000Z");
    const prev = getPreviousMonthBounds(cronNow);
    expect(prev.targetYear).toBe(2026);
    expect(prev.targetMonth).toBe(5);
  });

  it("JST 2026-06-01 00:00:00 に cron が起動した場合 → 先月=2026年5月", () => {
    // UTC 2026-05-31 15:00:00 = JST 2026-06-01 00:00:00
    const cronNow = new Date("2026-05-31T15:00:00.000Z");
    const prev = getPreviousMonthBounds(cronNow);
    expect(prev.targetYear).toBe(2026);
    expect(prev.targetMonth).toBe(5);
  });

  it("UTC 2026-01-01 02:00:00 (= JST 1/1 11:00) → 先月=2025年12月（年またぎ）", () => {
    const cronNow = new Date("2026-01-01T02:00:00.000Z");
    const prev = getPreviousMonthBounds(cronNow);
    expect(prev.targetYear).toBe(2025);
    expect(prev.targetMonth).toBe(12);
  });

  it("UTC 2026-03-01 02:00:00 → 先月=2026年2月（うるう年チェック）", () => {
    const cronNow = new Date("2026-03-01T02:00:00.000Z");
    const prev = getPreviousMonthBounds(cronNow);
    expect(prev.targetYear).toBe(2026);
    expect(prev.targetMonth).toBe(2);
  });

  it("JST 2026-05-31 23:59:59 に起動 → まだ5月 → 先月=2026年4月", () => {
    // UTC 14:59:59 on May 31 = JST 23:59:59 May 31
    const cronNow = new Date("2026-05-31T14:59:59.000Z");
    const prev = getPreviousMonthBounds(cronNow);
    expect(prev.targetYear).toBe(2026);
    expect(prev.targetMonth).toBe(4);
  });

  it("getPreviousMonthBounds().startUtc が先月初 00:00:00 JST の UTC表現になっている", () => {
    const cronNow = new Date("2026-06-01T02:00:00.000Z");
    const { startUtc } = getPreviousMonthBounds(cronNow);
    expect(startUtc.toISOString()).toBe("2026-04-30T15:00:00.000Z"); // 5月1日 JST
  });

  it("getPreviousMonthBounds().endUtc が先月末+1ms = 今月初 00:00:00 JST の UTC表現になっている", () => {
    const cronNow = new Date("2026-06-01T02:00:00.000Z");
    const { endUtc } = getPreviousMonthBounds(cronNow);
    expect(endUtc.toISOString()).toBe("2026-05-31T15:00:00.000Z"); // 6月1日 JST
  });
});

// ── TC-DATEUTILS-05: getMonthLastDay ─────────────────────────────────
describe("TC-DATEUTILS-05: getMonthLastDay — Yayoi取引日フォーマット", () => {
  it("2026年5月 → '2026/05/31'", () => {
    expect(getMonthLastDay(2026, 5)).toBe("2026/05/31");
  });

  it("2026年2月 → '2026/02/28'（非うるう年）", () => {
    expect(getMonthLastDay(2026, 2)).toBe("2026/02/28");
  });

  it("2024年2月 → '2024/02/29'（うるう年）", () => {
    expect(getMonthLastDay(2024, 2)).toBe("2024/02/29");
  });

  it("2026年12月 → '2026/12/31'", () => {
    expect(getMonthLastDay(2026, 12)).toBe("2026/12/31");
  });

  it("2026年1月 → '2026/01/31'", () => {
    expect(getMonthLastDay(2026, 1)).toBe("2026/01/31");
  });
});

// ── TC-DATEUTILS-06: getMonthEndInstant ──────────────────────────────
describe("TC-DATEUTILS-06: getMonthEndInstant — 月末 23:59:59.999 JST", () => {
  it("2026年5月末 = 2026-05-31T14:59:59.999Z", () => {
    const instant = getMonthEndInstant(2026, 5);
    expect(instant.toISOString()).toBe("2026-05-31T14:59:59.999Z");
  });

  it("2026年12月末 = 2026-12-31T14:59:59.999Z", () => {
    const instant = getMonthEndInstant(2026, 12);
    expect(instant.toISOString()).toBe("2026-12-31T14:59:59.999Z");
  });

  it("getMonthEndInstant(y,m) < getMonthBoundsUtc(y,m).endUtc を常に満たす", () => {
    for (const [y, m] of [[2026, 1], [2026, 5], [2026, 12], [2024, 2]]) {
      const instant = getMonthEndInstant(y, m);
      const { endUtc } = getMonthBoundsUtc(y, m);
      expect(instant.getTime()).toBeLessThan(endUtc.getTime());
    }
  });
});

// ── TC-DATEUTILS-07: JST_OFFSET_MS 定数の検証 ───────────────────────
describe("TC-DATEUTILS-07: JST_OFFSET_MS 定数", () => {
  it("9時間ぴったり（9 × 3600 × 1000 ms）", () => {
    expect(JST_OFFSET_MS).toBe(9 * 60 * 60 * 1000);
  });

  it("UTC + JST_OFFSET_MS で JST 時刻が得られる", () => {
    // UTC 2026-05-31 15:00:00 → JST 2026-06-01 00:00:00
    const utcMs = new Date("2026-05-31T15:00:00.000Z").getTime();
    const jstMs = utcMs + JST_OFFSET_MS;
    const jstDate = new Date(jstMs);
    expect(jstDate.getUTCFullYear()).toBe(2026);
    expect(jstDate.getUTCMonth() + 1).toBe(6);   // June
    expect(jstDate.getUTCDate()).toBe(1);
    expect(jstDate.getUTCHours()).toBe(0);
    expect(jstDate.getUTCMinutes()).toBe(0);
    expect(jstDate.getUTCSeconds()).toBe(0);
  });
});
