import type Stripe from "stripe";

export type CapabilityCheckResult = {
  ok: boolean;
  missing: string[];
};

// on_behalf_of を使うカード系決済（card / Apple Pay / Google Pay / Link）に必須のケイパビリティ。
// PayPay は on_behalf_of 非対応のためこのチェックから除外される。
// 将来 paypay_payments capability が安定版 API に昇格した際はここに追加する。
export const REQUIRED_CARD_CAPABILITIES = ["card_payments", "transfers"] as const;

export async function checkConnectCapabilities(
  stripe: Stripe,
  connectId: string,
  required: readonly string[] = REQUIRED_CARD_CAPABILITIES,
): Promise<CapabilityCheckResult> {
  const account = await stripe.accounts.retrieve(connectId);
  const caps = (account.capabilities ?? {}) as Record<string, string | undefined>;
  const missing = required.filter((cap) => caps[cap] !== "active");
  return { ok: missing.length === 0, missing };
}
