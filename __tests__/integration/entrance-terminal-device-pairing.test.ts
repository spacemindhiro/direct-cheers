/**
 * TC-TERMINAL-PAIRING: タッチ決済（Case④）のサインアップQR表示先子機ペアリング
 *
 * 従来、決済完了後のサインアップQRは event-display:{eventId} チャンネルに
 * 無差別ブロードキャストされており、同じイベントに繋がっている子機全てに
 * 表示されてしまっていた。/api/entrance/terminal/payment-intent で
 * target_device_id（ペアリング済み子機のdevice_id）を必須化し、
 * Stripe PaymentIntentのmetadataに保存することで、後続の
 * /api/entrance/terminal/complete が正しい宛先を子機に伝えられるようにする。
 *
 * カバレッジ:
 *   A. /api/entrance/terminal/payment-intent — target_device_idのバリデーション・保存
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
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

const captured: { piCreateParams?: any } = {};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.paymentIntents as any).create = async (params: any) => {
        captured.piCreateParams = params;
        return { id: "pi_test_pairing_stub", client_secret: "pi_test_pairing_stub_secret" };
      };
    }
  }
  return { ...StripeModule, default: InstrumentedStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as paymentIntentPOST } from "@/app/api/entrance/terminal/payment-intent/route";

let organizerProfileId: string;
let eventId: string;
let productId: string;
let displayDeviceId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  productIds: [] as string[],
  qrConfigIds: [] as string[],
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

function piReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/entrance/terminal/payment-intent", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer", displayName: "子機ペアリングテスト主催者", email: `pairing-organizer-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId);
  eventId = await insertEvent({ organizerProfileId, title: "TC-TERMINAL-PAIRING イベント" });
  cleanup.eventIds.push(eventId);

  productId = await insertProduct({
    eventId, type: "entrance", paymentType: "C", name: "タッチ決済テスト券",
    minAmount: 3000, maxAmount: 3000,
  });
  cleanup.productIds.push(productId);
  const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId });
  cleanup.qrConfigIds.push(qrConfigId);
  await testAdmin.from("qr_configs").update({ touchpay_enabled: true }).eq("qr_config_id", qrConfigId);

  displayDeviceId = crypto.randomUUID();
  await testAdmin.from("display_devices").insert({
    event_id: eventId, device_id: displayDeviceId, device_name: "テスト子機A",
  });

  mockOrganizerAuth();
}, 30_000);

afterAll(async () => {
  await testAdmin.from("display_devices").delete().eq("event_id", eventId);
  if (cleanup.qrConfigIds.length) {
    await testAdmin.from("qr_config_targets").delete().in("qr_config_id", cleanup.qrConfigIds);
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  }
  if (cleanup.productIds.length) await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  await cleanupTestData({ eventIds: cleanup.eventIds });
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-TERMINAL-PAIRING-A: /api/entrance/terminal/payment-intent — target_device_id", () => {
  it("TC-TERMINAL-PAIRING-A-01: target_device_id未指定 → 400", async () => {
    const res = await paymentIntentPOST(piReq({ product_id: productId, quantity: 1 }));
    expect(res.status).toBe(400);
  });

  it("TC-TERMINAL-PAIRING-A-02: 存在しないtarget_device_id → 400", async () => {
    const res = await paymentIntentPOST(piReq({
      product_id: productId, quantity: 1, target_device_id: crypto.randomUUID(),
    }));
    expect(res.status).toBe(400);
  });

  it("TC-TERMINAL-PAIRING-A-03: 登録済みtarget_device_id → 200・PaymentIntentのmetadataに保存される", async () => {
    const res = await paymentIntentPOST(piReq({
      product_id: productId, quantity: 2, target_device_id: displayDeviceId,
    }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.payment_intent_id).toBe("pi_test_pairing_stub");
    expect(captured.piCreateParams?.metadata?.target_device_id).toBe(displayDeviceId);
    expect(captured.piCreateParams?.metadata?.quantity).toBe("2");
  });

  it("TC-TERMINAL-PAIRING-A-04: 別イベントのtarget_device_id → 400", async () => {
    const otherEventId = await insertEvent({ organizerProfileId, title: "TC-TERMINAL-PAIRING 別イベント" });
    cleanup.eventIds.push(otherEventId);
    const otherDeviceId = crypto.randomUUID();
    await testAdmin.from("display_devices").insert({
      event_id: otherEventId, device_id: otherDeviceId, device_name: "別イベントの子機",
    });

    const res = await paymentIntentPOST(piReq({
      product_id: productId, quantity: 1, target_device_id: otherDeviceId,
    }));
    expect(res.status).toBe(400);

    await testAdmin.from("display_devices").delete().eq("event_id", otherEventId);
  });
});
