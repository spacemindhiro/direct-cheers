/**
 * TC-CHEERY-MCP-USER: MCP ツール my_cheers（応援履歴。カードコレクションと同じ範囲 lib/cheer-collection.ts）
 *
 * アクセス範囲表（my_cheers）
 * | 対象の決済                                        | 数えるか |
 * |---------------------------------------------------|----------|
 * | 本人が送ったチア（完了）                             | ○        |
 * | 登録前に同じメールで送ったチア（sender_profile なし） | ○        |
 * | 入場券など（entrance・custom）                       | ×        |
 * | 取り消された決済                                    | ×        |
 * | 招待チケット（invitation）                           | ×        |
 * | ウェルカムチアで演者が未確定のもの                    | ×        |
 * | 別の人が送ったチア                                  | ×        |
 * 返さない項目：決済ID・内部ID・メールアドレス
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent, insertProduct, insertQrConfig, insertTransaction } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { jstDateTime } from "@/lib/mcp/format";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const email = (k: string) => `mcpu-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], products: [] as string[], qrs: [] as string[], txs: [] as string[] };
const created: Record<string, string> = {};
const sessions: DcMcpSession[] = [];

async function mcpAs(key: string, role: string) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin });
  sessions.push(s);
  return s;
}

beforeAll(async () => {
  for (const [k, role] of [["u", "user"], ["v", "user"], ["org", "organizer"], ["dj", "artist"]] as const) {
    P[k] = await insertProfile({ role, displayName: `MCPU ${k}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  await testAdmin.from("profiles").update({ artist_name: "DJ テスト" }).eq("profile_id", P.dj);
  const ev = await insertEvent({ organizerProfileId: P.org, title: `MCPU 応援イベント ${ts}` });
  ids.events.push(ev);
  const cheer = await insertProduct({ eventId: ev, name: "チア", type: "standard", paymentType: undefined, minAmount: 500, maxAmount: 10000 });
  const entrance = await insertProduct({ eventId: ev, name: "入場券", type: "entrance", paymentType: "C", minAmount: 3000, maxAmount: 3000 });
  ids.products.push(cheer, entrance);
  const qrCheer = await insertQrConfig({ eventId: ev, creatorProfileId: P.org, recipientProfileId: P.dj, productId: cheer, recipientNameContext: "artist" });
  const qrEnt = await insertQrConfig({ eventId: ev, creatorProfileId: P.org, recipientProfileId: P.org, productId: entrance });
  ids.qrs.push(qrCheer, qrEnt);
  await testAdmin.from("qr_config_thanks").insert({ qr_config_id: qrCheer, thanks_message: "ありがとう", published_at: new Date().toISOString(), created_by: P.org });

  const add = async (key: string, qr: string, product: string, gross: number, minutesAgo: number, extra: Record<string, unknown>) => {
    const id = await insertTransaction({ qrConfigId: qr, grossAmount: gross, netAmount: gross, stripeFee: 0, platformFee: 0, stripePaymentIntentId: `pi_mcpu_${ts}_${key}` , status: (extra.status as string) ?? "completed" });
    created[key] = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    const { status: _s, ...rest } = extra;
    await testAdmin.from("transactions").update({ product_id: product, created_at: created[key], ...rest }).eq("transaction_id", id);
    ids.txs.push(id);
  };
  await add("own", qrCheer, cheer, 1000, 10, { sender_profile_id: P.u, sender_email: email("u"), sender_comment: "最高でした" });
  await add("guest", qrCheer, cheer, 2000, 20, { sender_profile_id: null, sender_email: email("u") });
  await add("entrance", qrEnt, entrance, 3000, 5, { sender_profile_id: P.u, sender_email: email("u") });
  await add("cancelled", qrCheer, cheer, 4000, 6, { sender_profile_id: P.u, sender_email: email("u"), status: "cancelled" });
  await add("invitation", qrCheer, cheer, 5000, 7, { sender_profile_id: P.u, sender_email: email("u"), transaction_type: "invitation" });
  await add("welcomeUnlocked", qrCheer, cheer, 6000, 8, { sender_profile_id: P.u, sender_email: email("u"), stripe_pi_sequence: 1, welcome_cheer_locked_at: null });
  await add("other", qrCheer, cheer, 7000, 9, { sender_profile_id: P.v, sender_email: email("v") });
}, 60_000);

afterAll(async () => {
  for (const s of sessions) await s.close().catch(() => {});
  await testAdmin.from("qr_config_thanks").delete().in("qr_config_id", ids.qrs);
  await cleanupTestData({ transactionIds: ids.txs, qrConfigIds: ids.qrs, eventIds: ids.events });
  await testAdmin.from("products").delete().in("product_id", ids.products);
  await deleteAuthUsers(ids.profiles);
});

describe("TC-CHEERY-MCP-USER: my_cheers", () => {
  it("本人のチアと同じメールのゲスト分だけ（入場券・取消・招待・未確定のウェルカムチア・他人の分は数えない）", async () => {
    const r = await (await mcpAs("u", "user")).tools.find((t) => t.name === "my_cheers")!.run({});
    expect(r).toEqual({
      isError: false,
      content: [
        "送ったチア 2件・合計¥3,000（新しい順に2件）",
        `1. ${jstDateTime(created.own)} ¥1,000`,
        "  - 宛先: DJ テスト",
        `  - イベント: MCPU 応援イベント ${ts}`,
        "  - あなたのコメント: 最高でした",
        "  - お礼メッセージ: 届いています（カードコレクションでカードをタップすると見られます）",
        `2. ${jstDateTime(created.guest)} ¥2,000`,
        "  - 宛先: DJ テスト",
        `  - イベント: MCPU 応援イベント ${ts}`,
        "  - お礼メッセージ: 届いています（カードコレクションでカードをタップすると見られます）",
      ].join("\n"),
    });
  });

  it("別の人 v には v の分だけ", async () => {
    const r = await (await mcpAs("v", "user")).tools.find((t) => t.name === "my_cheers")!.run({});
    expect(r.content.startsWith("送ったチア 1件・合計¥7,000（新しい順に1件）")).toBe(true);
  });

  it("送っていない人", async () => {
    const r = await (await mcpAs("org", "organizer")).tools.find((t) => t.name === "my_cheers")!.run({});
    expect(r.content).toBe("まだチアを送っていません。");
  });
});
