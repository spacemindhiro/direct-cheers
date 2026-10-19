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
 *   E. proxy-notify（下書きを主催者に送る：担当エージェント/adminのみ・下書きのみ・再送可）
 *   G. 送るまでは主催者から存在自体を見せない（承認依頼・編集・削除・中止は 404、送ったら見える）
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
import { POST as proxyNotifyPOST } from "@/app/api/events/[eventId]/proxy-notify/route";
import { PATCH as eventPATCH, DELETE as eventDELETE } from "@/app/api/events/[eventId]/route";
import { POST as cancelPOST } from "@/app/api/events/[eventId]/cancel/route";

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

  it("A-02: 作成しただけでは主催者に通知もメールも届かない（下書き）", async () => {
    mockAs(agentProfileId, "agent");
    const res = await createPOST(createReq({ title: `代理作成A02-${Date.now()}`, organizer_profile_id: organizerProfileId }));
    const { event_id } = await res.json();
    expect(res.status).toBe(200);
    cleanup.eventIds.push(event_id);

    const { count } = await testAdmin.from("notifications").select("notification_id", { count: "exact", head: true })
      .eq("profile_id", organizerProfileId).filter("metadata->>event_id", "eq", event_id);
    expect(count).toBe(0);
    expect(vi.mocked(sendProxyEventCreatedEmail)).toHaveBeenCalledTimes(0);
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

  it("B-04: 対象の主催者が登録手続き中（status≠active）でも代理作成できる（statusは作成可否に関係しない）", async () => {
    mockAs(agentProfileId, "agent");
    const title = `代理作成B04-${Date.now()}`;
    const res = await createPOST(createReq({ title, organizer_profile_id: pendingOrganizerId }));
    expect(res.status).toBe(200);
    const { data: ev } = await testAdmin.from("events").select("event_id, organizer_profile_id, agent_id").eq("title", title).single();
    cleanup.eventIds.push(ev!.event_id);
    expect(ev!.organizer_profile_id).toBe(pendingOrganizerId);
    expect(ev!.agent_id).toBe(agentProfileId);
  });

  it("B-05: 存在しない主催者ID → 400", async () => {
    mockAs(agentProfileId, "agent");
    const title = `代理作成B05-${Date.now()}`;
    const res = await createPOST(createReq({ title, organizer_profile_id: "00000000-0000-0000-0000-000000000000" }));
    expect(res.status).toBe(400);
    expect(await eventCountByTitle(title)).toBe(0);
  });
});

