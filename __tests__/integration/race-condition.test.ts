/**
 * TC-RACE: レースコンディション・排他制御テスト
 *
 * リアルイベント会場での同時アクセス集中を想定。
 * reserve_product_stock RPC の pg_advisory_xact_lock による
 * オーバーセル防止を検証する。
 *
 * カバレッジ:
 *   A. 残1枚チケットに N 人が同時予約 → 1人だけ成功
 *   B. 残0枚チケット → 全員 SOLD_OUT
 *   C. 在庫十分 → 全員成功（ロックが並列処理を妨げない）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers, insertEvent, insertProduct } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

vi.mock("@/lib/supabase/server", () => ({
  getUser: vi.fn().mockResolvedValue(null),
  createClient: vi.fn(),
}));

// Stripe をモック（reserve は Stripe Customer + SetupIntent/Session を作成する）
vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      let _cnt = 0;
      (this.customers as any).create = async () => ({ id: `cus_race_${_cnt++}`, object: "customer" });
      (this.setupIntents as any).create = async () => ({ id: `seti_race_${_cnt++}`, client_secret: `seti_race_${_cnt}_secret`, object: "setup_intent" });
      (this.checkout.sessions as any).create = async () => ({ id: `cs_race_${_cnt++}`, url: "https://checkout.stripe.com/pay/cs_race_mock", object: "checkout.session" });
    }
  }
  return { ...StripeModule, default: MockStripe };
});

import { POST as reservePOST } from "@/app/api/entrance/reserve/route";

let organizerProfileId: string;
let eventId: string;
const provisionalEmails: string[] = [];

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  productIds: [] as string[],
};

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer", displayName: "オーガナイザー（race）", email: `org-race-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId);

  eventId = await insertEvent({ organizerProfileId, title: "TC-RACE テストイベント" });
  cleanup.eventIds.push(eventId);
}, 30_000);

afterAll(async () => {
  if (cleanup.productIds.length)
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  if (provisionalEmails.length)
    await testAdmin.from("provisional_users").delete().in("email", provisionalEmails);
  await testAdmin.from("entrance_reservations").delete().like("email", "%-race-%@test.local");
  await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

function makeReserveReq(productId: string, email: string): Request {
  return new Request("http://localhost/api/entrance/reserve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId, customer_email: email }),
  });
}

// ── TC-RACE-A: 残1枚に5人が同時予約 ─────────────────────────────────────
describe("TC-RACE-A: 残1枚チケットへの同時予約 — 1人だけ成功", () => {
  it("5並行リクエスト → success=1, SOLD_OUT=4, DB sold_count=1", async () => {
    const productId = await insertProduct({
      eventId,
      paymentType: "B",
      name: "Race-A チケット（在庫1枚）",
      stockLimit: 1,
      soldCount: 0,
    });
    cleanup.productIds.push(productId);

    const N = 5;
    const emails = Array.from({ length: N }, (_, i) => `user${i}-race-a-${Date.now()}@test.local`);
    emails.forEach((e) => provisionalEmails.push(e));

    const results = await Promise.all(
      emails.map((email) => reservePOST(makeReserveReq(productId, email)))
    );

    const successCount = results.filter((r) => r.status === 200).length;
    const soldOutCount = results.filter((r) => r.status === 409).length;

    // 排他ロックにより1人だけ成功するはず
    expect(successCount).toBe(1);
    expect(soldOutCount).toBe(N - 1);

    // DB の sold_count が正確に 1 になっていること
    const { data: product } = await testAdmin
      .from("products")
      .select("sold_count")
      .eq("product_id", productId)
      .single();
    expect(product?.sold_count).toBe(1);
  }, 30_000);
});

// ── TC-RACE-B: 残0枚（売り切れ）への予約 ─────────────────────────────────
describe("TC-RACE-B: 在庫0枚チケット — 全員 SOLD_OUT", () => {
  it("3並行リクエスト → 全員 409 SOLD_OUT, sold_count 変化なし", async () => {
    const productId = await insertProduct({
      eventId,
      paymentType: "B",
      name: "Race-B チケット（在庫0枚）",
      stockLimit: 3,
      soldCount: 3, // 既に売り切れ
    });
    cleanup.productIds.push(productId);

    const emails = Array.from({ length: 3 }, (_, i) => `user${i}-race-b-${Date.now()}@test.local`);
    emails.forEach((e) => provisionalEmails.push(e));

    const results = await Promise.all(
      emails.map((email) => reservePOST(makeReserveReq(productId, email)))
    );

    expect(results.every((r) => r.status === 409)).toBe(true);

    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(bodies.every((b) => b.error === "SOLD_OUT")).toBe(true);

    // sold_count が 3 のまま（増加していない）
    const { data: product } = await testAdmin.from("products").select("sold_count").eq("product_id", productId).single();
    expect(product?.sold_count).toBe(3);
  }, 30_000);
});

// ── TC-RACE-C: 在庫十分 → 全員成功（ロックが正常に解放される） ────────────
describe("TC-RACE-C: 十分な在庫 — 全員成功（ロック解放確認）", () => {
  it("5並行リクエスト × 在庫10枚 → 全員 200 成功", async () => {
    const productId = await insertProduct({
      eventId,
      paymentType: "B",
      name: "Race-C チケット（在庫10枚）",
      stockLimit: 10,
      soldCount: 0,
    });
    cleanup.productIds.push(productId);

    const N = 5;
    const emails = Array.from({ length: N }, (_, i) => `user${i}-race-c-${Date.now()}@test.local`);
    emails.forEach((e) => provisionalEmails.push(e));

    const results = await Promise.all(
      emails.map((email) => reservePOST(makeReserveReq(productId, email)))
    );

    expect(results.every((r) => r.status === 200)).toBe(true);

    const { data: product } = await testAdmin.from("products").select("sold_count").eq("product_id", productId).single();
    expect(product?.sold_count).toBe(N);
  }, 30_000);
});
