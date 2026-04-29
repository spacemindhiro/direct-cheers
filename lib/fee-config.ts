import { createAdminClient } from "@/lib/supabase/admin";

export type FeeConfig = {
  stripe_rate: number;    // 例: 0.036
  platform_rate: number;  // 例: 0.10
  agent_fee_rate: number; // platform_rate の半分をエージェントへ (例: 0.05)
  net_rate: number;       // 1 - stripe_rate - platform_rate (例: 0.864)
};

const DEFAULT: FeeConfig = {
  stripe_rate: 0.036,
  platform_rate: 0.10,
  agent_fee_rate: 0.05,
  net_rate: 0.864,
};

/** サーバーサイドのみで呼び出すこと */
export async function getFeeConfig(): Promise<FeeConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_config")
      .select("stripe_rate, platform_rate")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (!data) return DEFAULT;

    const stripe_rate = Number(data.stripe_rate);
    const platform_rate = Number(data.platform_rate);
    const agent_fee_rate = Math.round(platform_rate / 2 * 10000) / 10000;
    return {
      stripe_rate,
      platform_rate,
      agent_fee_rate,
      net_rate: Math.round((1 - stripe_rate - platform_rate) * 10000) / 10000,
    };
  } catch {
    return DEFAULT;
  }
}

/** 表示用: 0.036 → "3.6%" */
export function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
