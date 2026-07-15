/**
 * TC-QR-EDIT: PATCH/DELETE /api/qr/[qrConfigId] — 権限修正と商品項目の編集解放
 *
 * カバレッジ:
 *   A. adminは担当agentでなくても編集・削除できる（バグ修正の回帰テスト）
 *   B. 商品項目（商品名・金額・在庫上限・在庫管理）の更新と作成時同等のバリデーション
 *   C. 権限外ユーザー（宛先artist・無関係organizer）は商品項目を変更できない
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertProduct,
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
// Walletプッシュはネットワーク副作用のためモック
vi.mock("@/lib/apple-wallet-push", () => ({
  pushWalletUpdateBySerial: vi.fn().mockResolvedValue(undefined),
}));

import { createClient } from "@/lib/supabase/server";
import { PATCH as qrPATCH, DELETE as qrDELETE } from "@/app/api/qr/[qrConfigId]/route";

let adminId: string;
let organizerId: string;
let agentId: string;
let artistId: string;
let otherOrganizerId: string;
let eventId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  productIds: [] as string[],
};

function mockAs(id: string, role: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role } }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

function callPatch(qrConfigId: string, body: Record<string, unknown>) {
  const req = new Request("http://localhost", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return qrPATCH(req, { params: Promise.resolve({ qrConfigId }) });
}

function callDelete(qrConfigId: string) {
  const req = new Request("http://localhost", { method: "DELETE" });
  return qrDELETE(req, { params: Promise.resolve({ qrConfigId }) });
}

// エントランス商品つきQRを1セット作る
async function seedEntranceQr(opts?: { soldCount?: number; stockLimit?: number; minAmount?: number; maxAmount?: number; recipientId?: string }) {
  const productId = await insertProduct({
    eventId,
    name: "前売りチケット",
    type: "entrance",
    paymentType: "B",
    minAmount: opts?.minAmount ?? 3000,
    maxAmount: opts?.maxAmount ?? 3000,
    stockLimit: opts?.stockLimit ?? 100,
    soldCount: opts?.soldCount ?? 0,
  });
  const qrConfigId = await insertQrConfig({
    eventId,
    creatorProfileId: organizerId,
    recipientProfileId: opts?.recipientId ?? organizerId,
    productId,
  });
  cleanup.productIds.push(productId);
  cleanup.qrConfigIds.push(qrConfigId);
  return { productId, qrConfigId };
}

beforeAll(async () => {
  const ts = Date.now();
  adminId = await insertProfile({ role: "admin", displayName: "管理者", email: `admin-qredit-${ts}@test.local` });
  organizerId = await insertProfile({ role: "organizer", displayName: "主催者", email: `org-qredit-${ts}@test.local` });
  agentId = await insertProfile({ role: "agent", displayName: "担当エージェント", email: `agent-qredit-${ts}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: "宛先アーティスト", email: `artist-qredit-${ts}@test.local` });
  otherOrganizerId = await insertProfile({ role: "organizer", displayName: "無関係主催者", email: `other-qredit-${ts}@test.local` });
  cleanup.profileIds.push(adminId, organizerId, agentId, artistId, otherOrganizerId);

  // agent_id は agentId（adminId ではない）→ adminが担当agentでないことを保証
  eventId = await insertEvent({ organizerProfileId: organizerId, agentId, title: "TC-QR-EDIT イベント" });
  cleanup.eventIds.push(eventId);
}, 30_000);

afterAll(async () => {
  if (cleanup.qrConfigIds.length)
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  if (cleanup.productIds.length)
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  if (cleanup.eventIds.length)
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── A. admin権限（バグ修正の回帰） ──────────────────────────────────────
describe("TC-QR-EDIT-A: adminは担当agentでなくても編集できる", () => {
  it("TC-QR-EDIT-A-01: adminがラベルをPATCHできる（修正前は403だった）", async () => {
    const { qrConfigId } = await seedEntranceQr();
    mockAs(adminId, "admin");

    const res = await callPatch(qrConfigId, { label: "admin編集ラベル" });
    expect(res.status).toBe(200);

    const { data: qr } = await testAdmin
      .from("qr_configs").select("label").eq("qr_config_id", qrConfigId).single();
    expect(qr!.label).toBe("admin編集ラベル");
  });

  it("TC-QR-EDIT-A-02: adminが売上ゼロのQRをDELETEできる", async () => {
    const { qrConfigId } = await seedEntranceQr();
    mockAs(adminId, "admin");

    const res = await callDelete(qrConfigId);
    expect(res.status).toBe(200);

    const { data: qr } = await testAdmin
      .from("qr_configs").select("deleted_at").eq("qr_config_id", qrConfigId).single();
    expect(qr!.deleted_at).not.toBeNull();
  });
});

// ── B. 商品項目の更新 ──────────────────────────────────────────────────
describe("TC-QR-EDIT-B: 商品項目の更新とバリデーション", () => {
  it("TC-QR-EDIT-B-01: organizerが商品名・固定金額・在庫上限を更新できる", async () => {
    const { qrConfigId, productId } = await seedEntranceQr({ stockLimit: 100 });
    mockAs(organizerId, "organizer");

    const res = await callPatch(qrConfigId, {
      product_name: "当日券",
      min_amount: 5000,
      max_amount: 5000,
      stock_limit: 50,
      track_inventory: false,
    });
    expect(res.status).toBe(200);

    const { data: p } = await testAdmin
      .from("products")
      .select("name, min_amount, max_amount, stock_limit, track_inventory")
      .eq("product_id", productId).single();
    expect(p!.name).toBe("当日券");
    expect(p!.min_amount).toBe(5000);
    expect(p!.max_amount).toBe(5000);
    expect(p!.stock_limit).toBe(50);
    expect(p!.track_inventory).toBe(false);
  });

  it("TC-QR-EDIT-B-02: 在庫上限を販売済み数未満にすると400", async () => {
    const { qrConfigId } = await seedEntranceQr({ soldCount: 10, stockLimit: 100 });
    mockAs(organizerId, "organizer");

    const res = await callPatch(qrConfigId, { stock_limit: 5 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("10件");
  });

  it("TC-QR-EDIT-B-03: 在庫上限をnull（無制限）にできる", async () => {
    const { qrConfigId, productId } = await seedEntranceQr({ soldCount: 10, stockLimit: 100 });
    mockAs(organizerId, "organizer");

    const res = await callPatch(qrConfigId, { stock_limit: null });
    expect(res.status).toBe(200);

    const { data: p } = await testAdmin
      .from("products").select("stock_limit").eq("product_id", productId).single();
    expect(p!.stock_limit).toBeNull();
  });

  it("TC-QR-EDIT-B-04: 最低金額が最高金額を上回ると400", async () => {
    const { qrConfigId } = await seedEntranceQr();
    mockAs(organizerId, "organizer");

    const res = await callPatch(qrConfigId, { min_amount: 8000, max_amount: 5000 });
    expect(res.status).toBe(400);
  });

  it("TC-QR-EDIT-B-05: 商品タイプの許容レンジ外の金額は400（entranceは上限30000）", async () => {
    const { qrConfigId } = await seedEntranceQr();
    mockAs(organizerId, "organizer");

    const res = await callPatch(qrConfigId, { min_amount: 50000, max_amount: 50000 });
    expect(res.status).toBe(400);
  });

  it("TC-QR-EDIT-B-06: 空の商品名は400", async () => {
    const { qrConfigId } = await seedEntranceQr();
    mockAs(organizerId, "organizer");

    const res = await callPatch(qrConfigId, { product_name: "   " });
    expect(res.status).toBe(400);
  });

  it("TC-QR-EDIT-B-07: レンジ縮小時に既存デフォルト金額が範囲外ならクランプされる", async () => {
    const { qrConfigId } = await seedEntranceQr({ minAmount: 500, maxAmount: 3000 });
    await testAdmin.from("qr_configs").update({ default_amount: 3000 }).eq("qr_config_id", qrConfigId);
    mockAs(organizerId, "organizer");

    const res = await callPatch(qrConfigId, { min_amount: 500, max_amount: 2000 });
    expect(res.status).toBe(200);

    const { data: qr } = await testAdmin
      .from("qr_configs").select("default_amount").eq("qr_config_id", qrConfigId).single();
    expect(qr!.default_amount).toBe(2000);
  });
});

// ── C. 権限外ユーザー ──────────────────────────────────────────────────
describe("TC-QR-EDIT-C: 権限外ユーザーは商品項目を変更できない", () => {
  it("TC-QR-EDIT-C-01: 宛先artist本人でも商品項目は403（画像のみ許可の原則維持）", async () => {
    const { qrConfigId } = await seedEntranceQr({ recipientId: artistId });
    mockAs(artistId, "artist");

    const res = await callPatch(qrConfigId, { product_name: "改ざん" });
    expect(res.status).toBe(403);
  });

  it("TC-QR-EDIT-C-02: 無関係のorganizerは403", async () => {
    const { qrConfigId } = await seedEntranceQr();
    mockAs(otherOrganizerId, "organizer");

    const res = await callPatch(qrConfigId, { product_name: "改ざん" });
    expect(res.status).toBe(403);
  });
});
