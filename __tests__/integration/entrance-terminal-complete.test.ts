/**
 * TC-TOUCHPAY-COMPLETE: /api/entrance/terminal/complete の統合テスト
 *
 * 対面タッチ決済（Case④、Stripe Terminal card_present）の決済確定API。
 * カバレッジ:
 *   A. 新規客（card_fingerprintが過去に実アカウントへ紐付いていない）
 *      → is_repeat=false・customer_name=null・holder_profile_id=null、
 *        子機へはサインアップQR用ブロードキャストのみ
 *   B. リピーター（同じcard_fingerprintが既に実アカウントへ紐付いている）
 *      → is_repeat=true・customer_name取得・新チケットのholder_profile_idを即時セット、
 *        子機へは投げ銭演出（cheer-new）ブロードキャストのみ
 *   C. 冪等性（同一payment_intent_idの再送で二重発行なし・レスポンス形状も一致）
 *   D. 権限（スタッフ以外は403）
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

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const broadcastCheerNew = vi.fn().mockResolvedValue(undefined);
const broadcastTouchpaySignup = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastCheerNew: (...args: unknown[]) => broadcastCheerNew(...args),
  broadcastTouchpaySignup: (...args: unknown[]) => broadcastTouchpaySignup(...args),
}));

// ── Stripe モック ────────────────────────────────────────────────────────────
const mockStripe: {
  piStatus: "requires_capture" | "succeeded";
  fingerprint: string | null;
  amount: number;
  metadata: Record<string, string>;
} = {
  piStatus: "requires_capture",
  fingerprint: null,
  amount: 3000,
  metadata: {},
};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.paymentIntents as any).retrieve = async (id: string) => ({
        id,
        status: mockStripe.piStatus,
        amount: mockStripe.amount,
        metadata: mockStripe.metadata,
        latest_charge: {
          payment_method_details: {
            card_present: { fingerprint: mockStripe.fingerprint },
          },
        },
      });
    }
  }
  return { ...StripeModule, default: MockStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as completePOST } from "@/app/api/entrance/terminal/complete/route";

let organizerProfileId: string;
let artistProfileId: string;
let eventId: string;
let productId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  productIds: [] as string[],
  ticketIds: [] as string[],
  transactionIds: [] as string[],
};

function mockAsOrganizer() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: organizerProfileId } }, error: null }) },
    from: vi.fn((t: string) => testAdmin.from(t)),
  });
}

function mockAsArtist() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: artistProfileId } }, error: null }) },
    from: vi.fn((t: string) => testAdmin.from(t)),
  });
}

function req(paymentIntentId: string) {
  return new Request("http://localhost/api/entrance/terminal/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payment_intent_id: paymentIntentId }),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({ role: "organizer", displayName: "org-touchpay", email: `org-touchpay-${ts}@test.local` });
  artistProfileId = await insertProfile({ role: "artist", displayName: "artist-touchpay", email: `artist-touchpay-${ts}@test.local` });
  cleanup.profileIds.push(organizerProfileId, artistProfileId);

  eventId = await insertEvent({ organizerProfileId, title: "TC-TOUCHPAY テストイベント" });
  cleanup.eventIds.push(eventId);

  productId = await insertProduct({ eventId, type: "entrance", paymentType: "C", name: "タッチ決済テスト券", minAmount: 3000 });
  cleanup.productIds.push(productId);
}, 30_000);

afterAll(async () => {
  if (cleanup.ticketIds.length)
    await testAdmin.from("tickets").delete().in("ticket_id", cleanup.ticketIds);
  if (cleanup.transactionIds.length)
    await testAdmin.from("transactions").delete().in("transaction_id", cleanup.transactionIds);
  if (cleanup.productIds.length)
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-TOUCHPAY-COMPLETE-A: 新規客 — fingerprintが未紐付け", () => {
  const piId = `pi_touchpay_new_${Date.now()}`;
  const fingerprint = `fp_new_${Date.now()}`;

  beforeAll(() => {
    mockAsOrganizer();
    mockStripe.piStatus = "requires_capture";
    mockStripe.fingerprint = fingerprint;
    mockStripe.amount = 3000;
    mockStripe.metadata = { product_id: productId, event_id: eventId, quantity: "1" };
    broadcastCheerNew.mockClear();
    broadcastTouchpaySignup.mockClear();
  });

  it("TC-TOUCHPAY-COMPLETE-A-01: is_repeat=false・customer_name=null が返る", async () => {
    const res = await completePOST(req(piId));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.is_repeat).toBe(false);
    expect(data.customer_name).toBe(null);
    expect(data.quantity).toBe(1);
    cleanup.ticketIds.push(data.ticket_id);

    const { data: tx } = await testAdmin
      .from("transactions")
      .select("transaction_id")
      .eq("stripe_payment_intent_id", piId)
      .single();
    cleanup.transactionIds.push(tx!.transaction_id);
  });

  it("TC-TOUCHPAY-COMPLETE-A-02: 新規ticketのholder_profile_idはnullのまま発行される", async () => {
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("transaction_id")
      .eq("stripe_payment_intent_id", piId)
      .single();
    const { data: ticket } = await testAdmin
      .from("tickets")
      .select("holder_profile_id, status, card_fingerprint")
      .eq("transaction_id", tx!.transaction_id)
      .single();
    expect(ticket?.holder_profile_id).toBe(null);
    expect(ticket?.status).toBe("used");
    expect(ticket?.card_fingerprint).toBe(fingerprint);
  });

  it("TC-TOUCHPAY-COMPLETE-A-03: 子機へはサインアップQR用ブロードキャストのみ送られる", () => {
    expect(broadcastTouchpaySignup).toHaveBeenCalledTimes(1);
    expect(broadcastCheerNew).not.toHaveBeenCalled();
  });
});

describe("TC-TOUCHPAY-COMPLETE-B: リピーター — fingerprintが既に実アカウントへ紐付け済み", () => {
  const fingerprint = `fp_repeat_${Date.now()}`;
  let knownProfileId: string;
  const piId = `pi_touchpay_repeat_${Date.now()}`;

  beforeAll(async () => {
    knownProfileId = await insertProfile({ role: "artist", displayName: "リピーター太郎", email: `repeat-${Date.now()}@test.local` });
    cleanup.profileIds.push(knownProfileId);

    // 過去にサインアップ済みの匿名タッチ決済ticket（既にholder_profile_idが紐付いている状態を再現）
    const { ticketId } = await insertTicket({
      eventId,
      productId,
      status: "used",
      email: null,
      holderProfileId: knownProfileId,
      cardFingerprint: fingerprint,
    });
    cleanup.ticketIds.push(ticketId);

    mockAsOrganizer();
    mockStripe.piStatus = "requires_capture";
    mockStripe.fingerprint = fingerprint;
    mockStripe.amount = 5000;
    mockStripe.metadata = { product_id: productId, event_id: eventId, quantity: "2" };
    broadcastCheerNew.mockClear();
    broadcastTouchpaySignup.mockClear();
  });

  it("TC-TOUCHPAY-COMPLETE-B-01: is_repeat=true・登録済みdisplay_nameが返る", async () => {
    const res = await completePOST(req(piId));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.is_repeat).toBe(true);
    expect(data.customer_name).toBe("リピーター太郎");
    expect(data.quantity).toBe(2);
    cleanup.ticketIds.push(data.ticket_id);

    const { data: tx } = await testAdmin
      .from("transactions")
      .select("transaction_id")
      .eq("stripe_payment_intent_id", piId)
      .single();
    cleanup.transactionIds.push(tx!.transaction_id);
  });

  it("TC-TOUCHPAY-COMPLETE-B-02: 新チケットのholder_profile_idが即時セットされる（次回サインアップ待ちにしない）", async () => {
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("transaction_id, sender_profile_id")
      .eq("stripe_payment_intent_id", piId)
      .single();
    expect(tx?.sender_profile_id).toBe(knownProfileId);

    const { data: ticket } = await testAdmin
      .from("tickets")
      .select("holder_profile_id")
      .eq("transaction_id", tx!.transaction_id)
      .single();
    expect(ticket?.holder_profile_id).toBe(knownProfileId);
  });

  it("TC-TOUCHPAY-COMPLETE-B-03: 子機へは投げ銭演出（cheer-new）のみ、サインアップQRは送られない", () => {
    expect(broadcastCheerNew).toHaveBeenCalledTimes(1);
    expect(broadcastCheerNew).toHaveBeenCalledWith(eventId, 5000);
    expect(broadcastTouchpaySignup).not.toHaveBeenCalled();
  });
});

describe("TC-TOUCHPAY-COMPLETE-C: 冪等性", () => {
  it("TC-TOUCHPAY-COMPLETE-C-01: 同一payment_intent_idを2回送っても同じレスポンス形状・二重発行なし", async () => {
    mockAsOrganizer();
    const piId = `pi_touchpay_idem_${Date.now()}`;
    const fingerprint = `fp_idem_${Date.now()}`;
    mockStripe.piStatus = "requires_capture";
    mockStripe.fingerprint = fingerprint;
    mockStripe.amount = 3000;
    mockStripe.metadata = { product_id: productId, event_id: eventId, quantity: "1" };

    const res1 = await completePOST(req(piId));
    const data1 = await res1.json();
    cleanup.ticketIds.push(data1.ticket_id);
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("transaction_id")
      .eq("stripe_payment_intent_id", piId)
      .single();
    cleanup.transactionIds.push(tx!.transaction_id);

    const res2 = await completePOST(req(piId));
    const data2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(data2.ticket_id).toBe(data1.ticket_id);
    expect(data2.quantity).toBe(data1.quantity);
    expect(data2.is_repeat).toBe(data1.is_repeat);
    expect(data2.customer_name).toBe(data1.customer_name);

    const { count } = await testAdmin
      .from("tickets")
      .select("ticket_id", { count: "exact", head: true })
      .eq("transaction_id", tx!.transaction_id);
    expect(count).toBe(1);
  });
});

describe("TC-TOUCHPAY-COMPLETE-D: 権限", () => {
  it("TC-TOUCHPAY-COMPLETE-D-01: artist（スタッフロール以外）は403", async () => {
    mockAsArtist();
    const res = await completePOST(req(`pi_touchpay_forbidden_${Date.now()}`));
    expect(res.status).toBe(403);
  });
});
