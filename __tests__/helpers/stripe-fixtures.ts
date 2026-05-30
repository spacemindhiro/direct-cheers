import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Stripe テスト用 Express Connect アカウントを作成して ID を返す
export async function createTestConnectAccount(): Promise<string> {
  const account = await stripe.accounts.create({
    type: "express",
    country: "JP",
    capabilities: { transfers: { requested: true } },
    settings: { payouts: { schedule: { interval: "manual" } } },
  });
  return account.id;
}

// テスト Connect アカウントを削除
export async function deleteTestConnectAccount(accountId: string): Promise<void> {
  try {
    await stripe.accounts.del(accountId);
  } catch {
    // アカウントが既に削除されていても無視
  }
}

// destination charge の PaymentIntent を作成（requires_capture 状態で返す）
export async function createTestPaymentIntent(params: {
  amount: number;
  organizerConnectId: string;
  applicationFeeAmount: number;
}): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: "jpy",
    capture_method: "manual",
    payment_method: "pm_card_visa",
    confirm: true,
    on_behalf_of: params.organizerConnectId,
    transfer_data: { destination: params.organizerConnectId },
    application_fee_amount: params.applicationFeeAmount,
    return_url: "http://localhost:3000",
  });
}

// platform → Connect アカウントへ直接 Transfer（旧フロー用・テスト残高を作るために使用）
export async function createTestTransfer(params: {
  amount: number;
  destination: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Transfer> {
  return stripe.transfers.create({
    amount: params.amount,
    currency: "jpy",
    destination: params.destination,
    metadata: params.metadata ?? {},
  });
}

// 指定した PaymentIntent をキャプチャして、destination_transfer_id を返す
export async function captureAndGetDestinationTransfer(piId: string): Promise<string | null> {
  await stripe.paymentIntents.capture(piId);
  const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
  const charge = pi.latest_charge as Stripe.Charge | null;
  const transfer = charge?.transfer;
  if (!transfer) return null;
  return typeof transfer === "string" ? transfer : (transfer as any).id;
}

// テスト用 Stripe Checkout Session を作成（pay/cheers route のアサーション用）
export async function retrieveRecentCheckoutSession(
  qrConfigId: string,
): Promise<Stripe.Checkout.Session | null> {
  const sessions = await stripe.checkout.sessions.list({ limit: 10 });
  return sessions.data.find((s) => s.metadata?.qr_config_id === qrConfigId) ?? null;
}
