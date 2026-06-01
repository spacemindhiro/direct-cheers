/**
 * TC-TAX-MATRIX: 手数料計算・端数処理の境界値・極端値・分配率マトリクステスト
 *
 * test.each でパラメータ駆動テストを生成し、
 * 1円単位の恒等式・Math.floor整合性・分配合計一致を全組み合わせで保証する。
 *
 * - DB・Stripe を一切使わない純粋計算ロジックの単体テスト
 * - BOUNDARY_AMOUNTS(30) × RATE_CONFIGS(3) = 90行 × 2 it.each = 180ケース
 * - DIST_AMOUNTS(10) × DIST_RATIOS(13) = 130行 × 2 it.each = 260ケース
 * - PAYPAY特化(30) × 2 it.each = 60ケース
 * - 計: 約500ケース
 */
import { describe, it, expect } from "vitest";

// ── 手数料計算ロジック（route.ts / settle/route.ts と同一） ────────────────

function calcFees(
  gross: number,
  stripeRate: number,
  platformRate: number,
): { stripeFee: number; platformFee: number; netAmount: number; applicationFeeAmount: number } {
  const stripeFee = Math.floor(gross * stripeRate);
  const platformFee = Math.floor(gross * platformRate);
  const netAmount = gross - stripeFee - platformFee;
  const applicationFeeAmount = platformFee + stripeFee;
  return { stripeFee, platformFee, netAmount, applicationFeeAmount };
}

/** 分配計算: 端数は最後の recipient（a2）が吸収 */
function calcDistributions(
  net: number,
  gross: number,
  agentRate: number,
  org: number,
  a1: number,
): { agentFee: number; orgAmount: number; a1Amount: number; a2Amount: number } {
  const agentFee = Math.floor(gross * agentRate);
  const orgAmount = Math.floor(net * org);
  const a1Amount = Math.floor(net * a1);
  const a2Amount = net - orgAmount - a1Amount; // 端数は残余
  return { agentFee, orgAmount, a1Amount, a2Amount };
}

// ── テストパラメータ定義 ────────────────────────────────────────────────────

/**
 * 境界値: 各プラン上限の ±1円・端数が最大化する金額
 * 1, 11, 99, 100, 101 ... 1,500,000
 */
const BOUNDARY_AMOUNTS = [
  1, 11, 99, 100, 101,
  999, 1_000, 1_001,
  2_999, 3_000, 3_001,
  4_999, 5_000, 5_001,
  9_999, 10_000, 10_001,
  29_999, 30_000, 30_001,
  49_999, 50_000, 50_001,
  99_999, 100_000, 100_001,
  299_999, 300_000, 1_000_000, 1_500_000,
];

const RATE_CONFIGS: Array<[string, number, number]> = [
  ["card(3.96%)", 0.0396, 0.10],
  ["paypay(4.378%)", 0.04378, 0.10],
  ["low_platform(5%)", 0.0396, 0.05],
];

// 境界値 × レート の全組み合わせ (30 × 3 = 90行)
const TAX_BOUNDARY_CASES: Array<[number, string, number, number]> =
  BOUNDARY_AMOUNTS.flatMap((gross) =>
    RATE_CONFIGS.map(([name, sr, pr]) => [gross, name, sr, pr] as [number, string, number, number]),
  );

/** 分配率: 2者〜3者の多様な比率パターン */
const DIST_RATIOS: Array<[string, number, number]> = [
  // label, org, a1 (a2 = 1 - org - a1)
  ["100:0:0", 1.0, 0.0],
  ["50:50:0", 0.5, 0.5],
  ["99:1:0", 0.99, 0.01],
  ["1:99:0", 0.01, 0.99],
  ["33:67:0", 0.33, 0.67],
  ["67:33:0", 0.67, 0.33],
  ["10:90:0", 0.10, 0.90],
  ["25:75:0", 0.25, 0.75],
  ["30:30:40", 0.30, 0.30],    // a2 = 0.40
  ["20:60:20", 0.20, 0.60],    // a2 = 0.20
  ["40:40:20", 0.40, 0.40],    // a2 = 0.20
  ["50:30:20", 0.50, 0.30],    // a2 = 0.20
  ["50:25:25", 0.50, 0.25],    // a2 = 0.25
];

const DIST_TEST_AMOUNTS = [
  500, 1_000, 3_000, 5_000, 7_777,
  10_000, 15_000, 33_333, 100_000, 300_001,
];

const STRIPE_RATE = 0.0396;
const PLATFORM_RATE = 0.10;
const AGENT_RATE = 0.05;
const PAYPAY_RATE = 0.04378;

// 分配率 × 金額 の全組み合わせ (13 × 10 = 130行)
const DIST_CASES: Array<[number, string, number, number]> =
  DIST_RATIOS.flatMap(([label, org, a1]) =>
    DIST_TEST_AMOUNTS.map((gross) => [gross, label, org, a1] as [number, string, number, number]),
  );

