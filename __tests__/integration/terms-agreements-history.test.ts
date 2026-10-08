/**
 * TC-TERMS-HIST: GET /api/terms/agreements（自分の規約同意履歴）の統合テスト
 *
 * 背景（2026-10-08）: デジタル同意（terms_agreements）した規約は、同意画面
 * （/dashboard/terms）では同意済みになると「同意完了（版）」の表示だけになり、
 * ログイン後に本文を見返す手段が無かった（対面調印した signed_documents のみ
 * 閲覧可能だった）。プロフィールの「規約・同意書」欄と
 * /dashboard/profile/agreements/[type]/[version] がこのAPIで同意履歴を取得する。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { GET as agreementsGET } from "@/app/api/terms/agreements/route";

let organizerProfileId: string;
let otherArtistProfileId: string;
let fanProfileId: string;

const cleanup = {
  profileIds: [] as string[],
};

function mockAuth(profileId: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: profileId ? { id: profileId } : null },
        error: null,
      }),
    },
  } as never);
}

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "テストオーガナイザー（同意履歴）",
    email: `organizer-terms-hist-${ts}@test.local`,
  });
  otherArtistProfileId = await insertProfile({
    role: "artist",
    displayName: "テストアーティスト（同意履歴・他人）",
    email: `artist-terms-hist-${ts}@test.local`,
  });
  fanProfileId = await insertProfile({
    role: "user",
    displayName: "テストファン（同意履歴）",
    email: `fan-terms-hist-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId, otherArtistProfileId, fanProfileId);

  // organizer: base の旧版・新版と organizer 版（admin確認済み）。他人の行も混ぜる
  const { error } = await testAdmin.from("terms_agreements").insert([
    { profile_id: organizerProfileId, terms_type: "base", version: "2026-05-24", agreed_at: "2026-05-25T01:00:00Z" },
    { profile_id: organizerProfileId, terms_type: "base", version: "2026-06-27", agreed_at: "2026-07-01T02:00:00Z" },
    {
      profile_id: organizerProfileId, terms_type: "organizer", version: "2026-05-24",
      agreed_at: "2026-07-01T02:00:01Z", confirmed_at: "2026-07-02T03:00:00Z",
    },
    { profile_id: otherArtistProfileId, terms_type: "base", version: "2026-06-27", agreed_at: "2026-08-01T00:00:00Z" },
  ]);
  if (error) throw error;
}, 30_000);

afterAll(async () => {
  await testAdmin.from("terms_agreements").delete().in("profile_id", cleanup.profileIds);
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-TERMS-HIST-01: 自分の同意履歴だけを、同意日時の新しい順に全バージョン返す", () => {
  it("organizer: 自分の3行が agreed_at 降順で完全一致し、他人の行は含まれない", async () => {
    mockAuth(organizerProfileId);
    const res = await agreementsGET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.agreements.map((a: { terms_type: string; version: string }) => [a.terms_type, a.version])).toEqual([
      ["organizer", "2026-05-24"],
      ["base", "2026-06-27"],
      ["base", "2026-05-24"],
    ]);
    expect(new Date(data.agreements[0].confirmed_at).toISOString()).toBe("2026-07-02T03:00:00.000Z");
    expect(data.agreements[1].confirmed_at).toBe(null);
    expect(new Date(data.agreements[2].agreed_at).toISOString()).toBe("2026-05-25T01:00:00.000Z");
  });
});

describe("TC-TERMS-HIST-02: 同意記録が無いユーザー（ファン）は空配列", () => {
  it("user ロール: agreements が [] で 200", async () => {
    mockAuth(fanProfileId);
    const res = await agreementsGET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.agreements).toEqual([]);
  });
});

describe("TC-TERMS-HIST-03: 未ログインは 401", () => {
  it("user が null なら 401 で agreements を返さない", async () => {
    mockAuth(null);
    const res = await agreementsGET();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.agreements).toBe(undefined);
    expect(data.error).toBe("Unauthorized");
  });
});
