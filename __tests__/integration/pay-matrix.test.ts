/**
 * TC-PAY-MATRIX: 決済手段 × Capability状態 × 金額 の全掛け算マトリクステスト
 *
 * test.each で以下を網羅:
 *   1. カード系4手段（card/apple_pay/google_pay/link）× 7 Capability状態 = 28ケース
 *   2. PayPay × 7 Capability状態 = 7ケース（全て通過：Capabilityチェック非対象）
 *   3. 有効金額境界値 × カード系4手段 = 20ケース
 *   4. 入力バリデーション（欠損フィールド・ゼロ金額等）= 12ケース
 *   5. missing_capabilities レスポンス内容検証 = 8ケース
 *   6. Connectなし × 各手段 = 5ケース
 * 計: 約80ケース
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
} from "../helpers/stripe-fixtures";
import { insertProfile, deleteAuthUsers, insertEvent, insertQrConfig, insertProduct } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

// pay-cheers.test.ts と同じ mock 戦略:
// captured を module スコープに置き、InstrumentedStripe で参照する
const captured: {
  sessionCreateParams?: any;
  accountCapabilities: Record<string, string>;
} = {
  accountCapabilities: { card_payments: "active", transfers: "active" },
};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);

      const origCreate = this.checkout.sessions.create.bind(this.checkout.sessions);
      (this.checkout.sessions as any).create = async (params: any, opts?: any) => {
        captured.sessionCreateParams = params;
        if ((params.payment_method_types ?? []).includes("paypay")) {
          return { url: "https://checkout.stripe.com/c/pay/cs_test_paypay_stub", id: "cs_test_paypay_stub" };
        }
        if ((params.payment_method_types ?? []).includes("link")) {
          return { url: "https://checkout.stripe.com/c/pay/cs_test_link_stub", id: "cs_test_link_stub" };
        }
        return origCreate(params, opts);
      };

      (this.accounts as any).retrieve = async (id: string) => ({
        id,
        object: "account",
        capabilities: captured.accountCapabilities,
      });
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

let organizerConnectId: string;
let noConnectConnectId: string;
let organizerProfileId: string;
let noConnectOrgProfileId: string;
let eventId: string;
let qrConfigId: string;
let productId: string;
let noConnectEventId: string;
let noConnectQrConfigId: string;
let noConnectProductId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  productIds: [] as string[],
};

beforeAll(async () => {
  organizerConnectId = await createTestConnectAccount();

  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "PAY-MATRIX オーガナイザー",
    email: `organizer-paymatrix-${ts}@test.local`,
    stripeConnectId: organizerConnectId,
  });
  noConnectOrgProfileId = await insertProfile({
    role: "organizer",
    displayName: "PAY-MATRIX Connect なし",
    email: `organizer-noconnect-paymatrix-${ts}@test.local`,
    stripeConnectId: null,
  });
  cleanup.profileIds.push(organizerProfileId, noConnectOrgProfileId);

  eventId = await insertEvent({ organizerProfileId, title: "PAY-MATRIX テストイベント" });
  productId = await insertProduct({ eventId, type: "standard", minAmount: 50, maxAmount: 500_000 });
  cleanup.productIds.push(productId);
  qrConfigId = await insertQrConfig({
    eventId,
    creatorProfileId: organizerProfileId,
    recipientProfileId: organizerProfileId,
    productId,
  });
  cleanup.eventIds.push(eventId);
  cleanup.qrConfigIds.push(qrConfigId);

  noConnectEventId = await insertEvent({
    organizerProfileId: noConnectOrgProfileId,
    title: "PAY-MATRIX Connect なしイベント",
  });
  noConnectProductId = await insertProduct({ eventId: noConnectEventId, type: "standard", minAmount: 50, maxAmount: 500_000 });
  cleanup.productIds.push(noConnectProductId);
  noConnectQrConfigId = await insertQrConfig({
    eventId: noConnectEventId,
    creatorProfileId: noConnectOrgProfileId,
    recipientProfileId: noConnectOrgProfileId,
    productId: noConnectProductId,
  });
  cleanup.eventIds.push(noConnectEventId);
  cleanup.qrConfigIds.push(noConnectQrConfigId);
}, 60_000);

afterAll(async () => {
  // FK制約(qr_configs.product_id / products.event_id は ON DELETE RESTRICT)のため
  // qr_configs → products → events の順で削除する必要がある
  if (cleanup.qrConfigIds.length) {
    await testAdmin.from("qr_config_targets").delete().in("qr_config_id", cleanup.qrConfigIds);
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  }
  if (cleanup.productIds.length) {
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  }
  await cleanupTestData({ eventIds: cleanup.eventIds, profileIds: cleanup.profileIds });
  await deleteAuthUsers(cleanup.profileIds);
  await deleteTestConnectAccount(organizerConnectId);
});

afterEach(() => {
  captured.accountCapabilities = { card_payments: "active", transfers: "active" };
  captured.sessionCreateParams = undefined;
});

// ── ヘルパー ────────────────────────────────────────────────────────────────

function makePayReq(body: object): Request {
  return new Request("http://localhost/api/pay/cheers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── TC-PAY-MATRIX-CARD: カード系4手段 × 7 Capability状態 = 28ケース ─────

const CARD_COMPATIBLE_METHODS = ["card", "apple_pay", "google_pay", "link"] as const;

const CAPABILITY_STATES: Array<{
  card_payments: string;
  transfers: string;
  shouldPass: boolean;
}> = [
  { card_payments: "active", transfers: "active", shouldPass: true },
  { card_payments: "pending", transfers: "active", shouldPass: false },
  { card_payments: "inactive", transfers: "active", shouldPass: false },
  { card_payments: "unrequested", transfers: "active", shouldPass: false },
  { card_payments: "active", transfers: "pending", shouldPass: false },
  { card_payments: "active", transfers: "inactive", shouldPass: false },
  { card_payments: "active", transfers: "unrequested", shouldPass: false },
];

const CARD_MATRIX_CASES = CARD_COMPATIBLE_METHODS.flatMap((method) =>
  CAPABILITY_STATES.map((cap) => [
    method,
    cap.card_payments,
    cap.transfers,
    cap.shouldPass ? 200 : 422,
  ] as [string, string, string, number]),
);

describe("TC-PAY-MATRIX-CARD: カード系手段 × Capability状態（4×7=28ケース）", () => {
  it.each(CARD_MATRIX_CASES)(
    "[%s] card_payments=%s, transfers=%s → HTTP %i",
    async (method, cardCap, transfersCap, expectedStatus) => {
      captured.accountCapabilities = { card_payments: cardCap, transfers: transfersCap };

      const res = await POST(makePayReq({
        qr_config_id: qrConfigId,
        product_id: productId,
        amount: 5_000,
        payment_method: method,
      }));

      expect(res.status).toBe(expectedStatus);

      if (expectedStatus === 422) {
        const data = await res.json();
        expect(data.error).toBe("account_incomplete");
        // Stripe に電文が飛んでいない（sessionCreateParams が undefined のまま）
        expect(captured.sessionCreateParams).toBeUndefined();
      }
    },
  );
});

// ── TC-PAY-MATRIX-PAYPAY: PayPay × 7 Capability状態 = 7ケース（全て通過） ─

const PAYPAY_MATRIX_CASES = CAPABILITY_STATES.map((cap) => [
  cap.card_payments,
  cap.transfers,
] as [string, string]);

describe("TC-PAY-MATRIX-PAYPAY: PayPay は Capability チェック対象外（7ケース、全て200）", () => {
  it.each(PAYPAY_MATRIX_CASES)(
    "PayPay: card_payments=%s, transfers=%s → 200（チェックスキップ）",
    async (cardCap, transfersCap) => {
      captured.accountCapabilities = { card_payments: cardCap, transfers: transfersCap };

      const res = await POST(makePayReq({
        qr_config_id: qrConfigId,
        product_id: productId,
        amount: 3_000,
        payment_method: "paypay",
      }));

      // PayPay は on_behalf_of を使わないため Capability チェックをスキップ → 常に200
      expect(res.status).toBe(200);
    },
  );
});

// ── TC-PAY-VALIDATE: 入力バリデーション（欠損フィールド・ゼロ金額）= 12ケース ─

const VALIDATION_CASES: Array<[string, object, number]> = [
  ["qr_config_id 欠損", { product_id: crypto.randomUUID(), amount: 1000, payment_method: "card" }, 400],
  ["product_id 欠損", { qr_config_id: qrConfigId, amount: 1000, payment_method: "card" }, 400],
  ["amount 欠損", { qr_config_id: qrConfigId, product_id: crypto.randomUUID(), payment_method: "card" }, 400],
  ["amount = 0", { qr_config_id: qrConfigId, product_id: crypto.randomUUID(), amount: 0, payment_method: "card" }, 400],
  ["qr_config_id + amount 欠損", { product_id: crypto.randomUUID(), payment_method: "card" }, 400],
  ["全フィールド欠損", {}, 400],
  ["qr_config_id が空文字", { qr_config_id: "", product_id: crypto.randomUUID(), amount: 1000 }, 400],
  ["amount が null", { qr_config_id: qrConfigId, product_id: crypto.randomUUID(), amount: null }, 400],
  ["product_id が空文字", { qr_config_id: qrConfigId, product_id: "", amount: 1000 }, 400],
  ["qr_config_id が undefined", { qr_config_id: undefined, product_id: crypto.randomUUID(), amount: 1000 }, 400],
  ["amount が文字列ゼロ", { qr_config_id: qrConfigId, product_id: crypto.randomUUID(), amount: "0" }, 400],
  ["amount が false", { qr_config_id: qrConfigId, product_id: crypto.randomUUID(), amount: false }, 400],
];

describe("TC-PAY-VALIDATE: 必須フィールド欠損・ゼロ金額（12ケース）", () => {
  it.each(VALIDATION_CASES)(
    "%s → HTTP %i",
    async (_label, body, expectedStatus) => {
      const res = await POST(makePayReq(body));
      expect(res.status).toBe(expectedStatus);
    },
  );
});

// ── TC-PAY-MATRIX-AMOUNT: 有効金額境界値 × カード系4手段 = 20ケース ──────

const VALID_BOUNDARY_AMOUNTS = [100, 1_000, 5_000, 10_000, 100_000];

const AMOUNT_MATRIX_CASES = CARD_COMPATIBLE_METHODS.flatMap((method) =>
  VALID_BOUNDARY_AMOUNTS.map((amount) => [method, amount] as [string, number]),
);

describe("TC-PAY-MATRIX-AMOUNT: 有効金額境界値×カード系手段（4×5=20ケース）", () => {
  it.each(AMOUNT_MATRIX_CASES)(
    "[%s] ¥%i → 200（正常系、全Capability active）",
    async (method, amount) => {
      // capabilities は afterEach でリセット済み → (active, active)
      const res = await POST(makePayReq({
        qr_config_id: qrConfigId,
        product_id: productId,
        amount,
        payment_method: method,
      }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    },
  );
});

// ── TC-PAY-MATRIX-MISSING-CAPS: missing_capabilities レスポンス検証 = 8ケース ─

const MISSING_CAPS_CASES: Array<[string, string, string[]]> = [
  ["card_payments が pending", "pending", ["active"]],
  ["card_payments が inactive", "inactive", ["active"]],
  ["transfers が pending", "active", ["pending"]],
  ["transfers が inactive", "active", ["inactive"]],
  ["transfers が unrequested", "active", ["unrequested"]],
  ["card_payments が unrequested", "unrequested", ["active"]],
  ["両方 pending", "pending", ["pending"]],
  ["両方 inactive", "inactive", ["inactive"]],
].map(([label, cardCap, [transfersCap]]) => [label, cardCap, transfersCap] as [string, string, string]);

describe("TC-PAY-MATRIX-MISSING-CAPS: 422レスポンスの missing_capabilities 内容検証（8ケース）", () => {
  it.each(MISSING_CAPS_CASES)(
    "%s → missing_capabilities に正しい Cap が含まれる",
    async (_label, cardCap, transfersCap) => {
      captured.accountCapabilities = { card_payments: cardCap, transfers: transfersCap };

      const res = await POST(makePayReq({
        qr_config_id: qrConfigId,
        product_id: productId,
        amount: 5_000,
        payment_method: "card",
      }));

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toBe("account_incomplete");
      expect(Array.isArray(data.missing_capabilities)).toBe(true);

      if (cardCap !== "active") {
        expect(data.missing_capabilities).toContain("card_payments");
      }
      if (transfersCap !== "active") {
        expect(data.missing_capabilities).toContain("transfers");
      }
    },
  );
});

// ── TC-PAY-NO-CONNECT: Connect 未設定オーガナイザー × 手段 = 5ケース ────

const NO_CONNECT_METHOD_CASES: Array<[string, number]> = [
  ["card", 200],      // Connect なし → on_behalf_of なし → Capability チェックなし → 200
  ["apple_pay", 200],
  ["google_pay", 200],
  ["link", 200],
  ["paypay", 200],
];

describe("TC-PAY-NO-CONNECT: Connect 未設定オーガナイザー（on_behalf_of なし）× 手段（5ケース）", () => {
  it.each(NO_CONNECT_METHOD_CASES)(
    "[%s] Connect なし → %i（Capability チェックをスキップ）",
    async (method, expectedStatus) => {
      // capabilities を bad に設定 → Connect なし QR なので capability チェック自体が走らない
      captured.accountCapabilities = { card_payments: "pending", transfers: "inactive" };

      const res = await POST(makePayReq({
        qr_config_id: noConnectQrConfigId,
        product_id: noConnectProductId,
        amount: 5_000,
        payment_method: method,
      }));

      // Connect なし → on_behalf_of なし → capability チェックスキップ → 200
      expect(res.status).toBe(expectedStatus);
    },
  );
});
