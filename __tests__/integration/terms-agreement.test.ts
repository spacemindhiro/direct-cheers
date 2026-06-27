/**
 * TC-TERMS: /api/terms/agree, /api/terms/status の統合テスト
 *
 * 背景: terms_agreements テーブルが2つの異なるマイグレーションで別スキーマとして
 * 定義されており（古い署名画像ベースの設計が先に作られていたため、後発の
 * "create table if not exists" が本番・ステージングで無効化されていた）、
 * APIが前提とするterms_type/versionカラムが存在せず、利用規約への同意が
 * 常にエラーになる障害が発生していた（テストカバレッジが無く検知できなかった）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as agreePOST } from "@/app/api/terms/agree/route";
import { GET as statusGET } from "@/app/api/terms/status/route";

let artistProfileId: string;
let organizerProfileId: string;

const cleanup = {
  profileIds: [] as string[],
};

function mockAuth(profileId: string) {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: profileId } }, error: null }),
    },
  });
}

beforeAll(async () => {
  const ts = Date.now();
  artistProfileId = await insertProfile({
    role: "artist",
    displayName: "テストアーティスト（規約）",
    email: `artist-terms-${ts}@test.local`,
  });
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "テストオーガナイザー（規約）",
    email: `organizer-terms-${ts}@test.local`,
  });
  cleanup.profileIds.push(artistProfileId, organizerProfileId);
}, 30_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-TERMS-01: artist — baseのみ同意すればallAgreedになる", () => {
  it("同意前はallAgreed=false、同意後にallAgreed=trueになる", async () => {
    mockAuth(artistProfileId);

    const before = await statusGET();
    const beforeData = await before.json();
    expect(beforeData.allAgreed).toBe(false);
    expect(beforeData.status.base.digitallySigned).toBe(false);

    const agreeRes = await agreePOST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ types: ["base"] }) }),
    );
    expect(agreeRes.status).toBe(200);
    const agreeData = await agreeRes.json();
    expect(agreeData.ok).toBe(true);

    const after = await statusGET();
    const afterData = await after.json();
    expect(afterData.allAgreed).toBe(true);
    expect(afterData.status.base.digitallySigned).toBe(true);
    expect(afterData.status.base.agreed).toBe(true);

    const { data: row } = await testAdmin
      .from("terms_agreements")
      .select("terms_type, version, agreed_at")
      .eq("profile_id", artistProfileId)
      .eq("terms_type", "base")
      .single();
    expect(row?.terms_type).toBe("base");
    expect(row?.agreed_at).not.toBeNull();
  });
});

describe("TC-TERMS-02: organizer — デジタル同意だけではallAgreedにならない（admin確認が必要）", () => {
  it("base+organizerに同意してもconfirmed_atが無い間はallAgreed=false", async () => {
    mockAuth(organizerProfileId);

    const agreeRes = await agreePOST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ types: ["base", "organizer"] }) }),
    );
    expect(agreeRes.status).toBe(200);

    const status = await statusGET();
    const data = await status.json();
    expect(data.status.base.digitallySigned).toBe(true);
    expect(data.status.organizer.digitallySigned).toBe(true);
    expect(data.status.organizer.confirmed).toBe(false);
    expect(data.status.organizer.agreed).toBe(false);
    expect(data.allAgreed).toBe(false);
  });
});

describe("TC-TERMS-03: 許可されていない規約タイプはエラー", () => {
  it("artistがorganizer規約に同意しようとすると400", async () => {
    mockAuth(artistProfileId);
    const res = await agreePOST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ types: ["organizer"] }) }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not required/i);
  });
});
