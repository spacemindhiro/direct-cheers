/**
 * TC-TYPEA: タイプA多段決済の全業務パターンテスト
 *
 * このシステムの最重要ポイント。
 * 「カード登録 → 日次確認 → 5日前オーソリ → エラー時サスペンド → リカバリ」
 * の全ルートを機械的に保証する。
 *
 * 業務パターン:
 *   A. cron/entrance-auth — 5日前自動オーソリ
 *   B. cron/entrance-card-check — 日次カード状態確認
 *   C. update-card リカバリ — 5日分岐・状態ガード
 *   D. complete — suspended チケット復活
 *   E. checkin — suspended チケットのスキャン拒否
 *   F. 一気通貫 — 予約→カード確認失敗→suspended→リカバリ→復活
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile, deleteAuthUsers, insertEvent,
  insertProduct, insertTicket, insertReservation, insertQrConfig, insertTransaction,
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

// ── Stripe モック制御 ────────────────────────────────────────────────────────
const mockStripe = {
  retrieveResult: "ok" as "ok" | "expired" | "error",
  authResult: "ok" as "ok" | "fail",
  cancelledPiIds: [] as string[],
};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);

      // PM retrieve：ok / expired / error を切り替え
      (this.paymentMethods as any).retrieve = async (_id: string) => {
        if (mockStripe.retrieveResult === "error") {
          throw Object.assign(new Error("No such PaymentMethod"), { type: "StripeInvalidRequestError" });
        }
        const now = new Date();
        const isExpired = mockStripe.retrieveResult === "expired";
        return {
          id: _id,
          object: "payment_method",
          card: {
            last4: "4242",
            brand: "visa",
            exp_month: isExpired ? now.getMonth() : now.getMonth() + 1,
            exp_year:  isExpired ? now.getFullYear() - 1 : now.getFullYear() + 1,
          },
        };
      };

      // PI create + confirm（off_session オーソリ）
      (this.paymentIntents as any).create = async (params: any) => {
        if (mockStripe.authResult === "fail") {
          throw Object.assign(new Error("Your card was declined."), {
            type: "StripeCardError",
            decline_code: "insufficient_funds",
          });
        }
        return {
          id: `pi_typea_mock_${Date.now()}`,
          status: "requires_capture",
          amount: params.amount,
          currency: "jpy",
          capture_method: "manual",
          object: "payment_intent",
          client_secret: `pi_typea_mock_secret_${Date.now()}`,
        };
      };

      // PI retrieve（complete の5日以内パスから呼ばれる）：カード入力でオーソリ済みの状態を返す
      (this.paymentIntents as any).retrieve = async (id: string) => ({
        id, status: "requires_capture", object: "payment_intent",
      });

      // PI cancel（update-card の再試行時に前回の PI を取り消す）
      (this.paymentIntents as any).cancel = async (id: string) => {
        mockStripe.cancelledPiIds.push(id);
        return { id, status: "canceled", object: "payment_intent" };
      };

      // Setup Intent create（update-card）
      (this.setupIntents as any).create = async (params: any) => ({
        id: `seti_mock_${Date.now()}`,
        client_secret: `seti_mock_secret_${Date.now()}`,
        customer: params.customer,
        object: "setup_intent",
      });

      // PM attach（complete から呼ばれる）
      (this.paymentMethods as any).attach = async (id: string, params: any) => ({
        id, customer: params.customer, object: "payment_method",
      });

      // Setup Intent retrieve（complete から呼ばれる）
      (this.setupIntents as any).retrieve = async (id: string) => ({
        id, payment_method: "pm_mock_visa", status: "succeeded",
      });
    }
  }
  return { ...StripeModule, default: MockStripe };
});

import { createClient } from "@/lib/supabase/server";
import { GET as cronAuthGET } from "@/app/api/cron/entrance-auth/route";
import { GET as cronCardCheckGET } from "@/app/api/cron/entrance-card-check/route";
import { POST as updateCardPOST } from "@/app/api/entrance/update-card/route";
import { POST as completePOST } from "@/app/api/entrance/complete/route";
import { POST as checkinPOST } from "@/app/api/entrance/checkin/route";
import { POST as cardUpdateLinkPOST } from "@/app/api/entrance/reservations/[reservationId]/card-update-link/route";

const CRON_SECRET = process.env.CRON_SECRET ?? "test_cron_secret";
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

let organizerProfileId: string;
let productId: string;
let eventId5days: string;    // 5日後のイベント（オーソリ対象）
let eventIdFar: string;      // 14日後のイベント（まだオーソリ対象外）
let eventIdPast: string;     // 過去のイベント（スキップ）

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  productIds: [] as string[],
  reservationIds: [] as string[],
  ticketIds: [] as string[],
  transactionIds: [] as string[],
};

function mockOrganizerAuth() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: organizerProfileId } }, error: null }) },
    from: vi.fn((t: string) => testAdmin.from(t)),
  });
}

function cronReq(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

/** テスト用予約+チケットをセットアップして IDs を返す */
async function setupReservation(params: {
  eventId: string;
  status?: "pending" | "reserved" | "charged" | "card_error";
  ticketStatus?: "valid" | "suspended" | "cancelled";
  stripePaymentMethodId?: string;
  stripePaymentIntentId?: string | null;
}): Promise<{ reservationId: string; ticketId: string }> {
  const qrConfigId = await insertQrConfig({
    eventId: params.eventId,
    creatorProfileId: organizerProfileId,
    recipientProfileId: organizerProfileId,
  });
  cleanup.transactionIds; // dummy reference
  cleanup.reservationIds.push(qrConfigId); // track for cleanup

  const reservationId = await insertReservation({
    productId,
    eventId: params.eventId,
    stripeCustomerId: `cus_ta_${Date.now()}`,
    stripePaymentMethodId: params.stripePaymentMethodId ?? "pm_mock_card_001",
    stripePaymentIntentId: params.stripePaymentIntentId ?? null,
    chargeAmount: 5000,
    status: params.status ?? "reserved",
    email: `ta-test-${Date.now()}@test.local`,
  });
  cleanup.reservationIds.push(reservationId);

  const { ticketId } = await insertTicket({
    eventId: params.eventId,
    productId,
    status: params.ticketStatus ?? "valid",
    reservationId,
  });
  cleanup.ticketIds.push(ticketId);

  return { reservationId, ticketId };
}

