/**
 * TC-VENUES: 会場マスタ（/api/venues, /api/venues/search）の統合テスト
 *
 * カバレッジ:
 *   A. 新規登録 → その場で検索にヒットする
 *   B. 同名会場は登録できない（グローバルに一意）
 *   C. 未ログイン・artistロールは登録・検索とも拒否
 *   D. 必須項目欠落は登録できない
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { POST as createVenue } from "@/app/api/venues/route";
import { GET as searchVenues } from "@/app/api/venues/search/route";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

let organizerId: string;
let artistId: string;
let currentUserId: string;
const venueIds: string[] = [];
const venueNames: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: currentUserId } } })),
    },
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            const { data } = await testAdmin.from(table).select("role").eq("profile_id", currentUserId).single();
            return { data };
          },
        }),
      }),
    })),
  })),
}));

function callSearch(q: string) {
  return searchVenues(new Request(`http://localhost:3000/api/venues/search?q=${encodeURIComponent(q)}`));
}

function callCreate(body: Record<string, unknown>) {
  return createVenue(new Request("http://localhost:3000/api/venues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeAll(async () => {
  organizerId = await insertProfile({
    role: "organizer",
    displayName: "会場テスト用オーガナイザー",
    email: `venue-test-organizer-${randomUUID().slice(0, 8)}@example.com`,
  });
  artistId = await insertProfile({
    role: "artist",
    displayName: "会場テスト用アーティスト",
    email: `venue-test-artist-${randomUUID().slice(0, 8)}@example.com`,
  });
});

afterAll(async () => {
  if (venueIds.length) await testAdmin.from("venues").delete().in("venue_id", venueIds);
  if (venueNames.length) await testAdmin.from("venues").delete().in("name", venueNames);
  await testAdmin.from("profiles").delete().in("profile_id", [organizerId, artistId]);
  await deleteAuthUsers([organizerId, artistId]);
});

describe("TC-VENUES", () => {
  it("A. 新規登録した会場がその場で検索にヒットする", async () => {
    currentUserId = organizerId;
    const name = `検証用ホール${randomUUID().slice(0, 8)}`;
    venueNames.push(name);

    const createRes = await callCreate({
      name,
      postal_code: "150-0001",
      prefecture: "東京都",
      city: "渋谷区",
      town: "神宮前",
      line1: "1-1-1",
    });
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.venue.name).toBe(name);
    venueIds.push(created.venue.venue_id);

    const searchRes = await callSearch(name.slice(0, 6));
    expect(searchRes.status).toBe(200);
    const { venues } = await searchRes.json();
    expect(venues.some((v: { venue_id: string }) => v.venue_id === created.venue.venue_id)).toBe(true);
  });

  it("B. 同名会場は登録できない（409）", async () => {
    currentUserId = organizerId;
    const name = `検証用ホール重複${randomUUID().slice(0, 8)}`;
    venueNames.push(name);

    const first = await callCreate({
      name, postal_code: "400-0000", prefecture: "山梨県", city: "北杜市", line1: "1-1-1",
    });
    expect(first.status).toBe(200);
    const firstData = await first.json();
    venueIds.push(firstData.venue.venue_id);

    const dup = await callCreate({
      name, postal_code: "400-0000", prefecture: "山梨県", city: "北杜市", line1: "2-2-2",
    });
    expect(dup.status).toBe(409);
  });

  it("C. artistロールは登録・検索とも403", async () => {
    currentUserId = artistId;
    const createRes = await callCreate({
      name: `artist試行${randomUUID().slice(0, 8)}`, postal_code: "100-0001", prefecture: "東京都", city: "千代田区", line1: "1-1",
    });
    expect(createRes.status).toBe(403);

    const searchRes = await callSearch("検証用");
    expect(searchRes.status).toBe(403);
  });

  it("D. 必須項目（例: city）が欠落していると登録できない", async () => {
    currentUserId = organizerId;
    const res = await callCreate({
      name: `不完全会場${randomUUID().slice(0, 8)}`, postal_code: "100-0001", prefecture: "東京都", city: "", line1: "1-1",
    });
    expect(res.status).toBe(400);
  });
});
