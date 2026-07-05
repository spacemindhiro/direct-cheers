/**
 * TC-ORG-AS-ARTIST: organizerロールのユーザーが他人のイベントにartistとして招待された場合のテスト
 *
 * カバレッジ:
 *   A. PATCH /api/events/[eventId]         — 編集権限はイベント固有IDで判定（ロール不問）
 *   B. POST  /api/events/[eventId]/lineup  — organizerロールのartistがlineupを操作できる
 *   C. POST  /api/qr/create               — artistとして招待されても他人のイベントのQRは作成不可
 *   D. lineup登録ベースの表示ロジック検証  — isLineupArtist の DB的根拠をアサート
 *
 * フィクスチャ構成:
 *   ownerOrgId      : このイベントの本来のオーガナイザー（organizerロール）
 *   orgAsArtistId   : 他人のイベントにartistとして招待されたorganizer（organizerロール）
 *   regularArtistId : 通常のartistロールのユーザー（比較対象）
 *   agentId         : イベント担当エージェント
 *   eventId         : ownerOrg のイベント（orgAsArtist と regularArtist が招待済み）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertEventArtist,
  insertQrConfig,
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

import { createClient, getUser } from "@/lib/supabase/server";
import { PATCH as eventPATCH } from "@/app/api/events/[eventId]/route";
import { POST as lineupPOST } from "@/app/api/events/[eventId]/lineup/[artistId]/route";
import { POST as qrCreatePOST } from "@/app/api/qr/create/route";

// ─── フィクスチャ ──────────────────────────────────────────────────────
let ownerOrgId: string;
let orgAsArtistId: string;
let regularArtistId: string;
let agentId: string;
let eventId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
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
  (getUser as any).mockResolvedValue({ id });
}

beforeAll(async () => {
  const ts = Date.now();
  agentId = await insertProfile({ role: "agent", displayName: "エージェント", email: `agent-oaa-${ts}@test.local` });
  ownerOrgId = await insertProfile({ role: "organizer", displayName: "イベントオーナー", email: `owner-oaa-${ts}@test.local` });
  orgAsArtistId = await insertProfile({ role: "organizer", displayName: "org-as-artist", email: `oaa-${ts}@test.local` });
  regularArtistId = await insertProfile({ role: "artist", displayName: "普通のアーティスト", email: `artist-oaa-${ts}@test.local` });
  cleanup.profileIds.push(agentId, ownerOrgId, orgAsArtistId, regularArtistId);

  // イベント作成（ownerOrg が主催）
  eventId = await insertEvent({
    organizerProfileId: ownerOrgId,
    agentId,
    title: "TC-ORG-AS-ARTIST テストイベント",
  });
  cleanup.eventIds.push(eventId);

  // orgAsArtist と regularArtist を出演者として招待（pending）
  await insertEventArtist({ eventId, artistProfileId: orgAsArtistId, status: "pending" });
  await insertEventArtist({ eventId, artistProfileId: regularArtistId, status: "pending" });
}, 30_000);

afterAll(async () => {
  if (cleanup.qrConfigIds.length)
    await testAdmin.from("qr_configs").update({ deleted_at: new Date().toISOString() }).in("qr_config_id", cleanup.qrConfigIds);
  if (cleanup.eventIds.length)
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── A. PATCH /api/events/[eventId] ——————————————————————————————————
describe("TC-ORG-AS-ARTIST-A: PATCH /api/events/[eventId] — 編集権限はIDで判定", () => {
  it("TC-ORG-AS-ARTIST-A-01: ownerOrg（本来のオーガナイザー）はタイトルを更新できる", async () => {
    mockAs(ownerOrgId, "organizer");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後タイトル" }),
    });
    const res = await eventPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);
  });

  it("TC-ORG-AS-ARTIST-A-02: orgAsArtist（organizerロールだがartistとして招待）は編集できない → 403", async () => {
    mockAs(orgAsArtistId, "organizer");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "書き換えNG" }),
    });
    const res = await eventPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(403);
    // タイトルが変わっていないことを確認
    const { data: ev } = await testAdmin.from("events").select("title").eq("event_id", eventId).single();
    expect(ev?.title).not.toBe("書き換えNG");
  });

  it("TC-ORG-AS-ARTIST-A-03: regularArtist（artistロールで招待）も編集できない → 403", async () => {
    mockAs(regularArtistId, "artist");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "書き換えNG-artist" }),
    });
    const res = await eventPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(403);
  });

  it("TC-ORG-AS-ARTIST-A-04: 全く無関係なorganizerも編集できない → 403", async () => {
    const strangerOrgId = await insertProfile({
      role: "organizer",
      displayName: "無関係org",
      email: `stranger-oaa-${Date.now()}@test.local`,
    });
    cleanup.profileIds.push(strangerOrgId);
    mockAs(strangerOrgId, "organizer");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "書き換えNG-stranger" }),
    });
    const res = await eventPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(403);
  });
});

// ── B. POST /api/events/[eventId]/lineup/[artistId] ——————————————————
describe("TC-ORG-AS-ARTIST-B: POST /lineup/[artistId] — organizerロールのartistがlineupを操作できる", () => {
  it("TC-ORG-AS-ARTIST-B-01: orgAsArtist（organizerロール）が自分のlineupをaccept → 200", async () => {
    mockAs(orgAsArtistId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    const res = await lineupPOST(req, {
      params: Promise.resolve({ eventId, artistId: orgAsArtistId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // DB確認: confirmed になっている
    const { data: ea } = await testAdmin
      .from("event_artists")
      .select("status")
      .eq("event_id", eventId)
      .eq("artist_profile_id", orgAsArtistId)
      .single();
    expect(ea?.status).toBe("confirmed");
  });

  it("TC-ORG-AS-ARTIST-B-02: regularArtist（artistロール）も同様にaccept → 200", async () => {
    mockAs(regularArtistId, "artist");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    const res = await lineupPOST(req, {
      params: Promise.resolve({ eventId, artistId: regularArtistId }),
    });
    expect(res.status).toBe(200);
    const { data: ea } = await testAdmin
      .from("event_artists")
      .select("status")
      .eq("event_id", eventId)
      .eq("artist_profile_id", regularArtistId)
      .single();
    expect(ea?.status).toBe("confirmed");
  });

  it("TC-ORG-AS-ARTIST-B-03: orgAsArtist が別ユーザーのlineupを代わりに操作 → 403", async () => {
    mockAs(orgAsArtistId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    // artistId を regularArtistId にすることで他人の代わりに操作しようとする
    const res = await lineupPOST(req, {
      params: Promise.resolve({ eventId, artistId: regularArtistId }),
    });
    expect(res.status).toBe(403);
  });

  it("TC-ORG-AS-ARTIST-B-04: 招待されていないorganizerがlineupを自分で accept → 404", async () => {
    const uninvitedOrgId = await insertProfile({
      role: "organizer",
      displayName: "未招待org",
      email: `uninvited-oaa-${Date.now()}@test.local`,
    });
    cleanup.profileIds.push(uninvitedOrgId);
    mockAs(uninvitedOrgId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    const res = await lineupPOST(req, {
      params: Promise.resolve({ eventId, artistId: uninvitedOrgId }),
    });
    // lineup レコードが存在しないので 404
    expect(res.status).toBe(404);
  });
});

// ── C. POST /api/qr/create ———————————————————————————————————————————
describe("TC-ORG-AS-ARTIST-C: POST /api/qr/create — artistとして招待されてもQR作成不可", () => {
  it("TC-ORG-AS-ARTIST-C-01: ownerOrg（本来のオーガナイザー）はQRを作成できる", async () => {
    mockAs(ownerOrgId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        label: "ownerOrg QR",
        product_type: "standard",
        min_amount: 500,
        max_amount: 500,
        recipient_profile_id: ownerOrgId,
        recipient_name_context: "organizer",
        targets: [{ profile_id: ownerOrgId, distribution_ratio: 1 }],
      }),
    });
    const res = await qrCreatePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.qr_config_id).toBeTruthy();
    cleanup.qrConfigIds.push(data.qr_config_id);
  });

  it("TC-ORG-AS-ARTIST-C-02: orgAsArtist（artistとして招待されたorganizer）はQRを作成できない → 403", async () => {
    mockAs(orgAsArtistId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        label: "orgAsArtist QR（作成NG）",
        product_type: "standard",
        min_amount: 500,
        max_amount: 500,
        recipient_profile_id: orgAsArtistId,
        recipient_name_context: "artist",
        targets: [{ profile_id: orgAsArtistId, distribution_ratio: 1 }],
      }),
    });
    const res = await qrCreatePOST(req);
    expect(res.status).toBe(403);
  });

  it("TC-ORG-AS-ARTIST-C-03: regularArtist（artistロールで招待）もQRを作成できない → 403", async () => {
    mockAs(regularArtistId, "artist");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        label: "artist QR（作成NG）",
        product_type: "standard",
        min_amount: 500,
        max_amount: 500,
        recipient_profile_id: regularArtistId,
        recipient_name_context: "artist",
        targets: [{ profile_id: regularArtistId, distribution_ratio: 1 }],
      }),
    });
    const res = await qrCreatePOST(req);
    expect(res.status).toBe(403);
  });
});

// ── D. isLineupArtist の DB的根拠を確認 ——————————————————————————————
describe("TC-ORG-AS-ARTIST-D: event_artists レコードがロールに依存しないことを確認", () => {
  it("TC-ORG-AS-ARTIST-D-01: orgAsArtist は event_artists に confirmed で登録されている", async () => {
    const { data: ea } = await testAdmin
      .from("event_artists")
      .select("status, deleted_at")
      .eq("event_id", eventId)
      .eq("artist_profile_id", orgAsArtistId)
      .single();
    expect(ea?.status).toBe("confirmed");
    expect(ea?.deleted_at).toBeNull();
  });

  it("TC-ORG-AS-ARTIST-D-02: orgAsArtist の profile.role は organizer のまま変わらない", async () => {
    const { data: profile } = await testAdmin
      .from("profiles")
      .select("role")
      .eq("profile_id", orgAsArtistId)
      .single();
    expect(profile?.role).toBe("organizer");
  });

  it("TC-ORG-AS-ARTIST-D-03: ownerOrg は event_artists に登録されていない（出演者ではない）", async () => {
    const { data: ea } = await testAdmin
      .from("event_artists")
      .select("artist_profile_id")
      .eq("event_id", eventId)
      .eq("artist_profile_id", ownerOrgId)
      .maybeSingle();
    expect(ea).toBeNull();
  });

  it("TC-ORG-AS-ARTIST-D-04: QR配分対象に orgAsArtist を設定→ qr_config_targets に反映される", async () => {
    // ownerOrgが作成したQRコードにorgAsArtistを配分対象として設定
    const qrConfigId = await insertQrConfig({
      eventId,
      creatorProfileId: ownerOrgId,
      recipientProfileId: orgAsArtistId,
    });
    cleanup.qrConfigIds.push(qrConfigId);

    // qr_config_targets を挿入
    const { error } = await testAdmin.from("qr_config_targets").insert({
      qr_config_id: qrConfigId,
      profile_id: orgAsArtistId,
      distribution_ratio: 1.0,
    });
    expect(error).toBeNull();

    // orgAsArtist が配分対象として存在することを確認
    const { data: target } = await testAdmin
      .from("qr_config_targets")
      .select("profile_id, distribution_ratio")
      .eq("qr_config_id", qrConfigId)
      .eq("profile_id", orgAsArtistId)
      .single();
    expect(target?.profile_id).toBe(orgAsArtistId);
    expect(Number(target?.distribution_ratio)).toBe(1.0);
  });

  it("TC-ORG-AS-ARTIST-D-05: ownerOrg が論理削除 → isLineupArtist = false 相当（deleted_at が非null）", async () => {
    // orgAsArtist を論理削除してlineupから外す
    await testAdmin
      .from("event_artists")
      .update({ deleted_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .eq("artist_profile_id", orgAsArtistId);

    const { data: ea } = await testAdmin
      .from("event_artists")
      .select("deleted_at")
      .eq("event_id", eventId)
      .eq("artist_profile_id", orgAsArtistId)
      .single();
    // deleted_at が設定されているのでisLineupArtist判定はfalseになる
    expect(ea?.deleted_at).not.toBeNull();

    // 戻す（他テストの依存を避けるため）
    await testAdmin
      .from("event_artists")
      .update({ deleted_at: null })
      .eq("event_id", eventId)
      .eq("artist_profile_id", orgAsArtistId);
  });
});
