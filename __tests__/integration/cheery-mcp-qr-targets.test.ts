/**
 * TC-CHEERY-MCP-QRT: MCP ツール my_qr_targets（自分が配分先のQRと比率）
 *
 * アクセス範囲表（QR詳細画面と同じ：イベントの関係者 lib/event-access.ts の canView か、そのQRの宛先の本人）
 * | 出演者Rとの関係                                   | 出すか |
 * |---------------------------------------------------|--------|
 * | 出演確定のイベントのQRで配分先                       | ○（比率は「あなた」と「その他の合計」だけ） |
 * | 出演を辞退したイベントのQRで配分先（宛先ではない）    | ×      |
 * | 出演者ではないが、そのQRの宛先が本人                 | ○      |
 * | 削除されたQR／削除された配分                         | ×      |
 * | 別の出演者だけが配分先のQR                          | ×      |
 * 返さない項目：他の配分先の名前・個別の比率・内部ID
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent, insertProduct, insertQrConfig, insertQrConfigTargets, insertEventArtist } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { jstDateTime } from "@/lib/mcp/format";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const email = (k: string) => `mcpq-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const ev: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], qrs: [] as string[], products: [] as string[] };
const sessions: DcMcpSession[] = [];

async function mcpAs(key: string, role: string) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin });
  sessions.push(s);
  return s;
}
async function call(s: DcMcpSession, name: string) {
  const r = await s.tools.find((t) => t.name === name)!.run({});
  expect(r.isError).toBe(false);
  return r.content;
}
async function event(key: string, daysFromNow: number) {
  ev[key] = await insertEvent({ organizerProfileId: P.org, title: `QRT ${key} ${ts}`, startAt: new Date(Date.now() + daysFromNow * DAY), endAt: new Date(Date.now() + daysFromNow * DAY + 3 * 3600e3) });
  ids.events.push(ev[key]);
  return ev[key];
}
async function qr(eventKey: string, recipient: string, targets: [string, number][], productName: string) {
  const product = await insertProduct({ eventId: ev[eventKey], type: "standard", name: productName });
  ids.products.push(product);
  const id = await insertQrConfig({ eventId: ev[eventKey], creatorProfileId: P.org, recipientProfileId: P[recipient] });
  await testAdmin.from("qr_configs").update({ product_id: product }).eq("qr_config_id", id);
  await insertQrConfigTargets(id, targets.map(([k, ratio]) => ({ profileId: P[k], ratio })));
  ids.qrs.push(id);
  return id;
}

beforeAll(async () => {
  for (const [k, role] of [["org", "organizer"], ["r", "artist"], ["r2", "artist"]] as const) {
    P[k] = await insertProfile({ role, displayName: `QRT ${k}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  await event("confirmed", 10);
  await insertEventArtist({ eventId: ev.confirmed, artistProfileId: P.r });
  await qr("confirmed", "r", [["r", 0.6], ["org", 0.4]], "メインのチア");

  await event("rejected", 20);
  await insertEventArtist({ eventId: ev.rejected, artistProfileId: P.r });
  await testAdmin.from("event_artists").update({ status: "rejected" }).eq("event_id", ev.rejected).eq("artist_profile_id", P.r);
  await qr("rejected", "org", [["r", 0.5], ["org", 0.5]], "辞退したイベント");

  await event("recipientOnly", 5);
  await qr("recipientOnly", "r", [["r", 1]], "宛先だけ");

  await event("deleted", 3);
  await insertEventArtist({ eventId: ev.deleted, artistProfileId: P.r });
  const deletedQr = await qr("deleted", "r", [["r", 1]], "削除したQR");
  await testAdmin.from("qr_configs").update({ deleted_at: new Date().toISOString() }).eq("qr_config_id", deletedQr);
  const deletedTarget = await qr("deleted", "org", [["r", 0.3], ["org", 0.7]], "配分を外したQR");
  await testAdmin.from("qr_config_targets").update({ deleted_at: new Date().toISOString() }).eq("qr_config_id", deletedTarget).eq("profile_id", P.r);

  await event("others", 7);
  await insertEventArtist({ eventId: ev.others, artistProfileId: P.r });
  await insertEventArtist({ eventId: ev.others, artistProfileId: P.r2 });
  await qr("others", "r2", [["r2", 1]], "別の出演者のQR");
}, 60_000);

afterAll(async () => {
  for (const s of sessions) await s.close();
  await cleanupTestData({ qrConfigIds: ids.qrs, eventIds: ids.events });
  await testAdmin.from("products").delete().in("product_id", ids.products);
  await deleteAuthUsers(ids.profiles);
}, 60_000);

describe("TC-CHEERY-MCP-QRT: my_qr_targets", () => {
  it("出演確定のQRと宛先だけのQRを新しい順に出し、辞退・削除・他人のQRは出さない", async () => {
    const start = async (k: string) => (await testAdmin.from("events").select("start_at").eq("event_id", ev[k]).single()).data!.start_at;
    expect(await call(await mcpAs("r", "artist"), "my_qr_targets")).toBe([
      "配分先に入っているQR 2件（2件を表示）",
      `1. QRT confirmed ${ts}`,
      "  - イベントの状態: 公開済み",
      `  - 開催: ${jstDateTime(await start("confirmed"))}`,
      "  - QR: スタンダード「メインのチア」",
      "  - 宛先: あなた",
      "  - あなたの比率: 60%",
      "  - その他の配分先（合計）: 40%",
      `2. QRT recipientOnly ${ts}`,
      "  - イベントの状態: 公開済み",
      `  - 開催: ${jstDateTime(await start("recipientOnly"))}`,
      "  - QR: スタンダード「宛先だけ」",
      "  - 宛先: あなた",
      "  - あなたの比率: 100%",
    ].join("\n"));
  });

  it("他の配分先の名前は出さない", async () => {
    const text = await call(await mcpAs("r", "artist"), "my_qr_targets");
    expect(text.includes("QRT org")).toBe(false);
  });

  it("配分先に1つも入っていなければその旨", async () => {
    await testAdmin.from("qr_config_targets").update({ deleted_at: new Date().toISOString() }).eq("profile_id", P.r2);
    expect(await call(await mcpAs("r2", "artist"), "my_qr_targets")).toBe("配分先に入っているQRはありません。");
  });

  it("一般ユーザーには登録しない", async () => {
    const c = await connectDcMcp({ userId: P.r, email: null, role: "user", supabase: testAdmin, admin: testAdmin });
    sessions.push(c);
    expect(c.tools.some((t) => t.name === "my_qr_targets")).toBe(false);
  });
});