/** カード無効メールのリンクと同じトークンを予約に発行して返す */
async function issueToken(reservationId: string): Promise<string> {
  const token = crypto.randomUUID();
  await testAdmin.from("entrance_reservations")
    .update({ card_update_token: token, card_update_token_issued_at: new Date().toISOString() })
    .eq("reservation_id", reservationId);
  return token;
}

function updateCardReq(body: Record<string, unknown>) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readCardUpdateToken(reservationId: string) {
  const { data } = await testAdmin.from("entrance_reservations")
    .select("status, card_update_token, card_update_token_issued_at")
    .eq("reservation_id", reservationId).single();
  return data as { status: string; card_update_token: string | null; card_update_token_issued_at: string | null };
}

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET;

  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer", displayName: "org-typeA", email: `org-typeA-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId);

  // 5日後イベント（オーソリ対象）
  eventId5days = await insertEvent({ organizerProfileId, title: "TypeA テスト 5日後" });
  await testAdmin.from("events")
    .update({ start_at: new Date(Date.now() + 5 * 86400_000).toISOString() })
    .eq("event_id", eventId5days);

  // 14日後イベント（まだオーソリ対象外）
  eventIdFar = await insertEvent({ organizerProfileId, title: "TypeA テスト 14日後" });
  await testAdmin.from("events")
    .update({ start_at: new Date(Date.now() + 14 * 86400_000).toISOString() })
    .eq("event_id", eventIdFar);

  // 過去イベント（スキップ対象）
  eventIdPast = await insertEvent({ organizerProfileId, title: "TypeA テスト 過去" });
  await testAdmin.from("events")
    .update({
      start_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
      lifecycle_status: "settled",
    })
    .eq("event_id", eventIdPast);

  cleanup.eventIds.push(eventId5days, eventIdFar, eventIdPast);

  productId = await insertProduct({
    eventId: eventId5days,
    paymentType: "A",
    name: "TypeA テストチケット",
    minAmount: 5000,
  });
  cleanup.productIds.push(productId);

  mockStripe.retrieveResult = "ok";
  mockStripe.authResult = "ok";
}, 30_000);

