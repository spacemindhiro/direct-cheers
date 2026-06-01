/**
 * TC-EVENTS-DETAIL: イベント詳細管理・ラインナップ・招待コードのテスト
 *
 * カバレッジ:
 *   A. events/[eventId] PATCH — イベント情報更新・権限
 *   B. events/[eventId]/lineup — アーティスト出演承認/辞退
 *   C. events/[eventId]/invite — 招待コード生成
 *   D. admin/users/[profileId]/approve — ユーザー登録承認
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers, insertEvent, insertEventArtist } from "../helpers/seed";
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
import { PATCH as eventPATCH } from "@/app/api/events/[eventId]/route";
import { POST as lineupPOST } from "@/app/api/events/[eventId]/lineup/[artistId]/route";
import { POST as invitePOST } from "@/app/api/events/[eventId]/invite/route";
import { POST as userApprovePOST } from "@/app/api/admin/users/[profileId]/approve/route";
import { insertQrConfig } from "../helpers/seed";

let adminProfileId: string;
let agentProfileId: string;
let organizerProfileId: string;
let artistProfileId: string;
let pendingUserId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
};

function mockAs(id: string, role: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role } }) };
      }
      return testAdmin.from(table);
    }),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  adminProfileId = await insertProfile({ role: "admin", displayName: "管理者（detail）", email: `admin-dt-${ts}@test.local` });
  agentProfileId = await insertProfile({ role: "agent", displayName: "エージェント（detail）", email: `agent-dt-${ts}@test.local` });
  organizerProfileId = await insertProfile({ role: "organizer", displayName: "オーガナイザー（detail）", email: `org-dt-${ts}@test.local` });
  artistProfileId = await insertProfile({ role: "artist", displayName: "アーティスト（detail）", email: `artist-dt-${ts}@test.local` });
  pendingUserId = await insertProfile({ role: "organizer", displayName: "承認待ちユーザー", email: `pending-dt-${ts}@test.local` });
  cleanup.profileIds.push(adminProfileId, agentProfileId, organizerProfileId, artistProfileId, pendingUserId);

  await testAdmin.from("profiles").update({ responsible_agent_id: agentProfileId }).eq("profile_id", organizerProfileId);
  // pending_interview ステータスに設定
  await testAdmin.from("profiles").update({ status: "pending_interview" }).eq("profile_id", pendingUserId);
}, 30_000);

afterAll(async () => {
  if (cleanup.eventIds.length)
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-EVENTS-DETAIL-A: events/[eventId] PATCH ──────────────────────────
describe("TC-EVENTS-DETAIL-A: events/[eventId] PATCH — イベント更新", () => {
  it("TC-EVENTS-DETAIL-A-01: オーガナイザーがタイトル更新 → 200・DB反映", async () => {
    const eventId = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "更新前タイトル" });
    cleanup.eventIds.push(eventId);
    mockAs(organizerProfileId, "organizer");

    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後タイトル", venue: "新会場" }),
    });
    const res = await eventPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);

    const { data: ev } = await testAdmin.from("events").select("title, venue").eq("event_id", eventId).single();
    expect(ev?.title).toBe("更新後タイトル");
    expect(ev?.venue).toBe("新会場");
  });

  it("TC-EVENTS-DETAIL-A-02: settled イベント更新 → 400 精算済み", async () => {
    const eventId = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "settled event" });
    cleanup.eventIds.push(eventId);
    await testAdmin.from("events").update({ lifecycle_status: "settled" }).eq("event_id", eventId);
    mockAs(organizerProfileId, "organizer");

    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "変更NG" }),
    });
    const res = await eventPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/精算済み/);
  });

  it("TC-EVENTS-DETAIL-A-03: 別オーガナイザー → 403", async () => {
    const otherOrgId = await insertProfile({ role: "organizer", displayName: "他org", email: `other-org-dt-${Date.now()}@test.local` });
    cleanup.profileIds.push(otherOrgId);
    const eventId = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "他orgテスト" });
    cleanup.eventIds.push(eventId);
    mockAs(otherOrgId, "organizer");

    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "変更NG" }),
    });
    const res = await eventPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(403);
  });
});

// ── TC-EVENTS-DETAIL-B: lineup — アーティスト出演承認/辞退 ──────────────
describe("TC-EVENTS-DETAIL-B: events/lineup — 出演承認・辞退", () => {
  let eventId: string;

  beforeAll(async () => {
    eventId = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "TC-EVENTS-DETAIL-B lineup" });
    cleanup.eventIds.push(eventId);
    await insertEventArtist({ eventId, artistProfileId, status: "pending" });
  });

  it("TC-EVENTS-DETAIL-B-01: アーティストが accept → event_artists.status=confirmed", async () => {
    mockAs(artistProfileId, "artist");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    const res = await lineupPOST(req, { params: Promise.resolve({ eventId, artistId: artistProfileId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true); // ルートは { ok: true, status } を返す

    const { data: ea } = await testAdmin.from("event_artists").select("status").eq("event_id", eventId).eq("artist_profile_id", artistProfileId).single();
    expect(ea?.status).toBe("confirmed");
  });

  it("TC-EVENTS-DETAIL-B-02: 既に回答済み → 409 Already responded", async () => {
    mockAs(artistProfileId, "artist");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    const res = await lineupPOST(req, { params: Promise.resolve({ eventId, artistId: artistProfileId }) });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/responded/i);
  });

  it("TC-EVENTS-DETAIL-B-03: 別アーティストによる操作 → 403", async () => {
    const artist2Id = await insertProfile({ role: "artist", displayName: "artist2", email: `artist2-dt-${Date.now()}@test.local` });
    cleanup.profileIds.push(artist2Id);
    mockAs(artist2Id, "artist");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    const res = await lineupPOST(req, { params: Promise.resolve({ eventId, artistId: artistProfileId }) });
    expect(res.status).toBe(403);
  });

  it("TC-EVENTS-DETAIL-B-04: 無効なアクション → 400", async () => {
    const artist3Id = await insertProfile({ role: "artist", displayName: "artist3", email: `artist3-dt-${Date.now()}@test.local` });
    cleanup.profileIds.push(artist3Id);
    const event2Id = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "lineup test 2" });
    cleanup.eventIds.push(event2Id);
    await insertEventArtist({ eventId: event2Id, artistProfileId: artist3Id, status: "pending" });

    mockAs(artist3Id, "artist");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid_action" }),
    });
    const res = await lineupPOST(req, { params: Promise.resolve({ eventId: event2Id, artistId: artist3Id }) });
    expect(res.status).toBe(400);
  });
});

// ── TC-EVENTS-DETAIL-C: invite — 招待コード生成 ─────────────────────────
describe("TC-EVENTS-DETAIL-C: events/invite — 招待コード生成", () => {
  it("TC-EVENTS-DETAIL-C-01: オーガナイザーが招待コード生成 → code が返る", async () => {
    const eventId = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "TC-EVENTS-DETAIL-C invite" });
    cleanup.eventIds.push(eventId);

    // invite ルートは qr_config_id が必須
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId });
    cleanup.qrConfigIds = cleanup.qrConfigIds ?? [];
    (cleanup as any).qrConfigIds.push(qrConfigId);

    mockAs(organizerProfileId, "organizer");

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qr_config_id: qrConfigId }),
    });
    const res = await invitePOST(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.code).toBeTruthy();
    expect(data.code.length).toBe(8); // 8文字コード

    // クリーンアップ
    await testAdmin.from("invitation_codes").delete().eq("code", data.code);
  });

  it("TC-EVENTS-DETAIL-C-02: 未認証 → 401", async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "TC-EVENTS-DETAIL-C-02" });
    cleanup.eventIds.push(eventId);
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      from: vi.fn((t: string) => testAdmin.from(t)),
    });
    const req = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "artist" }) });
    const res = await invitePOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(401);
  });
});

// ── TC-EVENTS-DETAIL-D: admin/users/approve ─────────────────────────────
describe("TC-EVENTS-DETAIL-D: admin/users/approve — ユーザー登録承認", () => {
  it("TC-EVENTS-DETAIL-D-01: pending_interview ユーザー承認 → status=active", async () => {
    mockAs(adminProfileId, "admin");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await userApprovePOST(req, { params: Promise.resolve({ profileId: pendingUserId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const { data: profile } = await testAdmin.from("profiles").select("status").eq("profile_id", pendingUserId).single();
    expect(profile?.status).toBe("active");
  });

  it("TC-EVENTS-DETAIL-D-02: 非admin → 403", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await userApprovePOST(req, { params: Promise.resolve({ profileId: pendingUserId }) });
    expect(res.status).toBe(403);
  });
});
