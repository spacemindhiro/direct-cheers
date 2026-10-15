/**
 * TC-LINEUP-DEFER: 下書きの間は出演依頼を送らない（依頼予定）
 *
 * 下書きで登録した出演者には何も届かず、主催者が承認依頼を送った時点でまとめて
 * 出演依頼（スレッド・通知・メール）が届く。下書きでないイベントへの追加は従来どおり即時。
 *
 * カバレッジ:
 *   A. 作成時（下書き）は送らない・依頼メッセージは保持
 *   B. 承認依頼でまとめて送る（スレッド参加者・依頼メッセージの投稿者・通知の内容）
 *   C. 編集での追加：公開済みは即時、下書きは保留（エージェントの依頼メッセージは保存しない）
 *   D. 送信済み・削除済みの出演者には再送しない
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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
vi.mock("@/lib/email/notification", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    sendLineupInviteEmail: vi.fn().mockResolvedValue(undefined),
    sendApprovalRequestEmail: vi.fn().mockResolvedValue(undefined),
  };
});

import { createClient } from "@/lib/supabase/server";
import { sendLineupInviteEmail } from "@/lib/email/notification";
import { POST as createPOST } from "@/app/api/events/create/route";
import { PATCH as eventPATCH } from "@/app/api/events/[eventId]/route";
import { POST as requestReviewPOST } from "@/app/api/events/[eventId]/request-review/route";

let agentId: string;
let organizerId: string;
let artist1Id: string;
let artist2Id: string;
let artist3Id: string;
const cleanup = { profileIds: [] as string[], eventIds: [] as string[] };

function mockAs(profileId: string, role: string, extra: Record<string, unknown> = {}) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: profileId } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role, status: "active", responsible_agent_id: agentId, ...extra } }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

const ctx = (eventId: string) => ({ params: Promise.resolve({ eventId }) });
const json = (method: string, body: unknown) =>
  new Request("http://localhost", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function lineupNotifCount(artistId: string, eventId: string) {
  const { count } = await testAdmin.from("notifications").select("notification_id", { count: "exact", head: true })
    .eq("profile_id", artistId).eq("type", "lineup_invite").filter("metadata->>event_id", "eq", eventId);
  return count;
}
async function eventArtist(eventId: string, artistId: string) {
  const { data } = await testAdmin.from("event_artists").select("event_artist_id, status, invite_message, deleted_at")
    .eq("event_id", eventId).eq("artist_profile_id", artistId).single();
  return data!;
}
async function conversationOf(eventArtistId: string) {
  const { data } = await testAdmin.from("conversations").select("conversation_id").eq("event_artist_id", eventArtistId).maybeSingle();
  return data?.conversation_id ?? null;
}
async function createDraftAsOrganizer(title: string, artists: { profile_id: string; invite_message?: string | null }[]) {
  mockAs(organizerId, "organizer");
  const res = await createPOST(new Request("http://localhost/api/events/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title, venue: "依頼予定テスト会場",
      start_at: new Date(Date.now() + 5 * 86400_000).toISOString(),
      end_at: new Date(Date.now() + 5 * 86400_000 + 3 * 3600_000).toISOString(),
      artists,
    }),
  }));
  const { event_id } = await res.json();
  cleanup.eventIds.push(event_id);
  return event_id as string;
}

beforeAll(async () => {
  const ts = Date.now();
  agentId = await insertProfile({ role: "agent", displayName: "エージェント（依頼予定）", email: `agent-defer-${ts}@test.local` });
  organizerId = await insertProfile({ role: "organizer", displayName: "主催者（依頼予定）", email: `org-defer-${ts}@test.local` });
  artist1Id = await insertProfile({ role: "artist", displayName: "出演者1（依頼予定）", email: `a1-defer-${ts}@test.local` });
  artist2Id = await insertProfile({ role: "artist", displayName: "出演者2（依頼予定）", email: `a2-defer-${ts}@test.local` });
  artist3Id = await insertProfile({ role: "artist", displayName: "出演者3（依頼予定）", email: `a3-defer-${ts}@test.local` });
  cleanup.profileIds.push(agentId, organizerId, artist1Id, artist2Id, artist3Id);
  await testAdmin.from("profiles").update({ responsible_agent_id: agentId, organizer_name: "依頼予定の屋号" }).eq("profile_id", organizerId);
}, 30_000);

afterAll(async () => {
  if (cleanup.eventIds.length) {
    await testAdmin.from("notifications").delete().filter("metadata->>event_id", "in", `(${cleanup.eventIds.join(",")})`);
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  }
  await deleteAuthUsers(cleanup.profileIds);
});

beforeEach(() => {
  vi.mocked(sendLineupInviteEmail).mockClear();
});

describe("TC-LINEUP-DEFER-A/B: 作成時は依頼予定 → 承認依頼でまとめて送る", () => {
  let eventId: string;

  it("A-01: 主催者が出演者付きで作成 → 通知・スレッド・メールなし、依頼メッセージは出演行に保持", async () => {
    eventId = await createDraftAsOrganizer(`依頼予定A-${Date.now()}`, [
      { profile_id: artist1Id, invite_message: "ぜひ出演してください" },
      { profile_id: artist2Id, invite_message: null },
    ]);
    const ea1 = await eventArtist(eventId, artist1Id);
    expect(ea1.status).toBe("pending");
    expect(ea1.invite_message).toBe("ぜひ出演してください");
    expect(await conversationOf(ea1.event_artist_id)).toBe(null);
    expect(await lineupNotifCount(artist1Id, eventId)).toBe(0);
    expect(await lineupNotifCount(artist2Id, eventId)).toBe(0);
    expect(vi.mocked(sendLineupInviteEmail)).toHaveBeenCalledTimes(0);
  });

  it("B-01: 主催者が承認依頼 → 2人に通知1件ずつ・メール2回", async () => {
    mockAs(organizerId, "organizer");
    const res = await requestReviewPOST(new Request("http://localhost", { method: "POST" }), ctx(eventId));
    expect(res.status).toBe(200);
    expect(await lineupNotifCount(artist1Id, eventId)).toBe(1);
    expect(await lineupNotifCount(artist2Id, eventId)).toBe(1);
    expect(vi.mocked(sendLineupInviteEmail)).toHaveBeenCalledTimes(2);

    const { data: n } = await testAdmin.from("notifications").select("body, metadata")
      .eq("profile_id", artist1Id).eq("type", "lineup_invite").filter("metadata->>event_id", "eq", eventId).single();
    expect(n?.body.startsWith("依頼予定の屋号 から「依頼予定A-")).toBe(true);
    expect(n?.metadata.organizer_id).toBe(organizerId);
  });

  it("B-02: スレッドは主催者と出演者・依頼メッセージは主催者名義で1通、メッセージなしの出演者は0通", async () => {
    const ea1 = await eventArtist(eventId, artist1Id);
    const conv1 = await conversationOf(ea1.event_artist_id);
    expect(conv1).not.toBe(null);
    const { data: parts } = await testAdmin.from("conversation_participants").select("profile_id").eq("conversation_id", conv1!);
    expect((parts ?? []).map((p) => p.profile_id).sort()).toEqual([organizerId, artist1Id].sort());
    const { data: msgs } = await testAdmin.from("messages").select("sender_profile_id, body").eq("conversation_id", conv1!);
    expect(msgs).toEqual([{ sender_profile_id: organizerId, body: "ぜひ出演してください" }]);

    const ea2 = await eventArtist(eventId, artist2Id);
    const conv2 = await conversationOf(ea2.event_artist_id);
    const { count } = await testAdmin.from("messages").select("message_id", { count: "exact", head: true }).eq("conversation_id", conv2!);
    expect(count).toBe(0);
  });
});

describe("TC-LINEUP-DEFER-C: 編集での出演者追加", () => {
  it("C-01: 公開済みイベントへの追加 → 即時に通知1件・スレッド作成", async () => {
    const eventId = await createDraftAsOrganizer(`依頼予定C01-${Date.now()}`, []);
    await testAdmin.from("events").update({ lifecycle_status: "published" }).eq("event_id", eventId);
    mockAs(organizerId, "organizer");
    const res = await eventPATCH(json("PATCH", { artists: [{ profile_id: artist1Id, invite_message: null }] }), ctx(eventId));
    expect(res.status).toBe(200);
    expect(await lineupNotifCount(artist1Id, eventId)).toBe(1);
    expect(await conversationOf((await eventArtist(eventId, artist1Id)).event_artist_id)).not.toBe(null);
    expect(vi.mocked(sendLineupInviteEmail)).toHaveBeenCalledTimes(1);
  });

  it("C-02: 下書きにエージェントが追加 → 送らない・依頼メッセージは保存しない", async () => {
    const eventId = await createDraftAsOrganizer(`依頼予定C02-${Date.now()}`, []);
    mockAs(agentId, "agent");
    const res = await eventPATCH(json("PATCH", { artists: [{ profile_id: artist3Id, invite_message: "エージェントの文" }] }), ctx(eventId));
    expect(res.status).toBe(200);
    const ea = await eventArtist(eventId, artist3Id);
    expect(ea.status).toBe("pending");
    expect(ea.invite_message).toBe(null);
    expect(await lineupNotifCount(artist3Id, eventId)).toBe(0);
    expect(await conversationOf(ea.event_artist_id)).toBe(null);
    expect(vi.mocked(sendLineupInviteEmail)).toHaveBeenCalledTimes(0);
  });

  it("C-03: 公開済みイベントの日程変更と同時に追加（下書きに戻る）→ 送らない", async () => {
    const eventId = await createDraftAsOrganizer(`依頼予定C03-${Date.now()}`, []);
    await testAdmin.from("events").update({ lifecycle_status: "published" }).eq("event_id", eventId);
    mockAs(organizerId, "organizer");
    const res = await eventPATCH(json("PATCH", {
      start_at: new Date(Date.now() + 9 * 86400_000).toISOString(),
      artists: [{ profile_id: artist2Id, invite_message: null }],
    }), ctx(eventId));
    expect(res.status).toBe(200);
    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", eventId).single();
    expect(ev?.lifecycle_status).toBe("draft");
    expect(await lineupNotifCount(artist2Id, eventId)).toBe(0);
  });
});

describe("TC-LINEUP-DEFER-D: 再送しない", () => {
  it("D-01: 送信済みの出演者は、下書きに戻って再度承認依頼しても通知は1件のまま。新しく足した人だけ届く", async () => {
    const eventId = await createDraftAsOrganizer(`依頼予定D01-${Date.now()}`, [{ profile_id: artist1Id }]);
    mockAs(organizerId, "organizer");
    expect((await requestReviewPOST(new Request("http://localhost", { method: "POST" }), ctx(eventId))).status).toBe(200);
    expect(await lineupNotifCount(artist1Id, eventId)).toBe(1);

    // 公開 → 日程変更で下書きに戻る＋出演者2を追加 → 再度承認依頼
    await testAdmin.from("events").update({ lifecycle_status: "published" }).eq("event_id", eventId);
    await eventPATCH(json("PATCH", {
      start_at: new Date(Date.now() + 10 * 86400_000).toISOString(),
      artists: [{ profile_id: artist1Id }, { profile_id: artist2Id }],
    }), ctx(eventId));
    vi.mocked(sendLineupInviteEmail).mockClear();
    expect((await requestReviewPOST(new Request("http://localhost", { method: "POST" }), ctx(eventId))).status).toBe(200);
    expect(await lineupNotifCount(artist1Id, eventId)).toBe(1);
    expect(await lineupNotifCount(artist2Id, eventId)).toBe(1);
    expect(vi.mocked(sendLineupInviteEmail)).toHaveBeenCalledTimes(1);
  });

  it("D-02: 下書きの間に外した出演者には、承認依頼しても届かない", async () => {
    const eventId = await createDraftAsOrganizer(`依頼予定D02-${Date.now()}`, [{ profile_id: artist1Id }, { profile_id: artist3Id }]);
    mockAs(organizerId, "organizer");
    await eventPATCH(json("PATCH", { artists: [{ profile_id: artist1Id }] }), ctx(eventId));
    expect((await eventArtist(eventId, artist3Id)).deleted_at).not.toBe(null);
    expect((await requestReviewPOST(new Request("http://localhost", { method: "POST" }), ctx(eventId))).status).toBe(200);
    expect(await lineupNotifCount(artist1Id, eventId)).toBe(1);
    expect(await lineupNotifCount(artist3Id, eventId)).toBe(0);
  });
});