afterAll(async () => {
  process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  if (cleanup.ticketIds.length)
    await testAdmin.from("tickets").delete().in("ticket_id", cleanup.ticketIds);
  if (cleanup.reservationIds.length)
    await testAdmin.from("entrance_reservations").delete().in("reservation_id", cleanup.reservationIds);
  if (cleanup.productIds.length)
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  if (cleanup.eventIds.length)
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── A. cron/entrance-auth ────────────────────────────────────────────────────
describe("TC-TYPEA-A: cron/entrance-auth — 5日前自動オーソリ", () => {
  it("A-01: 認証なし → 401", async () => {
    const res = await cronAuthGET(new Request("http://localhost/api/cron/entrance-auth"));
    expect(res.status).toBe(401);
  });

  it("A-02: 5日後イベント・reserved予約 → オーソリ成功 → reservation=charged・transaction作成", async () => {
    mockStripe.authResult = "ok";
    const { reservationId, ticketId } = await setupReservation({ eventId: eventId5days });

    const res = await cronAuthGET(cronReq("/api/cron/entrance-auth"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.succeeded).toBeGreaterThanOrEqual(1);

    const { data: rsv } = await testAdmin.from("entrance_reservations")
      .select("status, transaction_id")
      .eq("reservation_id", reservationId).single();
    expect(rsv?.status).toBe("charged");

    // ticket は valid のまま
    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("valid");

    // transaction が作成されている（RPC は reservation.transaction_id にセットする）
    expect(rsv?.transaction_id).toBeTruthy();
  }, 30_000);

  it("A-03: オーソリ失敗 → ticket=suspended・reservation=card_error", async () => {
    mockStripe.authResult = "fail";
    const { reservationId, ticketId } = await setupReservation({ eventId: eventId5days });

    const res = await cronAuthGET(cronReq("/api/cron/entrance-auth"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.failed).toBeGreaterThanOrEqual(1);

    const { data: rsv } = await testAdmin.from("entrance_reservations")
      .select("status, card_error_message")
      .eq("reservation_id", reservationId).single();
    expect(rsv?.status).toBe("card_error");
    expect(rsv?.card_error_message).toBeTruthy();

    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("suspended");

    // カード無効メールのリンク用トークンが発行されている
    const issued = await readCardUpdateToken(reservationId);
    expect(issued.card_update_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(issued.card_update_token_issued_at).not.toBeNull();

    mockStripe.authResult = "ok"; // reset
  }, 30_000);

  it("A-04: 14日後イベント（対象外）→ オーソリされない（reservedのまま）", async () => {
    const { reservationId } = await setupReservation({ eventId: eventIdFar });

    await cronAuthGET(cronReq("/api/cron/entrance-auth"));

    const { data: rsv } = await testAdmin.from("entrance_reservations")
      .select("status").eq("reservation_id", reservationId).single();
    // 14日後なので対象外 → reserved のまま
    expect(rsv?.status).toBe("reserved");
  }, 30_000);

  it("A-05: 既にcharged予約 → 再度オーソリされない（冪等）", async () => {
    const { reservationId } = await setupReservation({
      eventId: eventId5days,
      status: "charged",
      stripePaymentIntentId: `pi_already_charged_${Date.now()}`,
    });

    const beforeRes = await cronAuthGET(cronReq("/api/cron/entrance-auth"));
    const data = await beforeRes.json();

    const { data: rsv } = await testAdmin.from("entrance_reservations")
      .select("status").eq("reservation_id", reservationId).single();
    expect(rsv?.status).toBe("charged"); // 変化なし
  }, 30_000);
});

// ── B. cron/entrance-card-check ──────────────────────────────────────────────
describe("TC-TYPEA-B: cron/entrance-card-check — 日次カード状態確認", () => {
  it("B-01: 認証なし → 401", async () => {
    const res = await cronCardCheckGET(new Request("http://localhost/api/cron/entrance-card-check"));
    expect(res.status).toBe(401);
  });

  it("B-02: PM retrieve失敗（削除/VAU-ABUネガティブ更新）→ suspended + card_error", async () => {
    mockStripe.retrieveResult = "error";
    const { reservationId, ticketId } = await setupReservation({ eventId: eventIdFar });

    const res = await cronCardCheckGET(cronReq("/api/cron/entrance-card-check"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.suspended).toBeGreaterThanOrEqual(1);

    const { data: rsv } = await testAdmin.from("entrance_reservations")
      .select("status").eq("reservation_id", reservationId).single();
    expect(rsv?.status).toBe("card_error");

    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("suspended");

    // カード無効メールのリンク用トークンが発行されている
    const issued = await readCardUpdateToken(reservationId);
    expect(issued.card_update_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(issued.card_update_token_issued_at).not.toBeNull();

    mockStripe.retrieveResult = "ok";
  }, 30_000);

  it("B-03: PM有効期限切れ → suspended + card_error", async () => {
    mockStripe.retrieveResult = "expired";
    const { reservationId, ticketId } = await setupReservation({ eventId: eventIdFar });

    await cronCardCheckGET(cronReq("/api/cron/entrance-card-check"));

    const { data: rsv } = await testAdmin.from("entrance_reservations")
      .select("status").eq("reservation_id", reservationId).single();
    expect(rsv?.status).toBe("card_error");

    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("suspended");

    mockStripe.retrieveResult = "ok";
  }, 30_000);

  it("B-04: PM正常 → 変化なし（reserved のまま）", async () => {
    mockStripe.retrieveResult = "ok";
    const { reservationId, ticketId } = await setupReservation({ eventId: eventIdFar });

    await cronCardCheckGET(cronReq("/api/cron/entrance-card-check"));

    const { data: rsv } = await testAdmin.from("entrance_reservations")
      .select("status").eq("reservation_id", reservationId).single();
    expect(rsv?.status).toBe("reserved");

    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("valid");
  }, 30_000);

  it("B-05: 終了済みイベント → スキップ（settled イベントは対象外）", async () => {
    const { ticketId } = await setupReservation({
      eventId: eventIdPast,
      status: "reserved",
    });

    await cronCardCheckGET(cronReq("/api/cron/entrance-card-check"));

    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("valid"); // 変化なし
  }, 30_000);
});

// ── C. update-card リカバリ ───────────────────────────────────────────────────
describe("TC-TYPEA-C: update-card — リカバリ時の5日分岐・状態ガード", () => {
  it("C-01: card_error + 5日以内 → is_auth=true（PI直接オーソリ）", async () => {
    const { reservationId } = await setupReservation({
      eventId: eventId5days, // 5日後イベント
      status: "card_error",
    });

    const token = await issueToken(reservationId);
    const res2 = await updateCardPOST(updateCardReq({ reservation_id: reservationId, token }));
    const data2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(data2.is_auth).toBe(true); // 5日以内 → PI直接
    expect(data2.client_secret).toBeTruthy();
  }, 30_000);

  it("C-02: card_error + 5日以上（14日後イベント）→ is_auth=false（SetupIntent）", async () => {
    const { reservationId } = await setupReservation({
      eventId: eventIdFar, // 14日後イベント
      status: "card_error",
    });

    const token = await issueToken(reservationId);

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, token }),
    });
    const res = await updateCardPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.is_auth).toBe(false); // 5日以上 → SetupIntent
    expect(data.client_secret).toBeTruthy();
  }, 30_000);

  it("C-03: charged状態（オーソリ済み）→ 409 Cannot update card", async () => {
    const { reservationId } = await setupReservation({
      eventId: eventId5days,
      status: "charged",
      stripePaymentIntentId: `pi_charged_${Date.now()}`,
    });

    const token = await issueToken(reservationId);

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, token }),
    });
    const res = await updateCardPOST(req);
    expect(res.status).toBe(409);
  }, 30_000);

  it("C-04: チケットがcancelled → 409（チケット無効）", async () => {
    const { reservationId } = await setupReservation({
      eventId: eventIdFar,
      status: "card_error",
      ticketStatus: "cancelled",
    });

    const token = await issueToken(reservationId);

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, token }),
    });
    const res = await updateCardPOST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/無効/);
  }, 30_000);

  // ── 本人確認（メールのワンタイムトークン）──
  it("C-05: トークン不一致 → 404・予約は card_error のまま", async () => {
    const { reservationId } = await setupReservation({ eventId: eventIdFar, status: "card_error" });
    const token = await issueToken(reservationId);
    const wrong = crypto.randomUUID();
    expect(wrong).not.toBe(token);

    const res = await updateCardPOST(updateCardReq({ reservation_id: reservationId, token: wrong }));
    expect(res.status).toBe(404);
    const after = await readCardUpdateToken(reservationId);
    expect(after.status).toBe("card_error");
    expect(after.card_update_token).toBe(token);
  }, 30_000);

  it("C-06: 旧形式（メールアドレスのみ）→ 400・予約は card_error のまま", async () => {
    const { reservationId } = await setupReservation({ eventId: eventIdFar, status: "card_error" });
    await issueToken(reservationId);
    const { data: rsv } = await testAdmin.from("entrance_reservations")
      .select("email").eq("reservation_id", reservationId).single();

    const res = await updateCardPOST(updateCardReq({ reservation_id: reservationId, email: rsv!.email }));
    expect(res.status).toBe(400);
    expect((await readCardUpdateToken(reservationId)).status).toBe("card_error");
  }, 30_000);

  it("C-07: 別予約のトークン → 404・どちらの予約も動かない", async () => {
    const victim = await setupReservation({ eventId: eventIdFar, status: "card_error" });
    const other = await setupReservation({ eventId: eventIdFar, status: "card_error" });
    await issueToken(victim.reservationId);
    const otherToken = await issueToken(other.reservationId);

    const res = await updateCardPOST(updateCardReq({ reservation_id: victim.reservationId, token: otherToken }));
    expect(res.status).toBe(404);
    expect((await readCardUpdateToken(victim.reservationId)).status).toBe("card_error");
    expect((await readCardUpdateToken(other.reservationId)).status).toBe("card_error");
  }, 30_000);

  it("C-08: トークン未発行（初回予約の pending）→ 404", async () => {
    const { reservationId } = await setupReservation({ eventId: eventIdFar, status: "pending" });
    const res = await updateCardPOST(updateCardReq({ reservation_id: reservationId, token: crypto.randomUUID() }));
    expect(res.status).toBe(404);
    expect((await readCardUpdateToken(reservationId)).status).toBe("pending");
  }, 30_000);

  it("C-09: UUID形式でない値 → 404（DBに問い合わせない）", async () => {
    const { reservationId } = await setupReservation({ eventId: eventIdFar, status: "card_error" });
    await issueToken(reservationId);
    const res1 = await updateCardPOST(updateCardReq({ reservation_id: reservationId, token: "' or 1=1 --" }));
    expect(res1.status).toBe(404);
    const res2 = await updateCardPOST(updateCardReq({ reservation_id: "not-a-uuid", token: crypto.randomUUID() }));
    expect(res2.status).toBe(404);
    expect((await readCardUpdateToken(reservationId)).status).toBe("card_error");
  }, 30_000);

  it("C-10: 入力途中で離脱（pending）→ 同じリンクで再試行でき、前回のPIは取り消される", async () => {
    const { reservationId } = await setupReservation({ eventId: eventId5days, status: "card_error" });
    const token = await issueToken(reservationId);

    const first = await updateCardPOST(updateCardReq({ reservation_id: reservationId, token }));
    expect(first.status).toBe(200);
    const { data: p1 } = await testAdmin.from("entrance_reservations")
      .select("status, stripe_payment_intent_id").eq("reservation_id", reservationId).single();
    expect(p1!.status).toBe("pending");
    const firstPi = p1!.stripe_payment_intent_id as string;

    mockStripe.cancelledPiIds = [];
    await new Promise((r) => setTimeout(r, 5)); // モックPIのIDは Date.now() 由来のため重複回避
    const second = await updateCardPOST(updateCardReq({ reservation_id: reservationId, token }));
    expect(second.status).toBe(200);
    expect((await second.json()).is_auth).toBe(true);
    expect(mockStripe.cancelledPiIds).toEqual([firstPi]);

    const { data: p2 } = await testAdmin.from("entrance_reservations")
      .select("status, stripe_payment_intent_id").eq("reservation_id", reservationId).single();
    expect(p2!.status).toBe("pending");
    expect(p2!.stripe_payment_intent_id).not.toBe(firstPi);
  }, 30_000);
});

