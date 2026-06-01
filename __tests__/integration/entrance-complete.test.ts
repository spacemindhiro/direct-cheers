/**
 * TC-ENT-COMPLETE: /api/entrance/complete の統合テスト
 *
 * 入場チケット購入の「最後のマイル」。フロントがカード入力を完了した後に
 * 呼ばれ、チケットを発行する中核ルート（276行、3ハンドラ）。
 * 全経路が完全未テストだったため、ここで網羅する。
 *
 * カバレッジ:
 *   A. タイプB（Checkout Session 完了）— handleTypeB
 *   B. タイプA 5日以内（PaymentIntent オーソリ完了）— handleTypeAAuth
 *   C. タイプA/C（SetupIntent 完了）— メインルート
 *   D. 入力バリデーション・エラー系
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertProduct,
  insertReservation,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

// ── Stripe モック ────────────────────────────────────────────────────────────
const mockStripe: {
  sessionStatus: "paid" | "unpaid";
  sessionPiId: string;
  piStatus: "requires_capture" | "succeeded" | "canceled";
  setupPmId: string | null;
} = {
  sessionStatus: "paid",
  sessionPiId: "",
  piStatus: "requires_capture",
  setupPmId: "pm_mock_test_visa",
};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);

      (this.checkout.sessions as any).retrieve = async (id: string) => {
        if (id === "cs_invalid_session") throw new Error("No such checkout.session");
        return {
          id,
          payment_status: mockStripe.sessionStatus,
          payment_intent: mockStripe.sessionPiId,
          customer_email: "buyer@test.local",
          customer: "cus_mock_test",
          amount_total: 3000,
          metadata: {
            product_id: _currentProductId,
            event_id: _currentEventId,
            holder_name: "テスト太郎",
          },
        };
      };

      (this.paymentIntents as any).retrieve = async (id: string) => ({
        id,
        status: mockStripe.piStatus,
        amount: 5000,
        currency: "jpy",
      });

      (this.setupIntents as any).retrieve = async (id: string) => ({
        id,
        payment_method: mockStripe.setupPmId,
        status: "succeeded",
      });

      (this.paymentMethods as any).attach = async (pmId: string, params: any) => ({
        id: pmId,
        customer: params.customer,
        object: "payment_method",
      });
    }
  }
  return { ...StripeModule, default: MockStripe };
});

// Stripe モックが product_id / event_id を返せるよう共有変数を使う
let _currentProductId = "";
let _currentEventId = "";

import { POST as completePOST } from "@/app/api/entrance/complete/route";

let organizerProfileId: string;
let eventId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  productIds: [] as string[],
  reservationIds: [] as string[],
  ticketIds: [] as string[],
  transactionIds: [] as string[],
};

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "オーガナイザー（complete テスト）",
    email: `org-complete-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId);

  eventId = await insertEvent({ organizerProfileId, title: "TC-ENT-COMPLETE テストイベント" });
  cleanup.eventIds.push(eventId);
  _currentEventId = eventId;
}, 30_000);

afterAll(async () => {
  if (cleanup.ticketIds.length)
    await testAdmin.from("tickets").delete().in("ticket_id", cleanup.ticketIds);
  if (cleanup.transactionIds.length)
    await testAdmin.from("transactions").delete().in("transaction_id", cleanup.transactionIds);
  if (cleanup.reservationIds.length)
    await testAdmin.from("entrance_reservations").delete().in("reservation_id", cleanup.reservationIds);
  if (cleanup.productIds.length)
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-ENT-COMPLETE-A: タイプB（Checkout Session 完了） ──────────────────────
describe("TC-ENT-COMPLETE-A: タイプB — Checkout Session 完了でチケット発行", () => {
  let productId: string;
  let fakePiId: string;

  beforeAll(async () => {
    productId = await insertProduct({ eventId, paymentType: "B", name: "TypeB完了テスト券", minAmount: 3000 });
    cleanup.productIds.push(productId);
    _currentProductId = productId;
    fakePiId = `pi_typeb_${Date.now()}`;
    mockStripe.sessionStatus = "paid";
    mockStripe.sessionPiId = fakePiId;
  });

  it("TC-ENT-COMPLETE-A-01: paid セッション → ok=true、ticket_id / ticket_code が返る", async () => {
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "cs_typeb_test_001" }),
    });
    const res = await completePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.ticket_id).toBeTruthy();
    expect(data.ticket_code).toBeTruthy();

    // DB にチケットが作成されていること
    const { data: ticket } = await testAdmin
      .from("tickets")
      .select("ticket_id, status")
      .eq("ticket_id", data.ticket_id)
      .single();
    expect(ticket?.status).toBe("valid");
    cleanup.ticketIds.push(data.ticket_id);

    // DB にトランザクションが作成されていること
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("transaction_id, total_gross_amount")
      .eq("stripe_payment_intent_id", fakePiId)
      .maybeSingle();
    expect(tx).not.toBeNull();
    expect(tx?.total_gross_amount).toBe(3000);
    if (tx) cleanup.transactionIds.push(tx.transaction_id);
  });

  it("TC-ENT-COMPLETE-A-02: 同一セッション2回目 → 冪等性で既存チケットを返す（新規作成なし）", async () => {
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "cs_typeb_test_001" }),
    });
    const res = await completePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    // チケット件数が1件のまま（二重発行なし）
    const { count } = await testAdmin
      .from("tickets")
      .select("ticket_id", { count: "exact", head: true })
      .eq("ticket_id", data.ticket_id);
    expect(count).toBe(1);
  });

  it("TC-ENT-COMPLETE-A-03: payment_status=unpaid セッション → 400 Payment not completed", async () => {
    mockStripe.sessionStatus = "unpaid";
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "cs_unpaid_test" }),
    });
    const res = await completePOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/payment not completed/i);
    mockStripe.sessionStatus = "paid"; // reset
  });

  it("TC-ENT-COMPLETE-A-04: 無効なセッションID → 400 Invalid session", async () => {
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "cs_invalid_session" }),
    });
    const res = await completePOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalid session/i);
  });
});

// ── TC-ENT-COMPLETE-B: タイプA 5日以内（PaymentIntent オーソリ完了） ──────────
describe("TC-ENT-COMPLETE-B: タイプA auth — PaymentIntent オーソリ完了でチケット発行", () => {
  let productId: string;
  let reservationId: string;
  let fakePiId: string;

  beforeAll(async () => {
    productId = await insertProduct({ eventId, paymentType: "A", name: "TypeA直前テスト券", minAmount: 5000 });
    cleanup.productIds.push(productId);

    fakePiId = `pi_typea_auth_${Date.now()}`;
    mockStripe.piStatus = "requires_capture";

    reservationId = await insertReservation({
      productId,
      eventId,
      stripeCustomerId: `cus_typea_${Date.now()}`,
      stripePaymentIntentId: fakePiId,
      chargeAmount: 5000,
      status: "pending",
    });
    cleanup.reservationIds.push(reservationId);
  });

  it("TC-ENT-COMPLETE-B-01: requires_capture PI + pending reservation → ok=true、チケット発行", async () => {
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_intent_id: fakePiId, reservation_id: reservationId }),
    });
    const res = await completePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.ticket_id).toBeTruthy();
    expect(data.payment_type).toBe("A");
    cleanup.ticketIds.push(data.ticket_id);

    // reservation が charged に更新されていること（TypeA auth は課金完了のため）
    const { data: rsv } = await testAdmin
      .from("entrance_reservations")
      .select("status")
      .eq("reservation_id", reservationId)
      .single();
    expect(rsv?.status).toBe("charged");

    // transaction が作成されていること
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("transaction_id")
      .eq("stripe_payment_intent_id", fakePiId)
      .maybeSingle();
    expect(tx).not.toBeNull();
    if (tx) cleanup.transactionIds.push(tx.transaction_id);
  });

  it("TC-ENT-COMPLETE-B-02: 処理済み reservation → 409 Already processed", async () => {
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_intent_id: fakePiId, reservation_id: reservationId }),
    });
    const res = await completePOST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/already processed/i);
  });

  it("TC-ENT-COMPLETE-B-03: 存在しない reservation_id → 404", async () => {
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_intent_id: `pi_fake_${Date.now()}`, reservation_id: crypto.randomUUID() }),
    });
    const res = await completePOST(req);
    expect(res.status).toBe(404);
  });

  it("TC-ENT-COMPLETE-B-04: PI が requires_capture でない → 400", async () => {
    mockStripe.piStatus = "succeeded"; // requires_capture でない
    const fakePi2 = `pi_typea_wrong_${Date.now()}`;
    const rsv2 = await insertReservation({
      productId,
      eventId,
      stripeCustomerId: `cus_typea2_${Date.now()}`,
      stripePaymentIntentId: fakePi2,
      chargeAmount: 5000,
      status: "pending",
    });
    cleanup.reservationIds.push(rsv2);

    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_intent_id: fakePi2, reservation_id: rsv2 }),
    });
    const res = await completePOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/unexpected paymentintent status/i);
    mockStripe.piStatus = "requires_capture"; // reset
  });
});

// ── TC-ENT-COMPLETE-C: タイプA/C SetupIntent 完了 ────────────────────────────
describe("TC-ENT-COMPLETE-C: タイプA/C SetupIntent 完了経路", () => {
  let productAId: string;
  let productCId: string;
  let reservationAId: string;
  let reservationCId: string;

  beforeAll(async () => {
    productAId = await insertProduct({ eventId, paymentType: "A", name: "TypeA SetupIntentテスト券" });
    productCId = await insertProduct({ eventId, paymentType: "C", name: "TypeC SetupIntentテスト券" });
    cleanup.productIds.push(productAId, productCId);

    reservationAId = await insertReservation({
      productId: productAId,
      eventId,
      stripeCustomerId: `cus_typea_si_${Date.now()}`,
      stripeSetupIntentId: `seti_typea_${Date.now()}`,
      chargeAmount: 4000,
      status: "pending",
    });
    reservationCId = await insertReservation({
      productId: productCId,
      eventId,
      stripeCustomerId: `cus_typec_si_${Date.now()}`,
      stripeSetupIntentId: `seti_typec_${Date.now()}`,
      chargeAmount: 3000,
      status: "pending",
    });
    cleanup.reservationIds.push(reservationAId, reservationCId);

    mockStripe.setupPmId = "pm_mock_visa_001";
  });

  it("TC-ENT-COMPLETE-C-01: タイプA + payment_method_id → reservation=reserved、ticket発行", async () => {
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationAId, payment_method_id: "pm_mock_visa_001" }),
    });
    const res = await completePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.ticket_id).toBeTruthy();
    expect(data.payment_type).toBe("A");
    cleanup.ticketIds.push(data.ticket_id);

    const { data: rsv } = await testAdmin
      .from("entrance_reservations")
      .select("status, stripe_payment_method_id")
      .eq("reservation_id", reservationAId)
      .single();
    expect(rsv?.status).toBe("reserved");
    expect(rsv?.stripe_payment_method_id).toBe("pm_mock_visa_001");
  });

  it("TC-ENT-COMPLETE-C-02: タイプC + payment_method_id → ticket発行（RPC経由）", async () => {
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationCId, payment_method_id: "pm_mock_visa_002" }),
    });
    const res = await completePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.ticket_id).toBeTruthy();
    expect(data.payment_type).toBe("C");
    cleanup.ticketIds.push(data.ticket_id);
  });

  it("TC-ENT-COMPLETE-C-03: 処理済み reservation → 409 Already processed", async () => {
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationAId, payment_method_id: "pm_mock_visa_001" }),
    });
    const res = await completePOST(req);
    expect(res.status).toBe(409);
  });

  it("TC-ENT-COMPLETE-C-04: PaymentMethod が見つからない（setupIntents が null を返す）→ 400", async () => {
    mockStripe.setupPmId = null; // setupIntents.retrieve が null pm を返す
    const rsv3 = await insertReservation({
      productId: productAId,
      eventId,
      stripeCustomerId: `cus_noPm_${Date.now()}`,
      stripeSetupIntentId: `seti_noPm_${Date.now()}`,
      chargeAmount: 4000,
      status: "pending",
    });
    cleanup.reservationIds.push(rsv3);

    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: rsv3 }),
    });
    const res = await completePOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/payment method not found/i);
    mockStripe.setupPmId = "pm_mock_test_visa"; // reset
  });
});

// ── TC-ENT-COMPLETE-D: 入力バリデーション ──────────────────────────────────
describe("TC-ENT-COMPLETE-D: 入力バリデーション", () => {
  it("TC-ENT-COMPLETE-D-01: 全フィールド欠損 → 400 Missing reservation_id", async () => {
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await completePOST(req);
    expect(res.status).toBe(400);
  });

  it("TC-ENT-COMPLETE-D-02: 存在しない reservation_id → 404 Reservation not found", async () => {
    const req = new Request("http://localhost/api/entrance/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: crypto.randomUUID() }),
    });
    const res = await completePOST(req);
    expect(res.status).toBe(404);
  });
});
