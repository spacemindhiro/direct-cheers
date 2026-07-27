/**
 * TC-ARTISTS-SEARCH: GET /api/artists/search — 出演依頼の宛先検索
 *
 * カバレッジ:
 *   A. ロール絞り込み: artist/organizer/agentはヒットし、role='user'（一般ユーザー）は
 *      statusが'active'でもヒットしない（TORASさん事例の再発防止）。adminもヒットしない。
 *   B. 除外条件: 削除済みユーザーは結果に出ない
 *   C. 入力: 空クエリは空配列
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
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
import { GET as searchGET } from "@/app/api/artists/search/route";

const ts = Date.now();
const MARK = `asrch${ts}`;

let callerId: string;
let artistId: string;
let organizerId: string;
let agentId: string;
let adminId: string;
let activeUserId: string;
let deletedArtistId: string;

const cleanup = { profileIds: [] as string[] };

function mockAsCaller() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: callerId } }, error: null }) },
  });
}

function buildRequest(q: string) {
  return new Request(`http://localhost/api/artists/search?q=${encodeURIComponent(q)}`);
}

beforeAll(async () => {
  callerId = await insertProfile({ role: "organizer", displayName: `検索者${MARK}`, email: `caller-${MARK}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: `出演者${MARK}`, email: `artist-${MARK}@test.local` });
  organizerId = await insertProfile({ role: "organizer", displayName: `共催者${MARK}`, email: `organizer-${MARK}@test.local` });
  agentId = await insertProfile({ role: "agent", displayName: `代理店${MARK}`, email: `agent-${MARK}@test.local` });
  adminId = await insertProfile({ role: "admin", displayName: `管理者${MARK}`, email: `admin-${MARK}@test.local` });
  activeUserId = await insertProfile({ role: "user", displayName: `一般ユーザー${MARK}`, email: `user-${MARK}@test.local` });
  deletedArtistId = await insertProfile({ role: "artist", displayName: `削除済み出演者${MARK}`, email: `deleted-${MARK}@test.local` });
  cleanup.profileIds.push(callerId, artistId, organizerId, agentId, adminId, activeUserId, deletedArtistId);

  // role='user'でもstatusが'active'なら検索に出てしまっていたバグの再現条件
  await testAdmin.from("profiles").update({ status: "active" }).eq("profile_id", activeUserId);
  await testAdmin.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("profile_id", deletedArtistId);
}, 30_000);

afterAll(async () => {
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-ARTISTS-SEARCH-A: ロール絞り込み", () => {
  it("TC-ARTISTS-SEARCH-A-01: role='artist' はヒットする", async () => {
    mockAsCaller();
    const res = await searchGET(buildRequest(`出演者${MARK}`));
    expect(res.status).toBe(200);
    const { artists } = await res.json();
    expect(artists.length).toBe(1);
    expect(artists[0].profile_id).toBe(artistId);
  });

  it("TC-ARTISTS-SEARCH-A-02: role='organizer' はヒットする", async () => {
    mockAsCaller();
    const res = await searchGET(buildRequest(`共催者${MARK}`));
    expect(res.status).toBe(200);
    const { artists } = await res.json();
    expect(artists.length).toBe(1);
    expect(artists[0].profile_id).toBe(organizerId);
  });

  it("TC-ARTISTS-SEARCH-A-03: role='agent' はヒットする", async () => {
    mockAsCaller();
    const res = await searchGET(buildRequest(`代理店${MARK}`));
    expect(res.status).toBe(200);
    const { artists } = await res.json();
    expect(artists.length).toBe(1);
    expect(artists[0].profile_id).toBe(agentId);
  });

  it("TC-ARTISTS-SEARCH-A-04: role='admin' はヒットしない（出演しないため対象外）", async () => {
    mockAsCaller();
    const res = await searchGET(buildRequest(`管理者${MARK}`));
    expect(res.status).toBe(200);
    const { artists } = await res.json();
    expect(artists).toEqual([]);
  });

  it("TC-ARTISTS-SEARCH-A-05: role='user' はstatus='active'でもヒットしない（再発防止）", async () => {
    mockAsCaller();
    const res = await searchGET(buildRequest(`一般ユーザー${MARK}`));
    expect(res.status).toBe(200);
    const { artists } = await res.json();
    expect(artists).toEqual([]);
  });
});

describe("TC-ARTISTS-SEARCH-B: 除外条件", () => {
  it("TC-ARTISTS-SEARCH-B-01: 削除済みユーザーは結果に含まれない", async () => {
    mockAsCaller();
    const res = await searchGET(buildRequest(`削除済み出演者${MARK}`));
    expect(res.status).toBe(200);
    const { artists } = await res.json();
    expect(artists).toEqual([]);
  });
});

describe("TC-ARTISTS-SEARCH-C: 入力バリデーション", () => {
  it("TC-ARTISTS-SEARCH-C-01: 空クエリは空配列を返す", async () => {
    mockAsCaller();
    const res = await searchGET(buildRequest("  "));
    expect(res.status).toBe(200);
    const { artists } = await res.json();
    expect(artists).toEqual([]);
  });
});