// ── G. カード再登録リンクの再送 ─────────────────────────────────────────────
describe("TC-TYPEA-G: card-update-link — リンク再送", () => {
  function resendReq(reservationId: string) {
    return cardUpdateLinkPOST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ reservationId }) },
    );
  }

  it("G-01: card_error・トークン未発行（旧メールの404リンクから来た人）→ 新トークン発行", async () => {
    const { reservationId } = await setupReservation({ eventId: eventIdFar, status: "card_error" });
    const res = await resendReq(reservationId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const after = await readCardUpdateToken(reservationId);
    expect(after.card_update_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(after.card_update_token_issued_at).not.toBeNull();
  }, 30_000);

  it("G-02: 60秒以内の再送 → トークンは振り直さない（連打抑止）", async () => {
    const { reservationId } = await setupReservation({ eventId: eventIdFar, status: "card_error" });
    const token = await issueToken(reservationId);
    const res = await resendReq(reservationId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await readCardUpdateToken(reservationId)).card_update_token).toBe(token);
  }, 30_000);

  it("G-03: 60秒経過後の再送 → トークンが振り直され、古いリンクは無効", async () => {
    const { reservationId } = await setupReservation({ eventId: eventIdFar, status: "card_error" });
    const oldToken = await issueToken(reservationId);
    await testAdmin.from("entrance_reservations")
      .update({ card_update_token_issued_at: new Date(Date.now() - 61_000).toISOString() })
      .eq("reservation_id", reservationId);

    await resendReq(reservationId);
    const newToken = (await readCardUpdateToken(reservationId)).card_update_token;
    expect(newToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(newToken).not.toBe(oldToken);

    const res = await updateCardPOST(updateCardReq({ reservation_id: reservationId, token: oldToken }));
    expect(res.status).toBe(404);
  }, 30_000);

  it("G-04: 再登録不要（reserved）・チケット取消済み・初回pending → 発行しないが応答は同じ", async () => {
    const reserved = await setupReservation({ eventId: eventIdFar, status: "reserved" });
    const cancelled = await setupReservation({ eventId: eventIdFar, status: "card_error", ticketStatus: "cancelled" });
    const initialPending = await setupReservation({ eventId: eventIdFar, status: "pending" });

    for (const { reservationId } of [reserved, cancelled, initialPending]) {
      const res = await resendReq(reservationId);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect((await readCardUpdateToken(reservationId)).card_update_token).toBeNull();
    }
  }, 30_000);

  it("G-05: 存在しない予約ID・UUIDでない値 → 応答は同じ", async () => {
    for (const id of [crypto.randomUUID(), "not-a-uuid"]) {
      const res = await resendReq(id);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
  }, 30_000);
});

// ── D. complete — suspended復活 ───────────────────────────────────────────────
describe("TC-TYPEA-D: complete — suspended チケット復活", () => {
  it("D-01: suspended チケットへのcomplete → valid に復活", async () => {
    const { reservationId, ticketId } = await setupReservation({
      eventId: eventIdFar,
      status: "card_error",
      ticketStatus: "suspended",
    });

    // complete は pending 状態を要求するため、update-card で pending に戻してから呼ぶ
    const token = await issueToken(reservationId);
    const updateRes = await updateCardPOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, token }),
    }));
    expect(updateRes.status).toBe(200); // update-card 成功（SetupIntentパス）

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_id: reservationId,
        payment_method_id: "pm_mock_new_card",
      }),
    });
    const res = await completePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.ticket_id).toBe(ticketId);

    // ticket が valid に復活
    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("valid");

    // reservation の card_error もクリア
    const { data: rsv } = await testAdmin.from("entrance_reservations")
      .select("status, card_error_message")
      .eq("reservation_id", reservationId).single();
    expect(rsv?.status).toBe("reserved");
    expect(rsv?.card_error_message).toBeNull();

    // カード再登録完了でメールのリンクは無効になる
    expect((await readCardUpdateToken(reservationId)).card_update_token).toBeNull();
  }, 30_000);

  it("D-02: 5日以内パス（PIオーソリ）でcomplete → charged・トークン無効化", async () => {
    const { reservationId, ticketId } = await setupReservation({
      eventId: eventId5days,
      status: "card_error",
      ticketStatus: "suspended",
    });
    const token = await issueToken(reservationId);

    const updateRes = await updateCardPOST(updateCardReq({ reservation_id: reservationId, token }));
    const updateData = await updateRes.json();
    expect(updateRes.status).toBe(200);
    expect(updateData.is_auth).toBe(true);

    const { data: pending } = await testAdmin.from("entrance_reservations")
      .select("status, stripe_payment_intent_id").eq("reservation_id", reservationId).single();
    expect(pending!.status).toBe("pending");
    const piId = pending!.stripe_payment_intent_id as string;
    expect(piId).toMatch(/^pi_typea_mock_/);

    const res = await completePOST(updateCardReq({ reservation_id: reservationId, payment_intent_id: piId }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.ticket_id).toBe(ticketId);

    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("valid");

    const after = await readCardUpdateToken(reservationId);
    expect(after.status).toBe("charged");
    expect(after.card_update_token).toBeNull();
    expect(after.card_update_token_issued_at).toBeNull();
  }, 30_000);
});

