/**
 * TC-PROFILE: PATCH /api/profile の統合テスト
 *
 * 背景: profile/page.tsx の保存ロジックで、organizerロールが
 * 「DJとして出演する場合」セクションで artist_name を編集しても、
 * updates オブジェクトに artist_name を含める条件分岐が
 * artist/agent/admin のみでorganizerが漏れており、保存しても
 * DBに反映されない（再取得時に元の値に戻り「消えた」ように見える）
 * バグがあった。
 *
 * このテストはAPIルート自体（admin.from("profiles").update(updates)で
 * ロール制限なく任意のカラムを更新する）が正しく動作することを保証する
 * （フロントエンドのバグはupdatesに何を含めるかの問題であり、APIの
 * 責務ではないため、ここではAPIコントラクトを固定する）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers, insertEvent, insertQrConfig, insertTransaction } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

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
import { PATCH as profilePatch } from "@/app/api/profile/route";

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
};

function mockAuth(userId: string) {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  });
}

function makeReq(body: Record<string, any>): Request {
  return new Request("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-PROFILE-01: organizerロールでもartist_nameが正しく保存される", () => {
  it("organizerプロフィールにartist_nameを含むPATCHを送ると、DBに反映される", async () => {
    const ts = Date.now();
    const profileId = await insertProfile({
      role: "organizer",
      displayName: "兼任オーガナイザー",
      email: `organizer-patch-${ts}@test.local`,
    });
    cleanup.profileIds.push(profileId);

    mockAuth(profileId);
    const res = await profilePatch(makeReq({
      display_name: "兼任オーガナイザー",
      organizer_name: "SPACE BBQ",
      artist_name: "DJ HIRO",
    }));
    expect(res.status).toBe(200);

    const { data } = await testAdmin
      .from("profiles")
      .select("artist_name, organizer_name")
      .eq("profile_id", profileId)
      .single();

    expect(data?.artist_name).toBe("DJ HIRO");
    expect(data?.organizer_name).toBe("SPACE BBQ");
  });

  it("artist_nameを含まないPATCHを送っても、既存のartist_nameは消えない（部分更新）", async () => {
    const ts = Date.now();
    const profileId = await insertProfile({
      role: "organizer",
      displayName: "兼任オーガナイザー2",
      email: `organizer-patch2-${ts}@test.local`,
    });
    cleanup.profileIds.push(profileId);

    await testAdmin.from("profiles").update({ artist_name: "DJ EXISTING" }).eq("profile_id", profileId);

    mockAuth(profileId);
    const res = await profilePatch(makeReq({
      display_name: "兼任オーガナイザー2",
      organizer_name: "SPACE BBQ",
      // artist_name を含めない
    }));
    expect(res.status).toBe(200);

    const { data } = await testAdmin
      .from("profiles")
      .select("artist_name")
      .eq("profile_id", profileId)
      .single();

    expect(data?.artist_name).toBe("DJ EXISTING");
  });
});

describe("TC-PROFILE-02: 主催者用/演者用の画像（organizer_avatar_url/artist_avatar_url）が個別に保存される", () => {
  it("両方を含むPATCHを送ると、それぞれ別のカラムに反映される", async () => {
    const ts = Date.now();
    const profileId = await insertProfile({
      role: "organizer",
      displayName: "兼任オーガナイザー（画像テスト）",
      email: `organizer-avatar-patch-${ts}@test.local`,
    });
    cleanup.profileIds.push(profileId);

    mockAuth(profileId);
    const res = await profilePatch(makeReq({
      display_name: "兼任オーガナイザー（画像テスト）",
      organizer_avatar_url: "https://example.com/organizer.webp",
      artist_avatar_url: "https://example.com/artist.webp",
    }));
    expect(res.status).toBe(200);

    const { data } = await testAdmin
      .from("profiles")
      .select("organizer_avatar_url, artist_avatar_url")
      .eq("profile_id", profileId)
      .single();

    expect(data?.organizer_avatar_url).toBe("https://example.com/organizer.webp");
    expect(data?.artist_avatar_url).toBe("https://example.com/artist.webp");
  });

  it("display_name/avatar_url以外（organizer_avatar_url）の変更でもウォレットpushがトリガーされる", async () => {
    const ts = Date.now();
    const profileId = await insertProfile({
      role: "organizer",
      displayName: "兼任オーガナイザー（push検証）",
      email: `organizer-avatar-push-${ts}@test.local`,
    });
    cleanup.profileIds.push(profileId);

    const eventId = await insertEvent({ organizerProfileId: profileId, title: "TC-PROFILE push検証イベント" });
    cleanup.eventIds.push(eventId);
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: profileId, recipientProfileId: profileId });
    cleanup.qrConfigIds.push(qrConfigId);
    const txId = await insertTransaction({
      qrConfigId, grossAmount: 1000, netAmount: 900, stripeFee: 40, platformFee: 60,
      stripePaymentIntentId: `pi_profile_avatar_push_${ts}`,
    });
    cleanup.transactionIds.push(txId);

    const { pushWalletUpdateBySerial } = await import("@/lib/apple-wallet-push");
    (pushWalletUpdateBySerial as any).mockClear();

    mockAuth(profileId);
    const res = await profilePatch(makeReq({
      display_name: "兼任オーガナイザー（push検証）",
      organizer_avatar_url: "https://example.com/organizer-new.webp",
    }));
    expect(res.status).toBe(200);

    // fire-and-forgetなのでマイクロタスクが解決するのを待つ
    await new Promise((r) => setTimeout(r, 50));
    expect(pushWalletUpdateBySerial).toHaveBeenCalledWith(txId);
  });
});