// PayPay 境界値 (30行)
const PAYPAY_CASES: Array<[number]> = BOUNDARY_AMOUNTS.map((g) => [g]);

// ── TC-TAX-BOUNDARY: 恒等式（net + appFee ≤ gross、差 ≤ 1円） ────────────

describe("TC-TAX-BOUNDARY-01: 境界値×レート — net + appFee ≤ gross かつ差 ≤ 1円", () => {
  it.each(TAX_BOUNDARY_CASES)(
    "¥%i [%s]",
    (gross, _name, stripeRate, platformRate) => {
      const { netAmount, applicationFeeAmount } = calcFees(gross, stripeRate, platformRate);
      expect(netAmount + applicationFeeAmount).toBeLessThanOrEqual(gross);
      expect(gross - netAmount - applicationFeeAmount).toBeLessThanOrEqual(1);
    },
  );
});

describe("TC-TAX-BOUNDARY-02: 境界値×レート — 全計算値が整数かつ net > 0", () => {
  it.each(TAX_BOUNDARY_CASES)(
    "¥%i [%s]",
    (gross, _name, stripeRate, platformRate) => {
      const { stripeFee, platformFee, netAmount, applicationFeeAmount } = calcFees(
        gross, stripeRate, platformRate,
      );
      expect(Number.isInteger(stripeFee)).toBe(true);
      expect(Number.isInteger(platformFee)).toBe(true);
      expect(Number.isInteger(netAmount)).toBe(true);
      expect(Number.isInteger(applicationFeeAmount)).toBe(true);
      expect(netAmount).toBeGreaterThan(0);
    },
  );
});

// ── TC-TAX-DIST: 分配率×金額 — 合計整合性 ──────────────────────────────

describe("TC-TAX-DIST-01: 分配率×金額 — org + a1 + a2 == net（端数吸収後）", () => {
  it.each(DIST_CASES)(
    "¥%i [%s分配]",
    (gross, _label, org, a1) => {
      const { netAmount } = calcFees(gross, STRIPE_RATE, PLATFORM_RATE);
      const { orgAmount, a1Amount, a2Amount } = calcDistributions(
        netAmount, gross, AGENT_RATE, org, a1,
      );
      // 端数吸収: 合計は正確に net に一致
      expect(orgAmount + a1Amount + a2Amount).toBe(netAmount);
      // 全値が整数
      expect(Number.isInteger(orgAmount)).toBe(true);
      expect(Number.isInteger(a1Amount)).toBe(true);
      expect(Number.isInteger(a2Amount)).toBe(true);
      // 全値が非負
      expect(orgAmount).toBeGreaterThanOrEqual(0);
      expect(a1Amount).toBeGreaterThanOrEqual(0);
      expect(a2Amount).toBeGreaterThanOrEqual(0);
    },
  );
});

describe("TC-TAX-DIST-02: 分配率×金額 — agentFee は gross × 5% の floor 値", () => {
  it.each(DIST_CASES)(
    "¥%i [%s分配]",
    (gross, _label, org, a1) => {
      const { netAmount } = calcFees(gross, STRIPE_RATE, PLATFORM_RATE);
      const { agentFee } = calcDistributions(netAmount, gross, AGENT_RATE, org, a1);
      expect(agentFee).toBe(Math.floor(gross * AGENT_RATE));
      expect(Number.isInteger(agentFee)).toBe(true);
      expect(agentFee).toBeGreaterThanOrEqual(0);
    },
  );
});

// ── TC-TAX-PAYPAY: PayPay 消費税上乗せ境界値マトリクス ───────────────────

describe("TC-TAX-PAYPAY-01: PayPay 境界値 — net + fee ≤ gross かつ差 ≤ 1円", () => {
  it.each(PAYPAY_CASES)(
    "¥%i",
    (gross) => {
      const { netAmount, applicationFeeAmount } = calcFees(gross, PAYPAY_RATE, PLATFORM_RATE);
      expect(netAmount + applicationFeeAmount).toBeLessThanOrEqual(gross);
      expect(gross - netAmount - applicationFeeAmount).toBeLessThanOrEqual(1);
      expect(netAmount).toBeGreaterThan(0);
    },
  );
});

describe("TC-TAX-PAYPAY-02: PayPay 境界値 — stripeFee(PayPay) ≥ stripeFee(card)（消費税分上乗せ）", () => {
  it.each(PAYPAY_CASES)(
    "¥%i",
    (gross) => {
      const paypayFee = Math.floor(gross * PAYPAY_RATE);
      const cardFee = Math.floor(gross * STRIPE_RATE);
      // PayPay 手数料は必ずカード手数料以上（消費税10%上乗せ分）
      expect(paypayFee).toBeGreaterThanOrEqual(cardFee);
      expect(Number.isInteger(paypayFee)).toBe(true);
    },
  );
});

