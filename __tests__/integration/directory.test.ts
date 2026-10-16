/**
 * TC-DIRECTORY: 照会画面 API
 *   GET /api/directory/search?types=artist,organizer&q=
 *   GET /api/directory/:profileId
 *
 * カバレッジ:
 *   A. 閲覧権限マトリクス: user/artist は不可、organizer はアーティストのみ、agent/admin は両方
 *   B. 検索対象: 上位互換(organizer/agentもアーティスト検索に出る)・登録手続き中(Stripe未完了等)も出る・
 *      admin/一般ユーザー/削除済み/自分は出ない
 *   C. 検索列: artist は artist_name、organizer は organizer_name/organization_name でもヒット
 *   D. 詳細の出し分け: organizer には実績・口座状況を返さない（キー自体が値を持たない）、
 *      agent/admin には返す。実績は出演承諾済み×公開以降のみ
 *   E. 詳細の閲覧不可: 削除済み・一般ユーザー・admin・不正ID は404
 *   F. 入力: 空クエリ・or()構文破壊文字・SNSのjavascript:URL
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, insertEvent, insertEventArtist, deleteAuthUsers } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
// dc_stepup の値をテストごとに差し替える（既定はステップアップ直後）
const stepUp: { value: string | undefined } = { value: undefined };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === "dc_stepup" && stepUp.value !== undefined ? { value: stepUp.value } : undefined),
    getAll: () => [],
  })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { GET as searchGET } from "@/app/api/directory/search/route";
import { GET as detailGET } from "@/app/api/directory/[profileId]/route";

const ts = Date.now();
const MARK = `dir${ts}`;

const ids = {} as Record<
  | "user" | "artistViewer" | "organizer" | "agent" | "admin"
  | "artist" | "orgTarget" | "agentTarget" | "pendingArtist" | "deletedArtist" | "activeUser"
  | "pendingOrganizer" | "pendingAgent" | "deletedOrganizer",
  string
>;
const eventIds = {} as Record<"published" | "settled" | "draft" | "cancelled" | "pendingSlot" | "hosted", string>;

// stepUpValue: null は「dc_stepup cookie なし」
function mockAs(id: string | null, stepUpValue: string | null = String(Date.now())) {
  stepUp.value = stepUpValue ?? undefined;
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: id ? { id } : null }, error: null }) },
  });
}

async function search(viewer: string | null, type: string, q: string, stepUpValue?: string) {
  mockAs(viewer, stepUpValue ?? String(Date.now()));
  const res = await searchGET(
    new Request(`http://localhost/api/directory/search?types=${type}&q=${encodeURIComponent(q)}`),
  );
  return { status: res.status, body: await res.json() };
}

async function detail(viewer: string | null, profileId: string, stepUpValue?: string) {
  mockAs(viewer, stepUpValue ?? String(Date.now()));
  const res = await detailGET(new Request(`http://localhost/api/directory/${profileId}`), {
    params: Promise.resolve({ profileId }),
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  const mk = (role: any, name: string, extra?: { stripeConnectId?: string }) =>
    insertProfile({ role, displayName: `${name}${MARK}`, email: `${name}-${MARK}@test.local`.replace(/[^\x00-\x7F]/g, "x") + Math.random().toString(36).slice(2, 6), ...extra });

  ids.user = await mk("user", "閲覧一般");
  ids.artistViewer = await mk("artist", "閲覧アーティスト");
  ids.organizer = await mk("organizer", "閲覧オーガナイザー");
  ids.agent = await mk("agent", "閲覧エージェント");
  ids.admin = await mk("admin", "閲覧管理者");
  ids.artist = await mk("artist", "対象アーティスト", { stripeConnectId: `acct_dir${ts}` });
  ids.orgTarget = await mk("organizer", "対象主催");
  ids.agentTarget = await mk("agent", "対象代理店");
  ids.pendingArtist = await mk("artist", "未承認アーティスト");
  ids.deletedArtist = await mk("artist", "削除アーティスト");
  ids.activeUser = await mk("user", "一般アクティブ");
  ids.pendingOrganizer = await mk("organizer", "審査待ち主催");
  ids.pendingAgent = await mk("agent", "審査待ち代理店");
  ids.deletedOrganizer = await mk("organizer", "退会主催");

  await testAdmin.from("profiles").update({ status: "pending_interview" }).eq("profile_id", ids.pendingArtist);
  await testAdmin.from("profiles").update({ status: "pending_terms" }).eq("profile_id", ids.pendingOrganizer);
  await testAdmin.from("profiles").update({ status: "pending_onboarding" }).eq("profile_id", ids.pendingAgent);
  await testAdmin.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("profile_id", ids.deletedOrganizer);
  await testAdmin.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("profile_id", ids.deletedArtist);
  await testAdmin.from("profiles").update({
    artist_name: `芸名${MARK}`,
    genre: "TECHNO",
    bio: "紹介文",
    verification_status: "verified",
    stripe_restricted: true,
    balance_frozen: false,
    chargeback_count: 2,
    social_links: { instagram: "https://instagram.com/x", soundcloud: "javascript:alert(1)", website: "not a url" },
  }).eq("profile_id", ids.artist);
  await testAdmin.from("profiles").update({
    organizer_name: `主催名${MARK}`,
    organization_name: `団体${MARK}`,
  }).eq("profile_id", ids.orgTarget);

  // 出演実績: published / settled は実績、draft・cancelled・出演未承諾は実績にしない
  const day = (n: number) => new Date(Date.now() + n * 86400_000);
  eventIds.published = await insertEvent({ organizerProfileId: ids.orgTarget, title: `公開${MARK}`, startAt: day(-10), endAt: day(-9) });
  eventIds.settled = await insertEvent({ organizerProfileId: ids.orgTarget, title: `精算${MARK}`, startAt: day(-30), endAt: day(-29) });
  eventIds.draft = await insertEvent({ organizerProfileId: ids.orgTarget, title: `下書き${MARK}`, startAt: day(5), endAt: day(6) });
  eventIds.cancelled = await insertEvent({ organizerProfileId: ids.orgTarget, title: `中止${MARK}`, startAt: day(7), endAt: day(8) });
  eventIds.pendingSlot = await insertEvent({ organizerProfileId: ids.agentTarget, title: `未承諾${MARK}`, startAt: day(-3), endAt: day(-2) });
  await testAdmin.from("events").update({ lifecycle_status: "settled" }).eq("event_id", eventIds.settled);
  await testAdmin.from("events").update({ lifecycle_status: "draft" }).eq("event_id", eventIds.draft);
  await testAdmin.from("events").update({ lifecycle_status: "cancelled" }).eq("event_id", eventIds.cancelled);
  for (const e of [eventIds.published, eventIds.settled, eventIds.draft, eventIds.cancelled]) {
    await insertEventArtist({ eventId: e, artistProfileId: ids.artist });
  }
  await insertEventArtist({ eventId: eventIds.pendingSlot, artistProfileId: ids.artist, status: "pending" });
}, 60_000);

afterAll(async () => {
  const evs = Object.values(eventIds);
  await testAdmin.from("event_artists").delete().in("event_id", evs);
  await testAdmin.from("events").delete().in("event_id", evs);
  await deleteAuthUsers(Object.values(ids));
});

describe("TC-DIRECTORY-A: 閲覧権限マトリクス", () => {
  it("TC-DIRECTORY-A-01: 未ログインは401", async () => {
    const r = await search(null, "artist", MARK);
    expect(r.status).toBe(401);
    const d = await detail(null, ids.artist);
    expect(d.status).toBe(401);
  });

  it.each([
    ["user", "artist", 403],
    ["user", "organizer", 403],
    ["artistViewer", "artist", 403],
    ["artistViewer", "organizer", 403],
    ["organizer", "artist", 200],
    ["organizer", "organizer", 403],
    ["agent", "artist", 200],
    ["agent", "organizer", 200],
    ["admin", "artist", 200],
    ["admin", "organizer", 200],
  ] as const)("TC-DIRECTORY-A-02: %s が type=%s を検索 → %i", async (viewer, type, expected) => {
    const r = await search(ids[viewer], type, MARK);
    expect(r.status).toBe(expected);
  });

  it("TC-DIRECTORY-A-03: 不明な type は403", async () => {
    const r = await search(ids.admin, "user", MARK);
    expect(r.status).toBe(403);
  });

  it.each(["user", "artistViewer"] as const)("TC-DIRECTORY-A-04: %s は詳細も403", async (viewer) => {
    const d = await detail(ids[viewer], ids.artist);
    expect(d.status).toBe(403);
  });
});

describe("TC-DIRECTORY-B: 検索対象", () => {
  it("TC-DIRECTORY-B-01: アーティスト検索は artist/organizer/agent が出る（上位互換）", async () => {
    const r = await search(ids.organizer, "artist", `対象`);
    const hit = (r.body.results as { profile_id: string }[]).map((x) => x.profile_id).filter((id) => Object.values(ids).includes(id));
    expect(new Set(hit)).toEqual(new Set([ids.artist, ids.orgTarget, ids.agentTarget]));
  });

  it("TC-DIRECTORY-B-01b: 登録手続き中（面談待ち）でも検索に出る（口座状態だけで見えなくしない）", async () => {
    const r = await search(ids.organizer, "artist", `未承認アーティスト${MARK}`);
    expect(r.body.results.map((x: { profile_id: string }) => x.profile_id)).toEqual([ids.pendingArtist]);
  });

  it.each([
    ["deletedArtist", "削除アーティスト"],
    ["activeUser", "一般アクティブ"],
    ["admin", "閲覧管理者"],
  ] as const)("TC-DIRECTORY-B-02: %s はアーティスト検索に出ない", async (_k, name) => {
    const r = await search(ids.agent, "artist", `${name}${MARK}`);
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([]);
  });

  it("TC-DIRECTORY-B-03: 自分自身は出ない", async () => {
    const r = await search(ids.organizer, "artist", `閲覧オーガナイザー${MARK}`);
    expect(r.body.results).toEqual([]);
  });

  it("TC-DIRECTORY-B-04: オーガナイザー検索は organizer/agent のみで artist は出ない", async () => {
    const r = await search(ids.agent, "organizer", `対象`);
    const hit = (r.body.results as { profile_id: string }[]).map((x) => x.profile_id).filter((id) => Object.values(ids).includes(id));
    expect(new Set(hit)).toEqual(new Set([ids.orgTarget, ids.agentTarget]));
  });
});

describe("TC-DIRECTORY-C: 検索列と表示名", () => {
  it("TC-DIRECTORY-C-01: artist_name でヒットし、名前は芸名・サブはジャンル", async () => {
    const r = await search(ids.organizer, "artist", `芸名${MARK}`);
    expect(r.body.results).toEqual([
      { profile_id: ids.artist, role: "artist", name: `芸名${MARK}`, avatar_url: null, sub: "TECHNO", matched: ["artist"] },
    ]);
  });

  it("TC-DIRECTORY-C-02: organizer_name でヒットし、名前は主催名・サブは団体名", async () => {
    const r = await search(ids.admin, "organizer", `主催名${MARK}`);
    expect(r.body.results).toEqual([
      { profile_id: ids.orgTarget, role: "organizer", name: `主催名${MARK}`, avatar_url: null, sub: `団体${MARK}`, matched: ["organizer"] },
    ]);
  });

  it("TC-DIRECTORY-C-03: organization_name でもヒットする", async () => {
    const r = await search(ids.agent, "organizer", `団体${MARK}`);
    expect(r.body.results.map((x: { profile_id: string }) => x.profile_id)).toEqual([ids.orgTarget]);
  });

  it("TC-DIRECTORY-C-04: アーティスト検索では organizer_name ではヒットしない", async () => {
    const r = await search(ids.agent, "artist", `主催名${MARK}`);
    expect(r.body.results).toEqual([]);
  });
});

describe("TC-DIRECTORY-D: 詳細の出し分け", () => {
  it("TC-DIRECTORY-D-01: organizer には公開項目のみ（internal=null、口座情報の値を含まない）", async () => {
    const d = await detail(ids.organizer, ids.artist);
    expect(d.status).toBe(200);
    expect(d.body.profile.internal).toBe(null);
    expect(d.body.profile.artist_name).toBe(`芸名${MARK}`);
    expect(d.body.profile.genre).toBe("TECHNO");
    expect(d.body.profile.bio).toBe("紹介文");
    const raw = JSON.stringify(d.body);
    expect(raw.includes(`acct_dir${ts}`)).toBe(false);
    expect(raw.includes("chargeback")).toBe(false);
    expect(raw.includes("verification_status")).toBe(false);
  });

  it.each(["agent", "admin"] as const)("TC-DIRECTORY-D-02: %s には口座状況を返す（connect IDそのものは返さない）", async (viewer) => {
    const d = await detail(ids[viewer], ids.artist);
    expect(d.status).toBe(200);
    expect(d.body.profile.internal.account).toEqual({
      has_connect_account: true,
      verification_status: "verified",
      stripe_restricted: true,
      balance_frozen: false,
      chargeback_count: 2,
    });
    expect(JSON.stringify(d.body).includes(`acct_dir${ts}`)).toBe(false);
  });

  it("TC-DIRECTORY-D-03: 出演実績は承諾済み×公開以降のみ・開催日の新しい順", async () => {
    const d = await detail(ids.agent, ids.artist);
    expect(d.body.profile.internal.performances.map((e: { event_id: string }) => e.event_id))
      .toEqual([eventIds.published, eventIds.settled]);
    expect(d.body.profile.internal.performances[1].lifecycle_status).toBe("settled");
  });

  it("TC-DIRECTORY-D-04: 開催実績は主催イベントのうち公開以降のみ", async () => {
    const d = await detail(ids.admin, ids.orgTarget);
    expect(d.body.profile.internal.hosted_events.map((e: { event_id: string }) => e.event_id))
      .toEqual([eventIds.published, eventIds.settled]);
    expect(d.body.profile.organizer_name).toBe(`主催名${MARK}`);
    expect(d.body.profile.organization_name).toBe(`団体${MARK}`);
  });

  it("TC-DIRECTORY-D-05: 出演ゼロ・口座未登録でも空配列とfalseで返る（agentの主催分は開催実績に出る）", async () => {
    const d = await detail(ids.agent, ids.agentTarget);
    expect(d.body.profile.internal.performances).toEqual([]);
    expect(d.body.profile.internal.hosted_events.map((e: { event_id: string }) => e.event_id)).toEqual([eventIds.pendingSlot]);
    expect(d.body.profile.internal.account.has_connect_account).toBe(false);
    expect(d.body.profile.internal.account.chargeback_count).toBe(0);
  });

  it("TC-DIRECTORY-D-06: organizer も上位互換で organizer ロールのアーティスト面を照会できる", async () => {
    const d = await detail(ids.organizer, ids.orgTarget);
    expect(d.status).toBe(200);
    expect(d.body.profile.internal).toBe(null);
  });
});

describe("TC-DIRECTORY-E: 詳細の閲覧不可", () => {
  it.each([
    ["deletedArtist"],
    ["activeUser"],
    ["admin"],
  ] as const)("TC-DIRECTORY-E-01: %s は404", async (target) => {
    const d = await detail(ids.agent, ids[target]);
    expect(d.status).toBe(404);
  });

  it("TC-DIRECTORY-E-02: UUIDでないIDは500ではなく404", async () => {
    const d = await detail(ids.agent, "not-a-uuid");
    expect(d.status).toBe(404);
  });
});

describe("TC-DIRECTORY-F: 入力", () => {
  it("TC-DIRECTORY-F-01: 空クエリは空配列", async () => {
    const r = await search(ids.agent, "artist", "   ");
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([]);
  });

  it("TC-DIRECTORY-F-02: or()構文を壊す文字で他列条件を混ぜ込めない", async () => {
    const r = await search(ids.agent, "artist", `x,phone.ilike.%,(display_name.ilike.%)`);
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([]);
  });

  it("TC-DIRECTORY-F-03: % はワイルドカードとして扱われない", async () => {
    const r = await search(ids.agent, "artist", "%");
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([]);
  });

  it("TC-DIRECTORY-F-04: SNSは http(s) のみ残し javascript: や非URLは落とす", async () => {
    const d = await detail(ids.organizer, ids.artist);
    expect(d.body.profile.social_links).toEqual({ instagram: "https://instagram.com/x" });
  });
});

describe("TC-DIRECTORY-G: ステップアップ認証（APIを直接叩かれても画面と同じ条件を要求）", () => {
  const day = 86400_000;
  it.each([
    ["cookieなし", "NONE"],
    ["24時間超過", String(Date.now() - day - 60_000)],
    ["数値以外", "abc"],
    ["未来時刻（偽造）", String(Date.now() + 3600_000)],
    ["空文字", ""],
  ] as const)("TC-DIRECTORY-G-01: %s は検索・詳細とも401", async (_label, v) => {
    const value = v === "NONE" ? null : v;
    mockAs(ids.admin, value);
    const r = await searchGET(new Request(`http://localhost/api/directory/search?types=artist&q=${MARK}`));
    expect(r.status).toBe(401);
    mockAs(ids.admin, value);
    const d = await detailGET(new Request("http://localhost/api/directory/x"), { params: Promise.resolve({ profileId: ids.artist }) });
    expect(d.status).toBe(401);
  });

  it("TC-DIRECTORY-G-02: 24時間以内なら通る", async () => {
    const r = await search(ids.admin, "artist", `芸名${MARK}`, String(Date.now() - day + 60_000));
    expect(r.status).toBe(200);
    expect(r.body.results.map((x: { profile_id: string }) => x.profile_id)).toEqual([ids.artist]);
  });
});

describe("TC-DIRECTORY-H: 閲覧者の状態", () => {
  it.each(["pendingOrganizer", "pendingAgent"] as const)(
    "TC-DIRECTORY-H-01: %s（登録手続き中）でもロールどおり利用できる",
    async (viewer) => {
      const r = await search(ids[viewer], "artist", `芸名${MARK}`);
      expect(r.status).toBe(200);
      expect(r.body.results.map((x: { profile_id: string }) => x.profile_id)).toEqual([ids.artist]);
      const d = await detail(ids[viewer], ids.artist);
      expect(d.status).toBe(200);
    },
  );

  it("TC-DIRECTORY-H-01b: 登録手続き中の agent も口座状況まで見える（ロールで決まる）", async () => {
    const d = await detail(ids.pendingAgent, ids.artist);
    expect(d.body.profile.internal.account.chargeback_count).toBe(2);
    const o = await search(ids.pendingAgent, "organizer", `主催名${MARK}`);
    expect(o.status).toBe(200);
  });

  it("TC-DIRECTORY-H-01c: 登録手続き中の organizer はオーガナイザー検索不可・口座状況なし（ロールどおり）", async () => {
    const o = await search(ids.pendingOrganizer, "organizer", `主催名${MARK}`);
    expect(o.status).toBe(403);
    const d = await detail(ids.pendingOrganizer, ids.artist);
    expect(d.body.profile.internal).toBe(null);
  });

  it("TC-DIRECTORY-H-01d: 退会済みの organizer は検索・詳細とも403", async () => {
    const r = await search(ids.deletedOrganizer, "artist", MARK);
    expect(r.status).toBe(403);
    const d = await detail(ids.deletedOrganizer, ids.artist);
    expect(d.status).toBe(403);
  });

  it("TC-DIRECTORY-H-02: 登録手続き中の organizer/agent も照会される側としては検索に出る（退会者は出ない）", async () => {
    const r = await search(ids.admin, "organizer", `審査待ち`);
    const hit = (r.body.results as { profile_id: string }[]).map((x) => x.profile_id).filter((id) => Object.values(ids).includes(id));
    expect(new Set(hit)).toEqual(new Set([ids.pendingOrganizer, ids.pendingAgent]));
    const r2 = await search(ids.admin, "organizer", `退会主催${MARK}`);
    expect(r2.body.results).toEqual([]);
  });

  it.each([
    ["pendingArtist", "pending_interview"],
    ["pendingOrganizer", "pending_terms"],
    ["pendingAgent", "pending_onboarding"],
    ["artist", "active"],
  ] as const)("TC-DIRECTORY-H-04: agent には %s の登録状況 %s を返す", async (target, expected) => {
    const d = await detail(ids.agent, ids[target]);
    expect(d.status).toBe(200);
    expect(d.body.profile.internal.registration_status).toBe(expected);
  });

  it("TC-DIRECTORY-H-05: organizer が登録手続き中の相手を照会しても登録状況は返らない", async () => {
    const d = await detail(ids.organizer, ids.pendingArtist);
    expect(d.status).toBe(200);
    expect(d.body.profile.internal).toBe(null);
    expect(JSON.stringify(d.body).includes("pending_interview")).toBe(false);
  });

  it("TC-DIRECTORY-H-03: organizer の詳細レスポンスに口座・実績の値が載らない（agent用データを取得すらしない）", async () => {
    const d = await detail(ids.organizer, ids.orgTarget);
    expect(d.status).toBe(200);
    expect(Object.keys(d.body.profile).sort()).toEqual([
      "affiliation", "artist_name", "avatar_url", "bio", "display_name", "genre", "internal",
      "organization_name", "organizer_name", "profile_id", "role", "social_links",
    ]);
    expect(d.body.profile.internal).toBe(null);
  });
});

describe("TC-DIRECTORY-I: 両方オン（types=artist,organizer）", () => {
  type Item = { profile_id: string; matched: string[]; name: string };
  const mine = (results: Item[]) => results.filter((x) => Object.values(ids).includes(x.profile_id));

  it("TC-DIRECTORY-I-01: 両方の結果を合わせ、同一人物は1件にまとめて該当種別を両方返す", async () => {
    const r = await search(ids.agent, "artist,organizer", "対象");
    expect(r.status).toBe(200);
    const got = Object.fromEntries(mine(r.body.results).map((x) => [x.profile_id, x.matched]));
    expect(got).toEqual({
      [ids.artist]: ["artist"],
      [ids.orgTarget]: ["artist", "organizer"],
      [ids.agentTarget]: ["artist", "organizer"],
    });
    const idsOnly = mine(r.body.results).map((x) => x.profile_id);
    expect(idsOnly.length).toBe(new Set(idsOnly).size);
  });

  it("TC-DIRECTORY-I-02: 指定順に関係なく artist→organizer の順で該当種別を返す", async () => {
    const r = await search(ids.admin, "organizer,artist", `対象主催${MARK}`);
    expect(r.body.results.map((x: Item) => [x.profile_id, x.matched])).toEqual([[ids.orgTarget, ["artist", "organizer"]]]);
  });

  it("TC-DIRECTORY-I-02b: 両方に該当した人のサブ表記はジャンルと団体名を並べる（片方が空ならある方だけ）", async () => {
    await testAdmin.from("profiles").update({ genre: "HOUSE" }).eq("profile_id", ids.orgTarget);
    try {
      const r = await search(ids.admin, "artist,organizer", `対象主催${MARK}`);
      expect(r.body.results.map((x: Item & { sub: string | null }) => x.sub)).toEqual([`HOUSE / 団体${MARK}`]);
    } finally {
      await testAdmin.from("profiles").update({ genre: null }).eq("profile_id", ids.orgTarget);
    }
    const r2 = await search(ids.admin, "artist,organizer", `対象主催${MARK}`);
    expect(r2.body.results.map((x: Item & { sub: string | null }) => x.sub)).toEqual([`団体${MARK}`]);
    const r3 = await search(ids.admin, "artist,organizer", `対象代理店${MARK}`);
    expect(r3.body.results.map((x: Item & { sub: string | null }) => x.sub)).toEqual([null]);
  });

  it("TC-DIRECTORY-I-03: 片方にしか該当しない語ではその種別だけ・名前もその種別の名前", async () => {
    const r = await search(ids.agent, "artist,organizer", `主催名${MARK}`);
    expect(r.body.results.map((x: Item) => [x.profile_id, x.matched, x.name])).toEqual([[ids.orgTarget, ["organizer"], `主催名${MARK}`]]);
    const r2 = await search(ids.agent, "artist,organizer", `芸名${MARK}`);
    expect(r2.body.results.map((x: Item) => [x.profile_id, x.matched, x.name])).toEqual([[ids.artist, ["artist"], `芸名${MARK}`]]);
  });

  it("TC-DIRECTORY-I-04: 重複指定（artist,artist）は1種別として扱う", async () => {
    const r = await search(ids.agent, "artist,artist", `芸名${MARK}`);
    expect(r.status).toBe(200);
    expect(r.body.results.map((x: Item) => x.matched)).toEqual([["artist"]]);
  });

  it.each([
    ["organizer", "artist,organizer"],
    ["organizer", "organizer,artist"],
    ["agent", "artist,user"],
    ["admin", "artist,"+"profiles"],
    ["agent", ","],
    ["agent", ""],
  ] as const)("TC-DIRECTORY-I-05: %s が types=%s → 403（権限外・不明・空が混ざれば全体拒否）", async (viewer, types) => {
    const r = await search(ids[viewer], types, MARK);
    expect(r.status).toBe(403);
  });
});
