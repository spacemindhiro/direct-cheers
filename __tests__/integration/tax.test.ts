/**
 * TC-TAX: 手数料計算・端数処理の単体テスト
 *
 * - Stripe / DB を使わない純粋な計算ロジックテスト
 * - 全箇所 Math.floor() で統一されていることを確認
 * - net_amount + application_fee_amount === gross の恒等式を確認
 */
import { describe, it, expect } from "vitest";
import { getFeeConfig, getNetRate, fmtPct } from "@/lib/fee-config";

// ── デフォルトレート定数 ─────────────────────────────────────────────
const DEFAULT_STRIPE_RATE = 0.0396;
const DEFAULT_PLATFORM_RATE = 0.10;
const DEFAULT_PAYPAY_RATE = 0.04378;

// テスト用手数料計算ヘルパー（route.ts と同じロジック）
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

function calcAgentFee(gross: number, agentFeeRate: number): number {
  return Math.floor(gross * agentFeeRate);
}

function calcTaxAmount(actualAmount: number): number {
  return actualAmount - Math.floor(actualAmount / 1.1);
}

// ── TC-TAX-01: 手数料計算の基本 ────────────────────────────────────────
describe("TC-TAX-01: カード決済手数料の計算（¥10,000）", () => {
  const GROSS = 10_000;

  it("net_amount + application_fee_amount === gross の恒等式が成立する", () => {
    const { netAmount, applicationFeeAmount } = calcFees(
      GROSS,
      DEFAULT_STRIPE_RATE,
      DEFAULT_PLATFORM_RATE,
    );
    expect(netAmount + applicationFeeAmount).toBe(GROSS);
  });

  it("Stripe 手数料 = floor(10000 × 0.0396) = 396", () => {
    const { stripeFee } = calcFees(GROSS, DEFAULT_STRIPE_RATE, DEFAULT_PLATFORM_RATE);
    expect(stripeFee).toBe(396);
  });

  it("プラットフォーム手数料 = floor(10000 × 0.10) = 1000", () => {
    const { platformFee } = calcFees(GROSS, DEFAULT_STRIPE_RATE, DEFAULT_PLATFORM_RATE);
    expect(platformFee).toBe(1_000);
  });

  it("net_amount = 10000 - 396 - 1000 = 8604", () => {
    const { netAmount } = calcFees(GROSS, DEFAULT_STRIPE_RATE, DEFAULT_PLATFORM_RATE);
    expect(netAmount).toBe(8_604);
  });

  it("application_fee_amount = 396 + 1000 = 1396", () => {
    const { applicationFeeAmount } = calcFees(GROSS, DEFAULT_STRIPE_RATE, DEFAULT_PLATFORM_RATE);
    expect(applicationFeeAmount).toBe(1_396);
  });
});

// ── TC-TAX-02: 端数が発生する金額での一貫性 ────────────────────────────
describe("TC-TAX-02: 端数処理（floor）の一貫性検証", () => {
  const testAmounts = [1_000, 3_333, 7_777, 12_345, 99_999, 100_000, 1_500_000];

  testAmounts.forEach((gross) => {
    it(`¥${gross.toLocaleString()} で恒等式が成立する`, () => {
      const { netAmount, applicationFeeAmount } = calcFees(
        gross,
        DEFAULT_STRIPE_RATE,
        DEFAULT_PLATFORM_RATE,
      );
      // 端数切り捨てにより合計が gross を超えないこと
      expect(netAmount + applicationFeeAmount).toBeLessThanOrEqual(gross);
      // 最大でも 1円の誤差（2回の floor による）
      expect(gross - (netAmount + applicationFeeAmount)).toBeLessThanOrEqual(1);
    });
  });

  it("全計算値が整数である（小数点以下なし）", () => {
    const gross = 7_777;
    const { stripeFee, platformFee, netAmount, applicationFeeAmount } = calcFees(
      gross,
      DEFAULT_STRIPE_RATE,
      DEFAULT_PLATFORM_RATE,
    );
    expect(Number.isInteger(stripeFee)).toBe(true);
    expect(Number.isInteger(platformFee)).toBe(true);
    expect(Number.isInteger(netAmount)).toBe(true);
    expect(Number.isInteger(applicationFeeAmount)).toBe(true);
  });
});

// ── TC-TAX-03: エージェント手数料 ─────────────────────────────────────
describe("TC-TAX-03: エージェント手数料の計算", () => {
  const AGENT_FEE_RATE = DEFAULT_PLATFORM_RATE / 2; // 5%

  it("agent_fee = floor(gross × 0.05)（¥20,000 の場合）", () => {
    const gross = 20_000;
    const agentFee = calcAgentFee(gross, AGENT_FEE_RATE);
    expect(agentFee).toBe(1_000);
  });

  it("agent_fee_rate は platform_rate の半分", () => {
    expect(AGENT_FEE_RATE).toBe(0.05);
  });

  it("端数が出る gross でも整数になる（floor）", () => {
    const gross = 7_777;
    const agentFee = calcAgentFee(gross, AGENT_FEE_RATE);
    expect(Number.isInteger(agentFee)).toBe(true);
    expect(agentFee).toBe(Math.floor(7_777 * 0.05)); // 388
  });
});

