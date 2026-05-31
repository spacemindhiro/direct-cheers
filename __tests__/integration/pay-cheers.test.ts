/**
 * TC-PAY: /api/pay/cheers の統合テスト
 *
 * Stripe の Checkout Session は payment_intent が session 完了まで作成されない（API v2026-02-25.clover 以降）。
 * そのため vi.mock("stripe") で checkout.sessions.create の引数をキャプチャし、
 * route が Stripe に渡す payment_intent_data パラメータを直接検証する。
 * これは PI を完了後に検証するのと等価であり、テストドライバとして機能する。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
  retrieveRecentCheckoutSession,
  stripe,
} from "../helpers/stripe-fixtures";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { insertEvent, insertQrConfig } from "../helpers/seed";
import { cleanupTestData } from "../helpers/db-reset";

// route が stripe.checkout.sessions.create に渡すパラメータをキャプチャ
// vi.mock はホイスティングされるため、ファクトリがクロージャで参照できるよう module スコープに置く
const captured: { sessionCreateParams?: any } = {};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      const origCreate = this.checkout.sessions.create.bind(this.checkout.sessions);
      (this.checkout.sessions as any).create = async (params: any, opts?: any) => {
        captured.sessionCreateParams = params;
        // PayPay はテストモードのサンドボックスが Stripe から提供されていないためスタブを返す
        if ((params.payment_method_types ?? []).includes("paypay")) {
          return { url: "https://checkout.stripe.com/c/pay/cs_test_paypay_stub", id: "cs_test_paypay_stub" };
        }
        return origCreate(params, opts);
      };
    }
  }
  return { ...StripeModule, default: InstrumentedStripe };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { POST } from "@/app/api/pay/cheers/route";

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
  organizerConnectId = await createTestConnectAccount();

  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "テストオーガナイザー",
    email: `organizer-pay-${Date.now()}@test.local`,
    stripeConnectId: organizerConnectId,
  });
  noConnectOrganizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "Connectなし",
    email: `organizer-noconnect-${Date.now()}@test.local`,
    stripeConnectId: null,
  });
  cleanup.profileIds.push(organizerProfileId, noConnectOrganizerProfileId);

  eventId = await insertEvent({ organizerProfileId });
  qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
  cleanup.eventIds.push(eventId);
  cleanup.qrConfigIds.push(qrConfigId);

  noConnectEventId = await insertEvent({ organizerProfileId: noConnectOrganizerProfileId });
  noConnectQrConfigId = await insertQrConfig({
    eventId: noConnectEventId,
    creatorProfileId: noConnectOrganizerProfileId,
    recipientProfileId: noConnectOrganizerProfileId,
  });
  cleanup.eventIds.push(noConnectEventId);
  cleanup.qrConfigIds.push(noConnectQrConfigId);
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
  await deleteTestConnectAccount(organizerConnectId);
});

// ── TC-PAY-01: カード決済・destination charge フロー ─────────────────
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

    // Checkout Session がメタデータ付きで作成されていることを確認
    const session = await retrieveRecentCheckoutSession(qrConfigId);
    expect(session).not.toBeNull();
    expect(session!.metadata?.qr_config_id).toBe(qrConfigId);

    // route が Stripe に渡した payment_intent_data を検証
    // （API v2026-02-25.clover 以降、payment_intent は session 完了まで作成されないため
    //   capture した create 引数で確認する）
    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.on_behalf_of).toBe(organizerConnectId);
    expect(pid?.transfer_data).toBeUndefined();
    expect(pid?.application_fee_amount).toBeUndefined();
    expect(pid?.capture_method).toBe("manual");
  });
});

// ── TC-PAY-02: PayPay 決済 ────────────────────────────────────────────
describe("TC-PAY-02: PayPay 決済（即時キャプチャ・destination charge なし）", () => {
  // PayPay はテストモードのサンドボックスが Stripe から提供されていないため、
  // checkout.sessions.create をスタブ化して route のパラメータ組み立てのみ検証する。
  it("capture_method: automatic で Checkout Session が作成され on_behalf_of が設定されない", async () => {
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

    const pid = captured.sessionCreateParams?.payment_intent_data;
    // PayPay は manual capture 非対応 → automatic に切り替わっていることを確認
    expect(pid?.capture_method).toBe("automatic");
    // PayPay は Stripe Connect の on_behalf_of を現行 API でサポートしていないため未設定
    expect(pid?.on_behalf_of).toBeUndefined();
    expect(pid?.transfer_data).toBeUndefined();
  });
});

// ── TC-PAY-03: Connect 未設定オーガナイザー ──────────────────────────
describe("TC-PAY-03: Connect 未設定オーガナイザー（フォールバック）", () => {
  it("application_fee_amount なしの Checkout Session が作成される", async () => {
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

    const session = await retrieveRecentCheckoutSession(noConnectQrConfigId);
    expect(session).not.toBeNull();

    // Connect なし → on_behalf_of / application_fee_amount が設定されないことを確認
    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.on_behalf_of).toBeUndefined();
    expect(pid?.application_fee_amount).toBeUndefined();
  });
});

// ── TC-PAY-04: バリデーション ──────────────────────────────────────────
describe("TC-PAY-04: バリデーション", () => {
  it("必須フィールド欠損 → 400 を返す", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 5000, payment_method: "card" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
