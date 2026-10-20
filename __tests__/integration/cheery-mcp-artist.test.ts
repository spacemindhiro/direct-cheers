/**
 * TC-CHEERY-MCP-ART: MCP ツール my_lineups（出演依頼・出演予定）と my_payout_balance（出金残高）
 * ダッシュボード・出金管理画面から切り出した共通の計算（lib/lineup-invites.ts・lib/payout-balance.ts）を、MCP 経由で確かめる。
 *
 * アクセス範囲表（my_lineups）
 * | 関係者   | 状態                                   | 出すか |
 * |----------|----------------------------------------|--------|
 * | 出演者R  | 公開済みイベントの依頼（返事待ち）       | ○（依頼メッセージも） |
 * | 出演者R  | 下書きで依頼の通知がまだ（依頼予定）     | ×      |
 * | 出演者R  | 下書きで依頼の通知が届いている           | ○      |
 * | 出演者R  | 確定・これから                          | ○（出演予定） |
 * | 出演者R  | 確定・終了済み                          | ×      |
 * | 出演者R  | 中止になったイベント                    | ×      |
 * | 出演者R  | 別の出演者への依頼                      | ×      |
 *
 * アクセス範囲表（my_payout_balance）
 * | 関係者   | 対象                                   | 数えるか |
 * |----------|----------------------------------------|----------|
 * | 出演者R  | 自分への配分（4区分）＋精算前の見込み     | ○        |
 * | 出演者R  | 同じ決済の別の人への配分                 | ×        |
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent, insertQrConfig, insertQrConfigTargets, insertTransaction, insertDistribution, insertEventArtist } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { jstDateTime } from "@/lib/mcp/format";
import { HOLD_DAYS } from "@/lib/payout-config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;
const email = (k: string) => `mcpa-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], qrs: [] as string[], txs: [] as string[], dists: [] as string[], notifs: [] as string[] };
const ev: Record<string, string> = {};
let tx3Created: string;
const sessions: DcMcpSession[] = [];

async function mcpAs(key: string, role: string) {
  const c: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin, now: NOW });
  sessions.push(s);
  return s;
}
async function call(s: DcMcpSession, name: string) {
  return s.tools.find((t) => t.name === name)!.run({});
}
async function tx(qr: string, gross: number, daysAgo: number) {
  const id = await insertTransaction({ qrConfigId: qr, grossAmount: gross, netAmount: gross, stripeFee: 0, platformFee: 0, stripePaymentIntentId: `pi_mcpa_${ts}_${ids.txs.length}` });
  const created = new Date(NOW.getTime() - daysAgo * DAY).toISOString();
  await testAdmin.from("transactions").update({ created_at: created }).eq("transaction_id", id);
  ids.txs.push(id);
  return { id, created };
}
async function ev_(key: string, title: string, startOffsetDays: number, status: string, extra: Record<string, unknown> = {}) {
  const start = new Date(NOW.getTime() + startOffsetDays * DAY);
  ev[key] = await insertEvent({ organizerProfileId: P.org, title: `${title} ${ts}`, startAt: start, endAt: new Date(start.getTime() + 3 * 3600e3) });
  await testAdmin.from("events").update({ lifecycle_status: status, ...extra }).eq("event_id", ev[key]);
  ids.events.push(ev[key]);
}

beforeAll(async () => {
  for (const [k, role] of [["org", "organizer"], ["r", "artist"], ["other", "artist"]] as const) {
    P[k] = await insertProfile({ role, displayName: `MCPA ${k}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  // ── 出演依頼 ──
  await ev_("pub", "公開の依頼", 10, "published");
  await ev_("draftHidden", "依頼予定の下書き", 12, "draft");
  await ev_("draftSent", "依頼済みの下書き", 14, "draft");
  await ev_("future", "確定これから", 20, "published");
  await ev_("past", "確定終了", -10, "ended");
  await ev_("cancelled", "中止", 15, "cancelled");
  await insertEventArtist({ eventId: ev.pub, artistProfileId: P.r, status: "pending" });
  await testAdmin.from("event_artists").update({ invite_message: "ぜひ出演してください" }).eq("event_id", ev.pub).eq("artist_profile_id", P.r);
  await insertEventArtist({ eventId: ev.draftHidden, artistProfileId: P.r, status: "pending" });
  await insertEventArtist({ eventId: ev.draftSent, artistProfileId: P.r, status: "pending" });
  const { data: n } = await testAdmin.from("notifications").insert({ profile_id: P.r, type: "lineup_invite", title: "出演依頼", body: "", metadata: { event_id: ev.draftSent } }).select("notification_id").single();
  ids.notifs.push(n!.notification_id);
  await insertEventArtist({ eventId: ev.future, artistProfileId: P.r, status: "confirmed" });
  await insertEventArtist({ eventId: ev.past, artistProfileId: P.r, status: "confirmed" });
  await insertEventArtist({ eventId: ev.cancelled, artistProfileId: P.r, status: "pending" });
  await insertEventArtist({ eventId: ev.pub, artistProfileId: P.other, status: "pending" });

  // ── 出金残高 ──
  await ev_("settled", "精算済み照合済み", -200, "settled", { reconciled_at: new Date().toISOString() });
  await ev_("unsettled", "精算前", -1, "ended");
  const qS = await insertQrConfig({ eventId: ev.settled, creatorProfileId: P.org, recipientProfileId: P.org });
  const qU = await insertQrConfig({ eventId: ev.unsettled, creatorProfileId: P.org, recipientProfileId: P.org });
  ids.qrs.push(qS, qU);
  await insertQrConfigTargets(qU, [{ profileId: P.r, ratio: 0.5 }]);
  const t1 = await tx(qS, 1000, 20);   // 精算・照合済みで14日超 → 出金可能
  const t2 = await tx(qS, 2000, 130);  // 120日超 → 無料で出金可能
  const t3 = await tx(qS, 3000, 3);    // 14日未満 → 保留中
  tx3Created = t3.created;
  const t4 = await tx(qS, 400, 30);    // 凍結
  await tx(qU, 1000, 1);               // 精算前（配分行なし）→ 見込み 500 を保留中に
  for (const [t, amt, frozen] of [[t1, 1000, false], [t2, 2000, false], [t3, 3000, false], [t4, 400, true]] as const) {
    ids.dists.push(await insertDistribution({ transactionId: t.id, eventId: ev.settled, profileId: P.r, role: "artist", actualAmount: amt, holdReleased: false, isFrozen: frozen }));
  }
  ids.dists.push(await insertDistribution({ transactionId: t1.id, eventId: ev.settled, profileId: P.other, role: "artist", actualAmount: 9999, holdReleased: true }));
}, 60_000);

afterAll(async () => {
  for (const s of sessions) await s.close().catch(() => {});
  await testAdmin.from("notifications").delete().in("notification_id", ids.notifs);
  await testAdmin.from("event_artists").delete().in("event_id", ids.events);
  await testAdmin.from("qr_config_targets").delete().in("qr_config_id", ids.qrs);
  await cleanupTestData({ distributionIds: ids.dists, transactionIds: ids.txs, qrConfigIds: ids.qrs, eventIds: ids.events });
  await deleteAuthUsers(ids.profiles);
});

describe("TC-CHEERY-MCP-ART-A: my_lineups", () => {
  it("返事待ち（公開の依頼・依頼済みの下書き）と出演予定（確定これから）だけ。依頼予定・終了・中止・他人の依頼は出さない", async () => {
    const r = await call(await mcpAs("r", "artist"), "my_lineups");
    const startOf = async (k: string) => (await testAdmin.from("events").select("start_at").eq("event_id", ev[k]).single()).data!.start_at;
    expect(r.content).toBe([
      "返事待ちの出演依頼 2件（ダッシュボードの「出演」から承認・辞退できます）",
      `1. 依頼済みの下書き ${ts}`,
      `  - 開催: ${jstDateTime(await startOf("draftSent"))}`,
      "  - 主催者: MCPA org",
      `2. 公開の依頼 ${ts}`,
      `  - 開催: ${jstDateTime(await startOf("pub"))}`,
      "  - 主催者: MCPA org",
      "  - 依頼メッセージ: ぜひ出演してください",
      "出演予定 1件",
      `1. 確定これから ${ts}`,
      `  - 開催: ${jstDateTime(await startOf("future"))}`,
      "  - 主催者: MCPA org",
    ].join("\n"));
  });

  it("依頼の無い出演者", async () => {
    // other は公開の依頼が1件ある
    const r = await call(await mcpAs("other", "artist"), "my_lineups");
    expect(r.content.startsWith("返事待ちの出演依頼 1件")).toBe(true);
    expect(r.content.includes("依頼メッセージ")).toBe(false);
    expect((await call(await mcpAs("org", "organizer"), "my_lineups")).content).toBe("出演依頼・出演予定はありません。");
  });
});

describe("TC-CHEERY-MCP-ART-B: my_payout_balance", () => {
  it("4区分・イベント別の内訳・出金できる見込み日。別の人への配分は数えない", async () => {
    const r = await call(await mcpAs("r", "artist"), "my_payout_balance");
    const release = new Date(new Date(tx3Created).getTime() + HOLD_DAYS * DAY);
    expect(r.content).toBe([
      "出金残高（出金管理画面と同じ計算）",
      "  - 出金可能: ¥1,000（出金のたびに振込手数料¥500）",
      "  - 振込手数料無料で出金可能: ¥2,000（月1回まで。今月は未使用）",
      "  - 保留中: ¥3,500",
      "  - 凍結中（チャージバック対応中）: ¥400",
      "  - 口座登録: 受取口座が未登録です（出金には口座登録と審査完了が必要）",
      "イベント別の内訳",
      `1. 精算済み照合済み ${ts}`,
      "  - イベントの状態: 精算済み",
      "  - 照合: 照合済み",
      "  - 出金可能: ¥1,000",
      "  - 無料で出金可能: ¥2,000",
      "  - 保留中: ¥3,000",
      "  - 凍結中: ¥400",
      `  - 保留中の分が出金できる見込み: ${jstDateTime(release.toISOString())} 以降`,
      `2. 精算前 ${ts}`,
      "  - イベントの状態: 終了",
      "  - 照合: 照合待ち",
      "  - 保留中: ¥500",
      `  - 保留中の分が出金できる見込み: イベントの精算・照合が済んでから（済んだあと、決済から${HOLD_DAYS}日たった分から出金可能）`,
    ].join("\n"));
  });

  it("配分の無い人は残高0・内訳なし", async () => {
    const r = await call(await mcpAs("org", "organizer"), "my_payout_balance");
    expect(r.content.includes("  - 出金可能: ¥0")).toBe(true);
    expect(r.content.includes("イベント別の内訳")).toBe(false);
  });

  it("別の出演者 other は自分の 9,999 だけ（Rの分は混ざらない）", async () => {
    const r = await call(await mcpAs("other", "artist"), "my_payout_balance");
    expect(r.content.includes("  - 出金可能: ¥9,999（出金のたびに振込手数料¥500）")).toBe(true);
    expect(r.content.includes("¥3,500")).toBe(false);
  });
});
