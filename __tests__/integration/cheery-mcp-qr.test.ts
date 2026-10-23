/**
 * TC-CHEERY-QR: チアリー(AI) の QR の作成（P5 後半）の MCP ツール。アクセス範囲表は knowhow/ai-concierge/p5-access-matrix.md の C 段
 *
 * 読み取り（AI に渡す）：prepare_qr　書き込み（AI に渡さない。action モードだけ）：create_qr
 *
 * | 関係者                                   | prepare_qr | create_qr |
 * |------------------------------------------|------------|-----------|
 * | 一般ユーザー・アーティスト                   | × ツールが無い | × ツールが無い |
 * | そのイベントの主催者・担当エージェント         | ○          | ○（action だけ） |
 * | 別のイベントの主催者                        | × 見つからない | × 行が増えない |
 * | 代理の下書き（未送信）の名義の主催者          | × 見つからない | × 行が増えない |
 *
 * | 宛先・配分先                               | 期待 |
 * |-------------------------------------------|------|
 * | 主催者・出演者（確定・依頼中）               | ○ |
 * | イベントと関係ない人・断った出演者           | × いない／拒否・行が増えない |
 * | 宛先が配分先にいない・合計が100%でない        | × |
 * | 同じ名前が2人                              | カードで本人が選ぶまで決まらない |
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { markProxyDraft } from "@/lib/proxy-draft";
import { slotDecided, type QrCreateCard } from "@/lib/cheery/cards";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const email = (k: string) => `mcpq-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const E: Record<string, string> = {};
const profiles: string[] = [];
const sessions: DcMcpSession[] = [];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const IMG = `${url}/storage/v1/object/public/qr-images/test-${ts}/qr.jpg`;
const T = (k: string) => `QRチア${k}${ts}`; // イベント名
const name = (k: string) => `QR${k}${ts}`; // 出演者名

async function mcpAs(key: string, role: string, mode: "chat" | "action" = "chat") {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin, mode });
  sessions.push(s);
  return s;
}
async function prepare(s: DcMcpSession, input: Record<string, unknown>) {
  const r = await s.tools.find((t) => t.name === "prepare_qr")!.run({ product_type: "standard", label: "DJブース", price: 1000, ...input });
  expect(r.isError).toBe(false);
  return r.content;
}
const lastCard = (s: DcMcpSession) => s.cards().filter((c) => c.kind === "qr_create").at(-1) as QrCreateCard;
async function create(s: DcMcpSession, input: Record<string, unknown>) {
  const r = await s.call("create_qr", input);
  return JSON.parse(r.text) as { ok: boolean; error?: string; qrConfigId?: string; already?: boolean };
}
const qrCount = async (eventId: string) =>
  (await testAdmin.from("qr_configs").select("*", { count: "exact", head: true }).eq("event_id", eventId)).count;
const writeInput = (eventId: string, over: Record<string, unknown> = {}) => ({
  card_id: crypto.randomUUID(), event_id: eventId, product_type: "standard", payment_type: null, label: `直接${ts}`,
  min_amount: 1000, max_amount: 1000, stock_limit: null, sales_start_at: null, sales_end_at: null,
  recipient_profile_id: P.perf, recipient_name_context: "artist", targets: [{ profile_id: P.perf, distribution_ratio: 1 }], image_url: IMG, ...over,
});

beforeAll(async () => {
  for (const [k, role] of [
    ["usr", "user"], ["art", "artist"], ["org", "organizer"], ["orgOther", "organizer"], ["ag", "agent"],
    ["perf", "artist"], ["invited", "artist"], ["rej", "artist"], ["out", "artist"], ["same1", "artist"], ["same2", "artist"],
  ] as const) {
    P[k] = await insertProfile({ role, displayName: `MCPQ ${k} ${ts}`, email: email(k) });
    profiles.push(P[k]);
  }
  await testAdmin.from("profiles").update({ responsible_agent_id: P.ag, organizer_name: `QR主催${ts}` }).eq("profile_id", P.org);
  for (const k of ["perf", "invited", "rej", "out"]) await testAdmin.from("profiles").update({ artist_name: name(k) }).eq("profile_id", P[k]);
  for (const k of ["same1", "same2"]) await testAdmin.from("profiles").update({ artist_name: name("同名") }).eq("profile_id", P[k]);

  const start = new Date(Date.now() + 10 * 86400e3).toISOString();
  const end = new Date(Date.now() + 10 * 86400e3 + 3 * 3600e3).toISOString();
  for (const [k, org, status] of [
    ["pub", "org", "published"], ["draft", "org", "draft"], ["cancelled", "org", "cancelled"], ["other", "orgOther", "published"], ["proxy", "org", "draft"],
  ] as const) {
    const { data, error } = await testAdmin.from("events").insert({
      title: T(k), organizer_profile_id: P[org], agent_id: P.ag, lifecycle_status: status, start_at: start, end_at: end,
    }).select("event_id").single();
    if (error) throw error;
    E[k] = data.event_id;
  }
  const lineup = (eventId: string) => [
    { event_id: eventId, artist_profile_id: P.perf, status: "confirmed" },
    { event_id: eventId, artist_profile_id: P.invited, status: "pending" },
    { event_id: eventId, artist_profile_id: P.rej, status: "rejected" },
    { event_id: eventId, artist_profile_id: P.same1, status: "confirmed" },
    { event_id: eventId, artist_profile_id: P.same2, status: "confirmed" },
  ];
  const { error } = await testAdmin.from("event_artists").insert([...lineup(E.pub), ...lineup(E.draft), ...lineup(E.cancelled), ...lineup(E.proxy)]);
  if (error) throw error;
  await markProxyDraft(testAdmin, { eventId: E.proxy, creatorId: P.ag, organizerId: P.org });
}, 60_000);

afterAll(async () => {
  for (const s of sessions) await s.close().catch(() => {});
  const ids = Object.values(E);
  const { data: qrs } = await testAdmin.from("qr_configs").select("qr_config_id, product_id").in("event_id", ids);
  const qrIds = (qrs ?? []).map((q) => q.qr_config_id);
  if (qrIds.length) {
    await testAdmin.from("qr_config_targets").delete().in("qr_config_id", qrIds);
    await testAdmin.from("qr_configs").delete().in("qr_config_id", qrIds);
    await testAdmin.from("products").delete().in("product_id", (qrs ?? []).map((q) => q.product_id).filter(Boolean));
  }
  await testAdmin.from("products").delete().in("event_id", ids);
  await testAdmin.from("notifications").delete().filter("metadata->>event_id", "in", `(${ids.join(",")})`);
  await testAdmin.from("event_artists").delete().in("event_id", ids);
  await testAdmin.from("events").delete().in("event_id", ids);
  await testAdmin.from("cheery_card_uses").delete().in("profile_id", profiles);
  await deleteAuthUsers(profiles);
});

describe("TC-CHEERY-QR-1: ツールの一覧", () => {
  it("DQ1: 一般ユーザー・アーティストには prepare_qr も create_qr も無い（action でも）", async () => {
    for (const [k, role] of [["usr", "user"], ["art", "artist"]] as const) {
      for (const mode of ["chat", "action"] as const) {
        const names = (await mcpAs(k, role, mode)).tools.map((t) => t.name);
        expect(["prepare_qr", "create_qr"].filter((n) => names.includes(n))).toEqual([]);
      }
    }
  });

  it("1-02: AI との会話では create_qr が無く、カードのボタン（action）にだけ出る", async () => {
    const chat = (await mcpAs("org", "organizer")).tools.map((t) => t.name);
    expect([chat.includes("prepare_qr"), chat.includes("create_qr")]).toEqual([true, false]);
    const action = (await mcpAs("org", "organizer", "action")).tools.map((t) => t.name);
    expect(action.includes("create_qr")).toBe(true);
  });
});

describe("TC-CHEERY-QR-2: 確認カード（prepare_qr）", () => {
  it("2-01: 出演者を名前で宛先にすると、決まったカードが出る。AI への文に ID も画像の URL も無い（DQ13）", async () => {
    const s = await mcpAs("org", "organizer");
    const text = await prepare(s, { event: T("pub"), recipient: name("perf") });
    expect(text).toBe([
      "QR の確認カードを出しました。本人が［QRを作る］を押すまで作られません。作っても、宛先・配分先の人に通知は届きません。",
      "QR の画像は、カードで「宛先の画像」か「フライヤー」から選んでもらいます。ほかの画像を使うときは作成画面でアップロードしてもらってください。",
      `- イベント：${T("pub")}`,
      "- タイプ：スタンダード",
      "- ラベル：DJブース",
      "- 金額：¥1,000",
      `- 宛先：${name("perf")}`,
      `- 配分：${name("perf")} 100%`,
      "色・タッチ決済・ウェルカムチア・入場確定などは、作ったあとや作成画面で設定してもらいます。",
    ].join("\n"));
    expect(UUID.test(text)).toBe(false);
    const card = lastCard(s);
    expect({ ...card, card_id: "x" }).toEqual({
      kind: "qr_create", card_id: "x", event: { event_id: E.pub, title: T("pub"), draft: false }, product_type: "standard", payment_type: null,
      label: "DJブース", min_amount: 1000, max_amount: 1000, stock_limit: null, sales_start_at: null, sales_end_at: null,
      people: [{ query: name("perf"), exact: true, options: [{ profile_id: P.perf, role: "artist", name: name("perf"), avatar_url: null, avatar_original_url: null }] }],
      recipient: 0, targets: [{ person: 0, percent: 100 }], needs_image: true, flyer_url: null,
    });
  });

  it("2-02: 「主催者」と言えば主催者名義。配分は言われたとおり（依頼中の出演者も選べる）", async () => {
    const s = await mcpAs("org", "organizer");
    await prepare(s, { event: T("pub"), recipient: "主催者", targets: [{ name: "主催者", percent: 60 }, { name: name("invited"), percent: 40 }] });
    const card = lastCard(s);
    expect(card.people.map((p) => [p.query, slotDecided(p), p.options.map((o) => `${o.profile_id === P.org ? "org" : o.profile_id === P.invited ? "invited" : "?"}:${o.role}`)])).toEqual([
      ["主催者", true, ["org:organizer"]],
      [name("invited"), true, ["invited:artist"]],
    ]);
    expect(card.targets).toEqual([{ person: 0, percent: 60 }, { person: 1, percent: 40 }]);
  });

  it("2-03: 同じ名前が2人いれば決まらない（カードで本人が選ぶ）。AI には聞き返すよう返す", async () => {
    const s = await mcpAs("org", "organizer");
    const text = await prepare(s, { event: T("pub"), recipient: name("同名") });
    const slot = lastCard(s).people[0];
    expect([slotDecided(slot), slot.options.map((o) => o.profile_id).sort()]).toEqual([false, [P.same1, P.same2].sort()]);
    expect(text.includes(`「${name("同名")}」に当たる候補が2つあります（${name("同名")}（出演者名義）、${name("同名")}（出演者名義）`)).toBe(true);
    expect(text.includes(`- 宛先：${name("同名")}（本人が選ぶまで決まりません）`)).toBe(true);
  });

  it("DQ4・DQ5: 関係ない人・断った出演者は「いません」。カードは出ない", async () => {
    const s = await mcpAs("org", "organizer");
    for (const k of ["out", "rej"]) {
      const text = await prepare(s, { event: T("pub"), recipient: name(k) });
      expect(text.startsWith(`「${name(k)}」は、このイベントの主催者・出演者にいません。宛先・配分先に選べるのは：QR主催${ts}（主催者）、`)).toBe(true);
      // 候補の一覧に、断った人・関係ない人は出さない
      expect(text.split("選べるのは：")[1].split("。")[0].split("、").sort()).toEqual([`QR主催${ts}（主催者）`, name("perf"), name("invited"), name("同名"), name("同名")].sort());
    }
    expect(s.cards()).toEqual([]);
  });

  it("DQ6・DQ7: 宛先が配分先にいない・合計が100%でない・同じ人が2回 → カードは出ない", async () => {
    const s = await mcpAs("org", "organizer");
    expect(await prepare(s, { event: T("pub"), recipient: name("perf"), targets: [{ name: name("invited"), percent: 100 }] }))
      .toBe("宛先の人を配分先にも入れてください（宛先は配分を受け取る人の1人です）。");
    expect(await prepare(s, { event: T("pub"), recipient: name("perf"), targets: [{ name: name("perf"), percent: 60 }, { name: name("invited"), percent: 30 }] }))
      .toBe("配分の合計が90%です。合計を100%にしてください。");
    expect(await prepare(s, { event: T("pub"), recipient: name("perf"), targets: [{ name: name("perf"), percent: 50 }, { name: ` ${name("perf")}`, percent: 50 }] }))
      .toBe("配分先に同じ人が2回入っています。");
    expect(s.cards()).toEqual([]);
  });

  it("DQ8・DQ9: 前売即時確定の在庫なし・残高不足、前売りの販売期間なし・逆転 → カードは出ない", async () => {
    const s = await mcpAs("org", "organizer");
    const ent = { event: T("pub"), product_type: "entrance", label: "前売", price: 3000, recipient: name("perf") };
    expect(await prepare(s, { ...ent, payment_type: "B", sales_start: "2026-11-01T10:00", sales_end: "2026-11-05T10:00" }))
      .toBe("前売即時確定タイプは、中止のときの手数料を見積もるため販売上限数が必要です。本人に聞いてください。");
    const noMoney = await prepare(s, { ...ent, payment_type: "B", stock_limit: 100, sales_start: "2026-11-01T10:00", sales_end: "2026-11-05T10:00" });
    expect(noMoney.startsWith("前売即時確定タイプは、主催者の残高が¥")).toBe(true);
    expect(noMoney.includes("以上必要です（今は¥0）")).toBe(true);
    expect(await prepare(s, { ...ent, payment_type: "A" })).toBe("前売りは販売開始と終了の日時が必要です。本人に聞いてください。");
    expect(await prepare(s, { ...ent, payment_type: "A", sales_start: "2026-11-05T10:00", sales_end: "2026-11-01T10:00" }))
      .toBe("販売終了日時は開始日時より後にしてください。本人に確かめてください。");
    expect(s.cards()).toEqual([]);
  });

  it("2-04: エントランスの当日決済は画像が要らない。下書きのイベントは「確認用」と添える", async () => {
    const s = await mcpAs("org", "organizer");
    const text = await prepare(s, { event: T("draft"), product_type: "entrance", label: "当日券", price: 3000, payment_type: "C", recipient: "主催者" });
    expect(text.includes("このイベントは下書きなので、この QR ではまだ決済できません（確認用の QR になります。イベントが承認されると使えます）。")).toBe(true);
    expect(text.includes("QR の画像は")).toBe(false);
    expect(text.includes("- 販売上限数：無制限")).toBe(true);
    expect([lastCard(s).needs_image, lastCard(s).event.draft]).toEqual([false, true]);
  });

  it("DQ2・DQ3・DQ10: 別の主催者のイベント・代理の下書き（未送信）・中止のイベントは作れない", async () => {
    expect(await prepare(await mcpAs("orgOther", "organizer"), { event: T("pub"), recipient: name("perf") }))
      .toBe(`「${T("pub")}」に当てはまる、あなたが主催・担当するイベントは見つかりませんでした。`);
    const s = await mcpAs("org", "organizer");
    expect(await prepare(s, { event: T("proxy"), recipient: name("perf") }))
      .toBe(`「${T("proxy")}」に当てはまる、あなたが主催・担当するイベントは見つかりませんでした。`);
    expect(await prepare(s, { event: T("cancelled"), recipient: name("perf") }))
      .toBe(`「${T("cancelled")}」はもう QR を作れない状態です（中止・終了・精算済み）。`);
    expect(s.cards()).toEqual([]);
  });

  it("DQ12: 確認カードを何回出しても QR の行は増えない", async () => {
    const before = [await qrCount(E.pub), (await testAdmin.from("products").select("*", { count: "exact", head: true }).eq("event_id", E.pub)).count];
    const s = await mcpAs("org", "organizer");
    for (let i = 0; i < 3; i++) await prepare(s, { event: T("pub"), recipient: name("perf") });
    expect([await qrCount(E.pub), (await testAdmin.from("products").select("*", { count: "exact", head: true }).eq("event_id", E.pub)).count]).toEqual(before);
  });
});

describe("TC-CHEERY-QR-3: 書き込み（create_qr）", () => {
  it("3-01: カードの中身で作れる。1枚のカードで2回押しても1つだけ（DQ11）", async () => {
    const s = await mcpAs("org", "organizer", "action");
    const before = await qrCount(E.pub);
    const input = writeInput(E.pub);
    const first = await create(s, input);
    expect([first.ok, first.already]).toEqual([true, false]);
    const second = await create(s, input);
    expect([second.ok, second.already, second.qrConfigId]).toEqual([true, true, first.qrConfigId]);
    expect(await qrCount(E.pub)).toBe(before! + 1);
    const { data: qr } = await testAdmin.from("qr_configs").select("label, recipient_profile_id, recipient_name_context, image_url").eq("qr_config_id", first.qrConfigId!).single();
    expect(qr).toEqual({ label: `直接${ts}`, recipient_profile_id: P.perf, recipient_name_context: "artist", image_url: IMG });
  });

  it("3-02: 担当エージェントも作れる。エントランスの当日決済は画像なしで、在庫なしなら在庫を数えない", async () => {
    const s = await mcpAs("ag", "agent", "action");
    const r = await create(s, writeInput(E.pub, {
      product_type: "entrance", payment_type: "C", label: `当日券${ts}`, min_amount: 3000, max_amount: 3000, image_url: null,
      recipient_profile_id: P.org, recipient_name_context: "organizer", targets: [{ profile_id: P.org, distribution_ratio: 1 }],
    }));
    expect(r.ok).toBe(true);
    const { data: qr } = await testAdmin.from("qr_configs").select("product_id").eq("qr_config_id", r.qrConfigId!).single();
    const { data } = await testAdmin.from("products").select("type, payment_type, track_inventory, stock_limit").eq("product_id", qr!.product_id).single();
    expect(data).toEqual({ type: "entrance", payment_type: "C", track_inventory: false, stock_limit: null });
  });

  it("DQ2・DQ3・DQ10: 別の主催者・代理の下書き（未送信）の名義の主催者・中止のイベントは拒否・行が増えない", async () => {
    const cases: [string, string, string][] = [["orgOther", E.pub, "このイベントの QR は作れません"], ["org", E.proxy, "このイベントの QR は作れません"], ["org", E.cancelled, "このイベントではQRを作成できません"]];
    for (const [k, eventId, error] of cases) {
      const before = await qrCount(eventId);
      expect(await create(await mcpAs(k, "organizer", "action"), writeInput(eventId))).toEqual({ ok: false, error });
      expect(await qrCount(eventId)).toBe(before);
    }
  });

  it("DQ4〜DQ9: 宛先・配分先・比率・残高・販売期間・画像が正しくなければ拒否・行が増えない。カードはもう一度押せる", async () => {
    const s = await mcpAs("org", "organizer", "action");
    const before = await qrCount(E.pub);
    const cardId = crypto.randomUUID();
    const B = { product_type: "entrance", payment_type: "B", min_amount: 3000, max_amount: 3000, image_url: null, sales_start_at: "2026-11-01T01:00:00.000Z", sales_end_at: "2026-11-05T01:00:00.000Z" };
    const cases: [Record<string, unknown>, string][] = [
      [{ recipient_profile_id: P.out, targets: [{ profile_id: P.out, distribution_ratio: 1 }] }, "宛先はこのイベントの主催者か出演者から選んでください"],
      [{ recipient_profile_id: P.rej, targets: [{ profile_id: P.rej, distribution_ratio: 1 }] }, "宛先はこのイベントの主催者か出演者から選んでください"],
      [{ targets: [{ profile_id: P.perf, distribution_ratio: 0.5 }, { profile_id: P.out, distribution_ratio: 0.5 }] }, "配分先はこのイベントの主催者か出演者から選んでください"],
      [{ targets: [{ profile_id: P.invited, distribution_ratio: 1 }] }, "宛先を配分先に含めてください"],
      [{ targets: [{ profile_id: P.perf, distribution_ratio: 0.5 }] }, "配分比率の合計を100%にしてください"],
      [{ targets: [{ profile_id: P.perf, distribution_ratio: 0.5 }, { profile_id: P.perf, distribution_ratio: 0.5 }] }, "配分先に同じ人が2回入っています"],
      [{ recipient_name_context: "organizer" }, "宛先はこのイベントの主催者か出演者から選んでください"],
      [{ ...B, stock_limit: null }, "前売即時確定タイプは販売上限数を入力してください"],
      [{ ...B, stock_limit: 100 }, "前売即時確定タイプを利用するには残高が ¥"],
      [{ ...B, payment_type: "A", sales_end_at: "2026-10-01T01:00:00.000Z" }, "販売終了日時は開始日時より後にしてください"],
      [{ ...B, payment_type: "A", sales_start_at: null }, "前売り（前売事後確定／前売即時確定タイプ）は販売開始・終了日時を入力してください"],
      [{ image_url: null }, "QR画像をアップロードしてください"],
      [{ image_url: "https://example.com/x.jpg" }, "画像の形式が不正です"],
      [{ min_amount: 1, max_amount: 1 }, "金額は¥"],
      [{ product_type: "entrance", payment_type: null, image_url: null }, "決済タイプの指定が正しくありません"],
    ];
    for (const [over, error] of cases) {
      const r = await create(s, writeInput(E.pub, { card_id: cardId, ...over }));
      expect([r.ok, (r.error ?? "").startsWith(error) || r.error]).toEqual([false, true]);
    }
    expect(await qrCount(E.pub)).toBe(before);
    // 失敗したカードは使用済みにならない（直してもう一度押せる）
    expect((await create(s, writeInput(E.pub, { card_id: cardId }))).ok).toBe(true);
  });

  it("3-03: 比率がマイナス・100%超は入力の検査で落ちる（行が増えない）", async () => {
    const s = await mcpAs("org", "organizer", "action");
    const before = await qrCount(E.pub);
    for (const ratios of [[1.09, -0.09], [1.5]]) {
      const r = await s.call("create_qr", writeInput(E.pub, { targets: ratios.map((d, i) => ({ profile_id: i === 0 ? P.perf : P.invited, distribution_ratio: d })) }));
      expect(r.isError).toBe(true);
    }
    expect(await qrCount(E.pub)).toBe(before);
  });

  it("3-04: 他人のカードの ID は使えない", async () => {
    const mine = writeInput(E.pub);
    expect((await create(await mcpAs("org", "organizer", "action"), mine)).ok).toBe(true);
    expect(await create(await mcpAs("ag", "agent", "action"), mine)).toEqual({ ok: false, error: "このカードは使えません" });
  });
});
