/**
 * TC-CHEERY-MCP-STATS: MCP ツール my_stats（統計タブと同じ累計。集計は lib/profile-stats.ts を画面と共用）
 *
 * アクセス範囲表（送ったチア）
 * | 対象の決済                                         | 数えるか |
 * |----------------------------------------------------|----------|
 * | 本人のアカウントで送った（完了）                      | ○        |
 * | 登録前に同じメールアドレスで送った                    | ○        |
 * | アカウントとメールの両方で一致（同じ決済）             | ○（1回だけ） |
 * | 取り消された決済                                     | ×        |
 * | 招待チケット（invitation）                            | ×        |
 * | 別の人が送った                                       | ×        |
 *
 * アクセス範囲表（受け取りチア・受取配分）
 * | 対象                                                 | 数えるか |
 * |------------------------------------------------------|----------|
 * | 商品のアーティストが本人の完了決済                      | ○（受け取りチア） |
 * | 同・取り消し済み／別のアーティストの商品                | ×        |
 * | 本人への配分（決済が完了）                             | ○（受取配分。オーガナイザー・エージェントだけに出す） |
 * | 本人への配分（決済が取り消し）／削除済みの配分           | ×        |
 *
 * PostgREST の既定の上限（1000件）を超えても数え漏れないこと（以前の統計タブは黙って1000件で切れていた）。
 * 運営（admin）は統計タブを開けないため、ツールも登録しない。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent, insertProduct, insertQrConfig, insertTransaction, insertDistribution } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { getFeeConfig } from "@/lib/fee-config";
import { yen } from "@/lib/mcp/format";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const email = (k: string) => `mcps-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], qrs: [] as string[], txs: [] as string[] };
const sessions: DcMcpSession[] = [];
let productsToDelete: string[] = [];

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

let qr: string;
let eventId: string;
async function tx(gross: number, extra: Record<string, unknown> = {}, seed: Partial<Parameters<typeof insertTransaction>[0]> = {}) {
  const id = await insertTransaction({ qrConfigId: qr, grossAmount: gross, netAmount: gross, stripeFee: 0, platformFee: 0, stripePaymentIntentId: `pi_mcps_${ts}_${ids.txs.length}`, ...seed });
  if (Object.keys(extra).length) await testAdmin.from("transactions").update(extra).eq("transaction_id", id);
  ids.txs.push(id);
  return id;
}

beforeAll(async () => {
  for (const [k, role] of [["u", "user"], ["many", "user"], ["r", "artist"], ["r2", "artist"], ["org", "organizer"], ["adm", "admin"], ["other", "user"]] as const) {
    P[k] = await insertProfile({ role, displayName: `MCPS ${k}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  eventId = await insertEvent({ organizerProfileId: P.org, title: `MCPS ${ts}` });
  ids.events.push(eventId);
  qr = await insertQrConfig({ eventId, creatorProfileId: P.org, recipientProfileId: P.r });
  ids.qrs.push(qr);
  const prodR = await insertProduct({ eventId, artistId: P.r, type: "standard" });
  const prodR2 = await insertProduct({ eventId, artistId: P.r2, type: "standard" });
  productsToDelete = [prodR, prodR2];

  // ── 送ったチア（u）──
  await tx(1000, {}, { senderProfileId: P.u });
  await tx(2000, {}, { senderEmail: email("u") });
  await tx(3000, {}, { senderProfileId: P.u, senderEmail: email("u") });
  await tx(500, {}, { senderProfileId: P.u, status: "cancelled" });
  await tx(700, { transaction_type: "invitation" }, { senderProfileId: P.u });
  await tx(9999, {}, { senderProfileId: P.other });

  // ── 受け取りチア（r）──
  await tx(10000, { product_id: prodR }, { senderProfileId: P.other });
  await tx(5000, { product_id: prodR }, { senderProfileId: P.other, status: "cancelled" });
  await tx(8000, { product_id: prodR2 }, { senderProfileId: P.other });

  // ── 受取配分（org・r）──
  const done = await tx(4000, {}, { senderProfileId: P.other });
  const cancelled = await tx(4000, {}, { senderProfileId: P.other, status: "cancelled" });
  await insertDistribution({ transactionId: done, eventId, profileId: P.org, role: "organizer", actualAmount: 800 });
  await insertDistribution({ transactionId: cancelled, eventId, profileId: P.org, role: "organizer", actualAmount: 900 });
  const deleted = await insertDistribution({ transactionId: done, eventId, profileId: P.org, role: "organizer", actualAmount: 77 });
  await testAdmin.from("transaction_distributions").update({ deleted_at: new Date().toISOString() }).eq("transaction_distribution_id", deleted);
  await insertDistribution({ transactionId: done, eventId, profileId: P.r, role: "artist", actualAmount: 2400 });

  // ── 1000件の上限を超える送信（many：¥1 を 1001件）──
  const rows = Array.from({ length: 1001 }, (_, i) => ({
    transaction_id: randomUUID(), qr_config_id: qr, total_gross_amount: 1, net_amount: 1, stripe_fee: 0, platform_fee: 0,
    stripe_payment_intent_id: `pi_mcps_many_${ts}_${i}`, status: "completed", transaction_type: "purchase", payment_method: "card",
    amount_verified: true, amount_mismatch: 0, sender_profile_id: P.many,
  }));
  const { error } = await testAdmin.from("transactions").insert(rows);
  if (error) throw error;
  ids.txs.push(...rows.map((r) => r.transaction_id));
}, 120_000);

afterAll(async () => {
  for (const s of sessions) await s.close();
  await cleanupTestData({ transactionIds: ids.txs, qrConfigIds: ids.qrs, eventIds: ids.events });
  await testAdmin.from("products").delete().in("product_id", productsToDelete);
  await deleteAuthUsers(ids.profiles);
}, 120_000);

describe("TC-CHEERY-MCP-STATS: my_stats", () => {
  it("一般ユーザー：送ったチアだけ（アカウント＋同じメール、重複1回・取り消し・招待・他人は数えない）", async () => {
    const text = await call(await mcpAs("u", "user"), "my_stats");
    expect(text.split("\n").slice(0, 3)).toEqual(["送ったチア（累計）", "  - 件数: 3件", `  - 合計金額: ${yen(6000)}`]);
    expect(text.includes("受け取りチア")).toBe(false);
    expect(text.includes("受取配分")).toBe(false);
  });

  it("1000件を超えても数え漏れない（¥1×1001件）", async () => {
    const text = await call(await mcpAs("many", "user"), "my_stats");
    expect(text.split("\n").slice(1, 3)).toEqual(["  - 件数: 1001件", `  - 合計金額: ${yen(1001)}`]);
  });

  it("アーティスト：自分の商品の完了決済だけを受け取りチアに数え、受取配分は出さない（画面と同じ）", async () => {
    const { net_rate } = await getFeeConfig();
    const text = await call(await mcpAs("r", "artist"), "my_stats");
    expect(text.split("\n").slice(3, 7)).toEqual([
      "受け取りチア（累計・アーティストとして）",
      "  - チア件数: 1件",
      `  - 総流通額: ${yen(10000)}`,
      `  - 手数料控除後の受取額（概算）: ${yen(Math.floor(10000 * net_rate))}`,
    ]);
    expect(text.includes("受取配分")).toBe(false);
  });

  it("オーガナイザー：受取配分は完了決済への配分だけ（取り消し・削除済みは数えない）", async () => {
    const text = await call(await mcpAs("org", "organizer"), "my_stats");
    expect(text.split("\n").slice(3, 6)).toEqual(["受取配分（累計）", "  - 配分件数: 1件", `  - 受取総額: ${yen(800)}`]);
  });

  it("運営（admin）には my_stats を登録しない（統計タブを開けないのと同じ）", async () => {
    const s = await mcpAs("adm", "admin");
    expect(s.tools.some((t) => t.name === "my_stats")).toBe(false);
  });
});
