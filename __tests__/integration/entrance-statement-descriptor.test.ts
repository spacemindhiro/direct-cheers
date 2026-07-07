/**
 * TC-ENT-SD: 入場券決済（タイプB）の on_behalf_of・statement_descriptor_suffix 検証
 *
 * チア決済（pay-cheers.test.ts）と同じパターン: checkout.sessions.create の
 * 引数をキャプチャし、route が Stripe に渡すパラメータを直接検証する。
 *
 * - Connect未発行（stripe_connect_id=null）→ on_behalf_of省略・決済はブロックしない
 * - Connect発行済み・capability完了 → on_behalf_of設定・statement_descriptor_suffixは主催者名
 *   （イベント名は使わない。漢字17文字・カナ22文字しかなく、prefixで大半を
 *   使い切るため、イベント名を足すと確実に文字数があふれて意味不明になる）
 * - Connect発行済み・capability未完了 → 422 account_incomplete でブロック
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createTestConnectAccount, deleteTestConnectAccount } from "../helpers/stripe-fixtures";
import { insertProfile, deleteAuthUsers, insertEvent, insertProduct } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

const captured: {
  sessionCreateParams?: any;
  accountCapabilities: Record<string, string>;
} = {
  accountCapabilities: { card_payments: "active", transfers: "active" },
};

vi.mock("@/lib/supabase/server", () => ({
  getUser: vi.fn().mockResolvedValue(null),
  createClient: vi.fn(),
}));

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.checkout.sessions as any).create = async (params: any) => {
        captured.sessionCreateParams = params;
        return { id: `cs_test_entsd_${Date.now()}`, url: "https://checkout.stripe.com/c/pay/cs_test_entsd_stub" };
      };
      (this.accounts as any).retrieve = async (id: string) => ({
        id,
        object: "account",
        capabilities: captured.accountCapabilities,
      });
    }
  }
  return { ...StripeModule, default: InstrumentedStripe };
});

import { POST as reservePOST } from "@/app/api/entrance/reserve/route";

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
};

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-ENT-SD-01: Connect未発行 → ブロックせず on_behalf_of 省略 ──────────
describe("TC-ENT-SD-01: オーガナイザーがConnect未発行 → ブロックせずsuffixのみ付与", () => {
  let organizerProfileId: string;
  let eventId: string;
  let productId: string;

  beforeAll(async () => {
    const ts = Date.now();
    organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "未オンボーディング主催者",
      email: `organizer-entsd01-${ts}@test.local`,
    });
    cleanup.profileIds.push(organizerProfileId);

    eventId = await insertEvent({ organizerProfileId, title: "SPACE BBQ FESTIVAL" });
    cleanup.eventIds.push(eventId);
    await testAdmin.from("profiles").update({ organizer_name: "SPACE BBQ" }).eq("profile_id", organizerProfileId);

    productId = await insertProduct({ eventId, paymentType: "B" });
  }, 60_000);

  it("200で決済リンクが返り、on_behalf_ofは省略・suffixは主催者名になる", async () => {
    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, customer_email: "fan@test.local" }),
    });
    const res = await reservePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.type).toBe("B");

    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.on_behalf_of).toBeUndefined();
    expect(pid?.statement_descriptor_suffix).toBe("SPACE BBQ");
  });
});

// ── TC-ENT-SD-02: Connect発行済み・capability完了 → on_behalf_of設定 ──────
describe("TC-ENT-SD-02: Connect発行済み・capability完了 → on_behalf_of・suffixともに設定される", () => {
  let organizerConnectId: string;
  let organizerProfileId: string;
  let eventId: string;
  let productId: string;

  beforeAll(async () => {
    organizerConnectId = await createTestConnectAccount();
    const ts = Date.now();
    organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "オンボーディング完了主催者",
      email: `organizer-entsd02-${ts}@test.local`,
      stripeConnectId: organizerConnectId,
    });
    cleanup.profileIds.push(organizerProfileId);

    eventId = await insertEvent({ organizerProfileId, title: "宇宙フェス" });
    cleanup.eventIds.push(eventId);
    // 漢字のみの主催者名（ASCII変換不能ケース）
    await testAdmin.from("profiles").update({ organizer_name: "宇宙運営" }).eq("profile_id", organizerProfileId);

    productId = await insertProduct({ eventId, paymentType: "B" });
  }, 60_000);

  afterEach(() => {
    captured.accountCapabilities = { card_payments: "active", transfers: "active" };
  });

  afterAll(async () => {
    await deleteTestConnectAccount(organizerConnectId);
  });

  it("on_behalf_ofがオーガナイザーのConnectIDになる（チア決済と統一）", async () => {
    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, customer_email: "fan@test.local" }),
    });
    const res = await reservePOST(req);
    expect(res.status).toBe(200);

    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.on_behalf_of).toBe(organizerConnectId);
  });

  it("主催者名が漢字のみの場合、statement_descriptor_suffixは省略される（ASCII化不能）", async () => {
    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, customer_email: "fan2@test.local" }),
    });
    const res = await reservePOST(req);
    expect(res.status).toBe(200);

    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.statement_descriptor_suffix).toBeUndefined();
  });

  it("capabilityが未完了の場合、422 account_incompleteでブロックされる", async () => {
    captured.accountCapabilities = { card_payments: "pending", transfers: "active" };

    const req = new Request("http://localhost/api/entrance/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, customer_email: "fan3@test.local" }),
    });
    const res = await reservePOST(req);
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toBe("account_incomplete");
    expect(data.missing_capabilities).toContain("card_payments");
  });
});
