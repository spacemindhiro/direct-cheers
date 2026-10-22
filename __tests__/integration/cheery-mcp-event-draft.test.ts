/* eslint-disable @typescript-eslint/no-explicit-any -- fetch の差し替えを最小限の形で作るため */
/**
 * TC-CHEERY-DRAFT: チアリー(AI) のイベント作成（P5）の MCP ツール。アクセス範囲表は knowhow/ai-concierge/p5-access-matrix.md
 *
 * 読み取り（AI に渡す）：find_venue・check_venue_address・venue_pin・prepare_event_draft
 * 書き込み（AI に渡さない。action モードだけ）：register_venue・create_event_draft
 *
 * | 関係者                       | 読み取りのツール | 書き込みのツール（chat） | 書き込みのツール（action） |
 * |------------------------------|------------------|--------------------------|----------------------------|
 * | 一般ユーザー・アーティスト      | ×                | ×                        | ×                          |
 * | オーガナイザー・エージェント・admin | ○             | ×（AI には出さない）       | ○                          |
 *
 * | 名義の指定                                | 期待 |
 * |-------------------------------------------|------|
 * | エージェント → 自分が担当の主催者           | ○ 代理の下書き（主催者からは見えない・通知なし） |
 * | エージェント → 別のエージェントの主催者      | × 「見つかりません」・作成も拒否 |
 * | オーガナイザー → 他人                       | × 作成を拒否 |
 * | 担当エージェントのいないオーガナイザー        | × |
 *
 * Google（店の検索・位置から住所）と郵便番号の検索は差し替える（Supabase への通信はそのまま）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { isProxyDraftHiddenFrom } from "@/lib/proxy-draft";
import { slotDecided, type EventDraftCard, type VenueRegisterCard } from "@/lib/cheery/cards";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const email = (k: string) => `mcpd-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const cleanup = { profiles: [] as string[], events: [] as string[], venues: [] as string[], cards: [] as string[] };
const sessions: DcMcpSession[] = [];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const READ_TOOLS = ["check_venue_address", "find_venue", "prepare_event_draft", "venue_pin"];
const WRITE_TOOLS = ["create_event_draft", "register_venue"];
const EXISTING_VENUE = `既存会場${ts}`;
const SHOP = `テストバー${ts}`;
const CLOSED_SHOP = `閉店バー${ts}`;
const ODD_SHOP = `照合不可バー${ts}`;

// ── Google と郵便番号の検索の差し替え ──
const realFetch = globalThis.fetch;
const googleBodies: any[] = [];
const place = (name: string, extra: Record<string, unknown> = {}) => ({
  displayName: { text: name },
  formattedAddress: "日本、〒150-0041 東京都渋谷区神南１丁目１９−５",
  postalAddress: { postalCode: "150-0041" },
  location: { latitude: 35.6618, longitude: 139.6979 },
  googleMapsUri: "https://maps.google.com/?cid=1",
  businessStatus: "OPERATIONAL",
  ...extra,
});
function fakeFetch(input: any, init?: any) {
  const u = typeof input === "string" ? input : input.url;
  const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
  if (u.startsWith("https://places.googleapis.com/")) {
    const body = JSON.parse(init.body);
    googleBodies.push(body);
    if (body.textQuery.startsWith(SHOP)) return json({ places: [place(SHOP)] });
    if (body.textQuery.startsWith(CLOSED_SHOP)) return json({ places: [place(CLOSED_SHOP, { businessStatus: "CLOSED_PERMANENTLY" })] });
    // 住所が郵便番号の地域（渋谷区）と合わない
    if (body.textQuery.startsWith(ODD_SHOP)) return json({ places: [place(ODD_SHOP, { formattedAddress: "日本、〒150-0041 東京都新宿区西新宿２丁目８−１" })] });
    return json({});
  }
  if (u.startsWith("https://maps.googleapis.com/maps/api/geocode/")) return json({ status: "OK", results: [{ geometry: { location: { lat: 35.87, lng: 138.38 } } }] });
  if (u.startsWith("https://postcode.teraren.com/postcodes/1500041")) return json({ prefecture: "東京都", city: "渋谷区", suburb: "神南" });
  if (u.startsWith("https://postcode.teraren.com/")) return Promise.resolve(new Response("{}", { status: 404 }));
  return realFetch(input, init);
}

async function mcpAs(key: string, role: string, opts: { mode?: "chat" | "action"; stepUpFresh?: boolean } = {}) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin, mode: opts.mode ?? "chat", stepUpFresh: opts.stepUpFresh ?? true });
  sessions.push(s);
  return s;
}
async function run(s: DcMcpSession, name: string, input: Record<string, unknown>) {
  const r = await s.tools.find((t) => t.name === name)!.run(input);
  expect(r.isError).toBe(false);
  return r.content;
}
async function write(s: DcMcpSession, name: string, input: Record<string, unknown>) {
  const r = await s.call(name, input);
  return JSON.parse(r.text) as { ok: boolean; error?: string; id?: string; eventId?: string; already?: boolean };
}
const countRows = async (table: string, col: string, val: string) =>
  (await testAdmin.from(table).select("*", { count: "exact", head: true }).eq(col, val)).count;
const venueCount = async (name: string) => countRows("venues", "name", name);
const lastDraftCard = (s: DcMcpSession) => s.cards().filter((c) => c.kind === "event_draft").at(-1) as EventDraftCard;
const lastVenueCard = (s: DcMcpSession) => s.cards().filter((c) => c.kind === "venue_register").at(-1) as VenueRegisterCard;

beforeAll(async () => {
  vi.stubGlobal("fetch", fakeFetch);
  process.env.GOOGLE_PLACES_API_KEY = "k-test";
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY = "k-browser";
  for (const [k, role] of [
    ["usr", "user"], ["art", "artist"], ["org", "organizer"], ["orgNoAg", "organizer"], ["orgOther", "organizer"],
    ["ag", "agent"], ["ag2", "agent"], ["adm", "admin"], ["perf", "artist"], ["same1", "artist"], ["same2", "artist"], ["far", "artist"],
  ] as const) {
    P[k] = await insertProfile({ role, displayName: `MCPD ${k} ${ts}`, email: email(k) });
    cleanup.profiles.push(P[k]);
  }
  await testAdmin.from("profiles").update({ responsible_agent_id: P.ag, organizer_name: `担当主催${ts}` }).eq("profile_id", P.org);
  await testAdmin.from("profiles").update({ responsible_agent_id: P.ag2, organizer_name: `別担当主催${ts}` }).eq("profile_id", P.orgOther);
  await testAdmin.from("profiles").update({ artist_name: `ミライ${ts}` }).eq("profile_id", P.perf);
  await testAdmin.from("profiles").update({ artist_name: `同名${ts}` }).eq("profile_id", P.same1);
  await testAdmin.from("profiles").update({ artist_name: `同名${ts}` }).eq("profile_id", P.same2);
  await testAdmin.from("profiles").update({ artist_name: `遠い人${ts}` }).eq("profile_id", P.far);
  await testAdmin.from("connections").insert({ organizer_profile_id: P.org, artist_profile_id: P.perf, status: "active" });
  const { data: v } = await testAdmin.from("venues").insert({
    created_by: P.org, name: EXISTING_VENUE, postal_code: "150-0041", prefecture: "東京都", city: "渋谷区", town: "神南", line1: "1-1-1",
  }).select("venue_id").single();
  cleanup.venues.push(v!.venue_id);
}, 60_000);

afterAll(async () => {
  for (const s of sessions) await s.close().catch(() => {});
  vi.unstubAllGlobals();
  if (cleanup.events.length) {
    await testAdmin.from("notifications").delete().filter("metadata->>event_id", "in", `(${cleanup.events.join(",")})`);
    await testAdmin.from("event_artists").delete().in("event_id", cleanup.events);
    await testAdmin.from("events").delete().in("event_id", cleanup.events);
  }
  await testAdmin.from("cheery_card_uses").delete().in("profile_id", cleanup.profiles);
  const { data: made } = await testAdmin.from("venues").select("venue_id").in("created_by", cleanup.profiles);
  await testAdmin.from("venues").delete().in("venue_id", (made ?? []).map((r) => r.venue_id));
  await testAdmin.from("google_api_calls").delete().in("profile_id", cleanup.profiles);
  await testAdmin.from("connections").delete().eq("organizer_profile_id", P.org);
  await deleteAuthUsers(cleanup.profiles);
});

// ── 1. 誰にどのツールが出るか ──
describe("TC-CHEERY-DRAFT-1: ツールの一覧（VA1・DB1・書き込みは AI に出さない）", () => {
  it("1-01: 一般ユーザー・アーティストには読み取りも書き込みも出ない（action でも）", async () => {
    for (const [k, role] of [["usr", "user"], ["art", "artist"]] as const) {
      for (const mode of ["chat", "action"] as const) {
        const s = await mcpAs(k, role, { mode });
        const names = s.tools.map((t) => t.name);
        expect([...READ_TOOLS, ...WRITE_TOOLS].filter((n) => names.includes(n))).toEqual([]);
      }
    }
  });

  it("1-02: AI との会話（chat）では、admin でも書き込みのツールが無い", async () => {
    for (const [k, role] of [["org", "organizer"], ["ag", "agent"], ["adm", "admin"]] as const) {
      const names = (await mcpAs(k, role)).tools.map((t) => t.name);
      expect(READ_TOOLS.filter((n) => names.includes(n))).toEqual(READ_TOOLS);
      expect(WRITE_TOOLS.filter((n) => names.includes(n))).toEqual([]);
    }
  });

  it("1-03: カードのボタン（action）では、オーガナイザーに書き込みのツールが出る", async () => {
    const names = (await mcpAs("org", "organizer", { mode: "action" })).tools.map((t) => t.name);
    expect(WRITE_TOOLS.filter((n) => names.includes(n))).toEqual(WRITE_TOOLS);
  });

  it("1-04: 一般ユーザーが action で書き込みを呼んでも行が増えない（VA2・DB2）", async () => {
    const s = await mcpAs("usr", "user", { mode: "action" });
    const before = await venueCount(`不正登録${ts}`);
    const r = await s.call("register_venue", {
      card_id: crypto.randomUUID(), name: `不正登録${ts}`, postal_code: "150-0041", prefecture: "東京都", city: "渋谷区", town: null, line1: "1", latitude: null, longitude: null,
    });
    expect(r.isError).toBe(true);
    expect(await venueCount(`不正登録${ts}`)).toBe(before);
    const ev = await s.call("create_event_draft", {
      card_id: crypto.randomUUID(), title: `不正作成${ts}`, venue_id: cleanup.venues[0], start_at: "2026-12-01T10:00:00.000Z", end_at: "2026-12-01T12:00:00.000Z",
      organizer_profile_id: null, performer_ids: [],
    });
    expect(ev.isError).toBe(true);
    expect(await countRows("events", "title", `不正作成${ts}`)).toBe(0);
  });
});

// ── 2. 会場 ──
describe("TC-CHEERY-DRAFT-2: 会場を探す・登録する", () => {
  it("2-01: 会場マスタに同じ名前があれば、それを使うよう返し、Google は呼ばない・カードも出さない", async () => {
    const s = await mcpAs("org", "organizer");
    const before = googleBodies.length;
    const text = await run(s, "find_venue", { name: EXISTING_VENUE });
    expect(text).toBe(`会場マスタに「${EXISTING_VENUE}」（東京都渋谷区）があります。イベントの会場にはこの名前をそのまま使ってください（新しく登録しません）。`);
    expect(googleBodies.length).toBe(before);
    expect(s.cards()).toEqual([]);
  });

  it("2-02: Google で見つかった店は、照合した住所でカードになる。AI への文に ID が無く、送ったのは店名と地域だけ（VA4・VA9）", async () => {
    const s = await mcpAs("org", "organizer");
    const text = await run(s, "find_venue", { name: SHOP, area: "渋谷" });
    expect(googleBodies.at(-1)).toEqual({ textQuery: `${SHOP} 渋谷`, languageCode: "ja", regionCode: "JP", pageSize: 5 });
    const card = lastVenueCard(s);
    expect({ ...card, card_id: "x" }).toEqual({
      kind: "venue_register", card_id: "x", name: SHOP, postal_code: "150-0041", prefecture: "東京都", city: "渋谷区", town: "神南", line1: "1丁目19-5",
      latitude: 35.6618, longitude: 139.6979, maps_uri: "https://maps.google.com/?cid=1", source: "google",
    });
    expect(text.includes(`- ${SHOP}（〒150-0041 東京都渋谷区神南1丁目19-5）：確認カードを出しました`)).toBe(true);
    expect(UUID.test(text)).toBe(false);
    expect(await venueCount(SHOP)).toBe(0); // 読み取りだけ（VA3）
  });

  it("2-03: 閉店した店・住所と郵便番号が合わない店はカードにしない（VA5・VA6）", async () => {
    const s = await mcpAs("org", "organizer");
    const closed = await run(s, "find_venue", { name: CLOSED_SHOP });
    expect(closed.includes("閉店しているため登録できません")).toBe(true);
    const odd = await run(s, "find_venue", { name: ODD_SHOP });
    expect(odd.includes("住所と郵便番号の照合ができない")).toBe(true);
    expect(s.cards()).toEqual([]);
  });

  it("2-04: カードのボタンで登録すると1行でき、同じカードで二度押しても増えない（VA8）。ピンの位置も入る", async () => {
    const chat = await mcpAs("org", "organizer");
    await run(chat, "find_venue", { name: SHOP });
    const card = lastVenueCard(chat);
    const act = await mcpAs("org", "organizer", { mode: "action" });
    const input = { card_id: card.card_id, name: card.name, postal_code: card.postal_code, prefecture: card.prefecture, city: card.city, town: card.town, line1: card.line1, latitude: card.latitude, longitude: card.longitude };
    const first = await write(act, "register_venue", input);
    expect([first.ok, first.already]).toEqual([true, false]);
    const second = await write(act, "register_venue", input);
    expect([second.ok, second.already, second.id]).toEqual([true, true, first.id]);
    expect(await venueCount(SHOP)).toBe(1);
    const { data: row } = await testAdmin.from("venues").select("created_by, latitude, longitude, line1").eq("venue_id", first.id!).single();
    expect(row).toEqual({ created_by: P.org, latitude: 35.6618, longitude: 139.6979, line1: "1丁目19-5" });
  });

  it("2-05: 既にある名前で登録しようとしても新しい行はできない（VA7）", async () => {
    const act = await mcpAs("org", "organizer", { mode: "action" });
    const r = await write(act, "register_venue", {
      card_id: crypto.randomUUID(), name: EXISTING_VENUE, postal_code: "150-0041", prefecture: "東京都", city: "渋谷区", town: null, line1: "2-2-2", latitude: null, longitude: null,
    });
    expect(r).toEqual({ ok: false, error: "同じ名前の会場が既に登録されています" });
    expect(await venueCount(EXISTING_VENUE)).toBe(1);
  });

  it("2-06: 画面から来た住所が郵便番号の地域と合わなければ登録しない（カードの中身は信用しない）", async () => {
    const act = await mcpAs("org", "organizer", { mode: "action" });
    const r = await write(act, "register_venue", {
      card_id: crypto.randomUUID(), name: `書き換え${ts}`, postal_code: "150-0041", prefecture: "東京都", city: "新宿区", town: null, line1: "1", latitude: null, longitude: null,
    });
    expect(r).toEqual({ ok: false, error: "郵便番号と住所が合いません" });
    expect(await venueCount(`書き換え${ts}`)).toBe(0);
  });

  it("2-07: 他人のカード ID は使えない", async () => {
    const chat = await mcpAs("org", "organizer");
    await run(chat, "check_venue_address", { name: `手入力${ts}`, postal_code: "150-0041", address: "神南1-2-3" });
    const card = lastVenueCard(chat);
    expect([card.prefecture, card.city, card.town, card.line1, card.source]).toEqual(["東京都", "渋谷区", "神南", "1-2-3", "manual"]);
    const input = { card_id: card.card_id, name: card.name, postal_code: card.postal_code, prefecture: card.prefecture, city: card.city, town: card.town, line1: card.line1, latitude: null, longitude: null };
    expect((await write(await mcpAs("org", "organizer", { mode: "action" }), "register_venue", input)).ok).toBe(true);
    const other = await write(await mcpAs("ag", "agent", { mode: "action" }), "register_venue", input);
    expect(other).toEqual({ ok: false, error: "このカードは使えません" });
  });

  it("2-08: 名前の無い場所は、地域から地図の中心を引いたピンのカードになる", async () => {
    const s = await mcpAs("org", "organizer");
    const text = await run(s, "venue_pin", { name: `特設会場${ts}`, area: "山梨県北杜市" });
    expect(text).toBe(`「特設会場${ts}」の場所を地図で指してもらうカードを出しました。ピンを置くと、一番近い住所で会場の確認カードが出ます。`);
    const card = s.cards().at(-1)!;
    expect({ ...card, card_id: "x" }).toEqual({ kind: "venue_pin", card_id: "x", name: `特設会場${ts}`, center: { latitude: 35.87, longitude: 138.38 } });
  });
});

// ── 3. 下書き ──
describe("TC-CHEERY-DRAFT-3: 下書きの確認カードと作成", () => {
  const base = { title: `チアリー下書き${ts}`, venue_name: EXISTING_VENUE, start: "2026-12-10T19:00", end: "2026-12-10T22:00", performers: [] as string[] };

  it("3-00: 出演者の項目は省けない（本人に聞かずにカードを出させない）", async () => {
    const s = await mcpAs("org", "organizer");
    const { performers: _omit, ...noPerformers } = base;
    void _omit;
    const r = await s.tools.find((t) => t.name === "prepare_event_draft")!.run(noPerformers);
    expect(r).toEqual({ content: "入力の形式が正しくありません", isError: true });
    expect(s.cards()).toEqual([]);
  });

  it("3-01: 確認カードには名前・日時だけが AI に渡り、ID はカードにだけ入る。読み取りでは行が増えない（DB7・DB8）", async () => {
    const s = await mcpAs("org", "organizer");
    const before = await countRows("events", "title", base.title);
    const text = await run(s, "prepare_event_draft", { ...base, performers: [`ミライ${ts}`] });
    expect(text).toBe([
      "下書きの確認カードを出しました。本人が［下書きを作る］を押すまで作られません。作っても、承認依頼を送るまで誰にも届きません。",
      `- タイトル：${base.title}`,
      `- 会場：${EXISTING_VENUE}（東京都渋谷区）`,
      "- 開始：2026年12月10日(木) 19:00",
      "- 終了：2026年12月10日(木) 22:00",
      "- 名義：自分",
      `- 出演者：ミライ${ts}`,
    ].join("\n"));
    expect(UUID.test(text)).toBe(false);
    const card = lastDraftCard(s);
    expect(card.start_at).toBe("2026-12-10T10:00:00.000Z");
    expect(card.end_at).toBe("2026-12-10T13:00:00.000Z");
    expect(card.venue.venue_id).toBe(cleanup.venues[0]);
    expect(card.performers).toEqual([{ query: `ミライ${ts}`, exact: true, options: [{ profile_id: P.perf, name: `ミライ${ts}`, sub: null, connected: true }] }]);
    expect(await countRows("events", "title", base.title)).toBe(before);
  });

  it("3-02: 同じ名前の人が2人いれば両方が候補になり、決まりにしない（聞き返す）", async () => {
    const s = await mcpAs("org", "organizer");
    const text = await run(s, "prepare_event_draft", { ...base, performers: [`同名${ts}`] });
    const slot = lastDraftCard(s).performers[0];
    expect([slot.exact, slotDecided(slot)]).toEqual([true, false]);
    expect(slot.options.map((o) => o.profile_id).sort()).toEqual([P.same1, P.same2].sort());
    expect(text.includes(`- 出演者：同名${ts}（本人が選ぶまで決まりません）`)).toBe(true);
    expect(text.includes(`出演者「同名${ts}」と同じ名前の人が2人います`)).toBe(true);
    expect(text.includes("どの人か本人に聞き返してください")).toBe(true);
  });

  it("3-02b: 部分的にしか合わない人は、候補が1人でも決まりにしない（勝手に決めない）", async () => {
    const s = await mcpAs("org", "organizer");
    const text = await run(s, "prepare_event_draft", { ...base, performers: [`ミラ`] });
    const slot = lastDraftCard(s).performers.find((p) => p.query === "ミラ")!;
    expect(slot.exact).toBe(false);
    expect(slot.options.map((o) => o.profile_id).includes(P.perf)).toBe(true);
    expect(slotDecided(slot)).toBe(false);
    expect(text.includes("- 出演者：ミラ（本人が選ぶまで決まりません）")).toBe(true);
    expect(text.includes("出演者「ミラ」と完全に同じ名前の人はいません。")).toBe(true);
  });

  it("3-02c: 名義の主催者も、部分的にしか合わなければ決めずに聞き返す", async () => {
    const s = await mcpAs("ag", "agent");
    const text = await run(s, "prepare_event_draft", { ...base, organizer_name: "担当主催" });
    expect(text).toBe(`「担当主催」と完全に同じ名前の主催者はいません。候補：担当主催${ts}。どの主催者か本人に聞き返し、決まったらその名前どおりに organizer_name を入れて呼び直してください。`);
    expect(s.cards()).toEqual([]);
  });

  it("3-03: パスキー確認が24時間を過ぎていると、コネクションの無い人は探さない（DB15）", async () => {
    const fresh = await mcpAs("org", "organizer", { stepUpFresh: true });
    await run(fresh, "prepare_event_draft", { ...base, performers: [`遠い人${ts}`] });
    expect(lastDraftCard(fresh).performers[0].options.map((o) => o.profile_id)).toEqual([P.far]);
    const stale = await mcpAs("org", "organizer", { stepUpFresh: false });
    const text = await run(stale, "prepare_event_draft", { ...base, performers: [`遠い人${ts}`] });
    expect(lastDraftCard(stale).performers).toEqual([]);
    expect(text.includes(`出演者「遠い人${ts}」は見つかりませんでした（コネクション済みの中だけを探しました）`)).toBe(true);
  });

  it("3-04: 会場マスタに無い会場・終了が開始より前・ありえない日付はカードを出さない（DB10）", async () => {
    const s = await mcpAs("org", "organizer");
    expect(await run(s, "prepare_event_draft", { ...base, venue_name: `無い会場${ts}` })).toBe(`会場マスタに「無い会場${ts}」がありません。先に find_venue で会場を探して登録してください。`);
    expect(await run(s, "prepare_event_draft", { ...base, end: "2026-12-10T19:00" })).toBe("終了が開始より前（または同じ）になっています。本人に確かめてください。");
    expect(await run(s, "prepare_event_draft", { ...base, start: "2026-02-30T19:00" })).toBe("日時の形が正しくありません。日本時間の「YYYY-MM-DDTHH:mm」で指定してください。");
    expect(s.cards()).toEqual([]);
  });

  it("3-05: 担当エージェントのいないオーガナイザーはカードが出ず、作成も拒否（DB6）", async () => {
    const s = await mcpAs("orgNoAg", "organizer");
    expect((await run(s, "prepare_event_draft", base)).startsWith("担当エージェントが決まっていないため")).toBe(true);
    const r = await write(await mcpAs("orgNoAg", "organizer", { mode: "action" }), "create_event_draft", {
      card_id: crypto.randomUUID(), title: `担当なし${ts}`, venue_id: cleanup.venues[0], start_at: "2026-12-10T10:00:00.000Z", end_at: "2026-12-10T13:00:00.000Z", organizer_profile_id: null, performer_ids: [],
    });
    expect(r).toEqual({ ok: false, error: "No agent assigned" });
    expect(await countRows("events", "title", `担当なし${ts}`)).toBe(0);
  });

  it("3-06: 作成すると下書きが1つでき、二度押しても増えない。出演者は依頼予定で通知0件（DB11・DB13）", async () => {
    const chat = await mcpAs("org", "organizer");
    await run(chat, "prepare_event_draft", { ...base, title: `二度押し${ts}`, performers: [`ミライ${ts}`] });
    const card = lastDraftCard(chat);
    const act = await mcpAs("org", "organizer", { mode: "action" });
    const input = { card_id: card.card_id, title: card.title, venue_id: card.venue.venue_id, start_at: card.start_at, end_at: card.end_at, organizer_profile_id: null, performer_ids: [P.perf] };
    const first = await write(act, "create_event_draft", input);
    expect([first.ok, first.already]).toEqual([true, false]);
    cleanup.events.push(first.eventId!);
    const second = await write(act, "create_event_draft", input);
    expect([second.ok, second.already, second.eventId]).toEqual([true, true, first.eventId]);
    expect(await countRows("events", "title", `二度押し${ts}`)).toBe(1);
    const { data: ev } = await testAdmin.from("events").select("organizer_profile_id, agent_id, lifecycle_status, venue, venue_id").eq("event_id", first.eventId!).single();
    expect(ev).toEqual({ organizer_profile_id: P.org, agent_id: P.ag, lifecycle_status: "draft", venue: EXISTING_VENUE, venue_id: cleanup.venues[0] });
    const { data: ea } = await testAdmin.from("event_artists").select("artist_profile_id, status").eq("event_id", first.eventId!);
    expect(ea).toEqual([{ artist_profile_id: P.perf, status: "pending" }]);
    expect(await countRows("notifications", "profile_id", P.perf)).toBe(0);
  });

  it("3-07: エージェントの代理の下書きは主催者から見えず、主催者に通知も無い（DB12）", async () => {
    const chat = await mcpAs("ag", "agent");
    const text = await run(chat, "prepare_event_draft", { ...base, title: `代理${ts}`, organizer_name: `担当主催${ts}` });
    expect(text.includes(`- 名義：担当主催${ts}（代理。主催者に確認を依頼するまで主催者からは見えません）`)).toBe(true);
    const card = lastDraftCard(chat);
    expect(card.organizer).toEqual({ profile_id: P.org, name: `担当主催${ts}` });
    const r = await write(await mcpAs("ag", "agent", { mode: "action" }), "create_event_draft", {
      card_id: card.card_id, title: card.title, venue_id: card.venue.venue_id, start_at: card.start_at, end_at: card.end_at, organizer_profile_id: P.org, performer_ids: [],
    });
    expect(r.ok).toBe(true);
    cleanup.events.push(r.eventId!);
    expect(await isProxyDraftHiddenFrom(testAdmin, r.eventId!, P.org)).toBe(true);
    const { count } = await testAdmin.from("notifications").select("*", { count: "exact", head: true }).eq("profile_id", P.org).filter("metadata->>event_id", "eq", r.eventId!);
    expect(count).toBe(0);
  });

  it("3-08: 別のエージェントの主催者は「見つかりません」で、作成も拒否（DB3・DB4）", async () => {
    const s = await mcpAs("ag", "agent");
    expect(await run(s, "prepare_event_draft", { ...base, organizer_name: `別担当主催${ts}` })).toBe(`代理で作れる主催者の中に「別担当主催${ts}」は見つかりません。`);
    expect(s.cards()).toEqual([]);
    const r = await write(await mcpAs("ag", "agent", { mode: "action" }), "create_event_draft", {
      card_id: crypto.randomUUID(), title: `他人の担当${ts}`, venue_id: cleanup.venues[0], start_at: "2026-12-10T10:00:00.000Z", end_at: "2026-12-10T13:00:00.000Z", organizer_profile_id: P.orgOther, performer_ids: [],
    });
    expect(r).toEqual({ ok: false, error: "Forbidden" });
    expect(await countRows("events", "title", `他人の担当${ts}`)).toBe(0);
  });

  it("3-09: オーガナイザーが名義に他人を入れても作れない（DB5）", async () => {
    const r = await write(await mcpAs("org", "organizer", { mode: "action" }), "create_event_draft", {
      card_id: crypto.randomUUID(), title: `なりすまし${ts}`, venue_id: cleanup.venues[0], start_at: "2026-12-10T10:00:00.000Z", end_at: "2026-12-10T13:00:00.000Z", organizer_profile_id: P.orgOther, performer_ids: [],
    });
    expect(r).toEqual({ ok: false, error: "Forbidden" });
    expect(await countRows("events", "title", `なりすまし${ts}`)).toBe(0);
  });

  it("3-10: 画面から来た日時の前後が逆なら作らない（DB10）。失敗したカードはもう一度押せる", async () => {
    const act = await mcpAs("org", "organizer", { mode: "action" });
    const cardId = crypto.randomUUID();
    const bad = await write(act, "create_event_draft", {
      card_id: cardId, title: `逆転${ts}`, venue_id: cleanup.venues[0], start_at: "2026-12-10T13:00:00.000Z", end_at: "2026-12-10T10:00:00.000Z", organizer_profile_id: null, performer_ids: [],
    });
    expect(bad).toEqual({ ok: false, error: "終了日時は開始日時より後にしてください" });
    expect(await countRows("cheery_card_uses", "card_id", cardId)).toBe(0);
    const good = await write(act, "create_event_draft", {
      card_id: cardId, title: `逆転${ts}`, venue_id: cleanup.venues[0], start_at: "2026-12-10T10:00:00.000Z", end_at: "2026-12-10T13:00:00.000Z", organizer_profile_id: null, performer_ids: [],
    });
    expect(good.ok).toBe(true);
    cleanup.events.push(good.eventId!);
  });

  it("3-11: 一般ユーザーを出演者に入れても作れない（出演者の資格）", async () => {
    const r = await write(await mcpAs("org", "organizer", { mode: "action" }), "create_event_draft", {
      card_id: crypto.randomUUID(), title: `資格なし${ts}`, venue_id: cleanup.venues[0], start_at: "2026-12-10T10:00:00.000Z", end_at: "2026-12-10T13:00:00.000Z", organizer_profile_id: null, performer_ids: [P.usr],
    });
    expect(r).toEqual({ ok: false, error: "出演者に指定できないユーザーが含まれています" });
    expect(await countRows("events", "title", `資格なし${ts}`)).toBe(0);
  });
});
