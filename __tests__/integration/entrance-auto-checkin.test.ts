/**
 * TC-AUTOCHECKIN: エントランス×Cタイプの「決済完了と同時に入場確定」機能
 *
 * 対面タッチ決済（Case④）は元々スタッフがその場にいるため、チケットは
 * 最初からstatus='used'で発行される。一方、自己QR決済（/api/pay/complete）は
 * 従来、決済完了後もstatus='valid'のままスタッフのQRスキャンを待っていた。
 * auto_checkinを有効化したQRでは、このスキャン待ちを省略し、決済完了と
 * 同時にstatus='used'で発行する。
 *
 * カバレッジ:
 *   A. /api/qr/create — auto_checkin指定時のバリデーション・保存
 *   B. /api/qr/[qrConfigId] PATCH — 作成後の編集
 *   C. /api/pay/complete — auto_checkin有効/無効でのチケット発行結果の違い
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
      (this.checkout.sessions as any).retrieve = async (id: string) => ({
        id,
        payment_status: "paid",
        payment_intent: { id: mockComplete.fakePiId, status: "requires_capture", latest_charge: null },
        customer_email: "autocheckin-buyer@test.local",
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
    role: "organizer", displayName: "即入場テスト主催者", email: `autocheckin-organizer-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId);
  eventId = await insertEvent({ organizerProfileId, title: "TC-AUTOCHECKIN イベント" });
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

// ── TC-AUTOCHECKIN-A: /api/qr/create ──────────────────────────────────────
describe("TC-AUTOCHECKIN-A: /api/qr/create — auto_checkin", () => {
  beforeAll(() => mockOrganizerAuth());

  function createReq(body: Record<string, unknown>) {
    return new Request("http://localhost/api/qr/create", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }

  it("TC-AUTOCHECKIN-A-01: entrance×C + auto_checkin=true → 作成成功しauto_checkin=trueで保存される", async () => {
    const res = await qrCreatePOST(createReq({
      event_id: eventId,
      label: "即入場エントランス",
      product_type: "entrance",
      payment_type: "C",
      min_amount: 3000,
      max_amount: 3000,
      recipient_profile_id: organizerProfileId,
      recipient_name_context: "organizer",
      targets: [{ profile_id: organizerProfileId, distribution_ratio: 1 }],
      auto_checkin: true,
    }));
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);
    cleanup.productIds.push(data.product_id);

    const { data: product } = await testAdmin.from("products").select("auto_checkin").eq("product_id", data.product_id).single();
    expect(product?.auto_checkin).toBe(true);
  });

  it("TC-AUTOCHECKIN-A-02: auto_checkin未指定（デフォルト） → falseで保存される", async () => {
    const res = await qrCreatePOST(createReq({
      event_id: eventId,
      label: "通常エントランスC",
      product_type: "entrance",
      payment_type: "C",
      min_amount: 3000,
      max_amount: 3000,
      recipient_profile_id: organizerProfileId,
      recipient_name_context: "organizer",
      targets: [{ profile_id: organizerProfileId, distribution_ratio: 1 }],
    }));
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);
    cleanup.productIds.push(data.product_id);

    const { data: product } = await testAdmin.from("products").select("auto_checkin").eq("product_id", data.product_id).single();
    expect(product?.auto_checkin).toBe(false);
  });

  it("TC-AUTOCHECKIN-A-03: entrance×B + auto_checkin=true → 400", async () => {
    const res = await qrCreatePOST(createReq({
      event_id: eventId,
      label: "不正Bタイプ",
      product_type: "entrance",
      payment_type: "B",
      min_amount: 3000,
      max_amount: 3000,
      stock_limit: 100,
      recipient_profile_id: organizerProfileId,
      recipient_name_context: "organizer",
      targets: [{ profile_id: organizerProfileId, distribution_ratio: 1 }],
      auto_checkin: true,
    }));
    expect(res.status).toBe(400);
  });
});

// ── TC-AUTOCHECKIN-B: /api/qr/[qrConfigId] PATCH ──────────────────────────
describe("TC-AUTOCHECKIN-B: /api/qr/[qrConfigId] PATCH — auto_checkinの編集", () => {
  let qrConfigId: string;
  let productId: string;
  let nonCQrConfigId: string;

  beforeAll(async () => {
    mockOrganizerAuth();
    productId = await insertProduct({
      eventId, type: "entrance", paymentType: "C", name: "編集テスト即入場",
      minAmount: 3000, maxAmount: 3000,
    });
    qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId });
    cleanup.productIds.push(productId);
    cleanup.qrConfigIds.push(qrConfigId);

    const nonCProductId = await insertProduct({
      eventId, type: "entrance", paymentType: "B", name: "編集テストBタイプ",
      minAmount: 3000, maxAmount: 3000, stockLimit: 100,
    });
    nonCQrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId: nonCProductId });
    cleanup.productIds.push(nonCProductId);
    cleanup.qrConfigIds.push(nonCQrConfigId);
  });

  function patchReq(body: Record<string, unknown>) {
    return new Request("http://localhost/api/qr/x", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }

  it("TC-AUTOCHECKIN-B-01: auto_checkin=trueに変更できる", async () => {
    const res = await qrPATCH(patchReq({ auto_checkin: true }), { params: Promise.resolve({ qrConfigId }) });
    expect(res.status).toBe(200);
    const { data: product } = await testAdmin.from("products").select("auto_checkin").eq("product_id", productId).single();
    expect(product?.auto_checkin).toBe(true);
  });

  it("TC-AUTOCHECKIN-B-02: auto_checkin=falseに戻せる", async () => {
    const res = await qrPATCH(patchReq({ auto_checkin: false }), { params: Promise.resolve({ qrConfigId }) });
    expect(res.status).toBe(200);
    const { data: product } = await testAdmin.from("products").select("auto_checkin").eq("product_id", productId).single();
    expect(product?.auto_checkin).toBe(false);
  });

  it("TC-AUTOCHECKIN-B-03: エントランスBタイプにauto_checkinを指定 → 400", async () => {
    const res = await qrPATCH(patchReq({ auto_checkin: true }), { params: Promise.resolve({ qrConfigId: nonCQrConfigId }) });
    expect(res.status).toBe(400);
  });
});

// ── TC-AUTOCHECKIN-C: /api/pay/complete ───────────────────────────────────
describe("TC-AUTOCHECKIN-C: /api/pay/complete — チケット発行結果の違い", () => {
  let autoProductId: string;
  let autoQrConfigId: string;
  let normalProductId: string;
  let normalQrConfigId: string;

  beforeAll(async () => {
    autoProductId = await insertProduct({
      eventId, type: "entrance", paymentType: "C", name: "即入場テスト券",
      minAmount: 3000, maxAmount: 3000,
    });
    await testAdmin.from("products").update({ auto_checkin: true }).eq("product_id", autoProductId);
    autoQrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId: autoProductId });
    cleanup.productIds.push(autoProductId);
    cleanup.qrConfigIds.push(autoQrConfigId);

    normalProductId = await insertProduct({
      eventId, type: "entrance", paymentType: "C", name: "通常入場テスト券",
      minAmount: 3000, maxAmount: 3000,
    });
    normalQrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId: normalProductId });
    cleanup.productIds.push(normalProductId);
    cleanup.qrConfigIds.push(normalQrConfigId);
  });

  it("TC-AUTOCHECKIN-C-01: auto_checkin有効 → チケットが最初からstatus='used'・checked_in_at設定済みで発行される", async () => {
    const fakePiId = `pi_autocheckin_${Date.now()}`;
    mockComplete.fakePiId = fakePiId;
    mockComplete.amountTotal = 3000;
    mockComplete.fakeMetadata = { product_id: autoProductId, qr_config_id: autoQrConfigId, event_id: eventId };

    const req = new Request("http://localhost/api/pay/complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: `cs_autocheckin_${Date.now()}` }),
    });
    const res = await payCompletePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.entrance_auto_checkin).toBe(true);
    cleanup.ticketIds.push(data.ticket_id);

    const { data: ticket } = await testAdmin.from("tickets").select("status, checked_in_at").eq("ticket_id", data.ticket_id).single();
    expect(ticket?.status).toBe("used");
    expect(ticket?.checked_in_at).not.toBeNull();

    const { data: tx } = await testAdmin.from("transactions").select("transaction_id").eq("stripe_payment_intent_id", fakePiId).single();
    cleanup.transactionIds.push(tx!.transaction_id);
  });

  it("TC-AUTOCHECKIN-C-02: auto_checkin無効（通常）→ チケットはstatus='valid'のまま発行される", async () => {
    const fakePiId = `pi_normal_${Date.now()}`;
    mockComplete.fakePiId = fakePiId;
    mockComplete.amountTotal = 3000;
    mockComplete.fakeMetadata = { product_id: normalProductId, qr_config_id: normalQrConfigId, event_id: eventId };

    const req = new Request("http://localhost/api/pay/complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: `cs_normal_${Date.now()}` }),
    });
    const res = await payCompletePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.entrance_auto_checkin).toBe(false);
    cleanup.ticketIds.push(data.ticket_id);

    const { data: ticket } = await testAdmin.from("tickets").select("status, checked_in_at").eq("ticket_id", data.ticket_id).single();
    expect(ticket?.status).toBe("valid");
    expect(ticket?.checked_in_at).toBeNull();

    const { data: tx } = await testAdmin.from("transactions").select("transaction_id").eq("stripe_payment_intent_id", fakePiId).single();
    cleanup.transactionIds.push(tx!.transaction_id);
  });
});
