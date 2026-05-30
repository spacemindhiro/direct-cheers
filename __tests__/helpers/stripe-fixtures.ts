import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Stripe テスト用 Express Connect アカウントを作成して ID を返す
export async function createTestConnectAccount(): Promise<string> {
  const account = await stripe.accounts.create({
    type: "custom",
    country: "JP",
    capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
    settings: { payouts: { schedule: { interval: "manual" } } },
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" },
    business_type: "individual",
    business_profile: { mcc: "5734", product_description: "テスト", url: "https://direct-cheers.jp" },
    individual: {
      email: "test@direct-cheers.jp",
      phone: "+818012345678",
      first_name_kana: "テスト",
      last_name_kana: "ユーザー",
      first_name_kanji: "テスト",
      last_name_kanji: "ユーザー",
      dob: { day: 1, month: 1, year: 1990 },
      address_kana: { postal_code: "1000001", state: "トウキョウト", city: "チヨダク", town: "チヨダ", line1: "1-1" },
      address_kanji: { postal_code: "1000001", state: "東京都", city: "千代田区", town: "千代田", line1: "1-1" },
    },
    external_account: {
      object: "bank_account",
      country: "JP",
      currency: "jpy",
      routing_number: "1100000",
      account_number: "0001234",
      account_holder_name: "テスト ユーザー",
    },
  } as any);
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

// PaymentIntent を作成（requires_capture 状態で返す）
// on_behalf_of のみ設定し transfer_data.destination は使わない。
// settle 時に source_transaction で organizer / artist へ個別 Transfer するため。
export async function createTestPaymentIntent(params: {
  amount: number;
  organizerConnectId: string;
}): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: "jpy",
    capture_method: "manual",
    payment_method: "pm_card_visa",
    confirm: true,
    on_behalf_of: params.organizerConnectId,
    return_url: "http://localhost:3000",
  });
}

// PayPay のように即時キャプチャ済み（succeeded）の PI を作成する。
// PayPay はテストモード未対応のため pm_card_visa で代替。
// capture_method: "automatic" で confirm すると Stripe が即時キャプチャし succeeded 状態になる。
// PayPay 実フローと同様に on_behalf_of を設定しない（platform 口座に全額着金）。
export async function createTestCapturedPaymentIntent(params: {
  amount: number;
}): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: "jpy",
    capture_method: "automatic",
    payment_method: "pm_card_visa",
    confirm: true,
    return_url: "http://localhost:3000",
  });
}

// PI をキャプチャして chargeId と source_transaction Transfer ID を返す（settle フロー再現）
export async function captureAndTransfer(params: {
  piId: string;
  amount: number;
  destination: string;
}): Promise<{ chargeId: string; transferId: string }> {
  await stripe.paymentIntents.capture(params.piId);
  const pi = await stripe.paymentIntents.retrieve(params.piId, { expand: ["latest_charge"] });
  const chargeId = (pi.latest_charge as Stripe.Charge)?.id ?? "";
  const transfer = await stripe.transfers.create({
    amount: params.amount,
    currency: "jpy",
    destination: params.destination,
    source_transaction: chargeId,
  });
  return { chargeId, transferId: transfer.id };
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
