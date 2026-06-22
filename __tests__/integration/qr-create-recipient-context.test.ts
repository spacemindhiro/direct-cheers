/**
 * TC-QRC: /api/qr/create の recipient_name_context 検証
 *
 * 背景: オーガナイザーが演者を兼任する場合、recipient_profile_id だけでは
 * 「主催者名義」か「演者名義」かを区別できない（同一profile_idになるため）。
 * recipient_name_context を明示的に保存することで、後続の決済表示・
 * statement_descriptor_suffix の名前解決が正しく分岐することを保証する。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers, insertEvent } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as qrCreatePOST } from "@/app/api/qr/create/route";

let organizerProfileId: string;
let artistProfileId: string;
let eventId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
};

function mockOrganizerAuth() {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: organizerProfileId } }, error: null }),
    },
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
    role: "organizer",
    displayName: "兼任オーガナイザー",
    email: `organizer-qrc-${ts}@test.local`,
  });
  artistProfileId = await insertProfile({
    role: "artist",
    displayName: "テスト演者",
    email: `artist-qrc-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId, artistProfileId);

  eventId = await insertEvent({ organizerProfileId, title: "TC-QRC イベント" });
  cleanup.eventIds.push(eventId);
}, 60_000);

afterAll(async () => {
  if (cleanup.qrConfigIds.length > 0) {
    await testAdmin.from("qr_config_targets").delete().in("qr_config_id", cleanup.qrConfigIds);
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  }
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

function buildBody(overrides: Record<string, any> = {}) {
  return {
    event_id: eventId,
    label: "テストQR",
    product_type: "standard",
    min_amount: 500,
    max_amount: 3000,
    recipient_profile_id: artistProfileId,
    recipient_name_context: "artist",
    targets: [{ profile_id: artistProfileId, distribution_ratio: 1 }],
    ...overrides,
  };
}

describe("TC-QRC-01: recipient_name_context が正しく保存される", () => {
  it("recipient_name_context='artist' で作成 → qr_configsに'artist'が保存される", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody()),
    });
    const res = await qrCreatePOST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);

    const { data: qr } = await testAdmin
      .from("qr_configs")
      .select("recipient_name_context")
      .eq("qr_config_id", data.qr_config_id)
      .single();
    expect(qr?.recipient_name_context).toBe("artist");
  });

  it("recipient_name_context='organizer' で作成 → qr_configsに'organizer'が保存される", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody({
        recipient_profile_id: organizerProfileId,
        recipient_name_context: "organizer",
        targets: [{ profile_id: organizerProfileId, distribution_ratio: 1 }],
      })),
    });
    const res = await qrCreatePOST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);

    const { data: qr } = await testAdmin
      .from("qr_configs")
      .select("recipient_name_context")
      .eq("qr_config_id", data.qr_config_id)
      .single();
    expect(qr?.recipient_name_context).toBe("organizer");
  });

  it("recipient_name_context省略時はデフォルト'artist'になる", async () => {
    mockOrganizerAuth();
    const body = buildBody();
    delete (body as any).recipient_name_context;
    const req = new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await qrCreatePOST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.qrConfigIds.push(data.qr_config_id);

    const { data: qr } = await testAdmin
      .from("qr_configs")
      .select("recipient_name_context")
      .eq("qr_config_id", data.qr_config_id)
      .single();
    expect(qr?.recipient_name_context).toBe("artist");
  });

  it("不正なrecipient_name_context → 400エラー", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody({ recipient_name_context: "invalid_value" })),
    });
    const res = await qrCreatePOST(req);
    expect(res.status).toBe(400);
  });
});

// ── TC-QRC-02: オーガナイザー兼演者の名義混同が起きないことを保証する ─────
describe("TC-QRC-02: 同一profile_idでも名義コンテキストで区別される（兼任ケース）", () => {
  it("organizerProfileIdを宛先に、'organizer'名義と'artist'名義それぞれでQRを作成 → 両方が正しく区別保存される", async () => {
    mockOrganizerAuth();

    // 主催者名義のQR
    const reqOrg = new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody({
        label: "主催者名義QR",
        recipient_profile_id: organizerProfileId,
        recipient_name_context: "organizer",
        targets: [{ profile_id: organizerProfileId, distribution_ratio: 1 }],
      })),
    });
    const resOrg = await qrCreatePOST(reqOrg);
    const dataOrg = await resOrg.json();
    expect(resOrg.status).toBe(200);
    cleanup.qrConfigIds.push(dataOrg.qr_config_id);

    // 同じ organizerProfileId を「演者名義」として配分・宛先に指定（兼任シナリオ）
    const reqArtist = new Request("http://localhost/api/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody({
        label: "演者名義QR（兼任）",
        recipient_profile_id: organizerProfileId,
        recipient_name_context: "artist",
        targets: [{ profile_id: organizerProfileId, distribution_ratio: 1 }],
      })),
    });
    const resArtist = await qrCreatePOST(reqArtist);
    const dataArtist = await resArtist.json();
    expect(resArtist.status).toBe(200);
    cleanup.qrConfigIds.push(dataArtist.qr_config_id);

    // 同じrecipient_profile_idだが、recipient_name_contextがそれぞれ正しく独立して保存されている
    const { data: qrRows } = await testAdmin
      .from("qr_configs")
      .select("qr_config_id, recipient_profile_id, recipient_name_context")
      .in("qr_config_id", [dataOrg.qr_config_id, dataArtist.qr_config_id]);

    const orgRow = qrRows!.find((q) => q.qr_config_id === dataOrg.qr_config_id);
    const artistRow = qrRows!.find((q) => q.qr_config_id === dataArtist.qr_config_id);

    expect(orgRow?.recipient_profile_id).toBe(organizerProfileId);
    expect(artistRow?.recipient_profile_id).toBe(organizerProfileId);
    expect(orgRow?.recipient_name_context).toBe("organizer");
    expect(artistRow?.recipient_name_context).toBe("artist");
  });
});
