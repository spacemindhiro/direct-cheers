/**
 * TC-ENT: 入場チケットシステム統合テスト
 *
 * /api/entrance/reserve （予約作成）と
 * /api/entrance/checkin （チェックイン）の
 * 全ステータス遷移・エラーハンドリングを網羅する。
 *
 * カバレッジの柱:
 *   A. 予約バリデーション（必須フィールド欠損、存在しない商品、在庫切れ）
 *   B. タイプB予約（Checkout Session 作成）
 *   C. タイプA予約（SetupIntent 作成、5日以内は直接オーソリ）
 *   D. チェックイン正常系（有効チケット → status=used）
 *   E. チェックイン異常系（ALREADY_USED、TICKET_NOT_FOUND、TICKET_CANCELLED）
 *   F. チェックイン権限チェック（未認証、他イベントのオーガナイザー）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertProduct,
  insertTicket,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

// SetupIntent / Checkout Session / Customer を実Stripeに依存しないようモック
// PaymentIntent.create（≤5日前オーソリパス）もモック
vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);

      (this.customers as any).create = async (params: any) => ({
        id: `cus_ent_test_${Date.now()}`,
        email: params.email,
        object: "customer",
      });

      (this.setupIntents as any).create = async (params: any) => ({
        id: `seti_ent_test_${Date.now()}`,
        client_secret: `seti_ent_test_${Date.now()}_secret`,
        customer: params.customer,
        object: "setup_intent",
        status: "requires_payment_method",
      });

      (this.paymentIntents as any).create = async (params: any) => ({
        id: `pi_ent_test_${Date.now()}`,
        client_secret: `pi_ent_test_${Date.now()}_secret`,
        customer: params.customer,
        amount: params.amount,
        currency: params.currency,
        status: "requires_payment_method",
        capture_method: params.capture_method,
        object: "payment_intent",
      });

      const origSessionCreate = this.checkout.sessions.create.bind(this.checkout.sessions);
      (this.checkout.sessions as any).create = async (params: any) => ({
        id: `cs_ent_test_${Date.now()}`,
        url: `https://checkout.stripe.com/pay/cs_ent_test_mock`,
        payment_status: "unpaid",
        metadata: params.metadata,
        object: "checkout.session",
      });
    }
  }
  return { ...StripeModule, default: MockStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as reservePOST } from "@/app/api/entrance/reserve/route";
import { POST as checkinPOST } from "@/app/api/entrance/checkin/route";

let organizerProfileId: string;
let otherOrganizerProfileId: string;
let eventId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  productIds: [] as string[],
  ticketIds: [] as string[],
  reservationIds: [] as string[],
  provisionalEmails: [] as string[],
};

function mockOrganizerAuth() {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: organizerProfileId } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => testAdmin.from(table)),
  });
}

function mockOtherOrganizerAuth() {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: otherOrganizerProfileId } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => testAdmin.from(table)),
  });
}

function mockNoAuth() {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
    },
    from: vi.fn((table: string) => testAdmin.from(table)),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "オーガナイザー（入場テスト）",
    email: `organizer-ent-${ts}@test.local`,
  });
  otherOrganizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "他オーガナイザー",
    email: `other-org-ent-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId, otherOrganizerProfileId);

  eventId = await insertEvent({
    organizerProfileId,
    title: "TC-ENT テストイベント",
  });
  cleanup.eventIds.push(eventId);
}, 30_000);

afterAll(async () => {
  // tickets
  if (cleanup.ticketIds.length) {
    await testAdmin.from("tickets").delete().in("ticket_id", cleanup.ticketIds);
  }
  // reservations
  if (cleanup.reservationIds.length) {
    await testAdmin.from("entrance_reservations").delete().in("reservation_id", cleanup.reservationIds);
  }
  // products
  if (cleanup.productIds.length) {
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  }
  // provisional_users
  if (cleanup.provisionalEmails.length) {
    await testAdmin.from("provisional_users").delete().in("email", cleanup.provisionalEmails);
  }
  // events
  await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  // profiles
  await Promise.all(
    cleanup.profileIds.map((id) => testAdmin.auth.admin.deleteUser(id).catch(() => {}))
  );
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-ENT-A: 予約バリデーション ──────────────────────────────────────────
describe("TC-ENT-A: 予約バリデーション", () => {
  it("TC-ENT-A-01: product_id 欠損 → 400", async () => {
    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_email: "test@test.local" }),
    });
    const res = await reservePOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it("TC-ENT-A-02: customer_email 欠損 → 400", async () => {
    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: crypto.randomUUID() }),
    });
    const res = await reservePOST(req);
    expect(res.status).toBe(400);
  });

  it("TC-ENT-A-03: 存在しない product_id → 404", async () => {
    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: crypto.randomUUID(),
        customer_email: "test@test.local",
      }),
    });
    const res = await reservePOST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  it("TC-ENT-A-04: 在庫切れ（sold_count=stock_limit）→ 409 SOLD_OUT", async () => {
    const soldOutProductId = await insertProduct({
      eventId,
      paymentType: "B",
      stockLimit: 1,
      soldCount: 1,
    });
    cleanup.productIds.push(soldOutProductId);

    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: soldOutProductId,
        customer_email: "test@test.local",
      }),
    });
    const res = await reservePOST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("SOLD_OUT");
  });
});

// ── TC-ENT-B: タイプB予約（Checkout Session） ─────────────────────────────
describe("TC-ENT-B: タイプB予約", () => {
  it("TC-ENT-B-01: タイプB → Checkout Session URL が返る", async () => {
    const productId = await insertProduct({
      eventId,
      paymentType: "B",
      name: "前売りチケット（PayPay可）",
      minAmount: 2000,
    });
    cleanup.productIds.push(productId);

    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: productId,
        customer_email: "buyer-b@test.local",
        holder_name: "テスト太郎",
      }),
    });
    const res = await reservePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.type).toBe("B");
    expect(data.url).toMatch(/^https:\/\/checkout\.stripe\.com/);
  });
});

// ── TC-ENT-C: タイプA予約（SetupIntent / 5日前オーソリ） ──────────────────
describe("TC-ENT-C: タイプA予約", () => {
  it("TC-ENT-C-01: タイプA（開催まで14日）→ SetupIntent + reservation_id が返る", async () => {
    const productId = await insertProduct({
      eventId,
      paymentType: "A",
      name: "前売りチケット（タイプA）",
      minAmount: 5000,
    });
    cleanup.productIds.push(productId);

    // eventId の start_at はデフォルト+1日だが、テスト用に14日後のイベントを作る
    const farEventId = await insertEvent({
      organizerProfileId,
      title: "TC-ENT-C 遠い将来のイベント",
    });
    cleanup.eventIds.push(farEventId);
    // start_at を14日後に更新
    await testAdmin
      .from("events")
      .update({ start_at: new Date(Date.now() + 14 * 86400_000).toISOString() })
      .eq("event_id", farEventId);

    const farProductId = await insertProduct({
      eventId: farEventId,
      paymentType: "A",
      name: "前売りチケット（タイプA 遠い）",
      minAmount: 5000,
    });
    cleanup.productIds.push(farProductId);

    const email = `buyer-a-${Date.now()}@test.local`;
    cleanup.provisionalEmails.push(email);

    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: farProductId,
        customer_email: email,
        holder_name: "タイプAユーザー",
      }),
    });
    const res = await reservePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.type).toBe("A");
    expect(data.is_auth).toBe(false); // 5日以上前 → SetupIntentパス
    expect(data.client_secret).toBeTruthy();
    expect(data.reservation_id).toBeTruthy();

    // DB に reservation が作成されること
    const { data: reservation } = await testAdmin
      .from("entrance_reservations")
      .select("reservation_id, status, charge_amount")
      .eq("reservation_id", data.reservation_id)
      .single();
    expect(reservation?.status).toBe("pending");
    expect(reservation?.charge_amount).toBe(5000);
    cleanup.reservationIds.push(data.reservation_id);
  });

  it("TC-ENT-C-02: タイプA（開催まで3日）→ 直接オーソリ PI が返る（is_auth=true）", async () => {
    const nearEventId = await insertEvent({
      organizerProfileId,
      title: "TC-ENT-C 直前イベント",
    });
    cleanup.eventIds.push(nearEventId);
    // start_at を3日後に更新（5日以内 → 直接オーソリパス）
    await testAdmin
      .from("events")
      .update({ start_at: new Date(Date.now() + 3 * 86400_000).toISOString() })
      .eq("event_id", nearEventId);

    const nearProductId = await insertProduct({
      eventId: nearEventId,
      paymentType: "A",
      name: "前売りチケット（タイプA 直前）",
      minAmount: 4000,
    });
    cleanup.productIds.push(nearProductId);

    const email = `buyer-a-near-${Date.now()}@test.local`;
    cleanup.provisionalEmails.push(email);

    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: nearProductId,
        customer_email: email,
      }),
    });
    const res = await reservePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.type).toBe("A");
    expect(data.is_auth).toBe(true); // 5日以内 → 直接オーソリ
    expect(data.client_secret).toBeTruthy();
    expect(data.reservation_id).toBeTruthy();
    cleanup.reservationIds.push(data.reservation_id);
  });
});

// ── TC-ENT-D: チェックイン正常系 ──────────────────────────────────────────
describe("TC-ENT-D: チェックイン正常系", () => {
  it("TC-ENT-D-01: 有効チケット → 200 ok、チケット status が used に更新される", async () => {
    const productId = await insertProduct({
      eventId,
      paymentType: "B",
      name: "チェックインテスト用チケット",
    });
    cleanup.productIds.push(productId);

    const { ticketId, ticketCode } = await insertTicket({
      eventId,
      productId,
      status: "valid",
      email: "checkin-d01@test.local",
    });
    cleanup.ticketIds.push(ticketId);

    mockOrganizerAuth();
    const req = new Request("http://localhost/api/entrance/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: ticketCode }),
    });
    const res = await checkinPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.ticket_id).toBe(ticketId);

    // DB でステータスが変わっていること
    const { data: ticket } = await testAdmin
      .from("tickets")
      .select("status, checked_in_at")
      .eq("ticket_id", ticketId)
      .single();
    expect(ticket?.status).toBe("used");
    expect(ticket?.checked_in_at).not.toBeNull();
  });
});

// ── TC-ENT-E: チェックイン異常系 ──────────────────────────────────────────
describe("TC-ENT-E: チェックイン異常系", () => {
  it("TC-ENT-E-01: 使用済みチケット → 409 ALREADY_USED", async () => {
    const productId = await insertProduct({ eventId, paymentType: "B" });
    cleanup.productIds.push(productId);

    const { ticketId, ticketCode } = await insertTicket({
      eventId,
      productId,
      status: "used",
    });
    cleanup.ticketIds.push(ticketId);

    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: ticketCode }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("ALREADY_USED");
  });

  it("TC-ENT-E-02: キャンセル済みチケット → 409 TICKET_CANCELLED", async () => {
    const productId = await insertProduct({ eventId, paymentType: "B" });
    cleanup.productIds.push(productId);

    const { ticketId, ticketCode } = await insertTicket({
      eventId,
      productId,
      status: "cancelled",
    });
    cleanup.ticketIds.push(ticketId);

    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: ticketCode }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("TICKET_CANCELLED");
  });

  it("TC-ENT-E-03: 存在しないチケットコード → 404 TICKET_NOT_FOUND", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: "nonexistent_code_xyz_9999" }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("TICKET_NOT_FOUND");
  });

  it("TC-ENT-E-04: ticket_code 欠損 → 400", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(400);
  });
});

// ── TC-ENT-F: チェックイン権限チェック ────────────────────────────────────
describe("TC-ENT-F: チェックイン権限チェック", () => {
  it("TC-ENT-F-01: 未認証 → 401", async () => {
    mockNoAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: "any_code" }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(401);
  });

  it("TC-ENT-F-02: 別イベントのオーガナイザー → 403 Forbidden", async () => {
    const productId = await insertProduct({ eventId, paymentType: "B" });
    cleanup.productIds.push(productId);

    const { ticketId, ticketCode } = await insertTicket({
      eventId,
      productId,
      status: "valid",
    });
    cleanup.ticketIds.push(ticketId);

    // 別のオーガナイザーとしてログイン（このイベントの権限なし）
    mockOtherOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: ticketCode }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/forbidden/i);
  });
});
