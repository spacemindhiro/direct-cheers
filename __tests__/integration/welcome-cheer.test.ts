/**
 * TC-WELCOME-CHEER: ウェルカムチア機能の統合テスト
 *
 * エントランス決済（タッチ決済・QR自己決済、いずれもタイプC）に演者への
 * 投げ銭を裏側で自動生成し、購入者が後から演者を選ぶまでは主催者宛に
 * 計上しておく「2階建て」構造の検証。
 *
 * カバレッジ:
 *   A. /api/qr/create — welcome_cheer_amount指定時、デフォルト受取先
 *      （主催者ワンプライスチア）のproducts/qr_config/qr_config_targetsが自動生成される
 *   B. entrance/terminal/complete — 同一PIに1階・2階の2 transactionsが作成され、
 *      金額が正しく分割される（1階=単価-2階金額、2階=2階金額）
 *   C. 確定API — 正常系（演者確定で配分が切り替わる）、異常系（金額不一致・二重確定）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertProduct,
  insertQrConfig,
  insertQrConfigTargets,
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

const broadcastCheerNew = vi.fn().mockResolvedValue(undefined);
const broadcastTouchpaySignup = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastCheerNew: (...args: unknown[]) => broadcastCheerNew(...args),
  broadcastTouchpaySignup: (...args: unknown[]) => broadcastTouchpaySignup(...args),
}));

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
import { POST as qrCreatePOST } from "@/app/api/qr/create/route";
import { POST as terminalCompletePOST } from "@/app/api/entrance/terminal/complete/route";
import { GET as welcomeCheerGET } from "@/app/api/entrance/welcome-cheer/[ticketId]/route";
import { POST as welcomeCheerConfirmPOST } from "@/app/api/entrance/welcome-cheer/[ticketId]/confirm/route";

let organizerProfileId: string;
let artistProfileId: string;
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

function completeReq(paymentIntentId: string) {
  return new Request("http://localhost/api/entrance/terminal/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payment_intent_id: paymentIntentId }),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer", displayName: "WC主催者", email: `wc-organizer-${ts}@test.local`,
  });
  artistProfileId = await insertProfile({
    role: "artist", displayName: "WC演者", email: `wc-artist-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId, artistProfileId);

  eventId = await insertEvent({ organizerProfileId, title: "TC-WELCOME-CHEER イベント" });
  cleanup.eventIds.push(eventId);
}, 60_000);

afterAll(async () => {
  if (cleanup.ticketIds.length) await testAdmin.from("tickets").delete().in("ticket_id", cleanup.ticketIds);
  if (cleanup.transactionIds.length) await testAdmin.from("transaction_distributions").delete().in("transaction_id", cleanup.transactionIds);
  if (cleanup.transactionIds.length) await testAdmin.from("transactions").delete().in("transaction_id", cleanup.transactionIds);
  if (cleanup.qrConfigIds.length) {
    await testAdmin.from("qr_config_targets").delete().in("qr_config_id", cleanup.qrConfigIds);
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  }
  if (cleanup.productIds.length) await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  await cleanupTestData({ eventIds: cleanup.eventIds });
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-WC-A: /api/qr/create — ウェルカムチアのデフォルト受取先バンドル自動作成", () => {
  it("TC-WC-A-01: welcome_cheer_amount指定 → デフォルト受取先(主催者ワンプライス)が自動生成されリンクされる", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        label: "WCテストQR",
        product_type: "entrance",
        payment_type: "C",
        min_amount: 3000,
        max_amount: 3000,
        recipient_profile_id: organizerProfileId,
        recipient_name_context: "organizer",
        targets: [{ profile_id: organizerProfileId, distribution_ratio: 1 }],
        touchpay_enabled: true,
        welcome_cheer_amount: 500,
      }),
    });
    const res = await qrCreatePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.welcome_cheer_product_id).toBeTruthy();
    cleanup.productIds.push(data.product_id, data.welcome_cheer_product_id);
    cleanup.qrConfigIds.push(data.qr_config_id);

    const { data: entranceProduct } = await testAdmin
      .from("products")
      .select("welcome_cheer_amount, welcome_cheer_default_product_id")
      .eq("product_id", data.product_id)
      .single();
    expect(entranceProduct?.welcome_cheer_amount).toBe(500);
    expect(entranceProduct?.welcome_cheer_default_product_id).toBe(data.welcome_cheer_product_id);

    const { data: wcProduct } = await testAdmin
      .from("products")
      .select("type, min_amount, max_amount, artist_id")
      .eq("product_id", data.welcome_cheer_product_id)
      .single();
    expect(wcProduct?.type).toBe("standard");
    expect(wcProduct?.min_amount).toBe(500);
    expect(wcProduct?.max_amount).toBe(500);
    expect(wcProduct?.artist_id).toBe(organizerProfileId);

    const { data: wcQrConfig } = await testAdmin
      .from("qr_configs")
      .select("qr_config_id")
      .eq("product_id", data.welcome_cheer_product_id)
      .single();
    cleanup.qrConfigIds.push(wcQrConfig!.qr_config_id);

    const { data: wcTargets } = await testAdmin
      .from("qr_config_targets")
      .select("profile_id, distribution_ratio")
      .eq("qr_config_id", wcQrConfig!.qr_config_id);
    expect(wcTargets).toHaveLength(1);
    expect(wcTargets![0].profile_id).toBe(organizerProfileId);
    expect(Number(wcTargets![0].distribution_ratio)).toBe(1);

    // デフォルト受取先は候補テーブルにも自動登録される
    const { data: eligibleRows } = await testAdmin
      .from("welcome_cheer_eligible_products")
      .select("cheer_product_id")
      .eq("entrance_product_id", data.product_id);
    expect(eligibleRows).toHaveLength(1);
    expect(eligibleRows![0].cheer_product_id).toBe(data.welcome_cheer_product_id);
  });

  it("TC-WC-A-04: welcome_cheer_eligible_product_idsで既存チアQRを候補指定できる", async () => {
    mockOrganizerAuth();
    const existingCheerProductId = await insertProduct({
      eventId, type: "standard", name: "既存の演者チア", minAmount: 700, maxAmount: 700, artistId: artistProfileId,
    });
    cleanup.productIds.push(existingCheerProductId);
    const existingCheerQrConfigId = await insertQrConfig({
      eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId, productId: existingCheerProductId,
    });
    await insertQrConfigTargets(existingCheerQrConfigId, [{ profileId: artistProfileId, ratio: 1 }]);
    cleanup.qrConfigIds.push(existingCheerQrConfigId);

    const req = new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        label: "WC候補指定テストQR",
        product_type: "entrance",
        payment_type: "C",
        min_amount: 3000,
        max_amount: 3000,
        recipient_profile_id: organizerProfileId,
        recipient_name_context: "organizer",
        targets: [{ profile_id: organizerProfileId, distribution_ratio: 1 }],
        welcome_cheer_amount: 700,
        welcome_cheer_eligible_product_ids: [existingCheerProductId],
      }),
    });
    const res = await qrCreatePOST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.productIds.push(data.product_id, data.welcome_cheer_product_id);
    cleanup.qrConfigIds.push(data.qr_config_id);
    const { data: defaultWcQrConfig } = await testAdmin
      .from("qr_configs").select("qr_config_id").eq("product_id", data.welcome_cheer_product_id).single();
    cleanup.qrConfigIds.push(defaultWcQrConfig!.qr_config_id);

    const { data: eligibleRows } = await testAdmin
      .from("welcome_cheer_eligible_products")
      .select("cheer_product_id")
      .eq("entrance_product_id", data.product_id);
    const eligibleIds = (eligibleRows ?? []).map((r) => r.cheer_product_id);
    expect(eligibleIds).toContain(data.welcome_cheer_product_id); // デフォルト先
    expect(eligibleIds).toContain(existingCheerProductId); // 明示的に選んだ既存チア
    expect(eligibleIds).toHaveLength(2);
  });

  it("TC-WC-A-05: 金額が一致しないチアQRをwelcome_cheer_eligible_product_idsに指定 → 400", async () => {
    mockOrganizerAuth();
    const wrongAmountProductId = await insertProduct({
      eventId, type: "standard", name: "金額違い", minAmount: 999, maxAmount: 999, artistId: artistProfileId,
    });
    cleanup.productIds.push(wrongAmountProductId);

    const req = new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        label: "WC候補金額不一致テストQR",
        product_type: "entrance",
        payment_type: "C",
        min_amount: 3000,
        max_amount: 3000,
        recipient_profile_id: organizerProfileId,
        recipient_name_context: "organizer",
        targets: [{ profile_id: organizerProfileId, distribution_ratio: 1 }],
        welcome_cheer_amount: 500,
        welcome_cheer_eligible_product_ids: [wrongAmountProductId],
      }),
    });
    const res = await qrCreatePOST(req);
    expect(res.status).toBe(400);
  });

  it("TC-WC-A-02: welcome_cheer_amount >= min_amount → 400", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        label: "WC不正金額QR",
        product_type: "entrance",
        payment_type: "C",
        min_amount: 3000,
        max_amount: 3000,
        recipient_profile_id: organizerProfileId,
        recipient_name_context: "organizer",
        targets: [{ profile_id: organizerProfileId, distribution_ratio: 1 }],
        welcome_cheer_amount: 3000,
      }),
    });
    const res = await qrCreatePOST(req);
    expect(res.status).toBe(400);
  });

  it("TC-WC-A-03: エントランス以外でwelcome_cheer_amount指定 → 400", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        label: "WC対象外QR",
        product_type: "standard",
        min_amount: 500,
        max_amount: 3000,
        recipient_profile_id: artistProfileId,
        recipient_name_context: "artist",
        targets: [{ profile_id: artistProfileId, distribution_ratio: 1 }],
        welcome_cheer_amount: 500,
      }),
    });
    const res = await qrCreatePOST(req);
    expect(res.status).toBe(400);
  });
});

describe("TC-WC-B: entrance/terminal/complete — 同一PIに1階・2階の2 transactionsが作成される", () => {
  let entranceProductId: string;
  let wcProductId: string;
  let wcQrConfigId: string;
  const piId = `pi_wc_touchpay_${Date.now()}`;

  beforeAll(async () => {
    wcProductId = await insertProduct({
      eventId, type: "standard", name: "WC演者チア", minAmount: 500, maxAmount: 500, artistId: organizerProfileId,
    });
    wcQrConfigId = await insertQrConfig({
      eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId: wcProductId,
    });
    await insertQrConfigTargets(wcQrConfigId, [{ profileId: organizerProfileId, ratio: 1 }]);
    cleanup.productIds.push(wcProductId);
    cleanup.qrConfigIds.push(wcQrConfigId);

    entranceProductId = await insertProduct({
      eventId, type: "entrance", paymentType: "C", name: "WCエントランス券", minAmount: 3000, maxAmount: 3000,
      welcomeCheerAmount: 500, welcomeCheerDefaultProductId: wcProductId,
    });
    cleanup.productIds.push(entranceProductId);

    mockOrganizerAuth();
    mockStripe.piStatus = "requires_capture";
    mockStripe.fingerprint = `fp_wc_${Date.now()}`;
    mockStripe.amount = 3000;
    mockStripe.metadata = { product_id: entranceProductId, event_id: eventId, quantity: "1" };
  }, 30_000);

  it("TC-WC-B-01: 1階=2500・2階=500の2行が同一PIで作られる", async () => {
    const res = await terminalCompletePOST(completeReq(piId));
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.ticketIds.push(data.ticket_id);

    const { data: txs } = await testAdmin
      .from("transactions")
      .select("transaction_id, product_id, total_gross_amount, stripe_pi_sequence, welcome_cheer_locked_at")
      .eq("stripe_payment_intent_id", piId)
      .order("stripe_pi_sequence", { ascending: true });
    expect(txs).toHaveLength(2);
    cleanup.transactionIds.push(...txs!.map((t) => t.transaction_id));

    const floor1 = txs!.find((t) => t.stripe_pi_sequence === 0)!;
    const floor2 = txs!.find((t) => t.stripe_pi_sequence === 1)!;
    expect(floor1.product_id).toBe(entranceProductId);
    expect(floor1.total_gross_amount).toBe(2500);
    expect(floor2.product_id).toBe(wcProductId);
    expect(floor2.total_gross_amount).toBe(500);
    expect(floor2.welcome_cheer_locked_at).toBeNull();
  });

  it("TC-WC-B-02: 2階の配分はデフォルト（主催者100%）になっている", async () => {
    const { data: floor2 } = await testAdmin
      .from("transactions")
      .select("transaction_id")
      .eq("stripe_payment_intent_id", piId)
      .eq("stripe_pi_sequence", 1)
      .single();

    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("profile_id, distribution_role, actual_amount")
      .eq("transaction_id", floor2!.transaction_id)
      .eq("distribution_status", "accrued")
      .in("distribution_role", ["organizer", "artist"]);
    expect(dists).toHaveLength(1);
    expect(dists![0].profile_id).toBe(organizerProfileId);
    expect(dists![0].distribution_role).toBe("organizer");
  });

  it("TC-WC-B-03: 冪等リトライ（同一PI再送）で2階が重複作成されない", async () => {
    const res = await terminalCompletePOST(completeReq(piId));
    expect(res.status).toBe(200);

    const { count } = await testAdmin
      .from("transactions")
      .select("transaction_id", { count: "exact", head: true })
      .eq("stripe_payment_intent_id", piId);
    expect(count).toBe(2);
  });
});

describe("TC-WC-C: 確定API — 演者選択の正常系・異常系", () => {
  let entranceProductId: string;
  let wcDefaultProductId: string;
  let artistProductId: string;
  let artistQrConfigId: string;
  let wrongPriceProductId: string;
  let ticketId: string;
  let floor2TransactionId: string;
  const piId = `pi_wc_confirm_${Date.now()}`;

  beforeAll(async () => {
    wcDefaultProductId = await insertProduct({
      eventId, type: "standard", name: "WC確定デフォルト", minAmount: 500, maxAmount: 500, artistId: organizerProfileId,
    });
    const defaultQrConfigId = await insertQrConfig({
      eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId, productId: wcDefaultProductId,
    });
    await insertQrConfigTargets(defaultQrConfigId, [{ profileId: organizerProfileId, ratio: 1 }]);
    cleanup.productIds.push(wcDefaultProductId);
    cleanup.qrConfigIds.push(defaultQrConfigId);

    artistProductId = await insertProduct({
      eventId, type: "standard", name: "演者本人のチア", minAmount: 500, maxAmount: 500, artistId: artistProfileId,
    });
    artistQrConfigId = await insertQrConfig({
      eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId, productId: artistProductId,
    });
    await insertQrConfigTargets(artistQrConfigId, [{ profileId: artistProfileId, ratio: 1 }]);
    cleanup.productIds.push(artistProductId);
    cleanup.qrConfigIds.push(artistQrConfigId);

    // 金額不一致の商品（400を確認するため）
    wrongPriceProductId = await insertProduct({
      eventId, type: "standard", name: "金額違いのチア", minAmount: 1000, maxAmount: 1000, artistId: artistProfileId,
    });
    cleanup.productIds.push(wrongPriceProductId);

    entranceProductId = await insertProduct({
      eventId, type: "entrance", paymentType: "C", name: "WC確定用エントランス券", minAmount: 3000, maxAmount: 3000,
      welcomeCheerAmount: 500, welcomeCheerDefaultProductId: wcDefaultProductId,
    });
    cleanup.productIds.push(entranceProductId);

    // 候補テーブルに登録: デフォルト(主催者)・演者本人のチアのみ許可。
    // wrongPriceProductIdはあえて登録しない（400テストのため）。
    const { error: eligibleInsertError } = await testAdmin
      .from("welcome_cheer_eligible_products")
      .insert([
        { entrance_product_id: entranceProductId, cheer_product_id: wcDefaultProductId },
        { entrance_product_id: entranceProductId, cheer_product_id: artistProductId },
      ]);
    if (eligibleInsertError) throw new Error(`候補登録失敗: ${eligibleInsertError.message}`);

    mockOrganizerAuth();
    mockStripe.piStatus = "requires_capture";
    mockStripe.fingerprint = `fp_wc_confirm_${Date.now()}`;
    mockStripe.amount = 3000;
    mockStripe.metadata = { product_id: entranceProductId, event_id: eventId, quantity: "1" };

    const res = await terminalCompletePOST(completeReq(piId));
    const data = await res.json();
    ticketId = data.ticket_id;
    cleanup.ticketIds.push(ticketId);

    const { data: txs } = await testAdmin
      .from("transactions")
      .select("transaction_id, stripe_pi_sequence")
      .eq("stripe_payment_intent_id", piId);
    cleanup.transactionIds.push(...txs!.map((t) => t.transaction_id));
    floor2TransactionId = txs!.find((t) => t.stripe_pi_sequence === 1)!.transaction_id;
  }, 30_000);

  it("TC-WC-C-01: GET — 演者候補一覧に演者本人のチアが含まれる", async () => {
    const req = new Request(`http://localhost/api/entrance/welcome-cheer/${ticketId}`);
    const res = await welcomeCheerGET(req, { params: Promise.resolve({ ticketId }) });
    const data = await res.json();

    expect(data.has_welcome_cheer).toBe(true);
    expect(data.amount).toBe(500);
    expect(data.locked).toBe(false);
    expect(data.candidates.some((c: any) => c.product_id === artistProductId)).toBe(true);
    // 金額違いの商品は候補に出ない
    expect(data.candidates.some((c: any) => c.product_id === wrongPriceProductId)).toBe(false);
  });

  it("TC-WC-C-02: 金額不一致の商品を指定 → 400", async () => {
    const req = new Request(`http://localhost/api/entrance/welcome-cheer/${ticketId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: wrongPriceProductId }),
    });
    const res = await welcomeCheerConfirmPOST(req, { params: Promise.resolve({ ticketId }) });
    expect(res.status).toBe(400);

    const { data: floor2 } = await testAdmin
      .from("transactions")
      .select("welcome_cheer_locked_at")
      .eq("transaction_id", floor2TransactionId)
      .single();
    expect(floor2?.welcome_cheer_locked_at).toBeNull();
  });

  it("TC-WC-C-03: 正しい演者商品を指定 → 確定し配分が演者に切り替わる", async () => {
    const req = new Request(`http://localhost/api/entrance/welcome-cheer/${ticketId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: artistProductId }),
    });
    const res = await welcomeCheerConfirmPOST(req, { params: Promise.resolve({ ticketId }) });
    expect(res.status).toBe(200);

    const { data: floor2 } = await testAdmin
      .from("transactions")
      .select("product_id, qr_config_id, welcome_cheer_locked_at")
      .eq("transaction_id", floor2TransactionId)
      .single();
    expect(floor2?.product_id).toBe(artistProductId);
    expect(floor2?.qr_config_id).toBe(artistQrConfigId);
    expect(floor2?.welcome_cheer_locked_at).not.toBeNull();

    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("profile_id, distribution_role")
      .eq("transaction_id", floor2TransactionId)
      .eq("distribution_status", "accrued")
      .in("distribution_role", ["organizer", "artist"]);
    expect(dists).toHaveLength(1);
    expect(dists![0].profile_id).toBe(artistProfileId);
    expect(dists![0].distribution_role).toBe("artist");
  });

  it("TC-WC-C-04: 確定済みに再度確定を試みる → 409", async () => {
    const req = new Request(`http://localhost/api/entrance/welcome-cheer/${ticketId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: wcDefaultProductId }),
    });
    const res = await welcomeCheerConfirmPOST(req, { params: Promise.resolve({ ticketId }) });
    expect(res.status).toBe(409);

    // 配分は演者のまま変わらない
    const { data: floor2 } = await testAdmin
      .from("transactions")
      .select("product_id")
      .eq("transaction_id", floor2TransactionId)
      .single();
    expect(floor2?.product_id).toBe(artistProductId);
  });

  it("TC-WC-C-05: GET — 確定後はlocked=trueで返る", async () => {
    const req = new Request(`http://localhost/api/entrance/welcome-cheer/${ticketId}`);
    const res = await welcomeCheerGET(req, { params: Promise.resolve({ ticketId }) });
    const data = await res.json();
    expect(data.locked).toBe(true);
  });
});
