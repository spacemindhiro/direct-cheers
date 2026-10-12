/**
 * TC-PAYOUT-CONFIG: getJstMonthStartIso のユニットテスト
 *
 * 無料枠(120日超過分)の月次上限判定はJSTの暦月で行う。UTCのまま月初を
 * 計算すると日本時間の月初から最大9時間ズレる（例: 9/1 00:00 JSTはUTCでは
 * 8/31 15:00）ため、その境界を正確に跨ぐことを固定値で検証する。
 */
import { describe, it, expect } from "vitest";
import { getJstMonthStartIso, snapPayoutAmount, formatArrivalDate } from "@/lib/payout-config";

describe("TC-PAYOUT-CONFIG: getJstMonthStartIso", () => {
  it("JST日中の日時 → 同月1日 00:00 JST(UTC 前日15:00)を返す", () => {
    // 2026-09-15 12:00 JST = 2026-09-15 03:00 UTC
    const input = new Date("2026-09-15T03:00:00.000Z");
    expect(getJstMonthStartIso(input)).toBe("2026-08-31T15:00:00.000Z");
  });

  it("UTC上は月末日でもJSTでは翌月に入っている日時 → 翌月の月初を返す", () => {
    // 2026-08-31 23:00 UTC = 2026-09-01 08:00 JST（JSTでは既に9月）
    const input = new Date("2026-08-31T23:00:00.000Z");
    expect(getJstMonthStartIso(input)).toBe("2026-08-31T15:00:00.000Z");
  });

  it("JST月初ちょうど(00:00:00 JST) → 自分自身を月初として返す", () => {
    // 2026-09-01 00:00:00 JST = 2026-08-31 15:00:00 UTC
    const input = new Date("2026-08-31T15:00:00.000Z");
    expect(getJstMonthStartIso(input)).toBe("2026-08-31T15:00:00.000Z");
  });

  it("JST月初の1ミリ秒前 → 前月の月初を返す", () => {
    // 2026-08-31 23:59:59.999 JST = 2026-08-31 14:59:59.999 UTC
    const input = new Date("2026-08-31T14:59:59.999Z");
    expect(getJstMonthStartIso(input)).toBe("2026-07-31T15:00:00.000Z");
  });

  it("年またぎ(1月) → 前年12月ではなく当年1月の月初を返す", () => {
    // 2026-01-10 12:00 JST = 2026-01-10 03:00 UTC
    const input = new Date("2026-01-10T03:00:00.000Z");
    expect(getJstMonthStartIso(input)).toBe("2025-12-31T15:00:00.000Z");
  });
});

/**
 * TC-PAYOUT-SLIDER: 出金スライダーが「一番右＝全額」になること。
 *
 * 背景（2026-10-12 A-08 の収録中に発覚）: input[type=range] は min を基点に step 刻みで
 * 値を取るため、min=501 / step=100 / max=7743 では最大 7,701 までしか選べず、
 * スライダーを一度でも動かすと端数 42 円が出金できなくなっていた
 * （初期値は available なので、触らなければ全額申請できる＝触った人だけ損をする）。
 */
describe("TC-PAYOUT-SLIDER: snapPayoutAmount", () => {
  const STEP = 100;

  it("一番右（次の刻みが available を超える位置）では available ちょうどになる", () => {
    const available = 7743;
    // min=501 / step=100 で取りうる最大値
    const lastTick = 501 + Math.floor((available - 501) / STEP) * STEP;
    expect(lastTick).toBe(7701);
    expect(snapPayoutAmount(lastTick, available, STEP)).toBe(available);
    expect(snapPayoutAmount(lastTick, available, STEP)).toBe(7743);
  });

  it("途中の値はそのまま（勝手に増えない）", () => {
    const available = 7743;
    expect(snapPayoutAmount(501, available, STEP)).toBe(501);
    expect(snapPayoutAmount(3001, available, STEP)).toBe(3001);
    expect(snapPayoutAmount(7601, available, STEP)).toBe(7601);
  });

  it("available がちょうど刻みに乗る場合も、最大値は available のまま", () => {
    const available = 7701;
    expect(snapPayoutAmount(7701, available, STEP)).toBe(7701);
    expect(snapPayoutAmount(7601, available, STEP)).toBe(7601);
  });

  it("available が step より小さくても available を超えない", () => {
    const available = 550;
    expect(snapPayoutAmount(501, available, STEP)).toBe(550);
    expect(snapPayoutAmount(550, available, STEP)).toBe(550);
  });
});

/**
 * TC-PAYOUT-ARRIVAL: 着金予定日の表示。
 *
 * 出金申請は押した瞬間に stripe.payouts.create を叩くので、待ち時間は Stripe → 銀行の
 * 振込時間そのもの。Stripe が土日・銀行休業日を織り込んで返す payout.arrival_date を
 * そのまま出す。Stripe が返す値は「その日の 00:00 UTC」（実測: 1791936000 =
 * 2026-10-14T00:00:00Z、2026-10-12 19:43 JST 申請ぶんの着金予定日）なので、
 * サーバーのタイムゾーンで解釈すると日付がずれる。JST固定で組むことを境界値で固定する。
 */
describe("TC-PAYOUT-ARRIVAL: formatArrivalDate", () => {
  it("Stripe実測値（2026-10-14 00:00 UTC）→ 10月14日", () => {
    expect(formatArrivalDate(1791936000)).toBe("10月14日");
  });

  it("UTCの00:00を素のローカル時刻で見ると前日になりうる値でも、JSTの日付を返す", () => {
    // 2026-10-14 00:00 UTC = 2026-10-14 09:00 JST（UTC-5 のサーバーでは 10/13 19:00）
    expect(formatArrivalDate(Date.UTC(2026, 9, 14) / 1000)).toBe("10月14日");
  });

  it("月末の予定日 → 翌月1日に繰り上がらない", () => {
    expect(formatArrivalDate(Date.UTC(2026, 9, 31) / 1000)).toBe("10月31日");
  });

  it("年またぎ（1月1日）→ 12月31日にならない", () => {
    expect(formatArrivalDate(Date.UTC(2027, 0, 1) / 1000)).toBe("1月1日");
  });

  it("日付のゼロ埋めはしない（1月5日 と表示する）", () => {
    expect(formatArrivalDate(Date.UTC(2027, 0, 5) / 1000)).toBe("1月5日");
  });
});
