/**
 * TC-QR-BYPASS: 有効期間バイパス（qr_configs.bypass_validity）はadmin限定
 *
 * 背景: QRチェックインのテスト用に、開催日外でも決済フォームを表示できる
 * バイパススイッチがある。従来は「organizerのみ使用不可」というブラックリスト
 * 式で、agentも使えてしまっていた。admin限定のホワイトリスト式に変更した
 * ことの回帰テスト。あわせて、作成済みQRの更新（PATCH）でも同じくadmin限定
 * でこのスイッチを変更できることを確認する。
 *
 * カバレッジ:
 *   A. 新規作成（POST /api/qr/create）: admin以外が指定してもfalseになる
 *   B. 更新（PATCH /api/qr/[qrConfigId]）: admin以外が送ると403、adminは変更できる
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
vi.mock("@/lib/apple-wallet-push", () => ({
  pushWalletUpdateBySerial: vi.fn().mockResolvedValue(undefined),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as qrCreatePOST } from "@/app/api/qr/create/route";
import { PATCH as qrPATCH } from "@/app/api/qr/[qrConfigId]/route";

let adminId: string;
let organizerId: string;
let agentId: string;
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

function callCreate(body: Record<string, unknown>) {
  const req = new Request("http://localhost/api/qr/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return qrCreatePOST(req);
}

function callPatch(qrConfigId: string, body: Record<string, unknown>) {
  const req = new Request("http://localhost", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return qrPATCH(req, { params: Promise.resolve({ qrConfigId }) });
}

function buildCreateBody(overrides: Record<string, any> = {}) {
  return {
    event_id: eventId,
    label: "テストQR",
    product_type: "standard",
    min_amount: 500,
    max_amount: 3000,
    recipient_profile_id: organizerId,
    recipient_name_context: "organizer",
    targets: [{ profile_id: organizerId, distribution_ratio: 1 }],
    bypass_validity: true,
    ...overrides,
  };
}

async function seedQr() {
  const productId = await insertProduct({
    eventId,
    name: "テスト商品",
    type: "standard",
    minAmount: 500,
    maxAmount: 3000,
  });
  const qrConfigId = await insertQrConfig({
    eventId,
    creatorProfileId: organizerId,
    recipientProfileId: organizerId,
    productId,
  });
  cleanup.productIds.push(productId);
  cleanup.qrConfigIds.push(qrConfigId);
  return qrConfigId;
}

beforeAll(async () => {
  const ts = Date.now();
  adminId = await insertProfile({ role: "admin", displayName: "管理者", email: `admin-qrbypass-${ts}@test.local` });
  organizerId = await insertProfile({ role: "organizer", displayName: "主催者", email: `org-qrbypass-${ts}@test.local` });
  agentId = await insertProfile({ role: "agent", displayName: "担当エージェント", email: `agent-qrbypass-${ts}@test.local` });
  cleanup.profileIds.push(adminId, organizerId, agentId);

  eventId = await insertEvent({ organizerProfileId: organizerId, agentId, title: "TC-QR-BYPASS イベント" });
  cleanup.eventIds.push(eventId);
}, 30_000);

afterAll(async () => {
  if (cleanup.qrConfigIds.length)
    await testAdmin.from("qr_config_targets").delete().in("qr_config_id", cleanup.qrConfigIds);
  if (cleanup.qrConfigIds.length)
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  if (cleanup.productIds.length)
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  if (cleanup.eventIds.length)
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── A. 新規作成 ──────────────────────────────────────────────────────────
describe("TC-QR-BYPASS-A: 新規作成時のbypass_validityはadmin限定", () => {
  it("TC-QR-BYPASS-A-01: adminがbypass_validity=trueを指定 → そのままtrueで保存される", async () => {
    mockAs(adminId, "admin");
    const res = await callCreate(buildCreateBody());
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);

    const { data: qr } = await testAdmin
      .from("qr_configs").select("bypass_validity").eq("qr_config_id", data.qr_config_id).single();
    expect(qr!.bypass_validity).toBe(true);
  });

  it("TC-QR-BYPASS-A-02: agent（担当）がbypass_validity=trueを指定 → falseで保存される", async () => {
    mockAs(agentId, "agent");
    const res = await callCreate(buildCreateBody());
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);

    const { data: qr } = await testAdmin
      .from("qr_configs").select("bypass_validity").eq("qr_config_id", data.qr_config_id).single();
    expect(qr!.bypass_validity).toBe(false);
  });

  it("TC-QR-BYPASS-A-03: organizerがbypass_validity=trueを指定 → falseで保存される", async () => {
    mockAs(organizerId, "organizer");
    const res = await callCreate(buildCreateBody());
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);

    const { data: qr } = await testAdmin
      .from("qr_configs").select("bypass_validity").eq("qr_config_id", data.qr_config_id).single();
    expect(qr!.bypass_validity).toBe(false);
  });
});

// ── B. 更新（既存QRの編集） ────────────────────────────────────────────────
describe("TC-QR-BYPASS-B: 更新時のbypass_validityはadmin限定", () => {
  it("TC-QR-BYPASS-B-01: adminはPATCHでbypass_validityをtrueに変更できる", async () => {
    const qrConfigId = await seedQr();
    mockAs(adminId, "admin");

    const res = await callPatch(qrConfigId, { bypass_validity: true });
    expect(res.status).toBe(200);

    const { data: qr } = await testAdmin
      .from("qr_configs").select("bypass_validity").eq("qr_config_id", qrConfigId).single();
    expect(qr!.bypass_validity).toBe(true);
  });

  it("TC-QR-BYPASS-B-02: agent（担当）がPATCHでbypass_validityを送ると403、値は変わらない", async () => {
    const qrConfigId = await seedQr();
    mockAs(agentId, "agent");

    const res = await callPatch(qrConfigId, { bypass_validity: true });
    expect(res.status).toBe(403);

    const { data: qr } = await testAdmin
      .from("qr_configs").select("bypass_validity").eq("qr_config_id", qrConfigId).single();
    expect(qr!.bypass_validity).toBe(false);
  });

  it("TC-QR-BYPASS-B-03: organizerがPATCHでbypass_validityを送ると403、値は変わらない", async () => {
    const qrConfigId = await seedQr();
    mockAs(organizerId, "organizer");

    const res = await callPatch(qrConfigId, { bypass_validity: true });
    expect(res.status).toBe(403);

    const { data: qr } = await testAdmin
      .from("qr_configs").select("bypass_validity").eq("qr_config_id", qrConfigId).single();
    expect(qr!.bypass_validity).toBe(false);
  });
});
