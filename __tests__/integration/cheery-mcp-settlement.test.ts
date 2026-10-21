/**
 * TC-CHEERY-MCP-STL: MCP ツール settlement_report（確定精算レポート。集計は lib/settlement-report.ts を画面と共用）
 *
 * アクセス範囲表
 * | 人                    | 精算済みイベント | 精算前のイベント | エージェントの配分行・DC取り分の内訳 |
 * |-----------------------|------------------|------------------|--------------------------------------|
 * | 主催者O                | ○                | ×（精算後に出る旨） | ×（画面と同じ）                   |
 * | 担当エージェントAG      | ○                | ×                | ○                                    |
 * | 別の主催者X            | ×（見つからない） | ×                | ×                                    |
 *
 * 金額の決まり（画面と同じ）
 * - 照合済みの決済は実測値（stripe_fee_actual / stripe_net_actual − プラットフォーム手数料）を優先
 * - 状態：凍結なしで保留期間を過ぎた＝出金可／過ぎていない決済を含む＝ホールド中／全額凍結／一部凍結
 * - 振込実績は settle_transfers のプロフィール合計を、ロール行の合計配分額を上限に割り当てる
 * - 版は「精算後に起きたチャージバックの数」で v1.N
 * 返さない項目：お客様の名前・メッセージ・決済ID
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent, insertQrConfig, insertTransaction, insertDistribution, insertSettleTransfer } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { jstDateTime, yen } from "@/lib/mcp/format";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const email = (k: string) => `mcpt-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], qrs: [] as string[], txs: [] as string[], claims: [] as string[], transfers: [] as string[] };
let E: string;
const START = new Date(NOW - 25 * DAY);
const APPROVED = new Date(NOW - 3 * DAY).toISOString();
const CB_AT = new Date(NOW - 1 * DAY).toISOString();
const sessions: DcMcpSession[] = [];
const jpStamp = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

async function mcpAs(key: string, role: string) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin });
  sessions.push(s);
  return s;
}
async function report(s: DcMcpSession, event: string) {
  const r = await s.tools.find((t) => t.name === "settlement_report")!.run({ event });
  expect(r.isError).toBe(false);
  return r.content;
}
async function tx(qr: string, gross: number, stripe: number, platform: number, daysAgo: number, extra: Record<string, unknown> = {}) {
  const id = await insertTransaction({ qrConfigId: qr, grossAmount: gross, netAmount: gross - stripe - platform, stripeFee: stripe, platformFee: platform, stripePaymentIntentId: `pi_mcpt_${ts}_${ids.txs.length}`, senderEmail: `fan-${ts}@example.com` });
  await testAdmin.from("transactions").update({ created_at: new Date(NOW - daysAgo * DAY).toISOString(), sender_name: "ファンの名前", ...extra }).eq("transaction_id", id);
  ids.txs.push(id);
  return id;
}

beforeAll(async () => {
  for (const [k, role, name] of [["org", "organizer", "主催オー"], ["ag", "agent", "担当エージ"], ["r", "artist", "演者アール"], ["x", "organizer", "別主催"]] as const) {
    P[k] = await insertProfile({ role, displayName: `${name}${ts}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  E = await insertEvent({ organizerProfileId: P.org, agentId: P.ag, title: `MCPT 精算済み ${ts}`, startAt: START, endAt: new Date(START.getTime() + 4 * 3600e3) });
  await testAdmin.from("events").update({ lifecycle_status: "settled" }).eq("event_id", E);
  const pending = await insertEvent({ organizerProfileId: P.org, agentId: P.ag, title: `MCPT 精算前 ${ts}`, startAt: START, endAt: new Date(START.getTime() + 4 * 3600e3) });
  await testAdmin.from("events").update({ lifecycle_status: "ended" }).eq("event_id", pending);
  ids.events.push(E, pending);
  await testAdmin.from("settlement_summaries").insert({ event_id: E, is_approved_for_payout: true, approved_at: APPROVED, total_gross_amount: 15000 });

  const qr = await insertQrConfig({ eventId: E, creatorProfileId: P.org, recipientProfileId: P.org });
  await testAdmin.from("qr_configs").update({ label: "メインQR" }).eq("qr_config_id", qr);
  ids.qrs.push(qr);
  // 1件目：保留期間を過ぎた・照合前（見積り値）。演者の配分は全額凍結
  const t1 = await tx(qr, 10000, 396, 1000, 20);
  await insertDistribution({ transactionId: t1, eventId: E, profileId: P.org, role: "organizer", actualAmount: 6000, holdReleased: false });
  await insertDistribution({ transactionId: t1, eventId: E, profileId: P.r, role: "artist", actualAmount: 2604, holdReleased: false, isFrozen: true });
  await insertDistribution({ transactionId: t1, eventId: E, profileId: P.ag, role: "agent", actualAmount: 500, holdReleased: false });
  // 2件目：保留期間内・照合済み（実測値を優先：Stripe 180、配分原資 4820−500=4320）
  const t2 = await tx(qr, 5000, 198, 500, 2, { stripe_fee_actual: 180, stripe_net_actual: 4820 });
  await insertDistribution({ transactionId: t2, eventId: E, profileId: P.org, role: "organizer", actualAmount: 4320, holdReleased: false });
  await insertDistribution({ transactionId: t2, eventId: E, profileId: P.ag, role: "agent", actualAmount: 250, holdReleased: false });

  await insertSettleTransfer({ eventId: E, profileId: P.org, stripeTransferId: `tr_mcpt_${ts}`, amount: 6000 });
  const { data: claim } = await testAdmin.from("debt_claims").insert({ profile_id: P.org, original_transaction_id: t1, claim_amount: 2604, stripe_dispute_fee: 1500, status: "active", created_at: CB_AT }).select("claim_id").single();
  ids.claims.push(claim!.claim_id);
  // 消費税額は配分の明細を入れたときに DB 側で入る。保存値の合計がそのまま出ることを確かめる
  const { data: dists } = await testAdmin.from("transaction_distributions").select("tax_amount").in("transaction_id", ids.txs);
  taxTotal = (dists ?? []).reduce((s, d) => s + (d.tax_amount ?? 0), 0);
  expect(taxTotal > 0).toBe(true);
}, 90_000);

afterAll(async () => {
  for (const s of sessions) await s.close();
  await testAdmin.from("settle_transfers").delete().eq("event_id", E);
  await cleanupTestData({ debtClaimIds: ids.claims, transactionIds: ids.txs, qrConfigIds: ids.qrs, eventIds: ids.events });
  await deleteAuthUsers(ids.profiles);
}, 90_000);

let taxTotal = 0;
const head = (platform: string) => [
  `MCPT 精算済み ${ts} 確定精算レポート（v1.1）`,
  `  - 開催: ${jstDateTime(START.toISOString())}`,
  `  - 精算日時: ${jpStamp(APPROVED)}`,
  `  - 精算後のチャージバック: あり（最新 ${jpStamp(CB_AT)}）`,
  `  - 売上合計（総流通額）: ${yen(15000)}`,
  `  - Stripe決済手数料: ${yen(576)}`,
  `  - プラットフォーム手数料: ${platform}`,
  `  - 主催者受取総額（配分原資）: ${yen(12924)}`,
  `  - うち消費税: ${yen(taxTotal)}`,
  `  - CBによる保留: ${yen(4104)}（係争中 1件。凍結 ${yen(2604)}・CB手数料 ${yen(1500)}・不足分 ${yen(0)}）`,
  "受取人別 合計（イベント全体）",
];
const tail = [
  `  - 主催オー${ts}（オーガナイザー）: 合計配分額 ${yen(10320)}・振込実績 ${yen(6000)}・ホールド中`,
  `  - 演者アール${ts}（アーティスト）: 合計配分額 ${yen(2604)}・うちCB凍結 ${yen(2604)}・振込実績 未振込・全額凍結（CB係争）`,
  "QR設定別 内訳",
  `  - メインQR: 2チア（計2件）・売上 ${yen(15000)} → Stripe ${yen(576)} + 手数料 ${yen(1500)} = 配分原資 ${yen(12924)}`,
];

describe("TC-CHEERY-MCP-STL: settlement_report", () => {
  it("主催者：エージェントの配分行と DC取り分の内訳は出さない（画面と同じ）", async () => {
    expect(await report(await mcpAs("org", "organizer"), `MCPT 精算済み ${ts}`)).toBe([...head(yen(1500)), ...tail].join("\n"));
  });

  it("担当エージェント：エージェントの配分行と内訳も出す", async () => {
    expect(await report(await mcpAs("ag", "agent"), `MCPT 精算済み ${ts}`)).toBe([
      ...head(`${yen(1500)}（DC取り分 ${yen(750)} / エージェント ${yen(750)}）`),
      `  - 担当エージ${ts}（エージェント）: 合計配分額 ${yen(750)}・振込実績 未振込・ホールド中`,
      ...tail,
    ].join("\n"));
  });

  it("精算前のイベントはレポートが無い旨を返す", async () => {
    expect(await report(await mcpAs("org", "organizer"), `MCPT 精算前 ${ts}`)).toBe(`「MCPT 精算前 ${ts}」はまだ精算されていません。確定精算レポートは精算後に表示されます（開催証跡の状況は evidence_status で確認できます）。`);
  });

  it("別の主催者からは見つからない。お客様の名前・メールは返さない", async () => {
    expect(await report(await mcpAs("x", "organizer"), `MCPT 精算済み ${ts}`)).toBe(`「MCPT 精算済み ${ts}」に当てはまる、あなたが主催・担当するイベントは見つかりませんでした。`);
    const text = await report(await mcpAs("org", "organizer"), `MCPT 精算済み ${ts}`);
    expect(text.includes("ファンの名前")).toBe(false);
    expect(text.includes("@example.com")).toBe(false);
  });
});
