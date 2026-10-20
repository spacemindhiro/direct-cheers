/**
 * TC-CHEERY-MCP-INCOME: MCP ツール my_income（収支レポート。収支レポートAPIと同じ集計 lib/income-summary.ts）
 *
 * アクセス範囲表（my_income）
 * | 関係者        | 見えるもの                                   | 見えないもの |
 * |---------------|----------------------------------------------|--------------|
 * | アーティストR | 自分のダイレクト着金・未出金残高              | エージェント報酬・プラットフォーム純利（区分ごと出さない）・他人の着金 |
 * | エージェントG | 自分のダイレクト着金・エージェント報酬        | プラットフォーム純利 |
 * | 一般ユーザー  | （ツール自体が無い）                          | ―            |
 *
 * アクセス範囲表（my_payout_history）：本人の出金申請だけ。他人の申請・振込ID・口座情報は出さない
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent, insertQrConfig, insertTransaction, insertDistribution, insertSettleTransfer } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { jstPeriod } from "@/lib/ai/limits";
import { jstDateTime } from "@/lib/mcp/format";
import { getPayoutHistory } from "@/lib/payout-history";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const email = (k: string) => `mcpi-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], qrs: [] as string[], txs: [] as string[], dists: [] as string[] };
const sessions: DcMcpSession[] = [];
const [Y, M] = jstPeriod().month.split("-").map(Number);

async function mcpAs(key: string, role: string) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin });
  sessions.push(s);
  return s;
}

beforeAll(async () => {
  for (const [k, role] of [["org", "organizer"], ["r", "artist"], ["v", "artist"], ["g", "agent"], ["u", "user"]] as const) {
    P[k] = await insertProfile({ role, displayName: `MCPI ${k}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  const ev = await insertEvent({ organizerProfileId: P.org, agentId: P.g, title: `MCPI ${ts}` });
  ids.events.push(ev);
  const qr = await insertQrConfig({ eventId: ev, creatorProfileId: P.org, recipientProfileId: P.org });
  ids.qrs.push(qr);
  const tx = await insertTransaction({ qrConfigId: qr, grossAmount: 20000, netAmount: 17000, stripeFee: 0, platformFee: 0, stripePaymentIntentId: `pi_mcpi_${ts}` });
  ids.txs.push(tx);
  for (const [k, role, amt] of [["r", "artist", 5000], ["v", "artist", 9999], ["g", "agent", 700]] as const) {
    ids.dists.push(await insertDistribution({ transactionId: tx, eventId: ev, profileId: P[k], role, actualAmount: amt }));
    await insertSettleTransfer({ eventId: ev, profileId: P[k], stripeTransferId: `tr_mcpi_${ts}_${k}`, amount: amt });
  }
  const { error } = await testAdmin.from("payout_requests").insert({ profile_id: P.r, requested_amount: 1200, stripe_fee_deducted: 500, net_payout_amount: 700, status: "completed" });
  if (error) throw error;
}, 60_000);

afterAll(async () => {
  for (const s of sessions) await s.close().catch(() => {});
  await testAdmin.from("payout_requests").delete().in("profile_id", ids.profiles);
  await testAdmin.from("settle_transfers").delete().in("event_id", ids.events);
  await cleanupTestData({ distributionIds: ids.dists, transactionIds: ids.txs, qrConfigIds: ids.qrs, eventIds: ids.events });
  await deleteAuthUsers(ids.profiles);
});

const call = async (key: string, role: string, input: Record<string, unknown> = {}) =>
  (await mcpAs(key, role)).tools.find((t) => t.name === "my_income")!.run(input);

describe("TC-CHEERY-MCP-INCOME: my_income", () => {
  it("アーティストR：自分のダイレクト着金と未出金残高だけ（エージェント報酬・プラットフォームの区分は出さない）", async () => {
    const r = await call("r", "artist", { year: Y, month: M });
    expect(r.content).toBe([
      `${Y}年${M}月度の収支（着金日基準。未出金の残高は収入に含まない）`,
      "ダイレクト着金（出演・主催の受取）",
      "  - 着金: ¥5,000",
      "  - 差し引き: ¥5,000",
      "  - 未出金のStripe残高（今時点）: ¥3,800",
      "合計（差し引き）: ¥5,000",
    ].join("\n"));
  });

  it("エージェントG：エージェント報酬が出る。プラットフォーム純利は出ない", async () => {
    const r = await call("g", "agent", { year: Y, month: M });
    expect(r.content.includes("エージェント報酬\n  - 着金: ¥700\n  - 差し引き: ¥700\n  - 未出金のStripe残高（今時点）: ¥700")).toBe(true);
    expect(r.content.includes("プラットフォーム純利")).toBe(false);
    expect(r.content.endsWith("合計（差し引き）: ¥700")).toBe(true);
  });

  it("別の月は0円", async () => {
    const r = await call("r", "artist", { year: 2026, month: 1 });
    expect(r.content.includes("  - 着金: ¥0")).toBe(true);
  });

  it("year だけ・month だけは受け付けない", async () => {
    expect((await call("r", "artist", { year: Y })).content).toBe("year と month は両方指定するか、両方省略してください。");
  });

  it("一般ユーザーにはツールが無い", async () => {
    expect((await mcpAs("u", "user")).tools.some((t) => t.name === "my_income")).toBe(false);
  });
});

describe("TC-CHEERY-MCP-INCOME: my_payout_history", () => {
  it("本人の出金申請だけ（振込IDは出さない）", async () => {
    const { data } = await testAdmin.from("payout_requests").select("created_at").eq("profile_id", P.r).single();
    const r = (await mcpAs("r", "artist")).tools.find((t) => t.name === "my_payout_history")!;
    expect((await r.run({})).content).toBe([
      "出金の履歴 1件（新しい順）。銀行への着金まで1〜4営業日（土日祝を除く）",
      `1. ${jstDateTime(data!.created_at)} に申請`,
      "  - 申請額: ¥1,200",
      "  - 振込手数料: ¥500",
      "  - 振込額: ¥700",
      "  - 状態: 完了（振込手続き済み）",
    ].join("\n"));
  });

  it("申請の無い人", async () => {
    const r = (await mcpAs("v", "artist")).tools.find((t) => t.name === "my_payout_history")!;
    expect((await r.run({})).content).toBe("出金の履歴はありません。");
  });

  it("入金予定日は直近10日以内の申請だけ Stripe に問い合わせる（口座が無ければ問い合わせない）", async () => {
    await testAdmin.from("payout_requests").update({ stripe_transfer_id: "po_recent" }).eq("profile_id", P.r);
    const { error } = await testAdmin.from("payout_requests").insert({ profile_id: P.r, requested_amount: 3000, stripe_fee_deducted: 0, net_payout_amount: 3000, status: "completed", stripe_transfer_id: "po_old", created_at: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString() });
    if (error) throw error;
    const asked: string[] = [];
    const fake = async (id: string, acct: string) => { asked.push(`${id}@${acct}`); return { arrival_date: 1793145600 }; };
    const { history, arrivalDates } = await getPayoutHistory(testAdmin, P.r, "acct_test", new Date(), fake);
    expect(asked).toEqual(["po_recent@acct_test"]);
    expect(history.length).toBe(2);
    expect([...arrivalDates.values()]).toEqual([1793145600]);
    const none: string[] = [];
    await getPayoutHistory(testAdmin, P.r, null, new Date(), async (id) => { none.push(id); return { arrival_date: 1 }; });
    expect(none).toEqual([]);
  });
});
