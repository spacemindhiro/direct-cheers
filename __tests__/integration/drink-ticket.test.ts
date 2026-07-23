/**
 * TC-DRINK: ドリンクチケット（custom×Dタイプ）の統合テスト
 *
 * QRを使わない即時受け渡し型商品（例: バーカウンターのドリンクチケット）。
 * まとめ買い割引ティア・杯数指定可否のバリデーション、決済時の単価を
 * クライアント申告ではなくDB側のティア設定からサーバーが確定計算すること、
 * チケット記録（マイチケット表示用）が正しく発行されることを検証する。
 *
 * カバレッジ:
 *   A. /api/qr/create — custom×D作成時のバリデーション・保存
 *   B. /api/qr/[qrConfigId] PATCH — 作成後のドリンク設定編集
 *   C. /api/pay/cheers — サーバー側でのティア価格確定計算
 *   D. /api/pay/complete — チケット発行（quantity記録）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertProduct,
  insertQrConfig,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

const captured: { sessionCreateParams?: any } = {};
const mockComplete: {
  fakePiId: string;
  fakeMetadata: Record<string, string>;
  amountTotal: number;
} = { fakePiId: "", fakeMetadata: {}, amountTotal: 0 };

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.checkout.sessions as any).create = async (params: any) => {
        captured.sessionCreateParams = params;
        return { url: "https://checkout.stripe.com/c/pay/cs_test_drink_stub", id: "cs_test_drink_stub" };
      };
      (this.checkout.sessions as any).retrieve = async (id: string) => ({
        id,
        payment_status: "paid",
        payment_intent: { id: mockComplete.fakePiId, status: "requires_capture", latest_charge: null },
        customer_email: "drink-buyer@test.local",
        customer: null,
        amount_total: mockComplete.amountTotal,
        payment_method_types: ["card"],
        metadata: mockComplete.fakeMetadata,
      });
    }
  }
  return { ...StripeModule, default: InstrumentedStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as qrCreatePOST } from "@/app/api/qr/create/route";
import { PATCH as qrPATCH } from "@/app/api/qr/[qrConfigId]/route";
import { POST as payCheersPOST } from "@/app/api/pay/cheers/route";
import { POST as payCompletePOST } from "@/app/api/pay/complete/route";

let organizerProfileId: string;
let eventId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  productIds: [] as string[],
  qrConfigIds: [] as string[],
  ticketIds: [] as string[],
  transactionIds: [] as string[],
};

function mockOrganizerAuth() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: organizerProfileId } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "organizer" } }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer", displayName: "ドリンクテスト主催者", email: `drink-organizer-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId);
  eventId = await insertEvent({ organizerProfileId, title: "TC-DRINK イベント" });
  cleanup.eventIds.push(eventId);
}, 30_000);

afterAll(async () => {
  if (cleanup.ticketIds.length) await testAdmin.from("tickets").delete().in("ticket_id", cleanup.ticketIds);
  if (cleanup.transactionIds.length) await testAdmin.from("transactions").delete().in("transaction_id", cleanup.transactionIds);
  if (cleanup.qrConfigIds.length) {
    await testAdmin.from("qr_config_targets").delete().in("qr_config_id", cleanup.qrConfigIds);
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  }
  if (cleanup.productIds.length) await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  await cleanupTestData({ eventIds: cleanup.eventIds });
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-DRINK-A: /api/qr/create ────────────────────────────────────────────
describe("TC-DRINK-A: /api/qr/create — ドリンクチケット作成", () => {
  beforeAll(() => mockOrganizerAuth());

  function createReq(body: Record<string, unknown>) {
    return new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const baseBody = () => ({
    event_id: eventId,
    product_type: "custom",
    payment_type: "D",
    min_amount: 600,
    max_amount: 600,
    recipient_profile_id: organizerProfileId,
    recipient_name_context: "organizer" as const,
    targets: [{ profile_id: organizerProfileId, distribution_ratio: 1 }],
  });

  it("TC-DRINK-A-01: ティアなし → 作成成功、quantity_selectable=true・bulk_pricing=nullで保存される", async () => {
    const res = await qrCreatePOST(createReq({ ...baseBody(), label: "ドリンクA" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);
    cleanup.productIds.push(data.product_id);

    const { data: product } = await testAdmin
      .from("products")
      .select("type, payment_type, min_amount, max_amount, quantity_selectable, bulk_pricing")
      .eq("product_id", data.product_id)
      .single();
    expect(product?.type).toBe("custom");
    expect(product?.payment_type).toBe("D");
    expect(product?.min_amount).toBe(600);
    expect(product?.max_amount).toBe(600);
    expect(product?.quantity_selectable).toBe(true);
    expect(product?.bulk_pricing).toBeNull();
  });

  it("TC-DRINK-A-02: ティア指定あり → bulk_pricingがそのまま保存される", async () => {
    const res = await qrCreatePOST(createReq({
      ...baseBody(),
      label: "ドリンクB",
      quantity_selectable: true,
      bulk_pricing: [{ min_quantity: 3, unit_price: 500 }],
    }));
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);
    cleanup.productIds.push(data.product_id);

    const { data: product } = await testAdmin
      .from("products").select("bulk_pricing").eq("product_id", data.product_id).single();
    expect(product?.bulk_pricing).toEqual([{ min_quantity: 3, unit_price: 500 }]);
  });

  it("TC-DRINK-A-03: min_amount ≠ max_amount（金額固定でない） → 400", async () => {
    const res = await qrCreatePOST(createReq({ ...baseBody(), label: "不正レンジ", max_amount: 800 }));
    expect(res.status).toBe(400);
  });

  it("TC-DRINK-A-04: payment_type='D'だがproduct_type≠'custom' → 400", async () => {
    const res = await qrCreatePOST(createReq({ ...baseBody(), label: "不正D", product_type: "entrance" }));
    expect(res.status).toBe(400);
  });

  it("TC-DRINK-A-05: ティアのmin_quantityが降順・重複 → 400", async () => {
    const res = await qrCreatePOST(createReq({
      ...baseBody(),
      label: "不正ティア順",
      quantity_selectable: true,
      bulk_pricing: [{ min_quantity: 5, unit_price: 500 }, { min_quantity: 3, unit_price: 450 }],
    }));
    expect(res.status).toBe(400);
  });

  it("TC-DRINK-A-06: ティアの単価が段階を上がるごとに値上がりしている → 400", async () => {
    const res = await qrCreatePOST(createReq({
      ...baseBody(),
      label: "不正単価",
      quantity_selectable: true,
      bulk_pricing: [{ min_quantity: 3, unit_price: 700 }],
    }));
    expect(res.status).toBe(400);
  });
});

// ── TC-DRINK-B: /api/qr/[qrConfigId] PATCH ────────────────────────────────
describe("TC-DRINK-B: /api/qr/[qrConfigId] PATCH — ドリンク設定の編集", () => {
  let qrConfigId: string;
  let productId: string;
  let nonDrinkQrConfigId: string;

  beforeAll(async () => {
    mockOrganizerAuth();
    productId = await insertProduct({
      eventId, type: "custom", paymentType: "D", name: "編集テストドリンク",
      minAmount: 600, maxAmount: 600, quantitySelectable: true, bulkPricing: null,
    });
    qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId });
    cleanup.productIds.push(productId);
    cleanup.qrConfigIds.push(qrConfigId);

    const nonDrinkProductId = await insertProduct({
      eventId, type: "standard", name: "編集テスト非ドリンク", minAmount: 500, maxAmount: 500,
    });
    nonDrinkQrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId: nonDrinkProductId });
    cleanup.productIds.push(nonDrinkProductId);
    cleanup.qrConfigIds.push(nonDrinkQrConfigId);
  });

  function patchReq(body: Record<string, unknown>) {
    return new Request("http://localhost/api/qr/x", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }

  it("TC-DRINK-B-01: ティアを追加保存できる", async () => {
    const res = await qrPATCH(patchReq({ bulk_pricing: [{ min_quantity: 3, unit_price: 500 }] }), { params: Promise.resolve({ qrConfigId }) });
    expect(res.status).toBe(200);
    const { data: product } = await testAdmin.from("products").select("bulk_pricing").eq("product_id", productId).single();
    expect(product?.bulk_pricing).toEqual([{ min_quantity: 3, unit_price: 500 }]);
  });

  it("TC-DRINK-B-02: quantity_selectable=falseにすると既存のbulk_pricingもnullに落ちる", async () => {
    const res = await qrPATCH(patchReq({ quantity_selectable: false }), { params: Promise.resolve({ qrConfigId }) });
    expect(res.status).toBe(200);
    const { data: product } = await testAdmin.from("products").select("quantity_selectable, bulk_pricing").eq("product_id", productId).single();
    expect(product?.quantity_selectable).toBe(false);
    expect(product?.bulk_pricing).toBeNull();
  });

  it("TC-DRINK-B-03: ドリンク以外の商品にquantity_selectableを指定 → 400", async () => {
    const res = await qrPATCH(patchReq({ quantity_selectable: false }), { params: Promise.resolve({ qrConfigId: nonDrinkQrConfigId }) });
    expect(res.status).toBe(400);
  });
});

// ── TC-DRINK-C: /api/pay/cheers ────────────────────────────────────────────
describe("TC-DRINK-C: /api/pay/cheers — サーバー側でティア価格を確定計算する", () => {
  let qrConfigId: string;
  let productId: string;
  let fixedQtyProductId: string;
  let fixedQtyQrConfigId: string;

  beforeAll(async () => {
    productId = await insertProduct({
      eventId, type: "custom", paymentType: "D", name: "価格計算テストドリンク",
      minAmount: 600, maxAmount: 600, quantitySelectable: true,
      bulkPricing: [{ min_quantity: 3, unit_price: 500 }],
    });
    qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId });
    cleanup.productIds.push(productId);
    cleanup.qrConfigIds.push(qrConfigId);

    fixedQtyProductId = await insertProduct({
      eventId, type: "custom", paymentType: "D", name: "数量固定ドリンク",
      minAmount: 600, maxAmount: 600, quantitySelectable: false, bulkPricing: null,
    });
    fixedQtyQrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId: fixedQtyProductId });
    cleanup.productIds.push(fixedQtyProductId);
    cleanup.qrConfigIds.push(fixedQtyQrConfigId);
  });

  function payReq(body: Record<string, unknown>) {
    return new Request("http://localhost/api/pay/cheers", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }

  it("TC-DRINK-C-01: 3杯注文・クライアントは基準単価(600円)を送るが、サーバーはティア単価(500円)を採用する", async () => {
    const res = await payCheersPOST(payReq({
      qr_config_id: qrConfigId, product_id: productId, amount: 600, quantity: 3,
      payment_method: "card", customer_email: "drink-c01@test.local",
    }));
    expect(res.status).toBe(200);
    expect(captured.sessionCreateParams.line_items[0].price_data.unit_amount).toBe(500);
    expect(captured.sessionCreateParams.line_items[0].quantity).toBe(3);
  });

  it("TC-DRINK-C-02: 2杯注文（ティア未達） → 基準単価600円のまま", async () => {
    const res = await payCheersPOST(payReq({
      qr_config_id: qrConfigId, product_id: productId, amount: 600, quantity: 2,
      payment_method: "card", customer_email: "drink-c02@test.local",
    }));
    expect(res.status).toBe(200);
    expect(captured.sessionCreateParams.line_items[0].price_data.unit_amount).toBe(600);
  });

  it("TC-DRINK-C-03: quantity_selectable=falseの商品にquantity=2を指定 → 400", async () => {
    const res = await payCheersPOST(payReq({
      qr_config_id: fixedQtyQrConfigId, product_id: fixedQtyProductId, amount: 600, quantity: 2,
      payment_method: "card", customer_email: "drink-c03@test.local",
    }));
    expect(res.status).toBe(400);
  });

  it("TC-DRINK-C-04: quantity_selectable=falseの商品にquantity省略（デフォルト1） → 200・単価600円", async () => {
    const res = await payCheersPOST(payReq({
      qr_config_id: fixedQtyQrConfigId, product_id: fixedQtyProductId, amount: 600,
      payment_method: "card", customer_email: "drink-c04@test.local",
    }));
    expect(res.status).toBe(200);
    expect(captured.sessionCreateParams.line_items[0].price_data.unit_amount).toBe(600);
    expect(captured.sessionCreateParams.line_items[0].quantity).toBe(1);
  });
});

// ── TC-DRINK-D: /api/pay/complete ──────────────────────────────────────────
describe("TC-DRINK-D: /api/pay/complete — チケット発行", () => {
  let productId: string;
  let qrConfigId: string;

  beforeAll(async () => {
    productId = await insertProduct({
      eventId, type: "custom", paymentType: "D", name: "発行テストドリンク",
      minAmount: 600, maxAmount: 600, quantitySelectable: true,
      bulkPricing: [{ min_quantity: 3, unit_price: 500 }],
    });
    qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId });
    cleanup.productIds.push(productId);
    cleanup.qrConfigIds.push(qrConfigId);
  });

  it("TC-DRINK-D-01: 3杯決済完了 → チケットが quantity=3 で発行され、ticket_quantityとして返る", async () => {
    const fakePiId = `pi_drink_${Date.now()}`;
    mockComplete.fakePiId = fakePiId;
    mockComplete.amountTotal = 1500;
    mockComplete.fakeMetadata = {
      product_id: productId,
      qr_config_id: qrConfigId,
      quantity: "3",
      event_id: eventId,
    };

    const req = new Request("http://localhost/api/pay/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: `cs_drink_test_${Date.now()}` }),
    });
    const res = await payCompletePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ticket_id).toBeTruthy();
    expect(data.ticket_code).toBeTruthy();
    expect(data.ticket_quantity).toBe(3);
    cleanup.ticketIds.push(data.ticket_id);

    const { data: ticket } = await testAdmin
      .from("tickets").select("quantity, status").eq("ticket_id", data.ticket_id).single();
    expect(ticket?.quantity).toBe(3);
    expect(ticket?.status).toBe("valid");

    const { data: tx } = await testAdmin
      .from("transactions").select("transaction_id, total_gross_amount")
      .eq("stripe_payment_intent_id", fakePiId).single();
    expect(tx?.total_gross_amount).toBe(1500);
    cleanup.transactionIds.push(tx!.transaction_id);
  });

  it("TC-DRINK-D-02: 同一PIで2回目の呼び出し → 同じticket_id・ticket_quantityが返る（冪等性）", async () => {
    const fakePiId = `pi_drink_idem_${Date.now()}`;
    mockComplete.fakePiId = fakePiId;
    mockComplete.amountTotal = 500;
    mockComplete.fakeMetadata = {
      product_id: productId,
      qr_config_id: qrConfigId,
      quantity: "1",
      event_id: eventId,
    };

    const makeReq = () => new Request("http://localhost/api/pay/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: `cs_drink_idem_test_${Date.now()}` }),
    });

    const res1 = await payCompletePOST(makeReq());
    const data1 = await res1.json();
    expect(res1.status).toBe(200);
    cleanup.ticketIds.push(data1.ticket_id);

    const res2 = await payCompletePOST(makeReq());
    const data2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(data2.ticket_id).toBe(data1.ticket_id);
    expect(data2.ticket_quantity).toBe(1);

    const { count } = await testAdmin
      .from("transactions").select("transaction_id", { count: "exact", head: true })
      .eq("stripe_payment_intent_id", fakePiId);
    expect(count).toBe(1);
    const { data: tx } = await testAdmin
      .from("transactions").select("transaction_id")
      .eq("stripe_payment_intent_id", fakePiId).single();
    cleanup.transactionIds.push(tx!.transaction_id);
  });
});
