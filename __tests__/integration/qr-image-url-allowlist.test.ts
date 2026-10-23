/**
 * TC-QR-IMGURL: QR画像・帯画像のURLは自分たちの Storage（qr-images）だけ — 2026-10-22
 *
 * 背景: image_url / strip_image_url はウォレットカード作成時にサーバーが取りに行く。
 * 従来は作成・更新APIがクライアントから来たURLを素通しで保存していたため、
 * 主催者や宛先本人が攻撃者のサーバーを指させると、サーバーがその応答を受け取って処理していた
 * （SSRF、Node.js の応答展開処理の脆弱性 CVE-2026-111497 の入口）。
 * 取得時のガード（lib/apple-pass-generator.ts）に加え、保存時にも弾く。
 *
 * カバレッジ:
 *   A. 新規作成（POST /api/qr/create）: qr-images は保存、外部URLは400で作られない
 *   B. 更新（PATCH /api/qr/[qrConfigId]）: 変えるときだけ検証。保存済みの値の送り直しは通す
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertProduct,
  insertEventArtist,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";
import { storagePublicPrefix } from "@/lib/image-source";

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

const OWN = `${storagePublicPrefix("qr-images")}tc-qr-imgurl/x.jpg`;
const OWN2 = `${storagePublicPrefix("qr-images")}tc-qr-imgurl/y.jpg`;
const EXTERNAL = "https://evil.example.com/x.jpg";
const LEGACY = "https://legacy.example.com/old.jpg";

let organizerId: string;
let artistId: string;
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
    label: "TC-QR-IMGURL",
    product_type: "standard",
    min_amount: 500,
    max_amount: 3000,
    recipient_profile_id: artistId,
    recipient_name_context: "artist",
    targets: [{ profile_id: artistId, distribution_ratio: 1 }],
    ...overrides,
  };
}

async function countQrs() {
  const { count } = await testAdmin
    .from("qr_configs").select("qr_config_id", { count: "exact", head: true }).eq("event_id", eventId);
  return count ?? 0;
}

// 宛先＝artist のQRを作り、画像URLを直接入れておく（imageUrl=LEGACY で「以前に保存された外部URL」を再現）
async function seedQr(images: { image_url?: string | null; strip_image_url?: string | null } = {}) {
  const productId = await insertProduct({ eventId, name: "TC-QR-IMGURL 商品", type: "standard", minAmount: 500, maxAmount: 3000 });
  const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerId, recipientProfileId: artistId, productId });
  cleanup.productIds.push(productId);
  cleanup.qrConfigIds.push(qrConfigId);
  if (Object.keys(images).length) {
    const { error } = await testAdmin.from("qr_configs").update(images).eq("qr_config_id", qrConfigId);
    if (error) throw new Error(error.message);
  }
  return qrConfigId;
}

async function readQr(qrConfigId: string) {
  const { data } = await testAdmin
    .from("qr_configs").select("label, image_url, strip_image_url").eq("qr_config_id", qrConfigId).single();
  return data!;
}

beforeAll(async () => {
  const ts = Date.now();
  organizerId = await insertProfile({ role: "organizer", displayName: "主催者", email: `org-qrimgurl-${ts}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: "出演者", email: `artist-qrimgurl-${ts}@test.local` });
  cleanup.profileIds.push(organizerId, artistId);

  eventId = await insertEvent({ organizerProfileId: organizerId, title: "TC-QR-IMGURL イベント" });
  cleanup.eventIds.push(eventId);
  // 宛先・配分先はイベントの出演者だけ（2026-10-23〜 API も確かめる）
  await insertEventArtist({ eventId, artistProfileId: artistId });
}, 30_000);

afterAll(async () => {
  const { data: rest } = await testAdmin.from("qr_configs").select("qr_config_id, product_id").eq("event_id", eventId);
  const qrIds = [...new Set([...cleanup.qrConfigIds, ...(rest ?? []).map((r) => r.qr_config_id)])];
  const productIds = [...new Set([...cleanup.productIds, ...(rest ?? []).map((r) => r.product_id).filter(Boolean)])];
  if (qrIds.length) await testAdmin.from("qr_config_targets").delete().in("qr_config_id", qrIds);
  if (qrIds.length) await testAdmin.from("qr_configs").delete().in("qr_config_id", qrIds);
  if (productIds.length) await testAdmin.from("products").delete().in("product_id", productIds);
  await testAdmin.from("products").delete().eq("event_id", eventId);
  if (cleanup.eventIds.length) await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── A. 新規作成 ──────────────────────────────────────────────────────────
describe("TC-QR-IMGURL-A: 新規作成時の画像URL", () => {
  it("TC-QR-IMGURL-A-01: qr-images の画像 → そのまま保存される", async () => {
    mockAs(organizerId, "organizer");
    const res = await callCreate(buildCreateBody({ image_url: OWN }));
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);
    expect((await readQr(data.qr_config_id)).image_url).toBe(OWN);
  });

  it("TC-QR-IMGURL-A-02: 外部URLの image_url → 400、QRは作られない", async () => {
    mockAs(organizerId, "organizer");
    const before = await countQrs();
    const res = await callCreate(buildCreateBody({ image_url: EXTERNAL }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("画像の形式が不正です");
    expect(await countQrs()).toBe(before);
  });

  it("TC-QR-IMGURL-A-03: 外部URLの strip_image_url（エントランス等の帯画像）→ 400、QRは作られない", async () => {
    mockAs(organizerId, "organizer");
    const before = await countQrs();
    const res = await callCreate(buildCreateBody({ strip_image_url: EXTERNAL }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("画像の形式が不正です");
    expect(await countQrs()).toBe(before);
  });

  // QR 画像が要らないタイプ（エントランス）は、画像なしで保存される
  it("TC-QR-IMGURL-A-04: エントランスで画像なし（省略）→ 保存され、画像は null", async () => {
    mockAs(organizerId, "organizer");
    const res = await callCreate(buildCreateBody({ product_type: "entrance", payment_type: "C" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);
    const qr = await readQr(data.qr_config_id);
    expect(qr.image_url).toBe(null);
    expect(qr.strip_image_url).toBe(null);
  });

  // スタンダード・メッセージは画像が必須（画面と同じ。2026-10-23〜 API も確かめる）
  it("TC-QR-IMGURL-A-05: スタンダードで画像なし → 400、QRは作られない", async () => {
    mockAs(organizerId, "organizer");
    const before = await countQrs();
    const res = await callCreate(buildCreateBody());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("QR画像をアップロードしてください");
    expect(await countQrs()).toBe(before);
  });
});

// ── B. 更新 ──────────────────────────────────────────────────────────────
describe("TC-QR-IMGURL-B: 更新時の画像URL", () => {
  it("TC-QR-IMGURL-B-01: 主催者が外部URLに変える → 400、値は変わらない", async () => {
    const qrConfigId = await seedQr({ image_url: OWN });
    mockAs(organizerId, "organizer");
    const res = await callPatch(qrConfigId, { image_url: EXTERNAL });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("画像の形式が不正です");
    expect((await readQr(qrConfigId)).image_url).toBe(OWN);
  });

  it("TC-QR-IMGURL-B-02: 宛先本人（artist）が外部URLに変える → 400、値は変わらない", async () => {
    const qrConfigId = await seedQr({ image_url: OWN });
    mockAs(artistId, "artist");
    const res = await callPatch(qrConfigId, { image_url: EXTERNAL });
    expect(res.status).toBe(400);
    expect((await readQr(qrConfigId)).image_url).toBe(OWN);
  });

  it("TC-QR-IMGURL-B-03: 宛先本人が帯画像を外部URLに変える → 400、値は変わらない", async () => {
    const qrConfigId = await seedQr({ strip_image_url: OWN });
    mockAs(artistId, "artist");
    const res = await callPatch(qrConfigId, { strip_image_url: EXTERNAL });
    expect(res.status).toBe(400);
    expect((await readQr(qrConfigId)).strip_image_url).toBe(OWN);
  });

  it("TC-QR-IMGURL-B-04: 宛先本人が別の qr-images の画像に変える → 200、保存される", async () => {
    const qrConfigId = await seedQr({ image_url: OWN });
    mockAs(artistId, "artist");
    const res = await callPatch(qrConfigId, { image_url: OWN2 });
    expect(res.status).toBe(200);
    expect((await readQr(qrConfigId)).image_url).toBe(OWN2);
  });

  it("TC-QR-IMGURL-B-05: 画像を外す（null）→ 200、null になる", async () => {
    const qrConfigId = await seedQr({ image_url: OWN });
    mockAs(artistId, "artist");
    const res = await callPatch(qrConfigId, { image_url: null });
    expect(res.status).toBe(200);
    expect((await readQr(qrConfigId)).image_url).toBe(null);
  });

  it("TC-QR-IMGURL-B-06: 保存済みの外部URLをそのまま送り直し、ラベルだけ変える → 200（編集画面は変えていない画像も送る）", async () => {
    const qrConfigId = await seedQr({ image_url: LEGACY });
    mockAs(organizerId, "organizer");
    const res = await callPatch(qrConfigId, { label: "ラベル変更", image_url: LEGACY });
    expect(res.status).toBe(200);
    const qr = await readQr(qrConfigId);
    expect(qr.label).toBe("ラベル変更");
    expect(qr.image_url).toBe(LEGACY);
  });

  it("TC-QR-IMGURL-B-07: 保存済みの外部URLから別の外部URLに変える → 400、値は変わらない", async () => {
    const qrConfigId = await seedQr({ image_url: LEGACY });
    mockAs(organizerId, "organizer");
    const res = await callPatch(qrConfigId, { image_url: EXTERNAL });
    expect(res.status).toBe(400);
    expect((await readQr(qrConfigId)).image_url).toBe(LEGACY);
  });
});
