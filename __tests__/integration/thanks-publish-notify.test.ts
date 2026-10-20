/**
 * TC-THANKS-NOTIFY: サンクス特典を公開したとき、購入者にアプリ内のお知らせが入る
 *
 * 背景: 公開時に飛ぶのは Apple Wallet のパス更新だけで、changeMessage を付けていないため
 * 端末には何も出ない。カードの裏面も開かなければ気づけないので、購入者には
 * notifications（type='thanks_published'）で知らせる。
 * 「変更を反映する」を押すたびに増えないよう、未読が残っている人には入れ直さない。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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
// APNs へ実際に飛ばさない（公開時の Wallet push）
vi.mock("@/lib/apple-wallet-push", () => ({ sendWalletPush: vi.fn().mockResolvedValue(undefined) }));

import { createClient } from "@/lib/supabase/server";
import { POST as thanksPOST } from "@/app/api/qr/[qrConfigId]/thanks/route";

let organizerId: string;
let artistId: string;
let buyerAId: string;
let buyerBId: string;
let eventId: string;
let qrConfigId: string;

const cleanup = { profileIds: [] as string[], eventIds: [] as string[], qrConfigIds: [] as string[] };

function mockAuth(profileId: string, role: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: profileId } }, error: null }) },
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

const post = (body: Record<string, unknown>) =>
  thanksPOST(
    new Request(`http://localhost/api/qr/${qrConfigId}/thanks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ qrConfigId }) },
  );

const notifs = async (profileId: string) => {
  const { data } = await testAdmin
    .from("notifications")
    .select("notification_id, type, title, body, metadata, is_read")
    .eq("profile_id", profileId)
    .eq("type", "thanks_published")
    .order("created_at", { ascending: true });
  return data ?? [];
};

beforeAll(async () => {
  const ts = Date.now();
  organizerId = await insertProfile({ role: "organizer", displayName: "Demo主催者", email: `org-thx-${ts}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: "夜更けの配信者", email: `artist-thx-${ts}@test.local` });
  buyerAId = await insertProfile({ role: "user", displayName: "買った人A", email: `buyer-a-thx-${ts}@test.local` });
  buyerBId = await insertProfile({ role: "user", displayName: "買った人B", email: `buyer-b-thx-${ts}@test.local` });
  cleanup.profileIds.push(organizerId, artistId, buyerAId, buyerBId);

  // 宛先の表示名はカードと同じ規則（artist名義なら artist_name）で解決される
  await testAdmin.from("profiles").update({ artist_name: "Luna Orbit" }).eq("profile_id", artistId);

  eventId = await insertEvent({ organizerProfileId: organizerId, title: `TC-THANKS-NOTIFY ${ts}` });
  cleanup.eventIds.push(eventId);

  qrConfigId = await insertQrConfig({
    eventId,
    creatorProfileId: organizerId,
    recipientProfileId: artistId,
    recipientNameContext: "artist",
  });
  cleanup.qrConfigIds.push(qrConfigId);

  // 完了決済: A が2回・B が1回。会員でない購入者（sender_profile_id なし）が1件。
  await insertTransaction({ qrConfigId, grossAmount: 1000, netAmount: 861, stripeFee: 39, platformFee: 100, stripePaymentIntentId: `pi_thx_a1_${ts}`, senderProfileId: buyerAId });
  await insertTransaction({ qrConfigId, grossAmount: 2000, netAmount: 1761, stripeFee: 69, platformFee: 170, stripePaymentIntentId: `pi_thx_a2_${ts}`, senderProfileId: buyerAId });
  await insertTransaction({ qrConfigId, grossAmount: 500, netAmount: 416, stripeFee: 34, platformFee: 50, stripePaymentIntentId: `pi_thx_b1_${ts}`, senderProfileId: buyerBId });
  await insertTransaction({ qrConfigId, grossAmount: 500, netAmount: 416, stripeFee: 34, platformFee: 50, stripePaymentIntentId: `pi_thx_guest_${ts}`, senderProfileId: null, senderEmail: `guest-thx-${ts}@test.local` });
  // 未完了の決済は対象外
  await insertTransaction({ qrConfigId, grossAmount: 500, netAmount: 416, stripeFee: 34, platformFee: 50, stripePaymentIntentId: `pi_thx_pending_${ts}`, status: "pending", senderProfileId: buyerBId });
});

beforeEach(async () => {
  await testAdmin.from("notifications").delete().in("profile_id", [buyerAId, buyerBId, artistId, organizerId]);
  await testAdmin.from("qr_config_thanks").delete().eq("qr_config_id", qrConfigId);
  vi.clearAllMocks();
});

afterAll(async () => {
  await testAdmin.from("notifications").delete().in("profile_id", cleanup.profileIds);
  await testAdmin.from("qr_config_thanks").delete().eq("qr_config_id", qrConfigId);
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-THANKS-NOTIFY サンクス特典の公開通知", () => {
  it("TC-THANKS-NOTIFY-01: 公開すると購入者1人につき1件入り、文面に宛先の表示名が入る", async () => {
    mockAuth(artistId, "artist");   // 宛先の出演者が自分で公開する
    const res = await post({ thanks_message: "ありがとう！", publish: true });
    expect(res.status).toBe(200);

    const a = await notifs(buyerAId);
    const b = await notifs(buyerBId);
    // 同じ人が2回買っていても1件
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
    expect(a[0].title).toBe("お返しが届いています");
    expect(a[0].body).toBe("Luna Orbit からサンクス特典が届きました。カードの裏面で確認できます");
    expect(a[0].metadata).toEqual({ qr_config_id: qrConfigId });
    expect(a[0].is_read).toBe(false);
    // 出演者・主催者（＝送った側）には入らない
    expect((await notifs(artistId)).length).toBe(0);
    expect((await notifs(organizerId)).length).toBe(0);
  });

  it("TC-THANKS-NOTIFY-02: 未読が残っているうちは「変更を反映する」を押しても増えない", async () => {
    mockAuth(organizerId, "organizer");
    await post({ thanks_message: "ありがとう！", publish: true });
    await post({ thanks_message: "ありがとう！（修正）", publish: true });
    await post({ thanks_message: "ありがとう！（再修正）", publish: true });

    expect((await notifs(buyerAId)).length).toBe(1);
    expect((await notifs(buyerBId)).length).toBe(1);
  });

  it("TC-THANKS-NOTIFY-03: 既読にしたあとに公開すると、新しく1件入る", async () => {
    mockAuth(organizerId, "organizer");
    await post({ thanks_message: "1回目", publish: true });
    await testAdmin.from("notifications").update({ is_read: true }).eq("profile_id", buyerAId).eq("type", "thanks_published");

    await post({ thanks_message: "2回目", publish: true });

    const a = await notifs(buyerAId);
    expect(a.length).toBe(2);
    expect(a.filter((n) => n.is_read === false).length).toBe(1);
    // B は未読のままだったので増えない
    expect((await notifs(buyerBId)).length).toBe(1);
  });

  it("TC-THANKS-NOTIFY-04: 下書き保存（publish=false）では通知が入らない", async () => {
    mockAuth(organizerId, "organizer");
    const res = await post({ thanks_message: "下書き", publish: false });
    expect(res.status).toBe(200);

    expect((await notifs(buyerAId)).length).toBe(0);
    expect((await notifs(buyerBId)).length).toBe(0);
    const { data: row } = await testAdmin
      .from("qr_config_thanks").select("published_at").eq("qr_config_id", qrConfigId).single();
    expect(row!.published_at).toBe(null);
  });

  it("TC-THANKS-NOTIFY-05: 権限のない人が公開しようとしても通知は入らない（403）", async () => {
    mockAuth(buyerAId, "user");
    const res = await post({ thanks_message: "乗っ取り", publish: true });
    expect(res.status).toBe(403);

    expect((await notifs(buyerAId)).length).toBe(0);
    expect((await notifs(buyerBId)).length).toBe(0);
  });
});
