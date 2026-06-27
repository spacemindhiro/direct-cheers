/**
 * TC-IDEM: 冪等性・二重送信防止テスト
 *
 * 不安定な通信環境（リアルイベント会場）での二重課金・二重登録を防ぐ
 * 冪等性ロジックの網羅検証。
 *
 * カバレッジの柱:
 *   A. /api/pay/complete — 同一 session_id（PI id）の2回呼び出し
 *      → 既存 transaction_id が返り、新規トランザクションが作られない
 *   B. /api/pay/complete — 必須フィールド欠損・無効セッションのバリデーション
 *   C. /api/stripe/webhook — 同一 stripe_event_id の重複配信
 *      → 2回目は処理されず DB が増えない（TC-CB-01-冪等 の補強）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertTransaction,
  insertProduct,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

// pay/complete は createAdminClient() のみ使用（createClient の mock 不要）
// Stripe の checkout.sessions.retrieve をモックして特定の PI id を返す
const captured: {
  fakePiId: string;
  fakeSessionPaymentStatus: "paid" | "unpaid";
  fakePiStatus: "succeeded" | "requires_capture" | "requires_payment_method";
  fakeMetadata: Record<string, string>;
} = {
  fakePiId: "",
  fakeSessionPaymentStatus: "paid",
  fakePiStatus: "succeeded",
  fakeMetadata: {},
};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    // webhook 署名検証をバイパス（chargeback.test.ts と同じパターン）
    webhooks = {
      ...super.webhooks,
      constructEvent: (body: string, _sig: string, _secret: string) => JSON.parse(body),
    };

    constructor(...args: any[]) {
      super(...args);

      (this.checkout.sessions as any).retrieve = async (id: string, _opts?: any) => ({
        id,
        payment_status: captured.fakeSessionPaymentStatus,
        payment_intent: {
          id: captured.fakePiId,
          status: captured.fakePiStatus,
          latest_charge: null,
        },
        customer_email: "idem-test@test.local",
        customer: null,
        amount_total: 1000,
        payment_method_types: ["card"],
        metadata: captured.fakeMetadata,
      });
    }
  }
  return { ...StripeModule, default: InstrumentedStripe };
});

// webhook テスト用 — TC-CB と同様に署名検証をバイパス
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

import { POST as completePOST } from "@/app/api/pay/complete/route";
import { POST as webhookPOST } from "@/app/api/stripe/webhook/route";

let organizerProfileId: string;
let eventId: string;
let qrConfigId: string;
let cheersProductId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  productIds: [] as string[],
};

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "オーガナイザー（冪等テスト）",
    email: `organizer-idem-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId);

  eventId = await insertEvent({ organizerProfileId, title: "TC-IDEM テストイベント" });
  cleanup.eventIds.push(eventId);

  qrConfigId = await insertQrConfig({
    eventId,
    creatorProfileId: organizerProfileId,
    recipientProfileId: organizerProfileId,
  });
  cleanup.qrConfigIds.push(qrConfigId);

  cheersProductId = await insertProduct({ eventId, type: "standard", paymentType: "B", name: "TC-IDEM チアーズ" });
  cleanup.productIds.push(cheersProductId);
}, 30_000);

afterAll(async () => {
  if (cleanup.productIds.length) {
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  }
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-IDEM-A: pay/complete バリデーション ────────────────────────────────
describe("TC-IDEM-A: /api/pay/complete バリデーション", () => {
  it("TC-IDEM-A-01: session_id 欠損 → 400", async () => {
    const req = new Request("http://localhost/api/pay/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await completePOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/session_id/i);
  });

  it("TC-IDEM-A-02: payment_status=unpaid かつ PI.status=requires_payment_method → 400", async () => {
    captured.fakePiId = `pi_unpaid_${Date.now()}`;
    captured.fakeSessionPaymentStatus = "unpaid";
    captured.fakePiStatus = "requires_payment_method";

    const req = new Request("http://localhost/api/pay/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "cs_test_unpaid_mock" }),
    });
    const res = await completePOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/payment not completed/i);
  });
});

// ── TC-IDEM-B: pay/complete 二重呼び出し防止 ─────────────────────────────
describe("TC-IDEM-B: /api/pay/complete 二重呼び出し → 同一 transaction_id を返す", () => {
  it("TC-IDEM-B-01: 既存 PI の transaction が DB にある場合 → 新規作成せず既存 tx を返す", async () => {
    const fakePiId = `pi_idem_${Date.now()}`;
    captured.fakePiId = fakePiId;
    captured.fakeSessionPaymentStatus = "paid";
    captured.fakePiStatus = "succeeded";

    // 事前に同じ PI id でトランザクションを DB に挿入（1回目の決済が完了した状態）
    const existingTxId = await insertTransaction({
      qrConfigId,
      grossAmount: 1000,
      netAmount: 900,
      stripeFee: 40,
      platformFee: 100,
      stripePaymentIntentId: fakePiId,
    });
    cleanup.transactionIds.push(existingTxId);

    // 2回目の完了コールバック呼び出し（同一セッション）
    const req = new Request("http://localhost/api/pay/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "cs_test_idem_mock" }),
    });
    const res = await completePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    // 既存の transaction_id が返ること（新規作成されていない）
    expect(data.transaction_id).toBe(existingTxId);

    // DB に transaction が1件のみであること（二重作成されていない）
    const { count } = await testAdmin
      .from("transactions")
      .select("transaction_id", { count: "exact", head: true })
      .eq("stripe_payment_intent_id", fakePiId);
    expect(count).toBe(1);
  });

  it("TC-IDEM-B-02: requires_capture（manual capture PI）も冪等性が保証される", async () => {
    const fakePiId = `pi_idem_auth_${Date.now()}`;
    captured.fakePiId = fakePiId;
    captured.fakeSessionPaymentStatus = "unpaid"; // manual capture は unpaid のまま
    captured.fakePiStatus = "requires_capture";   // → isAuthorized = true で通過

    const existingTxId = await insertTransaction({
      qrConfigId,
      grossAmount: 2000,
      netAmount: 1700,
      stripeFee: 80,
      platformFee: 200,
      stripePaymentIntentId: fakePiId,
    });
    cleanup.transactionIds.push(existingTxId);

    const req = new Request("http://localhost/api/pay/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "cs_test_auth_mock" }),
    });
    const res = await completePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.transaction_id).toBe(existingTxId);
  });
});

// ── TC-IDEM-C: webhook 重複配信 ───────────────────────────────────────────
describe("TC-IDEM-C: Stripe webhook 重複配信 → 冪等性", () => {
  function buildWebhookRequest(event: object): Request {
    const body = JSON.stringify(event);
    return new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=1,v1=mock_signature",
      },
      body,
    });
  }

  it("TC-IDEM-C-01: 処理済みの stripe_event_id を再送信 → スキップ（DB 件数変化なし）", async () => {
    const stripeEventId = `evt_idem_dup_${Date.now()}`;

    // 1回目の処理済みとして webhook_processed_events に先行挿入（1回目の正常処理を模擬）
    await testAdmin.from("webhook_processed_events").insert({
      stripe_event_id: stripeEventId,
      event_type: "charge.dispute.created",
    });

    const { count: countBefore } = await testAdmin
      .from("webhook_processed_events")
      .select("id", { count: "exact", head: true })
      .eq("stripe_event_id", stripeEventId);
    expect(countBefore).toBe(1);

    // 2回目: 同一 event_id を webhook で送信 → スキップされるはず
    const duplicateEvent = {
      id: stripeEventId,
      type: "charge.dispute.created",
      data: {
        object: {
          id: `dp_skip_test_${Date.now()}`,
          object: "dispute",
          charge: "ch_skip_test",
          amount: 1000,
          currency: "jpy",
          status: "needs_response",
          reason: "fraudulent",
        },
      },
    };

    const res = await webhookPOST(buildWebhookRequest(duplicateEvent));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);

    // webhook_processed_events の件数は変わらない（2行目が追加されていない）
    const { count: countAfter } = await testAdmin
      .from("webhook_processed_events")
      .select("id", { count: "exact", head: true })
      .eq("stripe_event_id", stripeEventId);
    expect(countAfter).toBe(1);

    // クリーンアップ
    await testAdmin.from("webhook_processed_events").delete().eq("stripe_event_id", stripeEventId);
  });
});

// ── TC-IDEM-D: device_name の記録（子機モード端末識別） ────────────────────
describe("TC-IDEM-D: /api/pay/complete — device_name が transactions に記録される", () => {
  it("TC-IDEM-D-01: metadata.device_name が新規 transaction の device_name 列に保存される", async () => {
    const fakePiId = `pi_idem_device_${Date.now()}`;
    captured.fakePiId = fakePiId;
    captured.fakeSessionPaymentStatus = "paid";
    captured.fakePiStatus = "succeeded";
    captured.fakeMetadata = {
      product_id: cheersProductId,
      qr_config_id: qrConfigId,
      device_name: "DJ-01",
    };

    const req = new Request("http://localhost/api/pay/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "cs_test_device_mock" }),
    });
    const res = await completePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    cleanup.transactionIds.push(data.transaction_id);

    const { data: tx } = await testAdmin
      .from("transactions")
      .select("device_name")
      .eq("transaction_id", data.transaction_id)
      .single();
    expect(tx?.device_name).toBe("DJ-01");

    captured.fakeMetadata = {};
  });
});
