/**
 * TC-CHEERY-MCP-ADM: 運営向け MCP ツール admin_overview（DC 全体の対応待ち）
 *
 * DB 全体を数えるため、共有のローカルDBに残っている他の行も数に入る。そこで「入れる前と後の差」が
 * 入れた分とちょうど一致することを確かめる（区分ごとに、数えるもの・数えないものを両方入れる）。
 *
 * | 入れる行                                         | 増える区分 |
 * |--------------------------------------------------|------------|
 * | 口座審査中（verification_status=pending）の人       | 審査待ち +1 |
 * | 終了・証跡あり・差し戻しなし                        | 精算待ち合計 +1・精算できる +1 |
 * | 終了・証跡あり・差し戻し中                          | 合計 +1・差し戻し中 +1 |
 * | 公開中だが終了時刻を過ぎた・証跡なし・期限切れ        | 合計 +1・未提出 +1・期限切れ +1 |
 * | 公開中・これから／精算済み                          | 増えない |
 * | 承認待ち（自主開催）／承認待ち（担当エージェントあり） | 承認待ち +2・うち自主開催 +1 |
 * | 中止申請中                                         | 中止申請中 +1 |
 * | 完了決済：未照合／金額不一致／照合エラー／正常／取り消し | 各 +1、正常・取り消しは増えない |
 * | 振込の保留（pending）¥1,234／解決済み                | 保留 +1件 +¥1,234 |
 * | 運営宛て未読メッセージ／既読                         | +1 |
 * | 要確認のバッチ報告／正常完了                        | +1 |
 * 運営以外のセッションには登録しない。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent, insertQrConfig, insertTransaction, insertEventEvidence } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const email = (k: string) => `mcpad-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], qrs: [] as string[], txs: [] as string[], transfers: [] as string[], msgs: [] as string[], reports: [] as string[] };
const sessions: DcMcpSession[] = [];

async function mcpAs(key: string, role: string) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin });
  sessions.push(s);
  return s;
}
// 「- 区分: 3件（うち…）」「・数字」を区分名ごとの数に
function counts(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of text.matchAll(/- ([^:\n]+): (\d+)[人件]/g)) out[m[1]] = Number(m[2]);
  for (const m of text.matchAll(/うち(期限切れ|自主開催＝運営の承認が必要) (\d+)件/g)) out[m[1]] = Number(m[2]);
  const money = text.match(/振込の保留[^:]*: \d+件 ¥([\d,]+)/);
  out["保留額"] = money ? Number(money[1].replace(/,/g, "")) : NaN;
  return out;
}
async function overview() {
  const s = await mcpAs("adm", "admin");
  const r = await s.tools.find((t) => t.name === "admin_overview")!.run({ detail: 0 });
  expect(r.isError).toBe(false);
  return r.content;
}
async function event(title: string, status: string, startDaysFromNow: number, endHoursFromStart = 4, agent = "ag", organizer = "org") {
  const start = new Date(Date.now() + startDaysFromNow * DAY);
  const id = await insertEvent({ organizerProfileId: P[organizer], agentId: P[agent], title: `MCPAD ${title} ${ts}`, startAt: start, endAt: new Date(start.getTime() + endHoursFromStart * 3600e3) });
  await testAdmin.from("events").update({ lifecycle_status: status }).eq("event_id", id);
  ids.events.push(id);
  return id;
}

let before: Record<string, number>;
let text: string;

beforeAll(async () => {
  for (const [k, role] of [["adm", "admin"], ["ag", "agent"], ["org", "organizer"], ["pend", "artist"], ["ok", "artist"]] as const) {
    P[k] = await insertProfile({ role, displayName: `MCPAD ${k} ${ts}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  before = counts(await overview());

  await testAdmin.from("profiles").update({ verification_status: "pending" }).eq("profile_id", P.pend);
  await testAdmin.from("profiles").update({ verification_status: "verified" }).eq("profile_id", P.ok);

  const ready = await event("精算できる", "ended", -3);
  await insertEventEvidence({ eventId: ready, submittedByProfileId: P.org });
  const back = await event("差し戻し中", "ended", -3);
  await insertEventEvidence({ eventId: back, submittedByProfileId: P.org });
  await testAdmin.from("settlement_summaries").insert({ event_id: back, is_approved_for_payout: false, total_gross_amount: 0 });
  await event("証跡なし期限切れ", "published", -10);
  await event("これから", "published", 5);
  await event("精算済み", "settled", -20);
  await event("承認待ち自主開催", "review_requested", 10, 4, "ag", "ag");
  await event("承認待ち", "review_requested", 10);
  await event("中止申請中", "cancellation_requested", 10);

  const qr = await insertQrConfig({ eventId: ready, creatorProfileId: P.org, recipientProfileId: P.org });
  ids.qrs.push(qr);
  const tx = async (extra: Record<string, unknown>, reconciled = true, status = "completed") => {
    const id = await insertTransaction({ qrConfigId: qr, grossAmount: 1000, netAmount: 860, stripeFee: 40, platformFee: 100, stripePaymentIntentId: `pi_mcpad_${ts}_${ids.txs.length}`, reconciled, status });
    if (Object.keys(extra).length) await testAdmin.from("transactions").update(extra).eq("transaction_id", id);
    ids.txs.push(id);
    return id;
  };
  await tx({}, false);
  await tx({ amount_verified: false });
  await tx({ reconcile_error: "テストの照合エラー" });
  await tx({});
  await tx({}, false, "cancelled");

  for (const status of ["pending", "resolved"]) {
    const { data, error } = await testAdmin.from("pending_connect_transfers").insert({ event_id: ready, profile_id: P.org, role: "organizer", amount: 1234, status, charge_id: `ch_mcpad_${ts}_${status}` }).select("pending_transfer_id").single();
    if (error) throw error;
    ids.transfers.push(data.pending_transfer_id);
  }
  for (const read of [false, true]) {
    const { data, error } = await testAdmin.from("admin_messages").insert({ user_profile_id: P.org, sender_id: P.org, body: "相談です", is_from_admin: false, is_read_by_admin: read, is_read_by_user: true }).select("id").single();
    if (error) throw error;
    ids.msgs.push(data.id);
  }
  for (const status of ["要確認・未回収あり", "正常完了"]) {
    const { data, error } = await testAdmin.from("daily_business_reports").insert({ process_date: new Date().toISOString().slice(0, 10), task_name: `MCPAD ${ts}`, status }).select("id").single();
    if (error) throw error;
    ids.reports.push(data.id);
  }
  text = await overview();
}, 120_000);

afterAll(async () => {
  for (const s of sessions) await s.close();
  await testAdmin.from("pending_connect_transfers").delete().in("pending_transfer_id", ids.transfers);
  await testAdmin.from("admin_messages").delete().in("id", ids.msgs);
  await testAdmin.from("daily_business_reports").delete().in("id", ids.reports);
  await testAdmin.from("event_evidences").delete().in("event_id", ids.events);
  await cleanupTestData({ transactionIds: ids.txs, qrConfigIds: ids.qrs, eventIds: ids.events });
  await deleteAuthUsers(ids.profiles);
}, 120_000);

describe("TC-CHEERY-MCP-ADM: admin_overview", () => {
  it("区分ごとに、入れた分だけちょうど増える（数えないものは増えない）", () => {
    const after = counts(text);
    const diff = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - (before[k] ?? 0)]));
    expect(diff).toEqual({
      "審査待ち": 1,
      "合計": 3,
      "期限切れ": 1,
      "精算できる（証跡あり・差し戻しなし）": 1,
      "差し戻し中": 1,
      "証跡が未提出": 1,
      "承認待ち": 2,
      "自主開催＝運営の承認が必要": 1,
      "中止申請中": 1,
      "未照合": 1,
      "金額不一致": 1,
      "照合エラー": 1,
      "振込の保留（口座未完了などで送れていない分配）": 1,
      "保留額": 1234,
      "運営宛ての未読メッセージ": 1,
      "要確認のバッチ報告": 1,
    });
  });

  it("運営以外には登録しない（エージェント・主催者）", async () => {
    for (const [k, role] of [["ag", "agent"], ["org", "organizer"]] as const) {
      const s = await mcpAs(k, role);
      expect(`${role}:${s.tools.some((t) => t.name === "admin_overview")}`).toBe(`${role}:false`);
    }
  });
});