// ── C. 出演依頼（下書きの間は「依頼予定」） ─────────────────────────────
describe("TC-PROXY-CREATE-C: 代理作成時の出演者は依頼予定（何も送らない）", () => {
  it("C-01: 出演行は pending・依頼メッセージは保存しない・スレッドも通知も作らない", async () => {
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

    const { count: convCount } = await testAdmin.from("conversations").select("conversation_id", { count: "exact", head: true })
      .eq("event_artist_id", eas![0].event_artist_id);
    expect(convCount).toBe(0);
    const { count: notifCount } = await testAdmin.from("notifications").select("notification_id", { count: "exact", head: true })
      .eq("profile_id", artistProfileId).eq("type", "lineup_invite").filter("metadata->>event_id", "eq", event_id);
    expect(notifCount).toBe(0);
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
    // 主催者に送ってから（送るまでは主催者から見えない：G で検証）
    await proxyNotifyPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
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

// ── E. proxy-notify ───────────────────────────────────────────────
describe("TC-PROXY-CREATE-E: 下書きを主催者に送る（proxy-notify）", () => {
  let draftId: string;
  const notify = (id: string) => proxyNotifyPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId: id }) });
  const notifCount = async (id: string) => (await testAdmin.from("notifications").select("notification_id", { count: "exact", head: true })
    .eq("profile_id", organizerProfileId).eq("type", "proxy_event_created").filter("metadata->>event_id", "eq", id)).count;

  beforeAll(async () => {
    mockAs(agentProfileId, "agent");
    const res = await createPOST(createReq({ title: `代理作成E-${Date.now()}`, organizer_profile_id: organizerProfileId }));
    draftId = (await res.json()).event_id;
    cleanup.eventIds.push(draftId);
  });

  it("E-01: 他エージェント → 403・通知なし", async () => {
    mockAs(otherAgentProfileId, "agent");
    const res = await notify(draftId);
    expect(res.status).toBe(403);
    expect(await notifCount(draftId)).toBe(0);
  });

  it("E-02: 主催者本人 → 403・通知なし", async () => {
    mockAs(organizerProfileId, "organizer");
    const res = await notify(draftId);
    expect(res.status).toBe(403);
    expect(await notifCount(draftId)).toBe(0);
  });

  it("E-03: 担当エージェント → 主催者に通知1件・メール1回（宛先・内容一致）", async () => {
    mockAs(agentProfileId, "agent");
    const res = await notify(draftId);
    expect(res.status).toBe(200);
    expect(await notifCount(draftId)).toBe(1);

    const { data: ev } = await testAdmin.from("events").select("title").eq("event_id", draftId).single();
    const { data: n } = await testAdmin.from("notifications").select("title, body, metadata")
      .eq("type", "proxy_event_created").filter("metadata->>event_id", "eq", draftId).single();
    expect(n?.title).toBe(`「${ev!.title}」の内容を確認してください`);
    expect(n?.body).toBe("担当エージェント（代理作成） さんがあなたのイベントの下書きを作成しました。内容を確認して承認依頼を送ってください。");
    expect(n?.metadata.created_by).toBe(agentProfileId);
    const { data: authUser } = await testAdmin.auth.admin.getUserById(organizerProfileId);
    expect(vi.mocked(sendProxyEventCreatedEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendProxyEventCreatedEmail).mock.calls[0][0]).toEqual({
      to: authUser.user!.email,
      eventId: draftId,
      eventTitle: ev!.title,
      creatorName: "担当エージェント（代理作成）",
    });
  });

  it("E-04: 再送 → 通知が2件目になる・メールも再送", async () => {
    mockAs(agentProfileId, "agent");
    const res = await notify(draftId);
    expect(res.status).toBe(200);
    expect(await notifCount(draftId)).toBe(2);
    expect(vi.mocked(sendProxyEventCreatedEmail)).toHaveBeenCalledTimes(1);
  });

  it("E-05: admin も送れる", async () => {
    mockAs(adminProfileId, "admin");
    const res = await notify(draftId);
    expect(res.status).toBe(200);
    expect(await notifCount(draftId)).toBe(3);
  });

  it("E-06: 下書きでない（承認待ち）→ 400・通知増えない", async () => {
    await testAdmin.from("events").update({ lifecycle_status: "review_requested" }).eq("event_id", draftId);
    mockAs(agentProfileId, "agent");
    const res = await notify(draftId);
    expect(res.status).toBe(400);
    expect(await notifCount(draftId)).toBe(3);
  });

  it("E-07: 自主開催（主催者＝担当）→ 400", async () => {
    mockAs(agentProfileId, "agent");
    const res0 = await createPOST(createReq({ title: `代理作成E07-${Date.now()}` }));
    const selfId = (await res0.json()).event_id;
    cleanup.eventIds.push(selfId);
    const res = await notify(selfId);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("自主開催のイベントです");
  });
});

