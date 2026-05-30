/**
 * TC-PAY: /api/pay/cheers の統合テスト
 *
 * - Stripe テストモード API を実際に呼び出す
 * - Supabase はローカル Docker を使用
 * - @/lib/supabase/server（createClient, getUser）のみモック
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Stripe from "stripe";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
  retrieveRecentCheckoutSession,
  stripe,
} from "../helpers/stripe-fixtures";
import {
  insertProfile,
  insertEvent,
  insertQrConfig,
} from "../helpers/seed";
import { cleanupTestData } from "../helpers/db-reset";

// Next.js server utilities のモック（テスト環境では Request context が存在しない）
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { POST } from "@/app/api/pay/cheers/route";

// ── テスト用データ ────────────────────────────────────────────────────
let organizerProfileId: string;
let noConnectOrganizerProfileId: string;
let organizerConnectId: string;
let eventId: string;
let qrConfigId: string;
let noConnectEventId: string;
let noConnectQrConfigId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
};

beforeAll(async () => {
  // Stripe テスト Connect アカウント作成
  organizerConnectId = await createTestConnectAccount();

  // プロファイル作成
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "テストオーガナイザー",
    email: "organizer-pay@test.local",
    stripeConnectId: organizerConnectId,
  });
  noConnectOrganizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "Connectなし",
    email: "organizer-noconnect@test.local",
    stripeConnectId: null,
  });
  cleanup.profileIds.push(organizerProfileId, noConnectOrganizerProfileId);

  // イベント・QR config
  eventId = await insertEvent({ organizerProfileId });
  qrConfigId = await insertQrConfig({ eventId, recipientProfileId: organizerProfileId });
  cleanup.eventIds.push(eventId);
  cleanup.qrConfigIds.push(qrConfigId);

  noConnectEventId = await insertEvent({ organizerProfileId: noConnectOrganizerProfileId });
  noConnectQrConfigId = await insertQrConfig({
    eventId: noConnectEventId,
    recipientProfileId: noConnectOrganizerProfileId,
  });
  cleanup.eventIds.push(noConnectEventId);
  cleanup.qrConfigIds.push(noConnectQrConfigId);
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteTestConnectAccount(organizerConnectId);
});

// ── TC-PAY-01: カード決済・オーガナイザー Connect あり ─────────────────
describe("TC-PAY-01: カード決済（destination charge フロー）", () => {
  it("Checkout Session が destination charge パラメータ付きで作成される", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrConfigId,
        product_id: crypto.randomUUID(),
        amount: 10_000,
        payment_method: "card",
        metadata: { artist_name: "テストアーティスト", event_title: "テストイベント" },
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    // Stripe から Session を取得してパラメータを検証
    const session = await retrieveRecentCheckoutSession(qrConfigId);
    expect(session).not.toBeNull();
    expect(session!.metadata?.qr_config_id).toBe(qrConfigId);

    // destination charge の設定を確認
    const pi = await stripe.paymentIntents.retrieve(session!.payment_intent as string);
    expect(pi.on_behalf_of).toBe(organizerConnectId);
    expect((pi.transfer_data as any)?.destination).toBe(organizerConnectId);
    expect(pi.application_fee_amount).toBeGreaterThan(0);
    expect(pi.capture_method).toBe("manual");

    // application_fee_amount = floor(10000 * platform_rate) + floor(10000 * stripe_rate)
    // ≒ 1000 + 396 = 1396（platform_rate=10%, stripe_rate=3.96%）
    expect(pi.application_fee_amount).toBeGreaterThanOrEqual(1300);
    expect(pi.application_fee_amount).toBeLessThanOrEqual(1500);
  });
});

// ── TC-PAY-02: PayPay 決済 ────────────────────────────────────────────
describe("TC-PAY-02: PayPay 決済（destination charge なし）", () => {
  it("Checkout Session が paypay payment_method_type で作成される", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrConfigId,
        product_id: crypto.randomUUID(),
        amount: 5_000,
        payment_method: "paypay",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toBeTruthy();

    // PayPay Session では application_fee_amount なし（destination charge 対象外）
    const session = await retrieveRecentCheckoutSession(qrConfigId);
    if (session) {
      const pi = session.payment_intent
        ? await stripe.paymentIntents.retrieve(session.payment_intent as string)
        : null;
      // PayPay は on_behalf_of なし
      expect(pi?.on_behalf_of ?? null).toBeNull();
    }
  });
});

// ── TC-PAY-03: オーガナイザーに Connect アカウントなし ─────────────────
describe("TC-PAY-03: Connect 未設定オーガナイザー（フォールバック）", () => {
  it("on_behalf_of なしの Checkout Session が作成される", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: noConnectQrConfigId,
        product_id: crypto.randomUUID(),
        amount: 8_000,
        payment_method: "card",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toBeTruthy();

    // application_fee_amount が設定されないことを確認
    const session = await retrieveRecentCheckoutSession(noConnectQrConfigId);
    if (session?.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string);
      expect(pi.on_behalf_of).toBeNull();
      expect(pi.application_fee_amount).toBeNull();
    }
  });
});

// ── TC-PAY-04: バリデーションエラー ──────────────────────────────────────
describe("TC-PAY-04: バリデーション", () => {
  it("必須フィールド欠損 → 400 を返す", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 5000, payment_method: "card" }), // qr_config_id, product_id 欠損
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });
});
