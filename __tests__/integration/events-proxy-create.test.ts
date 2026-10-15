/**
 * TC-PROXY-CREATE: エージェントによるイベント代理作成
 *
 * 担当エージェント（またはadmin）が主催者名義で下書きを作り、
 * 主催者本人が承認依頼を送る → エージェントが承認、の流れを検証する。
 *
 * カバレッジ:
 *   A. 代理作成の正常系（名義・担当・通知・メール）
 *   B. 権限・対象チェック（他エージェントの主催者／オーガナイザー／対象ロール・状態）
 *   C. 出演依頼（依頼メッセージを主催者名義で送らない・スレッドは主催者と出演者）
 *   D. 代理作成後のライフサイクル（申請は主催者本人のみ → 承認で公開）
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
    sendProxyEventCreatedEmail: vi.fn().mockResolvedValue(undefined),
    sendLineupInviteEmail: vi.fn().mockResolvedValue(undefined),
  };
});

import { createClient } from "@/lib/supabase/server";
import { sendProxyEventCreatedEmail } from "@/lib/email/notification";
import { POST as createPOST } from "@/app/api/events/create/route";
import { POST as requestReviewPOST } from "@/app/api/events/[eventId]/request-review/route";
import { POST as approvePOST } from "@/app/api/events/[eventId]/approve/route";

let adminProfileId: string;
let agentProfileId: string;
let otherAgentProfileId: string;
let organizerProfileId: string;
let otherAgentsOrganizerId: string;
let pendingOrganizerId: string;
let artistProfileId: string;

const cleanup = { profileIds: [] as string[], eventIds: [] as string[] };

function mockAs(profileId: string, role: string, extra: Record<string, unknown> = {}) {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: profileId } }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { role, status: "active", responsible_agent_id: null, ...extra },
          }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

function createReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/events/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      venue: "代理作成テスト会場",
      start_at: new Date(Date.now() + 2 * 86400_000).toISOString(),
      end_at: new Date(Date.now() + 2 * 86400_000 + 3 * 3600_000).toISOString(),
      ...body,
    }),
  });
}

async function eventCountByTitle(title: string) {
  const { count } = await testAdmin.from("events").select("event_id", { count: "exact", head: true }).eq("title", title);
  return count;
}

beforeAll(async () => {
  const ts = Date.now();
  adminProfileId = await insertProfile({ role: "admin", displayName: "管理者（代理作成）", email: `admin-proxy-${ts}@test.local` });
  agentProfileId = await insertProfile({ role: "agent", displayName: "担当エージェント（代理作成）", email: `agent-proxy-${ts}@test.local` });
  otherAgentProfileId = await insertProfile({ role: "agent", displayName: "他エージェント（代理作成）", email: `agent2-proxy-${ts}@test.local` });
  organizerProfileId = await insertProfile({ role: "organizer", displayName: "主催者（代理作成）", email: `org-proxy-${ts}@test.local` });
  otherAgentsOrganizerId = await insertProfile({ role: "organizer", displayName: "他担当の主催者", email: `org2-proxy-${ts}@test.local` });
  pendingOrganizerId = await insertProfile({ role: "organizer", displayName: "未有効の主催者", email: `org3-proxy-${ts}@test.local` });
  artistProfileId = await insertProfile({ role: "artist", displayName: "出演者（代理作成）", email: `artist-proxy-${ts}@test.local` });
  cleanup.profileIds.push(adminProfileId, agentProfileId, otherAgentProfileId, organizerProfileId, otherAgentsOrganizerId, pendingOrganizerId, artistProfileId);

  await testAdmin.from("profiles").update({ responsible_agent_id: agentProfileId, organizer_name: "主催者屋号" }).eq("profile_id", organizerProfileId);
  await testAdmin.from("profiles").update({ responsible_agent_id: otherAgentProfileId }).eq("profile_id", otherAgentsOrganizerId);
  await testAdmin.from("profiles").update({ responsible_agent_id: agentProfileId, status: "pending_terms" }).eq("profile_id", pendingOrganizerId);
  // 出演者も担当エージェント付き（organizer ではないので代理作成の対象外であることの確認用）
  await testAdmin.from("profiles").update({ responsible_agent_id: agentProfileId }).eq("profile_id", artistProfileId);
}, 30_000);

afterAll(async () => {
  if (cleanup.eventIds.length) {
    await testAdmin.from("notifications").delete().filter("metadata->>event_id", "in", `(${cleanup.eventIds.join(",")})`);
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  }
  await deleteAuthUsers(cleanup.profileIds);
});

beforeEach(() => {
  vi.mocked(sendProxyEventCreatedEmail).mockClear();
});

// ── A. 代理作成の正常系 ─────────────────────────────────────────────
describe("TC-PROXY-CREATE-A: 代理作成の正常系", () => {
  it("A-01: 担当エージェントが主催者名義で作成 → 主催者名義・担当は本人・draft", async () => {
    mockAs(agentProfileId, "agent");
    const title = `代理作成A01-${Date.now()}`;
    const res = await createPOST(createReq({ title, organizer_profile_id: organizerProfileId }));
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.eventIds.push(data.event_id);

    const { data: ev } = await testAdmin.from("events")
      .select("organizer_profile_id, agent_id, lifecycle_status, title")
      .eq("event_id", data.event_id).single();
    expect(ev?.organizer_profile_id).toBe(organizerProfileId);
    expect(ev?.agent_id).toBe(agentProfileId);
    expect(ev?.lifecycle_status).toBe("draft");
    expect(ev?.title).toBe(title);
  });

  it("A-02: 主催者に proxy_event_created 通知が1件・メールが1回（宛先とイベント一致）", async () => {
    mockAs(agentProfileId, "agent");
    const title = `代理作成A02-${Date.now()}`;
    const res = await createPOST(createReq({ title, organizer_profile_id: organizerProfileId }));
    const { event_id } = await res.json();
    cleanup.eventIds.push(event_id);

    const { data: notifs } = await testAdmin.from("notifications")
      .select("profile_id, type, title, metadata, is_read")
      .filter("metadata->>event_id", "eq", event_id);
    expect(notifs?.length).toBe(1);
    expect(notifs?.[0].profile_id).toBe(organizerProfileId);
    expect(notifs?.[0].type).toBe("proxy_event_created");
    expect(notifs?.[0].title).toBe(`「${title}」の内容を確認してください`);
    expect(notifs?.[0].metadata.created_by).toBe(agentProfileId);
    expect(notifs?.[0].is_read).toBe(false);

    const { data: authUser } = await testAdmin.auth.admin.getUserById(organizerProfileId);
    expect(vi.mocked(sendProxyEventCreatedEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendProxyEventCreatedEmail).mock.calls[0][0]).toEqual({
      to: authUser.user!.email,
      eventId: event_id,
      eventTitle: title,
      creatorName: "担当エージェント（代理作成）",
    });
  });

  it("A-03: admin が代理作成 → 担当は主催者の responsible_agent_id（admin 自身ではない）", async () => {
    mockAs(adminProfileId, "admin");
    const res = await createPOST(createReq({ title: `代理作成A03-${Date.now()}`, organizer_profile_id: organizerProfileId }));
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.eventIds.push(data.event_id);

    const { data: ev } = await testAdmin.from("events").select("organizer_profile_id, agent_id").eq("event_id", data.event_id).single();
    expect(ev?.organizer_profile_id).toBe(organizerProfileId);
    expect(ev?.agent_id).toBe(agentProfileId);
  });

  it("A-04: organizer_profile_id が自分自身 → 従来どおり自主開催・確認依頼の通知なし", async () => {
    mockAs(agentProfileId, "agent");
    const res = await createPOST(createReq({ title: `代理作成A04-${Date.now()}`, organizer_profile_id: agentProfileId }));
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.eventIds.push(data.event_id);

    const { data: ev } = await testAdmin.from("events").select("organizer_profile_id, agent_id").eq("event_id", data.event_id).single();
    expect(ev?.organizer_profile_id).toBe(agentProfileId);
    expect(ev?.agent_id).toBe(agentProfileId);
    const { count } = await testAdmin.from("notifications").select("notification_id", { count: "exact", head: true })
      .eq("type", "proxy_event_created").filter("metadata->>event_id", "eq", data.event_id);
    expect(count).toBe(0);
    expect(vi.mocked(sendProxyEventCreatedEmail)).toHaveBeenCalledTimes(0);
  });
});

// ── B. 権限・対象チェック ─────────────────────────────────────────────
describe("TC-PROXY-CREATE-B: 権限・対象チェック（イベントは作られない）", () => {
  it("B-01: 他エージェントが担当する主催者 → 403", async () => {
    mockAs(agentProfileId, "agent");
    const title = `代理作成B01-${Date.now()}`;
    const res = await createPOST(createReq({ title, organizer_profile_id: otherAgentsOrganizerId }));
    expect(res.status).toBe(403);
    expect(await eventCountByTitle(title)).toBe(0);
  });

  it("B-02: オーガナイザーが他の主催者名義で作成 → 403", async () => {
    mockAs(otherAgentsOrganizerId, "organizer", { responsible_agent_id: otherAgentProfileId });
    const title = `代理作成B02-${Date.now()}`;
    const res = await createPOST(createReq({ title, organizer_profile_id: organizerProfileId }));
    expect(res.status).toBe(403);
    expect(await eventCountByTitle(title)).toBe(0);
  });

  it("B-03: 対象が organizer ロールでない（担当付きの出演者）→ 400", async () => {
    mockAs(agentProfileId, "agent");
    const title = `代理作成B03-${Date.now()}`;
    const res = await createPOST(createReq({ title, organizer_profile_id: artistProfileId }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("代理作成できない主催者です");
    expect(await eventCountByTitle(title)).toBe(0);
  });

  it("B-04: 対象の主催者が active でない → 400", async () => {
    mockAs(agentProfileId, "agent");
    const title = `代理作成B04-${Date.now()}`;
    const res = await createPOST(createReq({ title, organizer_profile_id: pendingOrganizerId }));
    expect(res.status).toBe(400);
    expect(await eventCountByTitle(title)).toBe(0);
  });

  it("B-05: 存在しない主催者ID → 400", async () => {
    mockAs(agentProfileId, "agent");
    const title = `代理作成B05-${Date.now()}`;
    const res = await createPOST(createReq({ title, organizer_profile_id: "00000000-0000-0000-0000-000000000000" }));
    expect(res.status).toBe(400);
    expect(await eventCountByTitle(title)).toBe(0);
  });
});

// ── C. 出演依頼 ───────────────────────────────────────────────────
describe("TC-PROXY-CREATE-C: 代理作成時の出演依頼", () => {
  it("C-01: 依頼メッセージは保存・送信せず、スレッド参加者は主催者と出演者", async () => {
    mockAs(agentProfileId, "agent");
    const res = await createPOST(createReq({
      title: `代理作成C01-${Date.now()}`,
      organizer_profile_id: organizerProfileId,
      artists: [{ profile_id: artistProfileId, invite_message: "エージェントが書いた依頼文" }],
    }));
    const { event_id } = await res.json();
    expect(res.status).toBe(200);
    cleanup.eventIds.push(event_id);

    const { data: eas } = await testAdmin.from("event_artists")
      .select("event_artist_id, artist_profile_id, status, invite_message").eq("event_id", event_id);
    expect(eas?.length).toBe(1);
    expect(eas?.[0].artist_profile_id).toBe(artistProfileId);
    expect(eas?.[0].status).toBe("pending");
    expect(eas?.[0].invite_message).toBe(null);

    const { data: conv } = await testAdmin.from("conversations").select("conversation_id")
      .eq("event_artist_id", eas![0].event_artist_id).single();
    const { data: parts } = await testAdmin.from("conversation_participants").select("profile_id")
      .eq("conversation_id", conv!.conversation_id);
    expect((parts ?? []).map((p) => p.profile_id).sort()).toEqual([organizerProfileId, artistProfileId].sort());
    const { count: msgCount } = await testAdmin.from("messages").select("message_id", { count: "exact", head: true })
      .eq("conversation_id", conv!.conversation_id);
    expect(msgCount).toBe(0);

    // 出演依頼の通知は主催者名義（屋号）
    const { data: lineupNotif } = await testAdmin.from("notifications").select("body, metadata")
      .eq("profile_id", artistProfileId).eq("type", "lineup_invite").filter("metadata->>event_id", "eq", event_id).single();
    expect(lineupNotif?.metadata.organizer_id).toBe(organizerProfileId);
    expect(lineupNotif?.body.startsWith("主催者屋号 から")).toBe(true);
  });
});

// ── D. 代理作成後のライフサイクル ─────────────────────────────────────
describe("TC-PROXY-CREATE-D: 申請は主催者本人 → 承認で公開", () => {
  let eventId: string;

  beforeAll(async () => {
    mockAs(agentProfileId, "agent");
    const res = await createPOST(createReq({ title: `代理作成D-${Date.now()}`, organizer_profile_id: organizerProfileId }));
    eventId = (await res.json()).event_id;
    cleanup.eventIds.push(eventId);
  });

  it("D-01: 作成したエージェントは承認依頼を送れない → 403・draftのまま", async () => {
    mockAs(agentProfileId, "agent");
    const res = await requestReviewPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(403);
    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", eventId).single();
    expect(ev?.lifecycle_status).toBe("draft");
  });

  it("D-02: 主催者本人が承認依頼 → review_requested", async () => {
    mockAs(organizerProfileId, "organizer", { responsible_agent_id: agentProfileId });
    const res = await requestReviewPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);
    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", eventId).single();
    expect(ev?.lifecycle_status).toBe("review_requested");
  });

  it("D-03: 担当エージェントが承認 → published（自主開催扱いにならない）", async () => {
    mockAs(agentProfileId, "agent");
    const res = await approvePOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);
    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", eventId).single();
    expect(ev?.lifecycle_status).toBe("published");
  });
});