// ── G. 送るまでは主催者から見えない ───────────────────────────────────
describe("TC-PROXY-CREATE-G: 未送信の代理下書きは主催者から存在しない扱い", () => {
  let eventId: string;
  let title: string;
  const ctx = () => ({ params: Promise.resolve({ eventId }) });
  const markers = async () => (await testAdmin.from("notifications").select("profile_id, metadata, is_read")
    .eq("type", "proxy_event_draft").filter("metadata->>event_id", "eq", eventId)).data ?? [];
  const eventRow = async () => (await testAdmin.from("events").select("title, lifecycle_status, deleted_at").eq("event_id", eventId).single()).data!;

  beforeAll(async () => {
    mockAs(agentProfileId, "agent");
    title = `代理作成G-${Date.now()}`;
    const res = await createPOST(createReq({ title, organizer_profile_id: organizerProfileId }));
    eventId = (await res.json()).event_id;
    cleanup.eventIds.push(eventId);
  });

  it("G-01: 代理作成で目印が1件付く（作成者宛て・主催者ID付き・既読）", async () => {
    expect(await markers()).toEqual([{ profile_id: agentProfileId, metadata: { event_id: eventId, organizer_id: organizerProfileId }, is_read: true }]);
  });

  it("G-02: 主催者の承認依頼 → 404・draftのまま", async () => {
    mockAs(organizerProfileId, "organizer", { responsible_agent_id: agentProfileId });
    const res = await requestReviewPOST(new Request("http://localhost", { method: "POST" }), ctx());
    expect(res.status).toBe(404);
    expect((await eventRow()).lifecycle_status).toBe("draft");
  });

  it("G-03: 主催者の編集 → 404・タイトル変わらない", async () => {
    mockAs(organizerProfileId, "organizer", { responsible_agent_id: agentProfileId });
    const res = await eventPATCH(new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "主催者が書き換え" }) }), ctx());
    expect(res.status).toBe(404);
    expect((await eventRow()).title).toBe(title);
  });

  it("G-04: 主催者の削除 → 404・残っている", async () => {
    mockAs(organizerProfileId, "organizer", { responsible_agent_id: agentProfileId });
    const res = await eventDELETE(new Request("http://localhost", { method: "DELETE" }), ctx());
    expect(res.status).toBe(404);
    expect((await eventRow()).deleted_at).toBe(null);
  });

  it("G-05: 主催者の中止 → 404・draftのまま", async () => {
    mockAs(organizerProfileId, "organizer", { responsible_agent_id: agentProfileId });
    const res = await cancelPOST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), ctx());
    expect(res.status).toBe(404);
    expect((await eventRow()).lifecycle_status).toBe("draft");
  });

  it("G-06: 担当エージェントは編集できる（200・反映）", async () => {
    mockAs(agentProfileId, "agent");
    const res = await eventPATCH(new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `${title}改` }) }), ctx());
    expect(res.status).toBe(200);
    expect((await eventRow()).title).toBe(`${title}改`);
    title = `${title}改`;
  });

  it("G-07: 送ると目印が消え、主催者が承認依頼できる", async () => {
    mockAs(agentProfileId, "agent");
    expect((await proxyNotifyPOST(new Request("http://localhost", { method: "POST" }), ctx())).status).toBe(200);
    expect(await markers()).toEqual([]);
    mockAs(organizerProfileId, "organizer", { responsible_agent_id: agentProfileId });
    const res = await requestReviewPOST(new Request("http://localhost", { method: "POST" }), ctx());
    expect(res.status).toBe(200);
    expect((await eventRow()).lifecycle_status).toBe("review_requested");
  });

  it("G-08: 主催者が自分で作った下書きには目印が付かない（従来どおり見える）", async () => {
    mockAs(organizerProfileId, "organizer", { responsible_agent_id: agentProfileId });
    const res = await createPOST(createReq({ title: `主催者自作G08-${Date.now()}` }));
    const ownId = (await res.json()).event_id;
    cleanup.eventIds.push(ownId);
    const { count } = await testAdmin.from("notifications").select("notification_id", { count: "exact", head: true })
      .eq("type", "proxy_event_draft").filter("metadata->>event_id", "eq", ownId);
    expect(count).toBe(0);
  });
});
