/**
 * TC-VOUCHER: バウチャー商品タイプ（custom/V）統合テスト
 *
 * カバレッジ:
 *   A. pay/complete — バウチャー商品でticket発行・冪等性
 *   B. checkin — 消込・再スキャン禁止（エントランスと違い再入場不可）・エラー系
 *   C. cron/refund-expired-vouchers — 期限切れ自動返金
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertProduct,
  insertTicket,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastCheerNew: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/email/purchase-receipt", () => ({
  sendPurchaseReceipt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/apple-wallet-push", () => ({
  pushWalletUpdateBySerial: vi.fn().mockResolvedValue(undefined),
}));

// ── Stripe モック制御 ──────────────────────────────────────────────────────
// vi.hoisted: vi.mock ファクトリより前に評価される必要がある
const mockCtrl = vi.hoisted(() => ({
  // pay/complete 用 Checkout Session の状態
  sessionStatus: "paid" as "paid" | "unpaid",
  piId: `pi_voucher_mock_${Date.now()}`,
  productId: "",
  qrConfigId: "",
  amountTotal: 2000,
  // cron 用 refund 成否制御
  refundShouldFail: false,
  refundCalled: [] as string[],  // 呼ばれた PI ID の一覧
}));

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);

      // pay/complete が呼ぶ session.retrieve（expand 付き）
      (this.checkout.sessions as any).retrieve = async (id: string) => {
        if (id === "cs_invalid") throw new Error("No such checkout.session");
        return {
          id,
          payment_status: mockCtrl.sessionStatus,
          payment_intent: {
            id: mockCtrl.piId,
            status: "succeeded",
            amount_received: mockCtrl.amountTotal,
            latest_charge: null,
          },
          customer_email: "voucher-buyer@test.local",
          customer: "cus_voucher_mock",
          amount_total: mockCtrl.amountTotal,
          payment_method_types: ["card"],
          metadata: {
            product_id: mockCtrl.productId,
            qr_config_id: mockCtrl.qrConfigId,
          },
        };
      };

      // checkin が呼ぶ checkin_ticket RPC は Supabase 側なのでモック不要
      // cron が呼ぶ refunds.create
      (this.refunds as any).create = async (params: any) => {
        if (mockCtrl.refundShouldFail) throw new Error("Stripe refund mock failure");
        mockCtrl.refundCalled.push(params.payment_intent);
        return { id: `re_mock_${Date.now()}`, status: "succeeded" };
      };

      // accounts.retrieve（pay/cheers 系で呼ばれる可能性）
      (this.accounts as any).retrieve = async (id: string) => ({
        id,
        capabilities: { card_payments: "active", transfers: "active" },
      });
    }
  }
  return { ...StripeModule, default: MockStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as payCompletePOST } from "@/app/api/pay/complete/route";
import { POST as checkinPOST } from "@/app/api/entrance/checkin/route";
import { GET as refundCronGET } from "@/app/api/cron/refund-expired-vouchers/route";

// ── 共有フィクスチャ ───────────────────────────────────────────────────────
let organizerProfileId: string;
let eventId: string;       // 未終了イベント（pay/complete・checkin 用）
let endedEventId: string;  // 終了済みイベント（cron 用）
let qrConfigId: string;
let voucherProductId: string;
let endedVoucherProductId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  productIds: [] as string[],
  ticketIds: [] as string[],
  transactionIds: [] as string[],
  qrConfigIds: [] as string[],
};

beforeAll(async () => {
  const ts = Date.now();

  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "バウチャーテストオーガナイザー",
    email: `org-voucher-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId);

  // pay/complete・checkin 用イベント（未終了）
  eventId = await insertEvent({
    organizerProfileId,
    title: "TC-VOUCHER テストイベント",
  });
  cleanup.eventIds.push(eventId);

  // cron 用イベント（終了済み）
  endedEventId = await insertEvent({
    organizerProfileId,
    title: "TC-VOUCHER 終了済みイベント",
    startAt: new Date(Date.now() - 7_200_000),  // 2時間前に開始
    endAt: new Date(Date.now() - 3_600_000),     // 1時間前に終了
  });
  cleanup.eventIds.push(endedEventId);

  qrConfigId = await insertQrConfig({
    eventId,
    creatorProfileId: organizerProfileId,
    recipientProfileId: organizerProfileId,
  });
  cleanup.qrConfigIds.push(qrConfigId);

  voucherProductId = await insertProduct({
    eventId,
    type: "custom",
    paymentType: "V",
    name: "テストバウチャー券 ¥2000",
    minAmount: 2000,
  });
  cleanup.productIds.push(voucherProductId);

  endedVoucherProductId = await insertProduct({
    eventId: endedEventId,
    type: "custom",
    paymentType: "V",
    name: "終了イベント用バウチャー",
    minAmount: 1500,
  });
  cleanup.productIds.push(endedVoucherProductId);

  // モック制御に ID を注入（vi.mock ファクトリが参照する）
  mockCtrl.productId = voucherProductId;
  mockCtrl.qrConfigId = qrConfigId;
}, 30_000);

afterAll(async () => {
  if (cleanup.ticketIds.length)
    await testAdmin.from("tickets").delete().in("ticket_id", cleanup.ticketIds);
  if (cleanup.transactionIds.length)
    await testAdmin.from("transactions").delete().in("transaction_id", cleanup.transactionIds);
  if (cleanup.qrConfigIds.length)
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  if (cleanup.productIds.length)
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-VOUCHER-A: pay/complete — バウチャーticket発行 ──────────────────────
describe("TC-VOUCHER-A: pay/complete — バウチャー商品でticket発行", () => {
  let issuedTicketId: string;
  const SESSION_ID = `cs_voucher_test_${Date.now()}`;

  beforeAll(() => {
    mockCtrl.sessionStatus = "paid";
    mockCtrl.piId = `pi_voucher_a_${Date.now()}`;
    mockCtrl.productId = voucherProductId;
    mockCtrl.qrConfigId = qrConfigId;
    mockCtrl.amountTotal = 2000;
  });

  it("TC-VOUCHER-A-01: 決済完了セッション → ticket_id あり・payment_type='V'・DB にticket status=valid", async () => {
    const req = new Request("http://localhost/api/pay/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: SESSION_ID }),
    });
    const res = await payCompletePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ticket_id).toBeTruthy();
    expect(data.payment_type).toBe("V");

    // DB にチケットが発行されていること
    const { data: ticket } = await testAdmin
      .from("tickets")
      .select("ticket_id, status")
      .eq("ticket_id", data.ticket_id)
      .single();
    expect(ticket?.status).toBe("valid");

    issuedTicketId = data.ticket_id;
    cleanup.ticketIds.push(issuedTicketId);

    // transaction が作成されていること
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("transaction_id, total_gross_amount")
      .eq("stripe_payment_intent_id", mockCtrl.piId)
      .maybeSingle();
    expect(tx).not.toBeNull();
    expect(tx?.total_gross_amount).toBe(2000);
    if (tx) cleanup.transactionIds.push(tx.transaction_id);
  });

  it("TC-VOUCHER-A-02: 同一session_idで2回呼び出し → 冪等性（ticket重複なし・同じticket_idを返す）", async () => {
    const req = new Request("http://localhost/api/pay/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: SESSION_ID }),
    });
    const res = await payCompletePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ticket_id).toBe(issuedTicketId);

    // tickets テーブルに同一 PI のチケットが1件のみ
    const { count } = await testAdmin
      .from("tickets")
      .select("ticket_id", { count: "exact", head: true })
      .eq("ticket_id", issuedTicketId);
    expect(count).toBe(1);
  });
});

// ── TC-VOUCHER-B: checkin — バウチャー消込 ───────────────────────────────
describe("TC-VOUCHER-B: checkin — バウチャー消込・再スキャン禁止", () => {
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

  it("TC-VOUCHER-B-01: valid バウチャー → 200 ok・is_voucher=true・DB status=used", async () => {
    const { ticketId, ticketCode } = await insertTicket({
      eventId,
      productId: voucherProductId,
      status: "valid",
      email: "voucher-b01@test.local",
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
    expect(data.is_voucher).toBe(true);
    expect(data.ticket_id).toBe(ticketId);

    const { data: ticket } = await testAdmin
      .from("tickets")
      .select("status, checked_in_at")
      .eq("ticket_id", ticketId)
      .single();
    expect(ticket?.status).toBe("used");
    expect(ticket?.checked_in_at).not.toBeNull();
  });

  it("TC-VOUCHER-B-02: used バウチャー（消込済み）再スキャン → 409 ALREADY_USED（エントランスと違い再入場不可）", async () => {
    const { ticketCode } = await insertTicket({
      eventId,
      productId: voucherProductId,
      status: "used",
    });

    mockOrganizerAuth();
    const req = new Request("http://localhost/api/entrance/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: ticketCode }),
    });
    const res = await checkinPOST(req);
    const data = await res.json();

    // エントランス（re_entry=true で 200）とは異なり、バウチャーは再利用不可
    expect(res.status).toBe(409);
    expect(data.error).toBe("ALREADY_USED");
    expect(data.is_voucher).toBe(true);
  });

  it("TC-VOUCHER-B-03: cancelled バウチャー → 409 TICKET_CANCELLED", async () => {
    const { ticketCode } = await insertTicket({
      eventId,
      productId: voucherProductId,
      status: "cancelled",
    });

    mockOrganizerAuth();
    const req = new Request("http://localhost/api/entrance/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: ticketCode }),
    });
    const res = await checkinPOST(req);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("TICKET_CANCELLED");
  });
});

// ── TC-VOUCHER-C: cron/refund-expired-vouchers ───────────────────────────
describe("TC-VOUCHER-C: cron/refund-expired-vouchers — 期限切れ自動返金", () => {
  const CRON_SECRET = process.env.CRON_SECRET ?? "test_cron_secret";

  function cronReq(auth?: string) {
    return new Request("http://localhost/api/cron/refund-expired-vouchers", {
      headers: { authorization: auth ?? `Bearer ${CRON_SECRET}` },
    });
  }

  beforeAll(() => {
    mockCtrl.refundShouldFail = false;
    mockCtrl.refundCalled = [];
  });

  it("TC-VOUCHER-C-01: 終了済みイベントの未消込バウチャー → Stripe refund呼び出し・ticket=cancelled・transaction=refunded", async () => {
    // 終了済みイベントの valid バウチャーチケット＋トランザクションを用意
    const fakePiId = `pi_cron_c01_${Date.now()}`;

    // qr_config が NOT NULL のため必要
    const cronQrConfigId = await insertQrConfig({
      eventId: endedEventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.qrConfigIds.push(cronQrConfigId);

    // transaction を直接挿入
    const txId = crypto.randomUUID();
    const { error: txErr } = await testAdmin.from("transactions").insert({
      transaction_id: txId,
      qr_config_id: cronQrConfigId,
      stripe_payment_intent_id: fakePiId,
      total_gross_amount: 1500,
      net_amount: 1350,
      stripe_fee: 75,
      platform_fee: 75,
      status: "completed",
      transaction_type: "purchase",
      payment_method: "card",
      amount_verified: true,
      amount_mismatch: 0,
    });
    expect(txErr).toBeNull();
    cleanup.transactionIds.push(txId);

    const { ticketId, ticketCode: _code } = await insertTicket({
      eventId: endedEventId,
      productId: endedVoucherProductId,
      status: "valid",
      transactionId: txId,
    });
    cleanup.ticketIds.push(ticketId);

    const res = await refundCronGET(cronReq());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.refunded).toBeGreaterThanOrEqual(1);
    expect(mockCtrl.refundCalled).toContain(fakePiId);

    // ticket が cancelled になっていること
    const { data: ticket } = await testAdmin
      .from("tickets")
      .select("status")
      .eq("ticket_id", ticketId)
      .single();
    expect(ticket?.status).toBe("cancelled");

    // transaction が refunded になっていること
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("status")
      .eq("transaction_id", txId)
      .single();
    expect(tx?.status).toBe("refunded");
  });

  it("TC-VOUCHER-C-02: 消込済みバウチャー（status=used）→ 対象外・返金されない", async () => {
    mockCtrl.refundCalled = [];

    const fakePiId = `pi_cron_c02_${Date.now()}`;

    const cronQrConfigId = await insertQrConfig({
      eventId: endedEventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.qrConfigIds.push(cronQrConfigId);

    const txId = crypto.randomUUID();
    await testAdmin.from("transactions").insert({
      transaction_id: txId,
      qr_config_id: cronQrConfigId,
      stripe_payment_intent_id: fakePiId,
      total_gross_amount: 1500,
      net_amount: 1350,
      stripe_fee: 75,
      platform_fee: 75,
      status: "completed",
      transaction_type: "purchase",
      payment_method: "card",
      amount_verified: true,
      amount_mismatch: 0,
    });
    cleanup.transactionIds.push(txId);

    // status=used（消込済み）
    const { ticketId } = await insertTicket({
      eventId: endedEventId,
      productId: endedVoucherProductId,
      status: "used",
      transactionId: txId,
    });
    cleanup.ticketIds.push(ticketId);

    const res = await refundCronGET(cronReq());
    const data = await res.json();

    expect(res.status).toBe(200);
    // このPI は refund 対象外
    expect(mockCtrl.refundCalled).not.toContain(fakePiId);

    // ticket は used のまま
    const { data: ticket } = await testAdmin
      .from("tickets")
      .select("status")
      .eq("ticket_id", ticketId)
      .single();
    expect(ticket?.status).toBe("used");
  });

  it("TC-VOUCHER-C-03: 未終了イベントのバウチャー → 対象外・返金されない", async () => {
    mockCtrl.refundCalled = [];

    // eventId は未終了なのでこのチケットは返金対象外
    const { ticketId } = await insertTicket({
      eventId,
      productId: voucherProductId,
      status: "valid",
    });
    cleanup.ticketIds.push(ticketId);

    const res = await refundCronGET(cronReq());
    const data = await res.json();

    expect(res.status).toBe(200);

    // ticket は valid のまま（未終了イベントなので返金されない）
    const { data: ticket } = await testAdmin
      .from("tickets")
      .select("status")
      .eq("ticket_id", ticketId)
      .single();
    expect(ticket?.status).toBe("valid");
  });

  it("TC-VOUCHER-C-04: CRON_SECRET 不一致 → 401", async () => {
    const res = await refundCronGET(cronReq("Bearer wrong_secret"));
    expect(res.status).toBe(401);
  });
});
