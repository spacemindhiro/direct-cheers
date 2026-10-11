/**
 * TC-ENT-MATRIX: 入場チケット システムの境界値・権限・在庫の全掛け算テスト
 *
 * test.each で以下を網羅:
 *   A. タイプA 5日前分岐の時間境界値 = 7ケース
 *   B. 在庫数×sold_count マトリクス = 10ケース
 *   C. チェックイン 認証×チケット状態 マトリクス = 9ケース
 *   D. チェックイン冪等性（同一コードを3回連打）= 3呼び出し
 *   E. 予約バリデーション入力マトリクス = 10ケース
 *   F. タイプB/C プロダクト種別テスト（タイプCは事前予約不可の確認含む）= 4ケース
 *   G. チェックインの連続失敗 = 5ケース
 * 計: 約65ケース
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertProduct,
  insertTicket,
  insertQrConfig,
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

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.customers as any).create = async (params: any) => ({
        id: `cus_entm_${Date.now()}`,
        email: params.email,
        object: "customer",
      });
      (this.setupIntents as any).create = async (params: any) => ({
        id: `seti_entm_${Date.now()}`,
        client_secret: `seti_entm_${Date.now()}_secret`,
        customer: params.customer,
        object: "setup_intent",
        status: "requires_payment_method",
      });
      (this.paymentIntents as any).create = async (params: any) => ({
        id: `pi_entm_${Date.now()}`,
        client_secret: `pi_entm_${Date.now()}_secret`,
        customer: params.customer,
        amount: params.amount,
        currency: params.currency,
        status: "requires_payment_method",
        capture_method: params.capture_method,
        object: "payment_intent",
      });
      (this.checkout.sessions as any).create = async (params: any) => ({
        _captured: (capturedSessionParams.push(params), true),
        id: `cs_entm_${Date.now()}`,
        url: `https://checkout.stripe.com/pay/cs_entm_mock`,
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

// ── 共有テストデータ ────────────────────────────────────────────────────────

let organizerProfileId: string;
let otherOrgProfileId: string;
let baseEventId: string;

// 時間境界値テスト用データ（beforeAll で生成）
const TIME_CASES = [
  { label: "6日1秒前", offsetMs: 6 * 86400_000 + 1_000, expectedIsAuth: false },
  // 5日境界の直上ケース: マージン1秒だとbeforeAllからテスト実行までの経過時間で
  // 境界を跨ぎis_authが反転する（負荷の高い全体実行で実際に発生した）。5分の余裕を持たせる。
  { label: "5日5分前", offsetMs: 5 * 86400_000 + 300_000, expectedIsAuth: false },
  // daysUntilEvent <= 5 の境界: ちょうど5日はテスト実行時間の経過で <5日 になるため is_auth=true
  { label: "5日ちょうど", offsetMs: 5 * 86400_000, expectedIsAuth: true },
  { label: "5日-1秒", offsetMs: 5 * 86400_000 - 1_000, expectedIsAuth: true },
  { label: "4日前", offsetMs: 4 * 86400_000, expectedIsAuth: true },
  { label: "3日前", offsetMs: 3 * 86400_000, expectedIsAuth: true },
  { label: "1日前", offsetMs: 86400_000, expectedIsAuth: true },
];
const timeCaseProductIds = new Map<string, string>(); // label → productId

// 在庫マトリクス用データ（beforeAll で生成）
const STOCK_CASES = [
  { stock: 1, sold: 0, expectedStatus: 200, expectedError: null as string | null },
  { stock: 1, sold: 1, expectedStatus: 409, expectedError: "SOLD_OUT" },
  { stock: 5, sold: 4, expectedStatus: 200, expectedError: null },
  { stock: 5, sold: 5, expectedStatus: 409, expectedError: "SOLD_OUT" },
  { stock: 100, sold: 0, expectedStatus: 200, expectedError: null },
  { stock: 100, sold: 99, expectedStatus: 200, expectedError: null },
  { stock: 100, sold: 100, expectedStatus: 409, expectedError: "SOLD_OUT" },
  { stock: 10, sold: 9, expectedStatus: 200, expectedError: null },
  { stock: 10, sold: 10, expectedStatus: 409, expectedError: "SOLD_OUT" },
  { stock: 50, sold: 50, expectedStatus: 409, expectedError: "SOLD_OUT" },
];
const stockCaseProductIds = new Map<number, string>(); // index → productId

// 認証×チケット状態マトリクス用データ（beforeAll で生成）
type AuthLabel = "own_organizer" | "other_organizer" | "no_auth";
// ルートはステータスチェック → 権限チェックの順に実行する（コメント参照）。
// そのため other_organizer × used/cancelled は、権限確認より先にステータス応答が返る。
// 未認証は user=null で最初に 401 が返るため、チケット状態に関わらず 401。
// 再入場仕様: used は 409 ではなく 200 (re_entry=true) で返す
// own_organizer は権限あり → 再入場通過
// other_organizer は権限チェックが先（usedでも権限確認が走る）→ 403
const AUTH_TICKET_CASES: Array<{ authLabel: AuthLabel; ticketStatus: "valid" | "used" | "cancelled"; expectedStatus: number }> = [
  { authLabel: "own_organizer", ticketStatus: "valid", expectedStatus: 200 },
  { authLabel: "own_organizer", ticketStatus: "used", expectedStatus: 200 },   // 再入場
  { authLabel: "own_organizer", ticketStatus: "cancelled", expectedStatus: 409 },
  { authLabel: "other_organizer", ticketStatus: "valid", expectedStatus: 403 },
  { authLabel: "other_organizer", ticketStatus: "used", expectedStatus: 403 }, // 権限なし
  { authLabel: "other_organizer", ticketStatus: "cancelled", expectedStatus: 409 },
  { authLabel: "no_auth", ticketStatus: "valid", expectedStatus: 401 },
  { authLabel: "no_auth", ticketStatus: "used", expectedStatus: 401 },
  { authLabel: "no_auth", ticketStatus: "cancelled", expectedStatus: 401 },
];
const authMatrixTicketCodes = new Map<number, string>(); // index → ticketCode
let authMatrixProductId = "";

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  productIds: [] as string[],
  ticketIds: [] as string[],
  provisionalEmails: [] as string[],
  qrConfigIds: [] as string[],
};

// Stripe Checkout セッション作成時のパラメータ（success_url 等の検証用）
const capturedSessionParams: any[] = [];

function reserveReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/entrance/reserve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function soldCount(productId: string): Promise<number> {
  const { data } = await testAdmin.from("products").select("sold_count").eq("product_id", productId).single();
  return (data as { sold_count: number }).sold_count;
}

// ── 認証ヘルパー ────────────────────────────────────────────────────────────

function mockOrganizerAuth() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: organizerProfileId } }, error: null }) },
    from: vi.fn((table: string) => testAdmin.from(table)),
  });
}
function mockOtherOrgAuth() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: otherOrgProfileId } }, error: null }) },
    from: vi.fn((table: string) => testAdmin.from(table)),
  });
}
function mockNoAuth() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    from: vi.fn((table: string) => testAdmin.from(table)),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "ENT-MATRIX オーガナイザー",
    email: `organizer-entmatrix-${ts}@test.local`,
  });
  otherOrgProfileId = await insertProfile({
    role: "organizer",
    displayName: "ENT-MATRIX 他オーガナイザー",
    email: `other-org-entmatrix-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId, otherOrgProfileId);

  baseEventId = await insertEvent({ organizerProfileId, title: "ENT-MATRIX ベースイベント" });
  cleanup.eventIds.push(baseEventId);

  // A. 時間境界値: 各 offset のイベントを作成
  await Promise.all(TIME_CASES.map(async ({ label, offsetMs }) => {
    const eventId = await insertEvent({ organizerProfileId, title: `ENT-TIME ${label}` });
    await testAdmin.from("events")
      .update({ start_at: new Date(Date.now() + offsetMs).toISOString() })
      .eq("event_id", eventId);
    const productId = await insertProduct({ eventId, paymentType: "A", minAmount: 3000 });
    timeCaseProductIds.set(label, productId);
    cleanup.eventIds.push(eventId);
    cleanup.productIds.push(productId);
  }));

  // B. 在庫マトリクス: 各 stock/sold 条件の商品を作成
  await Promise.all(STOCK_CASES.map(async ({ stock, sold }, idx) => {
    const productId = await insertProduct({
      eventId: baseEventId,
      paymentType: "B",
      stockLimit: stock,
      soldCount: sold,
      name: `在庫テスト[${idx}] stock=${stock} sold=${sold}`,
    });
    stockCaseProductIds.set(idx, productId);
    cleanup.productIds.push(productId);
  }));

  // C. 認証×チケット状態マトリクス: 1商品 + 9チケット
  authMatrixProductId = await insertProduct({ eventId: baseEventId, paymentType: "B" });
  cleanup.productIds.push(authMatrixProductId);

  await Promise.all(AUTH_TICKET_CASES.map(async ({ ticketStatus }, idx) => {
    const { ticketId, ticketCode } = await insertTicket({
      eventId: baseEventId,
      productId: authMatrixProductId,
      status: ticketStatus,
    });
    authMatrixTicketCodes.set(idx, ticketCode);
    cleanup.ticketIds.push(ticketId);
  }));
}, 60_000);

afterAll(async () => {
  if (cleanup.ticketIds.length) {
    await testAdmin.from("tickets").delete().in("ticket_id", cleanup.ticketIds);
  }
  if (cleanup.provisionalEmails.length) {
    await testAdmin.from("provisional_users").delete().in("email", cleanup.provisionalEmails);
  }
  if (cleanup.qrConfigIds.length) {
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  }
  if (cleanup.productIds.length) {
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  }
  await testAdmin.from("entrance_reservations").delete().in("event_id", cleanup.eventIds);
  await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await Promise.all(cleanup.profileIds.map((id) => testAdmin.auth.admin.deleteUser(id).catch(() => {})));
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-ENT-TIME: タイプA 5日境界値（7ケース） ────────────────────────────

describe("TC-ENT-TIME: タイプA 5日前境界値マトリクス（is_auth 切り替え検証）", () => {
  it.each(TIME_CASES.map((c) => [c.label, c.expectedIsAuth]))(
    "タイプA [%s] → is_auth=%s",
    async (label, expectedIsAuth) => {
      const productId = timeCaseProductIds.get(label as string)!;
      const email = `time-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
      cleanup.provisionalEmails.push(email);

      const req = new Request("http://localhost/api/entrance/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, customer_email: email }),
      });
      const res = await reservePOST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.type).toBe("A");
      expect(data.is_auth).toBe(expectedIsAuth);
      expect(data.client_secret).toBeTruthy();
      expect(data.reservation_id).toBeTruthy();
    },
  );
});

// ── TC-ENT-STOCK: 在庫マトリクス（10ケース） ─────────────────────────────

describe("TC-ENT-STOCK: 在庫数×sold_count マトリクス（stock/sold 境界値）", () => {
  it.each(STOCK_CASES.map((c, idx) => [idx, c.stock, c.sold, c.expectedStatus, c.expectedError]))(
    "在庫[%i] stock=%i, sold=%i → HTTP %i",
    async (idx, _stock, _sold, expectedStatus, expectedError) => {
      const productId = stockCaseProductIds.get(idx as number)!;
      const email = `stock-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
      if (expectedStatus === 200) cleanup.provisionalEmails.push(email);

      const req = new Request("http://localhost/api/entrance/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, customer_email: email }),
      });
      const res = await reservePOST(req);

      expect(res.status).toBe(expectedStatus);
      if (expectedError) {
        const data = await res.json();
        expect(data.error).toBe(expectedError);
      }
    },
  );
});

// ── TC-ENT-AUTH: 認証×チケット状態マトリクス（9ケース） ──────────────────

describe("TC-ENT-AUTH: チェックイン 認証×チケット状態 マトリクス", () => {
  it.each(AUTH_TICKET_CASES.map((c, idx) => [c.authLabel, c.ticketStatus, c.expectedStatus, idx]))(
    "[%s × %s] → HTTP %i",
    async (authLabel, _ticketStatus, expectedStatus, caseIdx) => {
      const ticketCode = authMatrixTicketCodes.get(caseIdx as number)!;

      if (authLabel === "own_organizer") mockOrganizerAuth();
      else if (authLabel === "other_organizer") mockOtherOrgAuth();
      else mockNoAuth();

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_code: ticketCode }),
      });
      const res = await checkinPOST(req);
      expect(res.status).toBe(expectedStatus);
    },
  );
});

// ── TC-ENT-IDEM: チェックイン冪等性（同一コードを3回連打） ──────────────

describe("TC-ENT-IDEM: チェックイン冪等性 — valid チケットを3回連打", () => {
  let idempotentTicketCode: string;

  beforeAll(async () => {
    const productId = await insertProduct({ eventId: baseEventId, paymentType: "B" });
    cleanup.productIds.push(productId);
    const { ticketId, ticketCode } = await insertTicket({
      eventId: baseEventId,
      productId,
      status: "valid",
    });
    cleanup.ticketIds.push(ticketId);
    idempotentTicketCode = ticketCode;
  });

  it("1回目: valid → 200 ok（used に遷移）", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: idempotentTicketCode }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("2回目: used → 200 re_entry=true（再入場仕様）", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: idempotentTicketCode }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.re_entry).toBe(true);
  });

  it("3回目: 依然 200 re_entry=true（冪等・何度でも再入場可）", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: idempotentTicketCode }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.re_entry).toBe(true);
  });
});

// ── TC-ENT-VALIDATE: 予約バリデーション入力マトリクス（10ケース） ──────────

const RESERVE_VALIDATION_CASES: Array<[string, object, number]> = [
  ["product_id 欠損", { customer_email: "test@test.local" }, 400],
  ["customer_email 欠損", { product_id: crypto.randomUUID() }, 400],
  ["両フィールド欠損", {}, 400],
  ["product_id が空文字", { product_id: "", customer_email: "x@x.x" }, 400],
  ["customer_email が空文字", { product_id: crypto.randomUUID(), customer_email: "" }, 400],
  ["存在しない product_id (UUID)", { product_id: crypto.randomUUID(), customer_email: "x@x.x" }, 404],
  ["product_id が 'undefined'", { product_id: "undefined", customer_email: "x@x.x" }, 404],
  ["product_id が null", { product_id: null, customer_email: "x@x.x" }, 400],
  ["customer_email が null", { product_id: crypto.randomUUID(), customer_email: null }, 400],
  ["両フィールドが null", { product_id: null, customer_email: null }, 400],
];

describe("TC-ENT-VALIDATE: 予約バリデーション入力マトリクス（10ケース）", () => {
  it.each(RESERVE_VALIDATION_CASES)(
    "%s → HTTP %i",
    async (_label, body, expectedStatus) => {
      const req = new Request("http://localhost/api/entrance/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const res = await reservePOST(req);
      expect(res.status).toBe(expectedStatus);
    },
  );
});

// ── TC-ENT-TYPE: タイプB/C プロダクト種別テスト（5ケース） ───────────────

describe("TC-ENT-TYPE: プロダクト種別（B/C）の予約パス分岐検証", () => {
  it("タイプB → Checkout Session URL が返る（type='B'）", async () => {
    const productId = await insertProduct({ eventId: baseEventId, paymentType: "B", name: "TYPE-B テスト" });
    cleanup.productIds.push(productId);

    const email = `type-b-${Date.now()}@test.local`;
    cleanup.provisionalEmails.push(email);
    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, customer_email: email }),
    });
    const res = await reservePOST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.type).toBe("B");
    expect(data.url).toMatch(/^https:\/\/checkout\.stripe\.com/);
  });

  it("タイプC → 事前予約は不可（400、当日決済専用）", async () => {
    const productId = await insertProduct({
      eventId: baseEventId,
      paymentType: "C",
      name: "TYPE-C テスト",
    });
    cleanup.productIds.push(productId);

    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, customer_email: `type-c-0@test.local` }),
    });
    const res = await reservePOST(req);
    expect(res.status).toBe(400);
  });

  it("タイプA（十分な余裕あり）→ SetupIntent パス（is_auth=false）", async () => {
    // デフォルト start_at は +1日 → 5日超 → SetupIntentパス
    const productId = await insertProduct({ eventId: baseEventId, paymentType: "A", minAmount: 2000 });
    cleanup.productIds.push(productId);

    // baseEventId の start_at を遠い未来に設定（14日後）
    const farEventId = await insertEvent({ organizerProfileId, title: "TYPE-A 14日前" });
    await testAdmin.from("events")
      .update({ start_at: new Date(Date.now() + 14 * 86400_000).toISOString() })
      .eq("event_id", farEventId);
    cleanup.eventIds.push(farEventId);

    const farProductId = await insertProduct({ eventId: farEventId, paymentType: "A", minAmount: 2000 });
    cleanup.productIds.push(farProductId);

    const email = `type-a-far-${Date.now()}@test.local`;
    cleanup.provisionalEmails.push(email);
    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: farProductId, customer_email: email }),
    });
    const res = await reservePOST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.type).toBe("A");
    expect(data.is_auth).toBe(false);
  });

  it("タイプB に qr_config_id あり → URL に qr_config_id が含まれる", async () => {
    const productId = await insertProduct({ eventId: baseEventId, paymentType: "B", name: "TYPE-B with QR" });
    cleanup.productIds.push(productId);
    const qrConfigId = await insertQrConfig({
      eventId: baseEventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId,
    });
    cleanup.qrConfigIds.push(qrConfigId);

    const email = `type-b-qr-${Date.now()}@test.local`;
    cleanup.provisionalEmails.push(email);
    const res = await reservePOST(reserveReq({ product_id: productId, customer_email: email, qr_config_id: qrConfigId }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.type).toBe("B");
    expect(data.url).toBe("https://checkout.stripe.com/pay/cs_entm_mock");
    const sent = capturedSessionParams[capturedSessionParams.length - 1];
    expect(sent.metadata.qr_config_id).toBe(qrConfigId);
    expect(sent.success_url).toBe(
      `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"}/c/${qrConfigId}/ticket?session_id={CHECKOUT_SESSION_ID}&product_id=${productId}`,
    );
  });

  // ── QRの関所（画面を通さずAPIを直接叩いた場合）──
  it("存在しないQR ID → 400・在庫は減らない", async () => {
    const productId = await insertProduct({ eventId: baseEventId, paymentType: "B", name: "TYPE-B fake QR" });
    cleanup.productIds.push(productId);
    const before = await soldCount(productId);
    const res = await reservePOST(reserveReq({ product_id: productId, customer_email: `fake-qr-${Date.now()}@test.local`, qr_config_id: "test-qr-config-id" }));
    expect(res.status).toBe(400);
    expect(await soldCount(productId)).toBe(before);
  });

  it("削除済みQR → 400・在庫は減らない", async () => {
    const productId = await insertProduct({ eventId: baseEventId, paymentType: "B", name: "TYPE-B deleted QR" });
    cleanup.productIds.push(productId);
    const qrConfigId = await insertQrConfig({
      eventId: baseEventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId,
    });
    cleanup.qrConfigIds.push(qrConfigId);
    await testAdmin.from("qr_configs").update({ deleted_at: new Date().toISOString() }).eq("qr_config_id", qrConfigId);
    const before = await soldCount(productId);

    const res = await reservePOST(reserveReq({ product_id: productId, customer_email: `deleted-qr-${Date.now()}@test.local`, qr_config_id: qrConfigId }));
    expect(res.status).toBe(400);
    expect(await soldCount(productId)).toBe(before);
  });

  it("別商品のQR → 400（安い商品のQRと組み合わせる攻撃）", async () => {
    const target = await insertProduct({ eventId: baseEventId, paymentType: "B", name: "TYPE-B target" });
    const other = await insertProduct({ eventId: baseEventId, paymentType: "B", name: "TYPE-B other" });
    cleanup.productIds.push(target, other);
    const otherQr = await insertQrConfig({
      eventId: baseEventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId: other,
    });
    cleanup.qrConfigIds.push(otherQr);

    const res = await reservePOST(reserveReq({ product_id: target, customer_email: `other-qr-${Date.now()}@test.local`, qr_config_id: otherQr }));
    expect(res.status).toBe(400);
  });
});

// ── TC-ENT-WINDOW: 前売り予約APIの販売期間・イベント状態の関所 ─────────────
describe("TC-ENT-WINDOW: 販売期間外・受付終了イベントは予約APIからも買えない（在庫も減らない）", () => {
  async function productWith(params: { salesStartAt?: Date; salesEndAt?: Date; lifecycle?: string; paymentType?: "A" | "B" }) {
    const evId = await insertEvent({ organizerProfileId, title: "ENT-WINDOW" });
    cleanup.eventIds.push(evId);
    if (params.lifecycle) await testAdmin.from("events").update({ lifecycle_status: params.lifecycle }).eq("event_id", evId);
    const prodId = await insertProduct({ eventId: evId, paymentType: params.paymentType ?? "B", name: "ENT-WINDOW" });
    cleanup.productIds.push(prodId);
    await testAdmin.from("products").update({
      sales_start_at: params.salesStartAt?.toISOString() ?? null,
      sales_end_at: params.salesEndAt?.toISOString() ?? null,
    }).eq("product_id", prodId);
    return prodId;
  }

  async function expectWindowRejected(prodId: string, reason: string) {
    const before = await soldCount(prodId);
    const email = `ent-window-${Date.now()}@test.local`;
    cleanup.provisionalEmails.push(email);
    const res = await reservePOST(reserveReq({ product_id: prodId, customer_email: email }));
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.reason).toBe(reason);
    expect(await soldCount(prodId)).toBe(before);
  }

  it("販売終了後のB → 409 after_sales", async () => {
    await expectWindowRejected(await productWith({ salesEndAt: new Date(Date.now() - 60_000) }), "after_sales");
  });

  it("販売開始前のA → 409 before_sales", async () => {
    await expectWindowRejected(await productWith({ paymentType: "A", salesStartAt: new Date(Date.now() + 3600_000) }), "before_sales");
  });

  it("中止イベント → 409 closed", async () => {
    await expectWindowRejected(await productWith({ lifecycle: "cancelled" }), "closed");
  });

  it("下書きイベント → 409 closed", async () => {
    await expectWindowRejected(await productWith({ lifecycle: "draft" }), "closed");
  });

  it("販売期間内のB → 200・仮押さえ1件（在庫数は支払い完了まで増えない）・支払い画面は30分で失効", async () => {
    const prodId = await productWith({ salesStartAt: new Date(Date.now() - 3600_000), salesEndAt: new Date(Date.now() + 3600_000) });
    const before = await soldCount(prodId);
    const email = `ent-window-ok-${Date.now()}@test.local`;
    cleanup.provisionalEmails.push(email);
    const startedAt = Math.floor(Date.now() / 1000);
    const res = await reservePOST(reserveReq({ product_id: prodId, customer_email: email }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe("B");
    expect(await soldCount(prodId)).toBe(before);

    const sent = capturedSessionParams[capturedSessionParams.length - 1];
    const { data: holds } = await testAdmin.from("stock_holds").select("hold_key, quantity").eq("product_id", prodId);
    expect(holds).toEqual([{ hold_key: sent.metadata.stock_hold_key, quantity: 1 }]);
    expect(sent.expires_at - startedAt).toBeGreaterThanOrEqual(30 * 60);
    expect(sent.expires_at - startedAt).toBeLessThanOrEqual(30 * 60 + 5);
  });
});

// ── TC-ENT-CHECKIN-FAIL: 失敗系チェックイン追加バリエーション（5ケース） ─

describe("TC-ENT-CHECKIN-FAIL: チェックイン失敗系バリエーション", () => {
  it("ticket_code 欠損 → 400", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(400);
  });

  it("存在しない ticket_code → 404 TICKET_NOT_FOUND", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: `nonexistent_${Date.now()}` }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("TICKET_NOT_FOUND");
  });

  it("空文字 ticket_code → 400 または 404", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: "" }),
    });
    const res = await checkinPOST(req);
    expect([400, 404]).toContain(res.status);
  });

  it("未認証で存在しないチケットコード → 401（認証エラー優先）", async () => {
    mockNoAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: `nonexistent_${Date.now()}` }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(401);
  });

  it("他オーガナイザーで存在しないチケットコード → 403 または 404", async () => {
    mockOtherOrgAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: `nonexistent_${Date.now()}` }),
    });
    const res = await checkinPOST(req);
    // 存在しないコードなので 404 TICKET_NOT_FOUND になる場合もある
    expect([403, 404]).toContain(res.status);
  });
});