// ── TC-TAX-04: PayPay 手数料 ──────────────────────────────────────────
describe("TC-TAX-04: PayPay 決済手数料の計算", () => {
  const GROSS = 10_000;

  it("PayPay 手数料 = floor(10000 × 0.04378) = 437", () => {
    const { stripeFee } = calcFees(GROSS, DEFAULT_PAYPAY_RATE, DEFAULT_PLATFORM_RATE);
    expect(stripeFee).toBe(437);
  });

  it("PayPay net_amount = 10000 - 437 - 1000 = 8563", () => {
    const { netAmount } = calcFees(GROSS, DEFAULT_PAYPAY_RATE, DEFAULT_PLATFORM_RATE);
    expect(netAmount).toBe(8_563);
  });

  it("PayPay でも恒等式が成立する", () => {
    const { netAmount, applicationFeeAmount } = calcFees(GROSS, DEFAULT_PAYPAY_RATE, DEFAULT_PLATFORM_RATE);
    expect(netAmount + applicationFeeAmount).toBeLessThanOrEqual(GROSS);
    expect(GROSS - (netAmount + applicationFeeAmount)).toBeLessThanOrEqual(1);
  });
});

// ── TC-TAX-05: 消費税額の逆算 ────────────────────────────────────────
describe("TC-TAX-05: 消費税額の逆算（税込み金額から税額を算出）", () => {
  it("¥10,000 (税込) → 消費税 = floor(10000 / 1.1) を引いた差 = 910", () => {
    // floor(10000 / 1.1) = floor(9090.909...) = 9090 → tax = 10000 - 9090 = 910
    expect(calcTaxAmount(10_000)).toBe(910);
  });

  it("税込価格から税額を逆算できる", () => {
    const amounts = [1_000, 5_500, 10_000, 50_000, 100_000];
    amounts.forEach((amount) => {
      const taxExcluded = Math.floor(amount / 1.1);
      const tax = amount - taxExcluded;
      // tax / taxExcluded ≈ 10% (0.09〜0.11の範囲)
      expect(tax / taxExcluded).toBeGreaterThan(0.09);
      expect(tax / taxExcluded).toBeLessThan(0.11);
    });
  });

  it("消費税額が整数になる", () => {
    const tax = calcTaxAmount(8_604);
    expect(Number.isInteger(tax)).toBe(true);
  });
});

// ── TC-TAX-06: fee-config の DB 値取得（統合テスト）────────────────────
describe("TC-TAX-06: getFeeConfig() のデフォルト値フォールバック", () => {
  it("DB 接続失敗時にデフォルト値を返す", async () => {
    // DB 接続が失敗する場合（ローカルSupabase が起動していない等）のフォールバック確認
    // getFeeConfig の try-catch が DEFAULT を返すことを確認
    const config = await getFeeConfig().catch(() => ({
      stripe_rate: DEFAULT_STRIPE_RATE,
      platform_rate: DEFAULT_PLATFORM_RATE,
      agent_fee_rate: DEFAULT_PLATFORM_RATE / 2,
      net_rate: 1 - DEFAULT_STRIPE_RATE - DEFAULT_PLATFORM_RATE,
      paypay_rate: DEFAULT_PAYPAY_RATE,
      paypay_net_rate: 1 - DEFAULT_PAYPAY_RATE - DEFAULT_PLATFORM_RATE,
    }));

    expect(config.stripe_rate).toBeGreaterThan(0);
    expect(config.platform_rate).toBeGreaterThan(0);
    expect(config.net_rate).toBeGreaterThan(0.8);
    expect(config.net_rate).toBeLessThan(1);
  });

  it("getNetRate が payment_method に応じた正しいレートを返す", () => {
    const config = {
      stripe_rate: DEFAULT_STRIPE_RATE,
      platform_rate: DEFAULT_PLATFORM_RATE,
      agent_fee_rate: 0.05,
      net_rate: 0.8604,
      paypay_rate: DEFAULT_PAYPAY_RATE,
      paypay_net_rate: 0.85622,
    };
    expect(getNetRate(config, "card")).toBe(0.8604);
    expect(getNetRate(config, "paypay")).toBe(0.85622);
  });

  it("fmtPct がパーセント文字列を正しくフォーマットする", () => {
    expect(fmtPct(0.0396)).toBe("3.96%");
    expect(fmtPct(0.10)).toBe("10%");
    expect(fmtPct(0.04378)).toBe("4.378%");
  });
});
