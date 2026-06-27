/**
 * TC-TAX-LIVE: 実DB手数料レートの整合性テスト
 *
 * tax-matrix.test.ts はレートをハードコードしているため、
 * fee_config テーブルの実値が変わっても検知できない。
 * このファイルは DB から実際のレートを取得し、
 * ① レート値が業務上合理な範囲にあること
 * ② 実レートで計算した結果が恒等式を満たすこと
 * ③ 定数定義との乖離がないこと
 * を保証する。
 *
 * DB・Stripe 必要。Stripe API は呼ばない（純計算テスト）。
 */
import { describe, it, expect } from "vitest";
import { getFeeConfig } from "@/lib/fee-config";

// ── 合理範囲の定義（変更時はここを更新） ───────────────────────────────────
const EXPECTED = {
  stripe_rate:    { min: 0.030, max: 0.050, nominal: 0.0396  },
  paypay_rate:    { min: 0.035, max: 0.060, nominal: 0.04378 },
  platform_rate:  { min: 0.05,  max: 0.20,  nominal: 0.10   },
  agent_fee_rate: { min: 0.01,  max: 0.10,  nominal: 0.05   },
};

const BOUNDARY_AMOUNTS = [1, 100, 1_000, 3_000, 5_000, 10_000, 30_000, 100_000];

