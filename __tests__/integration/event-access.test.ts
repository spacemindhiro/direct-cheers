/* eslint-disable @typescript-eslint/no-explicit-any -- Supabaseクライアントの偽物を最小限の形で作るため */
/**
 * TC-EVENT-ACCESS: イベントを見られる人・操作できる人（lib/event-access.ts）
 *
 * 2026-10-21 本番の不具合：イベント詳細・QR詳細に関係者の判定が無く、ログインしていれば誰でも他人のイベント
 * （下書きを含む）を開けた。QR作成・タッチ決済・子機表示はロールしか見ておらず、他の主催者のイベントでも開けた。
 * 証跡の一覧APIは、DBの読み取りルールの都合で担当でないエージェントも読めた。
 *
 * アクセス範囲表
 * | 関係者                         | 状態                     | 見る(canView) | 操作(canOperate) |
 * |--------------------------------|--------------------------|---------------|------------------|
 * | 主催者                         | 公開済み                 | ○             | ○                |
 * | 担当エージェント                | 公開済み                 | ○             | ○                |
 * | 出演者（確定）                  | 公開済み                 | ○             | ×                |
 * | 出演者（返事待ち）              | 公開済み                 | ○             | ×                |
 * | 出演者（辞退）                  | 公開済み                 | ×             | ×                |
 * | 無関係な一般ユーザー            | 公開済み                 | ×             | ×                |
 * | 無関係なオーガナイザー          | 公開済み                 | ×             | ×                |
 * | 担当でないエージェント          | 公開済み                 | ×             | ×                |
 * | admin                          | 公開済み                 | ○             | ○                |
 * | 主催者                         | 代理作成・未送信の下書き  | ×             | ×                |
 * | 代理作成したエージェント        | 同上                     | ○             | ○                |
 * | 出演者（依頼予定＝通知なし）     | 下書き                   | ×             | ×                |
 * | 出演者（依頼済み＝通知あり）     | 下書き                   | ○             | ×                |
 * | （存在しないイベント）           | ―                        | null          | null             |
 *
 * 証跡（event_evidences）の DB 直接の読み取り（RLS）：admin・主催者・担当エージェントだけ。
 * 担当でないエージェント・出演者・一般ユーザー・他の主催者は 0 件（2026-10-21 までロールが agent なら全件読めた）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent, insertEventArtist } from "../helpers/seed";
import { getEventAccess } from "@/lib/event-access";
import { markProxyDraft } from "@/lib/proxy-draft";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
import { createClient } from "@/lib/supabase/server";
import { GET as evidenceGET } from "@/app/api/events/[eventId]/evidence/route";

const ts = Date.now();
const P: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], notifs: [] as string[] };
let PUB: string, PROXY: string, DRAFT: string;

beforeAll(async () => {
  for (const [k, role] of [
    ["org", "organizer"], ["agent", "agent"], ["confirmed", "artist"], ["pending", "artist"], ["rejected", "artist"],
    ["user", "user"], ["otherOrg", "organizer"], ["otherAgent", "agent"], ["admin", "admin"], ["planned", "artist"], ["invited", "artist"],
  ] as const) {
    P[k] = await insertProfile({ role, displayName: `EA ${k}`, email: `ea-${k}-${ts}@test.local` });
    ids.profiles.push(P[k]);
  }
  PUB = await insertEvent({ organizerProfileId: P.org, agentId: P.agent, title: `EA 公開 ${ts}` });
  await insertEventArtist({ eventId: PUB, artistProfileId: P.confirmed, status: "confirmed" });
  await insertEventArtist({ eventId: PUB, artistProfileId: P.pending, status: "pending" });
  await insertEventArtist({ eventId: PUB, artistProfileId: P.rejected, status: "pending" });
  await testAdmin.from("event_artists").update({ status: "rejected" }).eq("event_id", PUB).eq("artist_profile_id", P.rejected);

  PROXY = await insertEvent({ organizerProfileId: P.org, agentId: P.agent, title: `EA 代理下書き ${ts}` });
  await testAdmin.from("events").update({ lifecycle_status: "draft" }).eq("event_id", PROXY);
  await markProxyDraft(testAdmin, { eventId: PROXY, creatorId: P.agent, organizerId: P.org });

  DRAFT = await insertEvent({ organizerProfileId: P.org, agentId: P.agent, title: `EA 下書き ${ts}` });
  await testAdmin.from("events").update({ lifecycle_status: "draft" }).eq("event_id", DRAFT);
  await insertEventArtist({ eventId: DRAFT, artistProfileId: P.planned, status: "pending" });
  await insertEventArtist({ eventId: DRAFT, artistProfileId: P.invited, status: "pending" });
  const { data: n } = await testAdmin.from("notifications").insert({ profile_id: P.invited, type: "lineup_invite", title: "出演依頼", body: "", metadata: { event_id: DRAFT } }).select("notification_id").single();
  ids.notifs.push(n!.notification_id);
  ids.events.push(PUB, PROXY, DRAFT);
}, 60_000);

afterAll(async () => {
  await testAdmin.from("notifications").delete().in("notification_id", ids.notifs);
  await testAdmin.from("notifications").delete().eq("type", "proxy_event_draft").filter("metadata->>event_id", "eq", PROXY);
  await testAdmin.from("event_artists").delete().in("event_id", ids.events);
  await cleanupTestData({ eventIds: ids.events });
  await deleteAuthUsers(ids.profiles);
});

const ROLE: Record<string, string> = {
  org: "organizer", agent: "agent", confirmed: "artist", pending: "artist", rejected: "artist", user: "user",
  otherOrg: "organizer", otherAgent: "agent", admin: "admin", planned: "artist", invited: "artist",
};
async function vo(eventId: string, who: string) {
  const a = await getEventAccess(testAdmin, eventId, P[who], ROLE[who]);
  return a ? `${a.canView ? "○" : "×"}${a.canOperate ? "○" : "×"}` : "null";
}

describe("TC-EVENT-ACCESS-A: 公開済みイベント", () => {
  const table: [string, string][] = [
    ["org", "○○"], ["agent", "○○"], ["confirmed", "○×"], ["pending", "○×"], ["rejected", "××"],
    ["user", "××"], ["otherOrg", "××"], ["otherAgent", "××"], ["admin", "○○"],
  ];
  for (const [who, expected] of table) {
    it(`${who} → ${expected}`, async () => {
      expect(`${who}:${await vo(PUB, who)}`).toBe(`${who}:${expected}`);
    });
  }
});

describe("TC-EVENT-ACCESS-B: 下書き（代理作成・依頼予定）", () => {
  it("代理作成で未送信の下書き：主催者は見えない・操作できない、作ったエージェントは両方できる", async () => {
    expect(await vo(PROXY, "org")).toBe("××");
    expect(await vo(PROXY, "agent")).toBe("○○");
    expect(await vo(PROXY, "user")).toBe("××");
  });

  it("下書きの出演者：依頼が届いていれば見える、依頼予定（通知なし）は見えない", async () => {
    expect(await vo(DRAFT, "invited")).toBe("○×");
    expect(await vo(DRAFT, "planned")).toBe("××");
    expect(await vo(DRAFT, "org")).toBe("○○");
  });

  it("存在しないイベントは null", async () => {
    expect(await vo(crypto.randomUUID(), "admin")).toBe("null");
  });
});

describe("TC-EVENT-ACCESS-C: 証跡の一覧API", () => {
  function asUser(who: string) {
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: P[who] } }, error: null }) },
      from: (table: string) => testAdmin.from(table),
    });
  }
  const req = () => new Request(`http://localhost/api/events/${PUB}/evidence`);
  const ctx = () => ({ params: Promise.resolve({ eventId: PUB }) });

  for (const who of ["otherAgent", "user", "confirmed", "otherOrg"]) {
    it(`${who} → 403`, async () => {
      asUser(who);
      expect((await evidenceGET(req(), ctx())).status).toBe(403);
    });
  }
  for (const who of ["org", "agent", "admin"]) {
    it(`${who} → 200`, async () => {
      asUser(who);
      const res = await evidenceGET(req(), ctx());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ evidences: [] });
    });
  }
});

describe("TC-EVENT-ACCESS-D: 証跡の DB 直接の読み取り（RLS）", () => {
  let evidenceId: string;
  beforeAll(async () => {
    const { data, error } = await testAdmin.from("event_evidences").insert({ event_id: PUB, submitted_by: P.org, photo_paths: [] }).select("evidence_id").single();
    if (error) throw error;
    evidenceId = data.evidence_id;
  });
  afterAll(async () => { await testAdmin.from("event_evidences").delete().eq("evidence_id", evidenceId); });

  async function rowsAs(who: string) {
    const c = createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email: `ea-${who}-${ts}@test.local`, password: "TestPass123!" });
    if (error) throw error;
    const { data } = await c.from("event_evidences").select("evidence_id").eq("event_id", PUB);
    return (data ?? []).length;
  }
  for (const [who, n] of [["org", 1], ["agent", 1], ["admin", 1], ["otherAgent", 0], ["confirmed", 0], ["user", 0], ["otherOrg", 0]] as const) {
    it(`${who} → ${n}件`, async () => {
      expect(`${who}:${await rowsAs(who)}`).toBe(`${who}:${n}`);
    });
  }
});
