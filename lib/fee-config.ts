import { createAdminClient } from "@/lib/supabase/admin";

export type FeeConfig = {
  stripe_rate: number;    // 例: 0.0396（3.6% × 消費税1.1）
  platform_rate: number;  // 例: 0.10
  agent_fee_rate: number; // platform_rate の半分をエージェントへ (例: 0.05)
  net_rate: number;       // 1 - stripe_rate - platform_rate (例: 0.8604)
  paypay_rate: number;    // 例: 0.04378（3.98% × 消費税1.1）
  paypay_net_rate: number;// 1 - paypay_rate - platform_rate
};

const DEFAULT: FeeConfig = {
  stripe_rate: 0.0396,
  platform_rate: 0.10,
  agent_fee_rate: 0.05,
  net_rate: 0.8604,
  paypay_rate: 0.04378,
  paypay_net_rate: 0.85622,
};

/** サーバーサイドのみで呼び出すこと */
export async function getFeeConfig(): Promise<FeeConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_config")
      .select("stripe_rate, platform_rate, paypay_rate")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (!data) return DEFAULT;

    const stripe_rate = Number(data.stripe_rate);
    const platform_rate = Number(data.platform_rate);
    const paypay_rate = Number(data.paypay_rate ?? 0.04378);
    const agent_fee_rate = Math.round(platform_rate / 2 * 10000) / 10000;
    return {
      stripe_rate,
      platform_rate,
      agent_fee_rate,
      net_rate: Math.round((1 - stripe_rate - platform_rate) * 10000) / 10000,
      paypay_rate,
      paypay_net_rate: Math.round((1 - paypay_rate - platform_rate) * 10000) / 10000,
    };
  } catch {
    return DEFAULT;
  }
}

/** payment_method に応じた net_rate を返す */
export function getNetRate(feeConfig: FeeConfig, paymentMethod: "card" | "paypay"): number {
  return paymentMethod === "paypay" ? feeConfig.paypay_net_rate : feeConfig.net_rate;
}

/** 表示用: 0.0396 → "3.96%"、0.10 → "10%" （末尾ゼロ除去） */
export function fmtPct(rate: number): string {
  return `${parseFloat((rate * 100).toFixed(3))}%`;
}
