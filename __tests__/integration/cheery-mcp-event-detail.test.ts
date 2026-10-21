/**
 * TC-CHEERY-MCP-EVD: MCP ツール event_detail（イベント1件の詳細。「今できる操作」は lib/event-actions.ts を画面と共用）
 *
 * アクセス範囲表（lib/event-access.ts の canOperate）
 * | 人                     | 対象のイベント                       | 見つかるか |
 * |------------------------|--------------------------------------|------------|
 * | 主催者O                 | 自分の公開済みイベント                | ○          |
 * | 主催者O                 | 代理作成で未送信の下書き（主催者はO）  | ×（存在しない扱い） |
 * | 担当エージェントAG       | 同じ代理作成の下書き                   | ○          |
 * | 別の主催者X             | Oのイベント                           | ×          |
 * | 運営（admin）           | Oのイベント                           | ○          |
 *
 * 売上の範囲（live-stats と同じ）
 * | 決済                                  | 数えるか |
 * |---------------------------------------|----------|
 * | 削除していないQRの完了決済              | ○        |
 * | ウェルカムチア用の自動QRの完了決済       | ○（合計に入る。QR一覧には出さない） |
 * | 取り消し／招待（invitation）            | ×        |
 * | 削除したQRの決済                       | ×        |
 * 返さない項目：お客様の名前・メールアドレス・コメント・決済ID・内部ID
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent, insertProduct, insertQrConfig, insertTransaction, insertEventArtist, insertEventEvidence } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { jstDateTime, yen } from "@/lib/mcp/format";
import { markProxyDraft } from "@/lib/proxy-draft";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const START = new Date(Date.now() + 10 * DAY);
const END = new Date(START.getTime() + 4 * 3600e3);
const email = (k: string) => `mcpe-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], qrs: [] as string[], txs: [] as string[], products: [] as string[], notifs: [] as string[] };
let E: string;
let PROXY: string;
const sessions: DcMcpSession[] = [];

async function mcpAs(key: string, role: string) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin });
  sessions.push(s);
  return s;
}
async function detail(s: DcMcpSession, event: string) {
  const r = await s.tools.find((t) => t.name === "event_detail")!.run({ event });
  expect(r.isError).toBe(false);
  return r.content;
}
async function qr(name: string, recipient: string, extra: Record<string, unknown> = {}) {
  const product = await insertProduct({ eventId: E, type: "standard", name });
  ids.products.push(product);
  const id = await insertQrConfig({ eventId: E, creatorProfileId: P.org, recipientProfileId: P[recipient] });
  await testAdmin.from("qr_configs").update({ product_id: product, ...extra }).eq("qr_config_id", id);
  ids.qrs.push(id);
  return id;
}
async function tx(qrId: string, gross: number, fees: { stripe: number; platform: number }, extra: Record<string, unknown> = {}) {
  const id = await insertTransaction({ qrConfigId: qrId, grossAmount: gross, netAmount: gross - fees.stripe - fees.platform, stripeFee: fees.stripe, platformFee: fees.platform, stripePaymentIntentId: `pi_mcpe_${ts}_${ids.txs.length}`, senderEmail: `buyer-${ts}@example.com` });
  await testAdmin.from("transactions").update({ sender_name: "購入者ヤマダ", sender_comment: "がんばって", ...extra }).eq("transaction_id", id);
  ids.txs.push(id);
}

beforeAll(async () => {
  for (const [k, role, name] of [["org", "organizer", "主催オー"], ["ag", "agent", "担当エージ"], ["a1", "artist", "確定アーティスト"], ["a2", "artist", "返事待ちアーティスト"], ["a3", "artist", "辞退アーティスト"], ["x", "organizer", "別の主催"], ["adm", "admin", "運営"]] as const) {
    P[k] = await insertProfile({ role, displayName: `${name}${ts}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  E = await insertEvent({ organizerProfileId: P.org, agentId: P.ag, title: `MCPE 夏祭り ${ts}`, startAt: START, endAt: END });
  await testAdmin.from("events").update({ venue: "テスト会場" }).eq("event_id", E);
  ids.events.push(E);
  await insertEventArtist({ eventId: E, artistProfileId: P.a1 });
  await insertEventArtist({ eventId: E, artistProfileId: P.a2, status: "pending" });
  const { data: n } = await testAdmin.from("notifications").insert({ profile_id: P.a2, type: "lineup_invite", title: "出演依頼", body: "", metadata: { event_id: E } }).select("notification_id").single();
  ids.notifs.push(n!.notification_id);
  await insertEventArtist({ eventId: E, artistProfileId: P.a3, status: "pending" });
  await testAdmin.from("event_artists").update({ status: "rejected" }).eq("event_id", E).eq("artist_profile_id", P.a3);

  const main = await qr("メインのチア", "a1");
  await tx(main, 1000, { stripe: 40, platform: 100 });
  await tx(main, 2000, { stripe: 79, platform: 200 });
  await tx(main, 3000, { stripe: 0, platform: 0 }, { status: "cancelled" });
  await tx(main, 0, { stripe: 0, platform: 0 }, { transaction_type: "invitation" });
  const welcome = await qr("ウェルカム", "org", { is_welcome_cheer_default: true });
  await tx(welcome, 500, { stripe: 20, platform: 50 });
  const gone = await qr("削除したQR", "org", { deleted_at: new Date().toISOString() });
  await tx(gone, 9000, { stripe: 0, platform: 0 });
  await insertEventEvidence({ eventId: E, submittedByProfileId: P.org });

  // 似た名前のイベントと、代理作成で未送信の下書き
  const similar = await insertEvent({ organizerProfileId: P.org, agentId: P.ag, title: `MCPE 夏祭り ${ts} 2日目`, startAt: new Date(START.getTime() + DAY), endAt: new Date(END.getTime() + DAY) });
  PROXY = await insertEvent({ organizerProfileId: P.org, agentId: P.ag, title: `MCPE 代理下書き ${ts}` });
  await testAdmin.from("events").update({ lifecycle_status: "draft" }).eq("event_id", PROXY);
  await markProxyDraft(testAdmin, { eventId: PROXY, creatorId: P.ag, organizerId: P.org });
  ids.events.push(similar, PROXY);
}, 90_000);

afterAll(async () => {
  for (const s of sessions) await s.close();
  await testAdmin.from("notifications").delete().in("notification_id", ids.notifs);
  await testAdmin.from("notifications").delete().eq("type", "proxy_event_draft").filter("metadata->>event_id", "eq", PROXY);
  await testAdmin.from("event_evidences").delete().in("event_id", ids.events);
  await cleanupTestData({ transactionIds: ids.txs, qrConfigIds: ids.qrs, eventIds: ids.events });
  await testAdmin.from("products").delete().in("product_id", ids.products);
  await deleteAuthUsers(ids.profiles);
}, 90_000);

const EXPECTED_BODY = (relation: string, actions: string) => [
  `MCPE 夏祭り ${ts}`,
  `  - あなたとの関係: ${relation}`,
  "  - 状態: 公開済み",
  `  - 開催: ${jstDateTime(START.toISOString())} 〜 ${jstDateTime(END.toISOString())}`,
  "  - 会場: テスト会場",
  `  - 担当エージェント: 担当エージ${ts}`,
  "  - 開催証跡: 1件提出済み",
  "出演者 2人",
  `  - 確定アーティスト${ts}: 出演確定`,
  `  - 返事待ちアーティスト${ts}: 交渉中（返事待ち）`,
  "売上（完了した決済 3件）",
  `  - お客様の支払額の合計: ${yen(3500)}`,
  `  - 決済手数料: ${yen(139)}`,
  `  - プラットフォーム手数料: ${yen(350)}`,
  `  - 配分対象額（手数料を引いた額）: ${yen(3011)}`,
  "QR 1件",
  `  - スタンダード「メインのチア」・宛先 確定アーティスト${ts}・2件 ${yen(3000)}`,
  actions,
].join("\n");

describe("TC-CHEERY-MCP-EVD: event_detail", () => {
  it("主催者：完全一致の名前で1件に決まり、画面と同じ範囲の売上・出演者・QR・できる操作を返す", async () => {
    expect(await detail(await mcpAs("org", "organizer"), `MCPE 夏祭り ${ts}`)).toBe(EXPECTED_BODY(
      "主催",
      "あなたが今できる操作（イベント詳細画面）：QRを作る／イベントを終了する／中止を申請する／イベントを編集する",
    ));
  });

  it("担当エージェント：同じイベントで、エージェントとしてできる操作になる", async () => {
    expect(await detail(await mcpAs("ag", "agent"), `MCPE 夏祭り ${ts}`)).toBe(EXPECTED_BODY(
      "担当エージェント",
      "あなたが今できる操作（イベント詳細画面）：QRを作る／代打（別のエージェントへの担当の引き継ぎ）を依頼する／イベントを編集する",
    ));
  });

  it("名前の一部で複数当たれば候補を返す", async () => {
    const text = await detail(await mcpAs("org", "organizer"), "MCPE 夏祭り");
    expect(text.split("\n")[0]).toBe("「MCPE 夏祭り」に当てはまるイベントが2件あります。どれか分かる名前で指定してください。");
  });

  it("代理作成で未送信の下書きは、主催者からは見つからず、担当エージェントからは見つかる", async () => {
    expect(await detail(await mcpAs("org", "organizer"), `代理下書き ${ts}`)).toBe(`「代理下書き ${ts}」に当てはまる、あなたが主催・担当するイベントは見つかりませんでした。`);
    expect((await detail(await mcpAs("ag", "agent"), `代理下書き ${ts}`)).split("\n")[0]).toBe(`MCPE 代理下書き ${ts}`);
  });

  it("別の主催者からは見つからず、運営からは見つかる", async () => {
    expect(await detail(await mcpAs("x", "organizer"), `MCPE 夏祭り ${ts}`)).toBe(`「MCPE 夏祭り ${ts}」に当てはまる、あなたが主催・担当するイベントは見つかりませんでした。`);
    expect((await detail(await mcpAs("adm", "admin"), `MCPE 夏祭り ${ts}`)).split("\n")[1]).toBe("  - あなたとの関係: 運営");
  });

  it("お客様の名前・メールアドレス・コメントは返さない。検索語の % は文字として扱う", async () => {
    const text = await detail(await mcpAs("org", "organizer"), `MCPE 夏祭り ${ts}`);
    for (const s of ["購入者ヤマダ", "@example.com", "がんばって"]) expect(`${s}:${text.includes(s)}`).toBe(`${s}:false`);
    expect(await detail(await mcpAs("org", "organizer"), "%")).toBe("「%」に当てはまる、あなたが主催・担当するイベントは見つかりませんでした。");
  });
});
