/**
 * TC-CHEERY-QREDIT: チアリー(AI) の QR の変更。アクセス範囲表は knowhow/ai-concierge/p5-access-matrix.md の D 段
 *
 * 読み取り（AI に渡す）：prepare_qr_edit　書き込み（AI に渡さない。action モードだけ）：edit_qr
 *
 * | 関係者・状態                                  | prepare_qr_edit | edit_qr |
 * |----------------------------------------------|-----------------|---------|
 * | 一般ユーザー・アーティスト                       | × ツールが無い   | × ツールが無い |
 * | そのイベントの主催者・担当エージェント             | ○              | ○ |
 * | 別のイベントの主催者                            | × 見つからない   | × 変わらない |
 * | 代理の下書き（未送信）の名義の主催者              | × 見つからない   | × 変わらない |
 * | 精算済みのイベント                              | × 変えない       | × 変わらない |
 *
 * | 変えるもの                         | 期待 |
 * |-----------------------------------|------|
 * | ラベル（本人の言葉）                 | カードに入る。変えると商品名もそろう |
 * | ラベル（本人の言葉でない）            | カードでは空欄（本人が決める） |
 * | 決済のあとに宛先・配分                | × |
 * | 宛先を配分先にいない人に               | × |
 * | 金額の範囲外・上限数を販売済みより下     | × |
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertProduct, insertQrConfig, insertQrConfigTargets, insertTransaction } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { markProxyDraft } from "@/lib/proxy-draft";
import type { QrEditCard } from "@/lib/cheery/cards";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const email = (k: string) => `mcpqe-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const E: Record<string, string> = {};
const Q: Record<string, string> = {};
const profiles: string[] = [];
const sessions: DcMcpSession[] = [];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const T = (k: string) => `QR変更${k}${ts}`;
const name = (k: string) => `QE${k}${ts}`;
const L = (k: string) => `ラベル${k}${ts}`;

async function mcpAs(key: string, role: string, mode: "chat" | "action" = "chat", userTexts: string[] = [`新しいラベルは「${L("新")}」で、宛先は${name("perf")}か${name("invited")}か主催者です`]) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin, mode, userTexts });
  sessions.push(s);
  return s;
}
async function prepare(s: DcMcpSession, input: Record<string, unknown>) {
  const r = await s.tools.find((t) => t.name === "prepare_qr_edit")!.run(input);
  expect(r.isError).toBe(false);
  return r.content;
}
const lastCard = (s: DcMcpSession) => s.cards().filter((c) => c.kind === "qr_edit").at(-1) as QrEditCard;
async function edit(s: DcMcpSession, input: Record<string, unknown>) {
  const r = await s.call("edit_qr", { card_id: crypto.randomUUID(), ...input });
  return JSON.parse(r.text) as { ok: boolean; error?: string; already?: boolean };
}
const snapshot = async (qr: string) => {
  const { data: c } = await testAdmin.from("qr_configs").select("label, recipient_profile_id, recipient_name_context, product_id").eq("qr_config_id", qr).single();
  const { data: p } = await testAdmin.from("products").select("name, min_amount, max_amount, stock_limit").eq("product_id", c!.product_id).single();
  const { data: t } = await testAdmin.from("qr_config_targets").select("profile_id, distribution_ratio").eq("qr_config_id", qr).is("deleted_at", null);
  return { label: c!.label, recipient: c!.recipient_profile_id, context: c!.recipient_name_context, ...p, targets: (t ?? []).map((x) => `${x.profile_id}:${Number(x.distribution_ratio)}`).sort() };
};

async function seedQr(eventId: string, key: string, opts: { label: string; type?: string; paymentType?: "A" | "B" | "C"; min?: number; max?: number; stock?: number; sold?: number; recipient?: string; context?: "organizer" | "artist"; targets?: { profileId: string; ratio: number }[] }) {
  const productId = await insertProduct({
    eventId, name: opts.label, type: opts.type ?? "standard", paymentType: opts.paymentType ?? "A",
    minAmount: opts.min ?? 1000, maxAmount: opts.max ?? 1000, stockLimit: opts.stock, soldCount: opts.sold ?? 0,
  });
  const recipient = opts.recipient ?? P.perf;
  Q[key] = await insertQrConfig({ eventId, creatorProfileId: P.org, recipientProfileId: recipient, productId, recipientNameContext: opts.context ?? "artist" });
  await testAdmin.from("qr_configs").update({ label: opts.label }).eq("qr_config_id", Q[key]);
  await insertQrConfigTargets(Q[key], opts.targets ?? [{ profileId: recipient, ratio: 1 }]);
}

beforeAll(async () => {
  for (const [k, role] of [["usr", "user"], ["art", "artist"], ["org", "organizer"], ["orgOther", "organizer"], ["ag", "agent"], ["perf", "artist"], ["invited", "artist"], ["out", "artist"]] as const) {
    P[k] = await insertProfile({ role, displayName: `MCPQE ${k} ${ts}`, email: email(k) });
    profiles.push(P[k]);
  }
  await testAdmin.from("profiles").update({ responsible_agent_id: P.ag, organizer_name: `QE主催${ts}` }).eq("profile_id", P.org);
  for (const k of ["perf", "invited", "out"]) await testAdmin.from("profiles").update({ artist_name: name(k) }).eq("profile_id", P[k]);
  const start = new Date(Date.now() + 10 * 86400e3).toISOString();
  const end = new Date(Date.now() + 10 * 86400e3 + 3 * 3600e3).toISOString();
  for (const [k, org, status] of [["pub", "org", "published"], ["settled", "org", "settled"], ["proxy", "org", "draft"]] as const) {
    const { data, error } = await testAdmin.from("events").insert({ title: T(k), organizer_profile_id: P[org], agent_id: P.ag, lifecycle_status: status, start_at: start, end_at: end }).select("event_id").single();
    if (error) throw error;
    E[k] = data.event_id;
    await testAdmin.from("event_artists").insert([
      { event_id: E[k], artist_profile_id: P.perf, status: "confirmed" },
      { event_id: E[k], artist_profile_id: P.invited, status: "pending" },
    ]);
  }
  await markProxyDraft(testAdmin, { eventId: E.proxy, creatorId: P.ag, organizerId: P.org });
  await seedQr(E.pub, "std", { label: L("std") });
  await seedQr(E.pub, "paid", { label: L("paid") });
  await insertTransaction({ qrConfigId: Q.paid, grossAmount: 1000, netAmount: 900, stripeFee: 40, platformFee: 60, stripePaymentIntentId: `pi_qe_${ts}` });
  await seedQr(E.pub, "ent", { label: L("ent"), type: "entrance", paymentType: "C", min: 3000, max: 3000, stock: 100, sold: 30 });
  await seedQr(E.settled, "settled", { label: L("settled") });
  await seedQr(E.proxy, "proxy", { label: L("proxy") });
}, 60_000);

afterAll(async () => {
  for (const s of sessions) await s.close().catch(() => {});
  const ids = Object.values(E);
  const qrIds = Object.values(Q);
  await testAdmin.from("transactions").delete().in("qr_config_id", qrIds);
  await testAdmin.from("qr_config_targets").delete().in("qr_config_id", qrIds);
  const { data: qrs } = await testAdmin.from("qr_configs").select("product_id").in("qr_config_id", qrIds);
  await testAdmin.from("qr_configs").delete().in("qr_config_id", qrIds);
  await testAdmin.from("products").delete().in("product_id", (qrs ?? []).map((q) => q.product_id).filter(Boolean));
  await testAdmin.from("notifications").delete().filter("metadata->>event_id", "in", `(${ids.join(",")})`);
  await testAdmin.from("event_artists").delete().in("event_id", ids);
  await testAdmin.from("events").delete().in("event_id", ids);
  await testAdmin.from("cheery_card_uses").delete().in("profile_id", profiles);
  await deleteAuthUsers(profiles);
});

describe("TC-CHEERY-QREDIT-1: ツールの一覧", () => {
  it("DE1: 一般ユーザー・アーティストには prepare_qr_edit も edit_qr も無い。edit_qr は action にだけ出る", async () => {
    for (const [k, role] of [["usr", "user"], ["art", "artist"]] as const) {
      for (const mode of ["chat", "action"] as const) {
        const names = (await mcpAs(k, role, mode)).tools.map((t) => t.name);
        expect(["prepare_qr_edit", "edit_qr"].filter((n) => names.includes(n))).toEqual([]);
      }
    }
    const chat = (await mcpAs("org", "organizer")).tools.map((t) => t.name);
    expect([chat.includes("prepare_qr_edit"), chat.includes("edit_qr")]).toEqual([true, false]);
    expect((await mcpAs("org", "organizer", "action")).tools.map((t) => t.name).includes("edit_qr")).toBe(true);
  });
});

describe("TC-CHEERY-QREDIT-2: 確認カード（prepare_qr_edit）", () => {
  it("2-01: 本人の言葉のラベル・金額の変更は、変える前と後のカードになる。AI への文に ID が無い（DE10）", async () => {
    const s = await mcpAs("org", "organizer");
    const text = await prepare(s, { event: T("pub"), qr: L("std"), new_label: L("新"), price: 2000 });
    expect(text).toBe([
      `「${L("std")}」の変更の確認カードを出しました。本人が［変更する］を押すまで変わりません。`,
      `- ラベル：${L("std")} → ${L("新")}（本人の言葉。本人がカードで確かめて印を付けるまで変わりません）`,
      "- 金額：¥1,000 → ¥2,000（これからの決済だけに効きます）",
      "ラベルや宛先を変えると、すでに買ったお客様の Wallet のカード・チケットにも新しい名前が出ます。本人にそう伝えてください。",
      "画像・色・タッチ決済・削除は、QR の詳細画面で変えてもらいます。",
    ].join("\n"));
    expect(UUID.test(text)).toBe(false);
    const card = lastCard(s);
    expect([card.qr_config_id, card.change, card.current.recipient]).toEqual([Q.std, { label: L("新"), min_amount: 2000, max_amount: 2000 }, name("perf")]);
  });

  it("DE4: 本人の言葉でない新しいラベルはカードに入れない（空欄。本人が決める）。ラベルを変えたいだけでも空欄", async () => {
    const s = await mcpAs("org", "organizer", "chat", ["ラベルをいい感じに変えて"]);
    await prepare(s, { event: T("pub"), qr: L("std"), new_label: "AIが考えたラベル" });
    expect(lastCard(s).change.label).toBe(null);
    await prepare(s, { event: T("pub"), qr: L("std"), change_label: true });
    expect(lastCard(s).change.label).toBe(null);
  });

  it("DE2・DE3: 別の主催者・代理の下書き（未送信）・精算済みのイベントは出さない", async () => {
    expect(await prepare(await mcpAs("orgOther", "organizer"), { event: T("pub"), qr: L("std"), price: 2000 }))
      .toBe(`「${T("pub")}」に当てはまる、あなたが主催・担当するイベントは見つかりませんでした。`);
    const s = await mcpAs("org", "organizer");
    expect(await prepare(s, { event: T("proxy"), qr: L("proxy"), price: 2000 }))
      .toBe(`「${T("proxy")}」に当てはまる、あなたが主催・担当するイベントは見つかりませんでした。`);
    expect(await prepare(s, { event: T("settled"), qr: L("settled"), price: 2000 }))
      .toBe(`「${T("settled")}」は終わった（または中止の）イベントなので、チャットでは QR を変えません。`);
    expect(s.cards()).toEqual([]);
  });

  it("DE5・DE6: 決済のある QR の宛先・配分は変えない。宛先が配分先にいない・イベントにいない人もカードを出さない", async () => {
    const s = await mcpAs("org", "organizer");
    expect(await prepare(s, { event: T("pub"), qr: L("paid"), recipient: name("invited") }))
      .toBe("この QR はもう決済があるので、宛先と配分は変えられません（すでに払ったお客様の明細・カードの販売者名が変わってしまうため）。変えたいときは新しい QR を作ってもらってください。");
    expect(await prepare(s, { event: T("pub"), qr: L("std"), recipient: name("invited") }))
      .toBe("宛先の人を配分先にも入れてください（宛先は配分を受け取る人の1人です）。配分も一緒に変えるか、本人に聞いてください。");
    expect((await prepare(s, { event: T("pub"), qr: L("std"), recipient: name("out"), targets: [{ name: name("out"), percent: 100 }] })).startsWith(`「${name("out")}」は、このイベントの主催者・出演者にいません。`)).toBe(true);
    expect(s.cards()).toEqual([]);
  });

  it("2-02: 宛先と配分を一緒に変える。配分先が2人以上なら宛先は未定（カードで選ぶ）、1人で本人が名前を言っていれば決まり", async () => {
    const s = await mcpAs("org", "organizer");
    await prepare(s, { event: T("pub"), qr: L("std"), recipient: name("invited"), targets: [{ name: name("invited"), percent: 50 }, { name: name("perf"), percent: 50 }] });
    expect(lastCard(s).change.recipient).toEqual({ person: 0, said: false });
    await prepare(s, { event: T("pub"), qr: L("std"), recipient: name("invited"), targets: [{ name: name("invited"), percent: 100 }] });
    expect(lastCard(s).change.recipient).toEqual({ person: 0, said: true });
  });

  it("DE7: 金額の範囲外・上限数を販売済みより下・スタンダードの上限数は出さない", async () => {
    const s = await mcpAs("org", "organizer");
    expect((await prepare(s, { event: T("pub"), qr: L("std"), price: 999999 })).startsWith("スタンダードの金額は¥")).toBe(true);
    expect(await prepare(s, { event: T("pub"), qr: L("ent"), stock_limit: 10 })).toBe("販売上限数は、すでに売れた30枚より少なくできません。");
    expect(await prepare(s, { event: T("pub"), qr: L("std"), stock_limit: 10 })).toBe("販売上限数を変えられるのはエントランスの QR だけです。");
    expect(s.cards()).toEqual([]);
  });

  it("DE9: 確認カードを何回出しても QR は変わらない", async () => {
    const before = await snapshot(Q.std);
    const s = await mcpAs("org", "organizer");
    for (let i = 0; i < 3; i++) await prepare(s, { event: T("pub"), qr: L("std"), new_label: L("新"), price: 2000 });
    expect(await snapshot(Q.std)).toEqual(before);
  });
});

describe("TC-CHEERY-QREDIT-3: 書き込み（edit_qr）", () => {
  it("3-01: ラベルと金額を変える。ラベルを変えると商品名もそろう。1枚のカードで2回押しても1回だけ（DE8）", async () => {
    const s = await mcpAs("org", "organizer", "action");
    const cardId = crypto.randomUUID();
    const first = await edit(s, { card_id: cardId, qr_config_id: Q.std, label: L("新"), min_amount: 2000, max_amount: 2000 });
    expect([first.ok, first.already]).toEqual([true, false]);
    const second = await edit(s, { card_id: cardId, qr_config_id: Q.std, label: "二回目", min_amount: 2500, max_amount: 2500 });
    expect([second.ok, second.already]).toEqual([true, true]);
    const snap = await snapshot(Q.std);
    expect([snap.label, snap.name, snap.min_amount, snap.max_amount]).toEqual([L("新"), L("新"), 2000, 2000]);
  });

  it("DE2・DE3: 別の主催者・代理の下書き（未送信）の名義の主催者・精算済みのイベントの QR は変わらない", async () => {
    const cases: [string, string, string][] = [
      ["orgOther", Q.ent, "この QR は変えられません"],
      ["org", Q.proxy, "この QR は変えられません"],
      ["org", Q.settled, "終わった（または中止の）イベントの QR は、チャットでは変えません"],
    ];
    for (const [k, qr, error] of cases) {
      const before = await snapshot(qr);
      expect(await edit(await mcpAs(k, "organizer", "action"), { qr_config_id: qr, label: "変えない" })).toEqual({ ok: false, error });
      expect(await snapshot(qr)).toEqual(before);
    }
  });

  it("DE5・DE6・DE7: 決済のあとの宛先・配分、配分先にいない宛先、範囲外の金額、販売済みより下の上限数は拒否・変わらない。カードはもう一度押せる", async () => {
    const s = await mcpAs("org", "organizer", "action");
    const cardId = crypto.randomUUID();
    const beforePaid = await snapshot(Q.paid);
    expect(await edit(s, { card_id: cardId, qr_config_id: Q.paid, recipient_profile_id: P.invited, recipient_name_context: "artist", targets: [{ profile_id: P.invited, distribution_ratio: 1 }] }))
      .toEqual({ ok: false, error: "この QR はもう決済があるので、宛先と配分は変えられません" });
    expect(await snapshot(Q.paid)).toEqual(beforePaid);
    const beforeEnt = await snapshot(Q.ent);
    expect(await edit(s, { card_id: cardId, qr_config_id: Q.ent, recipient_profile_id: P.invited, recipient_name_context: "artist" }))
      .toEqual({ ok: false, error: "宛先を配分先に含めてください" });
    expect((await edit(s, { card_id: cardId, qr_config_id: Q.ent, min_amount: 999999, max_amount: 999999 })).error?.startsWith("金額は¥")).toBe(true);
    expect(await edit(s, { card_id: cardId, qr_config_id: Q.ent, stock_limit: 10 })).toEqual({ ok: false, error: "在庫上限は販売済み数（30件）以上にしてください" });
    expect(await snapshot(Q.ent)).toEqual(beforeEnt);
    expect((await edit(s, { card_id: cardId, qr_config_id: Q.ent, stock_limit: 200 })).ok).toBe(true);
    expect((await snapshot(Q.ent)).stock_limit).toBe(200);
  });

  it("3-02: 決済のない QR は宛先と配分を一緒に変えられる。担当エージェントも変えられる", async () => {
    const r = await edit(await mcpAs("ag", "agent", "action"), {
      qr_config_id: Q.std, recipient_profile_id: P.org, recipient_name_context: "organizer",
      targets: [{ profile_id: P.org, distribution_ratio: 0.5 }, { profile_id: P.perf, distribution_ratio: 0.5 }],
    });
    expect(r.ok).toBe(true);
    const snap = await snapshot(Q.std);
    expect([snap.recipient, snap.context, snap.targets]).toEqual([P.org, "organizer", [`${P.org}:0.5`, `${P.perf}:0.5`].sort()]);
  });

  it("3-03: 一般ユーザーが action で edit_qr を呼んでも変わらない", async () => {
    const before = await snapshot(Q.std);
    const r = await (await mcpAs("usr", "user", "action")).call("edit_qr", { card_id: crypto.randomUUID(), qr_config_id: Q.std, label: "不正" });
    expect(r.isError).toBe(true);
    expect(await snapshot(Q.std)).toEqual(before);
  });
});
