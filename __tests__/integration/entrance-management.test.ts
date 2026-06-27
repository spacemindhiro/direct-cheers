/**
 * TC-ENT-MGMT: 入場チケット予約管理テスト
 *
 * カバレッジ:
 *   A. entrance/reservations GET — メール・予約ID検索
 *   B. entrance/reservations/[id]/cancel — 予約キャンセル権限・状態チェック
 *   C. entrance/product/[productId] — 商品情報取得
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers, insertEvent, insertProduct, insertTicket, insertReservation } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { GET as reservationsGET } from "@/app/api/entrance/reservations/route";
import { POST as cancelPOST } from "@/app/api/entrance/reservations/[reservationId]/cancel/route";
import { GET as productGET } from "@/app/api/entrance/product/[productId]/route";

let organizerProfileId: string;
let holderProfileId: string;
let otherProfileId: string;
let eventId: string;
let productId: string;
const testEmail = `mgmt-holder-${Date.now()}@test.local`;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  productIds: [] as string[],
  reservationIds: [] as string[],
  ticketIds: [] as string[],
};

function mockAsHolder() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: holderProfileId } }, error: null }) },
    from: vi.fn((t: string) => testAdmin.from(t)),
  });
}

function mockAsOther() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: otherProfileId } }, error: null }) },
    from: vi.fn((t: string) => testAdmin.from(t)),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({ role: "organizer", displayName: "org-mgmt", email: `org-mgmt-${ts}@test.local` });
  holderProfileId = await insertProfile({ role: "organizer", displayName: "holder-mgmt", email: testEmail });
  otherProfileId = await insertProfile({ role: "organizer", displayName: "other-mgmt", email: `other-mgmt-${ts}@test.local` });
  cleanup.profileIds.push(organizerProfileId, holderProfileId, otherProfileId);

  eventId = await insertEvent({ organizerProfileId, title: "TC-ENT-MGMT イベント" });
  cleanup.eventIds.push(eventId);

  productId = await insertProduct({ eventId, paymentType: "A", name: "管理テスト券", minAmount: 3000 });
  cleanup.productIds.push(productId);
}, 30_000);

afterAll(async () => {
  if (cleanup.ticketIds.length)
    await testAdmin.from("tickets").delete().in("ticket_id", cleanup.ticketIds);
  if (cleanup.reservationIds.length)
    await testAdmin.from("entrance_reservations").delete().in("reservation_id", cleanup.reservationIds);
  if (cleanup.productIds.length)
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-ENT-MGMT-A: reservations GET ─────────────────────────────────────
describe("TC-ENT-MGMT-A: entrance/reservations GET", () => {
  it("TC-ENT-MGMT-A-01: email なし → reservations=[] (空)", async () => {
    const req = new Request("http://localhost/api/entrance/reservations");
    const res = await reservationsGET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data.reservations)).toBe(true);
    expect(data.reservations).toHaveLength(0);
  });

  it("TC-ENT-MGMT-A-02: 存在しないメール → reservations=[]", async () => {
    const req = new Request(`http://localhost/api/entrance/reservations?email=nonexistent-${Date.now()}@test.local`);
    const res = await reservationsGET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reservations).toHaveLength(0);
  });

  it("TC-ENT-MGMT-A-03: 既存メール → 予約一覧が返る", async () => {
    const reservationId = await insertReservation({
      productId,
      eventId,
      stripeCustomerId: `cus_mgmt_${Date.now()}`,
      email: testEmail,
      chargeAmount: 3000,
      status: "reserved",
    });
    cleanup.reservationIds.push(reservationId);

    const req = new Request(`http://localhost/api/entrance/reservations?email=${encodeURIComponent(testEmail)}`);
    const res = await reservationsGET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reservations.length).toBeGreaterThanOrEqual(1);
    const found = data.reservations.find((r: any) => r.reservation_id === reservationId);
    expect(found).toBeDefined();
  });
});

// ── TC-ENT-MGMT-B: reservations/cancel ──────────────────────────────────
describe("TC-ENT-MGMT-B: entrance/reservations/cancel — 予約キャンセル", () => {
  it("TC-ENT-MGMT-B-01: reserved 状態の予約をキャンセル → ok=true", async () => {
    const reservationId = await insertReservation({
      productId, eventId,
      stripeCustomerId: `cus_cancel_${Date.now()}`,
      email: testEmail, chargeAmount: 3000, status: "reserved",
    });
    cleanup.reservationIds.push(reservationId);

    const { ticketId } = await insertTicket({
      eventId, productId,
      status: "valid",
      email: testEmail,
      holderProfileId,
      reservationId,
    });
    cleanup.ticketIds.push(ticketId);

    mockAsHolder();
    const res = await cancelPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ reservationId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    const { data: rsv } = await testAdmin.from("entrance_reservations").select("status").eq("reservation_id", reservationId).single();
    expect(rsv?.status).toBe("cancelled");

    const { data: tk } = await testAdmin.from("tickets").select("status").eq("ticket_id", ticketId).single();
    expect(tk?.status).toBe("cancelled");
  });

  it("TC-ENT-MGMT-B-02: charged（オーソリ済み）はキャンセル不可 → 400", async () => {
    const reservationId = await insertReservation({
      productId, eventId,
      stripeCustomerId: `cus_charged_${Date.now()}`,
      email: testEmail, chargeAmount: 3000, status: "charged",
    });
    cleanup.reservationIds.push(reservationId);

    const { ticketId } = await insertTicket({
      eventId, productId, status: "valid",
      email: testEmail, holderProfileId, reservationId,
    });
    cleanup.ticketIds.push(ticketId);

    mockAsHolder();
    const res = await cancelPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ reservationId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/オーソリ|キャンセルできない/);
  });

  it("TC-ENT-MGMT-B-03: 他ユーザーによるキャンセル → 403", async () => {
    const reservationId = await insertReservation({
      productId, eventId,
      stripeCustomerId: `cus_other_${Date.now()}`,
      email: testEmail, chargeAmount: 3000, status: "reserved",
    });
    cleanup.reservationIds.push(reservationId);

    const { ticketId } = await insertTicket({
      eventId, productId, status: "valid",
      email: testEmail, holderProfileId, reservationId,
    });
    cleanup.ticketIds.push(ticketId);

    mockAsOther(); // 別ユーザーとしてリクエスト
    const res = await cancelPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ reservationId }) });
    expect(res.status).toBe(403);
  });

  it("TC-ENT-MGMT-B-04: 未認証 → 401", async () => {
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      from: vi.fn((t: string) => testAdmin.from(t)),
    });
    const res = await cancelPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ reservationId: crypto.randomUUID() }) });
    expect(res.status).toBe(401);
  });
});

// ── TC-ENT-MGMT-C: entrance/product/[productId] ──────────────────────────
describe("TC-ENT-MGMT-C: entrance/product — 商品情報取得", () => {
  it("TC-ENT-MGMT-C-01: 存在する商品 → 200・商品情報が返る", async () => {
    const req = new Request(`http://localhost/api/entrance/product/${productId}`);
    const res = await productGET(req, { params: Promise.resolve({ productId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    // レスポンス: { product: { product_id, name, ... } }
    expect(data.product?.product_id ?? data.product?.name).toBeTruthy();
  });

  it("TC-ENT-MGMT-C-02: 存在しない productId → 404", async () => {
    const fakeId = crypto.randomUUID();
    const req = new Request(`http://localhost/api/entrance/product/${fakeId}`);
    const res = await productGET(req, { params: Promise.resolve({ productId: fakeId }) });
    expect(res.status).toBe(404);
  });
});