// ── E. checkin — suspended ガード ────────────────────────────────────────────
describe("TC-TYPEA-E: checkin — suspended チケット拒否", () => {
  it("E-01: suspended チケットをスキャン → 409 TICKET_SUSPENDED", async () => {
    const { ticketCode } = await (async () => {
      const { ticketId } = await setupReservation({
        eventId: eventId5days,
        ticketStatus: "suspended",
      });
      const { data } = await testAdmin.from("tickets")
        .select("ticket_code").eq("ticket_id", ticketId).single();
      return { ticketCode: data?.ticket_code };
    })();

    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: ticketCode }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("TICKET_SUSPENDED");
  }, 30_000);

  it("E-02: 復活後（valid）のチケットは正常チェックイン可能", async () => {
    const { reservationId, ticketId } = await setupReservation({
      eventId: eventId5days,
      ticketStatus: "valid",
    });

    const { data: tktData } = await testAdmin.from("tickets")
      .select("ticket_code").eq("ticket_id", ticketId).single();

    mockOrganizerAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: tktData?.ticket_code }),
    });
    const res = await checkinPOST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("used");
  }, 30_000);
});

// ── F. 一気通貫シナリオ ──────────────────────────────────────────────────────
describe("TC-TYPEA-F: 一気通貫 — カード問題→suspended→リカバリ→チェックイン", () => {
  it("F-01: 予約済み → 日次確認でPM取得失敗 → suspended → update-card → complete → valid → checkin", async () => {
    // 1. 予約（14日後イベント）
    const { reservationId, ticketId } = await setupReservation({
      eventId: eventIdFar,
      status: "reserved",
    });

    // チケット valid 確認
    let tkt = (await testAdmin.from("tickets").select("status").eq("ticket_id", ticketId).single()).data;
    expect(tkt?.status).toBe("valid");

    // 2. 日次確認でPM取得失敗 → suspended
    mockStripe.retrieveResult = "error";
    await cronCardCheckGET(cronReq("/api/cron/entrance-card-check"));
    mockStripe.retrieveResult = "ok";

    tkt = (await testAdmin.from("tickets").select("status").eq("ticket_id", ticketId).single()).data;
    expect(tkt?.status).toBe("suspended"); // ✓ 保留

    // 3. cron がサスペンド時に発行したメールリンクのトークンで update-card
    const issued = await readCardUpdateToken(reservationId);
    expect(issued.card_update_token).toMatch(/^[0-9a-f-]{36}$/);
    const token = issued.card_update_token!;
    const updateReq = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, token }),
    });
    const updateRes = await updateCardPOST(updateReq);
    expect(updateRes.status).toBe(200);
    expect((await updateRes.json()).is_auth).toBe(false); // 14日後 → SetupIntentパス

    // 4. complete でカード登録完了 → valid 復活
    const completeReq = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, payment_method_id: "pm_mock_new" }),
    });
    const completeRes = await completePOST(completeReq);
    expect(completeRes.status).toBe(200);

    tkt = (await testAdmin.from("tickets").select("status").eq("ticket_id", ticketId).single()).data;
    expect(tkt?.status).toBe("valid"); // ✓ 復活

    // メールのリンクは使用済みで無効化され、再利用しても予約は動かない
    const after = await readCardUpdateToken(reservationId);
    expect(after.card_update_token).toBeNull();
    expect(after.card_update_token_issued_at).toBeNull();
    const reuseRes = await updateCardPOST(updateCardReq({ reservation_id: reservationId, token }));
    expect(reuseRes.status).toBe(404);
    expect((await readCardUpdateToken(reservationId)).status).toBe("reserved");

    // 5. checkin 成功
    const { data: tktData } = await testAdmin.from("tickets")
      .select("ticket_code").eq("ticket_id", ticketId).single();
    mockOrganizerAuth();
    const checkinReq = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: tktData?.ticket_code }),
    });
    const checkinRes = await checkinPOST(checkinReq);
    expect(checkinRes.status).toBe(200); // ✓ 正常入場
    expect((await checkinRes.json()).ok).toBe(true);
  }, 60_000);
});
