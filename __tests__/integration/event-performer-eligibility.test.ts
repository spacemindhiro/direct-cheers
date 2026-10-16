/**
 * TC-PERFORMER-ELIG: イベント作成・更新APIで出演者に指定できる相手の検証
 *
 * 画面（出演者検索＝照会API）を通さず API を直接呼んで、出演できない相手を指定されるのを防ぐ。
 * 条件は照会のアーティスト検索の対象と同じ：artist/organizer/agent かつ未削除。
 *
 * カバレッジ:
 *   A. 作成（POST /api/events/create）: 一般ユーザー・admin・削除済み・存在しないID・UUIDでない値は400、
 *      イベントも出演行も作られない。artist/organizer/agent/主催者本人は通る。旧形式 artist_ids も同じ。
 *      作成者の登録手続きの進捗（status）は作成可否に関係しない
 *   B. 更新（PATCH /api/events/:id）: 新しく加える相手が不正なら400、イベント本体（タイトル）も出演行も変わらない。
 *      既に出演中の人は検証対象外（後からロールが変わっても編集が止まらない）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, insertEvent, insertEventArtist, deleteAuthUsers } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

const auth = { userId: null as string | null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: auth.userId ? { id: auth.userId } : null }, error: null }) },
    from: (t: string) => testAdmin.from(t),
  })),
  getUser: vi.fn(async () => (auth.userId ? { id: auth.userId } : null)),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/email/notification", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, sendLineupInviteEmail: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("@/lib/apple-wallet-push", () => ({
  pushWalletUpdateBySerial: vi.fn(async () => {}),
  sendWalletPush: vi.fn(async () => {}),
}));

import { POST as createPOST } from "@/app/api/events/create/route";
import { PATCH as eventPATCH } from "@/app/api/events/[eventId]/route";

const ts = Date.now();
const MARK = `pelig${ts}`;
const ids = {} as Record<"agent" | "organizer" | "otherOrganizer" | "artist" | "artist2" | "user" | "admin" | "deleted" | "demoted", string>;
const eventIds: string[] = [];
const GHOST = "00000000-0000-4000-8000-000000000000";

function createReq(title: string, artists: unknown) {
  return new Request("http://localhost/api/events/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title, venue: "検証会場",
      start_at: new Date(Date.now() + 86400_000).toISOString(),
      end_at: new Date(Date.now() + 90000_000).toISOString(),
      ...(artists as Record<string, unknown>),
    }),
  });
}

async function create(title: string, artists: unknown) {
  auth.userId = ids.organizer;
  const res = await createPOST(createReq(title, artists));
  const { data } = await testAdmin.from("events").select("event_id").eq("title", title);
  for (const e of data ?? []) eventIds.push(e.event_id);
  return { status: res.status, body: await res.json(), eventCount: (data ?? []).length };
}

async function performersOf(eventId: string) {
  const { data } = await testAdmin.from("event_artists").select("artist_profile_id").eq("event_id", eventId).is("deleted_at", null);
  return (data ?? []).map((r) => r.artist_profile_id).sort();
}

beforeAll(async () => {
  const mk = (role: Parameters<typeof insertProfile>[0]["role"], n: string) => insertProfile({ role, displayName: `${n}${MARK}`, email: `${n}-${MARK}@test.local` });
  ids.agent = await mk("agent", "agent");
  ids.organizer = await mk("organizer", "org");
  ids.otherOrganizer = await mk("organizer", "org2");
  ids.artist = await mk("artist", "artist");
  ids.artist2 = await mk("artist", "artist2");
  ids.user = await mk("user", "user");
  ids.admin = await mk("admin", "admin");
  ids.deleted = await mk("artist", "deleted");
  ids.demoted = await mk("artist", "demoted");
  await testAdmin.from("profiles").update({ responsible_agent_id: ids.agent }).eq("profile_id", ids.organizer);
  await testAdmin.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("profile_id", ids.deleted);
}, 60_000);

afterAll(async () => {
  if (eventIds.length) {
    await testAdmin.from("event_artists").delete().in("event_id", eventIds);
    await testAdmin.from("conversation_participants").delete().in("profile_id", Object.values(ids));
    await testAdmin.from("events").delete().in("event_id", eventIds);
  }
  await deleteAuthUsers(Object.values(ids));
});

describe("TC-PERFORMER-ELIG-A: 作成", () => {
  it.each([
    ["一般ユーザー", "user"],
    ["admin", "admin"],
    ["削除済み", "deleted"],
  ] as const)("TC-PERFORMER-ELIG-A-01: %s を出演者にすると400・イベントも作られない", async (_l, key) => {
    const title = `A01-${key}-${MARK}`;
    const r = await create(title, { artists: [{ profile_id: ids[key] }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("出演者に指定できないユーザーが含まれています");
    expect(r.eventCount).toBe(0);
  });

  it.each([
    ["存在しないID", GHOST],
    ["UUIDでない値", "not-a-uuid"],
    ["数値", 12345],
  ] as const)("TC-PERFORMER-ELIG-A-02: %s は400・イベントも作られない", async (_l, v) => {
    const title = `A02-${String(v)}-${MARK}`;
    const r = await create(title, { artists: [{ profile_id: v }] });
    expect(r.status).toBe(400);
    expect(r.eventCount).toBe(0);
  });

  it("TC-PERFORMER-ELIG-A-03: 正しい出演者に1人でも不正が混ざれば全体を拒否（一部だけ登録しない）", async () => {
    const title = `A03-${MARK}`;
    const r = await create(title, { artists: [{ profile_id: ids.artist }, { profile_id: ids.user }] });
    expect(r.status).toBe(400);
    expect(r.eventCount).toBe(0);
  });

  it("TC-PERFORMER-ELIG-A-04: 旧形式 artist_ids でも同じく400", async () => {
    const title = `A04-${MARK}`;
    const r = await create(title, { artist_ids: [ids.admin] });
    expect(r.status).toBe(400);
    expect(r.eventCount).toBe(0);
  });

  it("TC-PERFORMER-ELIG-A-05: artist・他のorganizer・agent・主催者本人は出演者にできる（上位互換）", async () => {
    const title = `A05-${MARK}`;
    const r = await create(title, {
      artists: [ids.artist, ids.otherOrganizer, ids.agent, ids.organizer].map((id) => ({ profile_id: id })),
    });
    expect(r.status).toBe(200);
    expect(r.eventCount).toBe(1);
    expect(await performersOf(eventIds[eventIds.length - 1]))
      .toEqual([ids.artist, ids.otherOrganizer, ids.agent, ids.organizer].sort());
  });

  it("TC-PERFORMER-ELIG-A-06: 出演者なしでも作成できる", async () => {
    const r = await create(`A06-${MARK}`, { artists: [] });
    expect(r.status).toBe(200);
    expect(r.eventCount).toBe(1);
  });

  it.each(["pending_onboarding", "pending_terms", "pending_interview"] as const)(
    "TC-PERFORMER-ELIG-A-07: 登録手続き中（status=%s）の organizer でも作成できる（statusは作成可否に関係しない）",
    async (status) => {
      await testAdmin.from("profiles").update({ status }).eq("profile_id", ids.organizer);
      try {
        const r = await create(`A07-${status}-${MARK}`, { artists: [{ profile_id: ids.artist }] });
        expect(r.status).toBe(200);
        expect(r.eventCount).toBe(1);
        expect(await performersOf(eventIds[eventIds.length - 1])).toEqual([ids.artist]);
      } finally {
        await testAdmin.from("profiles").update({ status: "active" }).eq("profile_id", ids.organizer);
      }
    },
  );
});

describe("TC-PERFORMER-ELIG-B: 更新", () => {
  let eventId: string;
  const ORIGINAL_TITLE = `B-original-${MARK}`;

  beforeAll(async () => {
    eventId = await insertEvent({ organizerProfileId: ids.organizer, agentId: ids.agent, title: ORIGINAL_TITLE });
    eventIds.push(eventId);
    await testAdmin.from("events").update({ lifecycle_status: "draft" }).eq("event_id", eventId);
    await insertEventArtist({ eventId, artistProfileId: ids.artist });
    await insertEventArtist({ eventId, artistProfileId: ids.demoted });
    // 出演中にロールが一般ユーザーに変わった人
    await testAdmin.from("profiles").update({ role: "user" }).eq("profile_id", ids.demoted);
  });

  const patch = async (body: Record<string, unknown>) => {
    auth.userId = ids.organizer;
    const res = await eventPATCH(
      new Request(`http://localhost/api/events/${eventId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ eventId }) },
    );
    const { data: ev } = await testAdmin.from("events").select("title").eq("event_id", eventId).single();
    return { status: res.status, body: await res.json(), title: ev?.title, performers: await performersOf(eventId) };
  };

  it.each([
    ["一般ユーザー", "user"],
    ["admin", "admin"],
    ["削除済み", "deleted"],
  ] as const)("TC-PERFORMER-ELIG-B-01: %s を追加すると400・タイトル変更も出演行も反映されない", async (_l, key) => {
    const r = await patch({
      title: `changed-${key}-${MARK}`,
      artists: [ids.artist, ids.demoted, ids[key]].map((id) => ({ profile_id: id })),
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("出演者に指定できないユーザーが含まれています");
    expect(r.title).toBe(ORIGINAL_TITLE);
    expect(r.performers).toEqual([ids.artist, ids.demoted].sort());
  });

  it("TC-PERFORMER-ELIG-B-02: 旧形式 artist_ids で存在しないIDを足しても400", async () => {
    const r = await patch({ artist_ids: [ids.artist, ids.demoted, GHOST] });
    expect(r.status).toBe(400);
    expect(r.performers).toEqual([ids.artist, ids.demoted].sort());
  });

  it("TC-PERFORMER-ELIG-B-03: 既に出演中の人（後からロールが変わった人）が残っていても、正しい追加は通る", async () => {
    const r = await patch({ artists: [ids.artist, ids.demoted, ids.artist2].map((id) => ({ profile_id: id })) });
    expect(r.status).toBe(200);
    expect(r.performers).toEqual([ids.artist, ids.demoted, ids.artist2].sort());
  });

  it("TC-PERFORMER-ELIG-B-04: 外すだけの更新は検証に関係なく通る", async () => {
    const r = await patch({ artists: [{ profile_id: ids.artist }] });
    expect(r.status).toBe(200);
    expect(r.performers).toEqual([ids.artist]);
  });

  it("TC-PERFORMER-ELIG-B-05: 一度外した人（ロール変更済み）を戻すのは新規追加扱いで400", async () => {
    const r = await patch({ artists: [{ profile_id: ids.artist }, { profile_id: ids.demoted }] });
    expect(r.status).toBe(400);
    expect(r.performers).toEqual([ids.artist]);
  });
});