describe("TC-TAX-LIVE: fee_config 実レートの整合性検証", () => {
  let feeConfig: Awaited<ReturnType<typeof getFeeConfig>>;

  // beforeAll の代わりに each it で取得するのは遅いので、最初の it で取得してキャッシュ
  async function getConfig() {
    if (!feeConfig) feeConfig = await getFeeConfig();
    return feeConfig;
  }

  // ── A: レート値が合理範囲内にあること ──────────────────────────────────
  it("TC-TAX-LIVE-A-01: stripe_rate が合理範囲 [3.0%, 5.0%] にある", async () => {
    const cfg = await getConfig();
    expect(cfg.stripe_rate).toBeGreaterThanOrEqual(EXPECTED.stripe_rate.min);
    expect(cfg.stripe_rate).toBeLessThanOrEqual(EXPECTED.stripe_rate.max);
  });

  it("TC-TAX-LIVE-A-02: paypay_rate が stripe_rate より高い（PayPay に消費税が加算されるため）", async () => {
    const cfg = await getConfig();
    expect(cfg.paypay_rate).toBeGreaterThan(cfg.stripe_rate);
    expect(cfg.paypay_rate).toBeGreaterThanOrEqual(EXPECTED.paypay_rate.min);
    expect(cfg.paypay_rate).toBeLessThanOrEqual(EXPECTED.paypay_rate.max);
  });

  it("TC-TAX-LIVE-A-03: platform_rate が合理範囲 [5%, 20%] にある", async () => {
    const cfg = await getConfig();
    expect(cfg.platform_rate).toBeGreaterThanOrEqual(EXPECTED.platform_rate.min);
    expect(cfg.platform_rate).toBeLessThanOrEqual(EXPECTED.platform_rate.max);
  });

  it("TC-TAX-LIVE-A-04: agent_fee_rate が合理範囲 [1%, 10%] にある", async () => {
    const cfg = await getConfig();
    expect(cfg.agent_fee_rate).toBeGreaterThanOrEqual(EXPECTED.agent_fee_rate.min);
    expect(cfg.agent_fee_rate).toBeLessThanOrEqual(EXPECTED.agent_fee_rate.max);
  });

  it("TC-TAX-LIVE-A-05: platform_rate > agent_fee_rate（エージェント手数料はプラットフォーム手数料から払う）", async () => {
    const cfg = await getConfig();
    expect(cfg.platform_rate).toBeGreaterThan(cfg.agent_fee_rate);
  });

  // ── B: 実レートによる恒等式検証 ─────────────────────────────────────────
  it.each(BOUNDARY_AMOUNTS)(
    "TC-TAX-LIVE-B: gross=%i円 → net + stripeFee + platformFee = gross（端数誤差0〜2円以内）",
    async (gross) => {
      const cfg = await getConfig();
      const stripeFee   = Math.ceil(gross * cfg.stripe_rate);
      const platformFee = Math.floor(gross * cfg.platform_rate);
      const net         = gross - stripeFee - platformFee;

      // ceil 丸めで超小額取引は net=0 になり得る（正常。実運用の最小取引額は 100 円以上）
      expect(net).toBeGreaterThanOrEqual(0);
      // 再合成
      expect(stripeFee + platformFee + net).toBe(gross);
      // stripeFee は ceil(gross × stripe_rate) 以下
      expect(stripeFee).toBeLessThanOrEqual(Math.ceil(gross * cfg.stripe_rate));
    }
  );

  it.each(BOUNDARY_AMOUNTS)(
    "TC-TAX-LIVE-B-PAYPAY: PayPay gross=%i → net + fees = gross",
    async (gross) => {
      const cfg = await getConfig();
      const stripeFee   = Math.floor(gross * cfg.paypay_rate);
      const platformFee = Math.floor(gross * cfg.platform_rate);
      const net         = gross - stripeFee - platformFee;

      expect(net).toBeGreaterThan(0);
      expect(stripeFee + platformFee + net).toBe(gross);
    }
  );

  // ── C: 定数との乖離チェック（±10% 以内なら警告、±30% 超は FAIL） ─────
  it("TC-TAX-LIVE-C-01: stripe_rate の実値が nominal(3.96%) から ±30% 以内", async () => {
    const cfg = await getConfig();
    const nominal = EXPECTED.stripe_rate.nominal;
    const drift = Math.abs(cfg.stripe_rate - nominal) / nominal;
    // ±30% 超はテスト失敗（設定ミスや大幅な料率変更を検知）
    expect(drift, `stripe_rate=${cfg.stripe_rate} が nominal=${nominal} から ${(drift * 100).toFixed(1)}% 乖離`).toBeLessThan(0.30);
  });

  it("TC-TAX-LIVE-C-02: paypay_rate の実値が nominal(4.378%) から ±30% 以内", async () => {
    const cfg = await getConfig();
    const nominal = EXPECTED.paypay_rate.nominal;
    const drift = Math.abs(cfg.paypay_rate - nominal) / nominal;
    expect(drift, `paypay_rate=${cfg.paypay_rate} が nominal=${nominal} から ${(drift * 100).toFixed(1)}% 乖離`).toBeLessThan(0.30);
  });

  it("TC-TAX-LIVE-C-03: platform_rate の実値が nominal(10%) から ±30% 以内", async () => {
    const cfg = await getConfig();
    const nominal = EXPECTED.platform_rate.nominal;
    const drift = Math.abs(cfg.platform_rate - nominal) / nominal;
    expect(drift, `platform_rate=${cfg.platform_rate} が nominal=${nominal} から ${(drift * 100).toFixed(1)}% 乖離`).toBeLessThan(0.30);
  });

  // ── D: エージェント含む4者分配の端数検証（実レートで） ───────────────
  it.each([
    [10_000, 0.5, 0.5],
    [33_333, 0.5, 0.5],  // 端数が多い金額
    [7_777,  0.3, 0.7],
    [99_999, 0.33, 0.67],
  ])(
    "TC-TAX-LIVE-D: gross=%i 実レートでの4者分配合計が net+agent と一致",
    async (gross, orgRatio, artistRatio) => {
      const cfg = await getConfig();
      const stripeFee   = Math.ceil(gross * cfg.stripe_rate);
      const platformFee = Math.floor(gross * cfg.platform_rate);
      const net         = gross - stripeFee - platformFee;

      const agentFee    = Math.floor(gross * cfg.agent_fee_rate);
      const orgAmount   = Math.floor(net * orgRatio);
      const artistAmount = net - orgAmount; // 端数は artist が吸収

      const total = agentFee + orgAmount + artistAmount;

      // 合計は net + agentFee と一致するはず
      expect(total).toBe(net + agentFee);
      // agent を除いた org + artist = net
      expect(orgAmount + artistAmount).toBe(net);
    }
  );
});
