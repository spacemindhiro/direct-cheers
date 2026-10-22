/**
 * TC-CLOSE-UNIT: 締め時刻（終了3時間後）の判定 lib/purchase-window.ts
 *
 * 証跡の提出・自動照合・証跡提出の依頼通知・タッチ決済の自動キャプチャ・当日決済の受付終了が、
 * すべて同じ境界で切り替わることを固定する（2026-10-22 終了ボタン廃止・時間差の解消）。
 */
import { describe, it, expect } from "vitest";
import {
  POST_EVENT_GRACE_MS,
  eventCloseAt,
  isEventClosed,
  evaluatePurchaseWindow,
} from "@/lib/purchase-window";

const endAt = "2026-10-18T13:00:00.000Z"; // 22:00 JST
const closeAtMs = new Date(endAt).getTime() + POST_EVENT_GRACE_MS;
const product = { type: "entrance", payment_type: "C" };

describe("TC-CLOSE-UNIT: 締め時刻", () => {
  it("TC-CLOSE-UNIT-01: 締め時刻は終了の3時間後", () => {
    expect(eventCloseAt(endAt).toISOString()).toBe("2026-10-18T16:00:00.000Z");
  });

  it.each([
    ["終了時刻ちょうど", new Date(endAt).getTime(), false],
    ["締め時刻の1ミリ秒前", closeAtMs - 1, false],
    ["締め時刻ちょうど（まだ受付中）", closeAtMs, false],
    ["締め時刻の1ミリ秒後", closeAtMs + 1, true],
  ])("TC-CLOSE-UNIT-02: %s → closed=%s", (_label, nowMs, expected) => {
    expect(isEventClosed(endAt, new Date(nowMs))).toBe(expected);
  });

  it("TC-CLOSE-UNIT-03: 終了日時が無ければ締めていない扱い", () => {
    expect(isEventClosed(null)).toBe(false);
    expect(isEventClosed(undefined)).toBe(false);
  });

  // 当日決済の受付終了と、締め時刻の判定が同じ瞬間に切り替わる（時間差が無い）
  it.each([closeAtMs - 1, closeAtMs, closeAtMs + 1])("TC-CLOSE-UNIT-04: now=%s で決済の可否と締めの判定が逆になる", (nowMs) => {
    const now = new Date(nowMs);
    const verdict = evaluatePurchaseWindow({
      lifecycleStatus: "published",
      eventStartAt: "2026-10-18T05:00:00.000Z",
      eventEndAt: endAt,
      product,
      now,
    });
    expect(verdict.ok).toBe(!isEventClosed(endAt, now));
  });
});