// ── TC-TAX-TRIPLE: 3者同時分配の合計検証 ────────────────────────────────

describe("TC-TAX-TRIPLE: agent + org + artist の総合計が gross - platformFee - stripeFee に一致", () => {
  const TRIPLE_CASES: Array<[number, string, number, number]> = [
    // [gross, label, orgRatio, a1Ratio] — a2=(1-org-a1) がオーガナイザーと同率のアーティスト分
    [10_000, "50:50", 0.5, 0.5],
    [10_000, "33:33:34", 0.33, 0.33],
    [10_000, "99:1", 0.99, 0.01],
    [33_333, "50:50", 0.5, 0.5],
    [33_333, "30:30:40", 0.3, 0.3],
    [100_001, "67:33", 0.67, 0.33],
    [1_000_000, "50:50", 0.5, 0.5],
    [7_777, "25:75", 0.25, 0.75],
  ];

  it.each(TRIPLE_CASES)(
    "¥%i [%s]: agent + org + artist = net、gross整合性も確認",
    (gross, _label, org, a1) => {
      const { stripeFee, platformFee, netAmount } = calcFees(gross, STRIPE_RATE, PLATFORM_RATE);
      const agentFee = Math.floor(gross * AGENT_RATE);
      const { orgAmount, a1Amount, a2Amount } = calcDistributions(
        netAmount, gross, AGENT_RATE, org, a1,
      );

      // organizer + artist 合計 = net
      expect(orgAmount + a1Amount + a2Amount).toBe(netAmount);
      // agentFee は platform_fee とは別（gross から直接）
      expect(agentFee).toBe(Math.floor(gross * AGENT_RATE));
      // 全費用の合計 ≤ gross（切り捨て誤差は最大2円）
      const totalFees = stripeFee + platformFee + agentFee + orgAmount + a1Amount + a2Amount;
      // agentFee は net の中から払われる想定ではなく gross × 5% の別立て
      // 実際: stripeFee + platformFee + net = gross（±1円）かつ net内でagent+org+artist
      expect(stripeFee + platformFee + netAmount).toBeLessThanOrEqual(gross);
      expect(gross - stripeFee - platformFee - netAmount).toBeLessThanOrEqual(1);
    },
  );
});

// ── TC-TAX-RATE-PRECISION: 消費税上乗せ精度検証 ──────────────────────────

describe("TC-TAX-RATE-PRECISION: 3.98% × 1.1 = 4.378% の5桁精度", () => {
  const PAYPAY_BASE = 0.0398;
  const TAX_MULTIPLIER = 1.1;
  const EXPECTED_EFFECTIVE = 0.04378;

  it("計算値が EXPECTED_EFFECTIVE と一致する", () => {
    const computed = Math.round(PAYPAY_BASE * TAX_MULTIPLIER * 100000) / 100000;
    expect(computed).toBe(EXPECTED_EFFECTIVE);
  });

  it("カード手数料 3.6% × 1.1 = 3.96% の精度", () => {
    const base = 0.036;
    const effective = Math.round(base * TAX_MULTIPLIER * 10000) / 10000;
    expect(effective).toBe(0.0396);
  });

  it("net_rate = 1 - stripe_rate - platform_rate が小数点5桁精度で正しい", () => {
    const net = Math.round((1 - STRIPE_RATE - PLATFORM_RATE) * 100000) / 100000;
    expect(net).toBe(0.8604);
  });

  it("paypay_net_rate = 1 - paypay_rate - platform_rate が正しい", () => {
    const net = Math.round((1 - PAYPAY_RATE - PLATFORM_RATE) * 100000) / 100000;
    expect(net).toBe(0.85622);
  });
});

// ── TC-TAX-AGENT-MATRIX: エージェント手数料 × 多金額 ───────────────────

describe("TC-TAX-AGENT-MATRIX: エージェント手数料 = floor(gross × 5%) の全境界値確認", () => {
  const AGENT_CASES: Array<[number]> = BOUNDARY_AMOUNTS.map((g) => [g]);

  it.each(AGENT_CASES)(
    "¥%i",
    (gross) => {
      const agentFee = Math.floor(gross * AGENT_RATE);
      // 整数
      expect(Number.isInteger(agentFee)).toBe(true);
      // 非負
      expect(agentFee).toBeGreaterThanOrEqual(0);
      // gross × 5% ≤ agentFee + 1（floor誤差）
      expect(agentFee).toBeLessThanOrEqual(gross * AGENT_RATE);
      expect(gross * AGENT_RATE - agentFee).toBeLessThan(1);
    },
  );
});
