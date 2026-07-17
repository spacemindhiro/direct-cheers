/**
 * TC-INV-SEARCH: GET /api/invitations/search-users — 招待宛先ユーザー検索
 *
 * カバレッジ:
 *   A. 検索ヒット: display_name / artist_name / organizer_name のいずれでもヒットし、
 *      レスポンスにメールアドレスが含まれない
 *   B. 除外条件: 自分自身・削除済みユーザーは結果に出ない
 *   C. 権限・入力: 招待権限のないロールは403、空クエリは空配列
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
import { GET as searchGET } from "@/app/api/invitations/search-users/route";

// ─── フィクスチャ ──────────────────────────────────────────────────────
const ts = Date.now();
const MARK = `srch${ts}`;

let adminId: string;
let artistId: string;
let byDisplayId: string;
let byArtistNameId: string;
let byOrganizerNameId: string;
let deletedId: string;

const cleanup = { profileIds: [] as string[] };

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

function buildRequest(q: string) {
  return new Request(`http://localhost/api/invitations/search-users?q=${encodeURIComponent(q)}`);
}

beforeAll(async () => {
  adminId = await insertProfile({ role: "admin", displayName: `検索する管理者${MARK}`, email: `admin-${MARK}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: `権限なし${MARK}`, email: `artist-${MARK}@test.local` });
  byDisplayId = await insertProfile({ role: "user", displayName: `表示名ヒット${MARK}`, email: `by-display-${MARK}@test.local` });
  byArtistNameId = await insertProfile({ role: "artist", displayName: `無関係な表示名A`, email: `by-artist-${MARK}@test.local` });
  byOrganizerNameId = await insertProfile({ role: "organizer", displayName: `無関係な表示名B`, email: `by-organizer-${MARK}@test.local` });
  deletedId = await insertProfile({ role: "user", displayName: `削除済みヒット${MARK}`, email: `deleted-${MARK}@test.local` });
  cleanup.profileIds.push(adminId, artistId, byDisplayId, byArtistNameId, byOrganizerNameId, deletedId);

  await testAdmin.from("profiles").update({ artist_name: `DJヒット${MARK}` }).eq("profile_id", byArtistNameId);
  await testAdmin.from("profiles").update({ organizer_name: `主催ヒット${MARK}` }).eq("profile_id", byOrganizerNameId);
  await testAdmin.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("profile_id", deletedId);
}, 30_000);

afterAll(async () => {
  await deleteAuthUsers(cleanup.profileIds);
});

// ── A. 検索ヒット ──────────────────────────────────────────────────────
describe("TC-INV-SEARCH-A: 名前検索のヒット条件", () => {
  it("TC-INV-SEARCH-A-01: display_name でヒットし、メールアドレスを含まない", async () => {
    mockAs(adminId, "admin");
    const res = await searchGET(buildRequest(`表示名ヒット${MARK}`));
    expect(res.status).toBe(200);

    const { users } = await res.json();
    expect(users.length).toBe(1);
    expect(users[0]).toEqual({
      profile_id: byDisplayId,
      display_name: `表示名ヒット${MARK}`,
      artist_name: null,
      organizer_name: null,
      avatar_url: null,
      role: "user",
    });
    expect(Object.keys(users[0])).not.toContain("email");
  });

  it("TC-INV-SEARCH-A-02: artist_name でヒットする", async () => {
    mockAs(adminId, "admin");
    const res = await searchGET(buildRequest(`DJヒット${MARK}`));
    expect(res.status).toBe(200);

    const { users } = await res.json();
    expect(users.length).toBe(1);
    expect(users[0].profile_id).toBe(byArtistNameId);
    expect(users[0].artist_name).toBe(`DJヒット${MARK}`);
    expect(users[0].role).toBe("artist");
  });

  it("TC-INV-SEARCH-A-03: organizer_name でヒットする（adminがエージェント招待時に使う導線）", async () => {
    mockAs(adminId, "admin");
    const res = await searchGET(buildRequest(`主催ヒット${MARK}`));
    expect(res.status).toBe(200);

    const { users } = await res.json();
    expect(users.length).toBe(1);
    expect(users[0].profile_id).toBe(byOrganizerNameId);
    expect(users[0].organizer_name).toBe(`主催ヒット${MARK}`);
    expect(users[0].role).toBe("organizer");
  });
});

// ── B. 除外条件 ────────────────────────────────────────────────────────
describe("TC-INV-SEARCH-B: 除外条件", () => {
  it("TC-INV-SEARCH-B-01: 自分自身は結果に含まれない", async () => {
    mockAs(adminId, "admin");
    const res = await searchGET(buildRequest(`検索する管理者${MARK}`));
    expect(res.status).toBe(200);

    const { users } = await res.json();
    expect(users).toEqual([]);
  });

  it("TC-INV-SEARCH-B-02: 削除済みユーザーは結果に含まれない", async () => {
    mockAs(adminId, "admin");
    const res = await searchGET(buildRequest(`削除済みヒット${MARK}`));
    expect(res.status).toBe(200);

    const { users } = await res.json();
    expect(users).toEqual([]);
  });
});

// ── C. 権限・入力 ──────────────────────────────────────────────────────
describe("TC-INV-SEARCH-C: 権限・入力バリデーション", () => {
  it("TC-INV-SEARCH-C-01: artistロールは検索できない（403）", async () => {
    mockAs(artistId, "artist");
    const res = await searchGET(buildRequest(`表示名ヒット${MARK}`));
    expect(res.status).toBe(403);
  });

  it("TC-INV-SEARCH-C-02: 空クエリは空配列を返す", async () => {
    mockAs(adminId, "admin");
    const res = await searchGET(buildRequest("  "));
    expect(res.status).toBe(200);

    const { users } = await res.json();
    expect(users).toEqual([]);
  });

  it("TC-INV-SEARCH-C-03: PostgRESTのor構文を壊す文字が混ざってもエラーにならない", async () => {
    mockAs(adminId, "admin");
    const res = await searchGET(buildRequest(`表示名ヒット${MARK},()`));
    expect(res.status).toBe(200);

    const { users } = await res.json();
    expect(users.length).toBe(1);
    expect(users[0].profile_id).toBe(byDisplayId);
  });
});
