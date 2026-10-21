/**
 * TC-CHEERY-MCP-EVS: MCP ツール evidence_status（開催証跡の提出内容・確認状況・差し戻し理由）
 *
 * 確認状況
 * | 状態                                              | 表示 |
 * |---------------------------------------------------|------|
 * | 提出なし                                            | 未提出 |
 * | 提出あり・差し戻しの印なし・未精算                    | 運営の確認待ち |
 * | 差し戻しの印あり（settlement_summaries.is_approved_for_payout=false） | 差し戻し中 |
 * | 精算済み                                            | 精算済み |
 *
 * アクセス範囲表（差し戻しの理由は主催者への通知にだけ残る）
 * | 人                | イベント                | 証跡の状況 | 差し戻しの理由 |
 * |-------------------|-------------------------|------------|----------------|
 * | 主催者O            | 自分のイベント            | ○          | ○              |
 * | 担当エージェントAG  | 担当のイベント            | ○          | ×（主催者に通知済みとだけ） |
 * | 運営              | どのイベントも            | ○          | ○              |
 * | 別の主催者X        | Oのイベント              | ×（見つからない） | ×        |
 * 返さない項目：写真の保存先（枚数だけ）
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { jstDateTime } from "@/lib/mcp/format";
import { AUTH_EXPIRE_DAYS } from "@/lib/settlement-deadline";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;
const email = (k: string) => `mcpv-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const ev: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], notifs: [] as string[] };
const sessions: DcMcpSession[] = [];

async function mcpAs(key: string, role: string) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin, now: NOW });
  sessions.push(s);
  return s;
}
async function status(s: DcMcpSession, event: string) {
  const r = await s.tools.find((t) => t.name === "evidence_status")!.run({ event });
  expect(r.isError).toBe(false);
  return r.content;
}
const START = new Date(NOW.getTime() - 3 * DAY);
async function event(key: string, lifecycle: string) {
  ev[key] = await insertEvent({ organizerProfileId: P.org, agentId: P.ag, title: `MCPV ${key} ${ts}`, startAt: START, endAt: new Date(START.getTime() + 4 * 3600e3) });
  await testAdmin.from("events").update({ lifecycle_status: lifecycle }).eq("event_id", ev[key]);
  ids.events.push(ev[key]);
}
async function evidence(key: string, daysAgo: number, description: string, attendance: number, photos: number) {
  await testAdmin.from("event_evidences").insert({
    event_id: ev[key], submitted_by: P.org, description, attendance_count: attendance,
    photo_paths: Array.from({ length: photos }, (_, i) => `secret-path/${ts}/${i}.jpg`),
    created_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  });
}
async function reject(key: string, daysAgo: number, comment: string) {
  const { data } = await testAdmin.from("notifications").insert({
    profile_id: P.org, type: "evidence_rejected", title: "エビデンス差戻し", body: comment,
    metadata: { event_id: ev[key], comment }, created_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  }).select("notification_id").single();
  ids.notifs.push(data!.notification_id);
}

beforeAll(async () => {
  for (const [k, role] of [["org", "organizer"], ["ag", "agent"], ["x", "organizer"], ["adm", "admin"]] as const) {
    P[k] = await insertProfile({ role, displayName: `MCPV ${k}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  await event("none", "ended");
  await event("waiting", "ended");
  await evidence("waiting", 2, "満員でした", 120, 3);
  await event("rejected", "ended");
  await evidence("rejected", 2, "最初の提出", 50, 1);
  await reject("rejected", 1.5, "写真が暗くて会場が分かりません");
  await evidence("rejected", 1, "撮り直しました", 55, 2);
  await reject("rejected", 0.5, "来場者数の根拠を添えてください");
  await testAdmin.from("settlement_summaries").insert({ event_id: ev.rejected, is_approved_for_payout: false, total_gross_amount: 0 });
  await event("settled", "settled");
  await evidence("settled", 2, "問題なし", 80, 4);
}, 60_000);

afterAll(async () => {
  for (const s of sessions) await s.close();
  await testAdmin.from("notifications").delete().in("notification_id", ids.notifs);
  await testAdmin.from("event_evidences").delete().in("event_id", ids.events);
  await cleanupTestData({ eventIds: ids.events });
  await deleteAuthUsers(ids.profiles);
}, 60_000);

const deadline = () => {
  const due = new Date(START.getTime() + AUTH_EXPIRE_DAYS * DAY);
  return `${jstDateTime(due.toISOString())}（あと${Math.ceil((due.getTime() - NOW.getTime()) / DAY)}日）`;
};

describe("TC-CHEERY-MCP-EVS: evidence_status", () => {
  it("未提出", async () => {
    expect(await status(await mcpAs("org", "organizer"), `MCPV none ${ts}`)).toBe([
      `MCPV none ${ts} の開催証跡`,
      "  - イベントの状態: 終了",
      "  - 確認状況: 未提出",
      "  - 提出: まだありません",
      `  - 精算期限（開催から${AUTH_EXPIRE_DAYS}日）: ${deadline()}`,
    ].join("\n"));
  });

  it("提出済み・確認待ち：最新の提出内容（写真は枚数だけ）", async () => {
    const text = await status(await mcpAs("org", "organizer"), `MCPV waiting ${ts}`);
    expect(text).toBe([
      `MCPV waiting ${ts} の開催証跡`,
      "  - イベントの状態: 終了",
      "  - 確認状況: 運営の確認待ち",
      `  - 提出: 1回（最新 ${jstDateTime(new Date(NOW.getTime() - 2 * DAY).toISOString())}）`,
      "  - 最新の説明: 満員でした",
      "  - 最新の来場者数: 120",
      "  - 最新の写真: 3枚",
      `  - 精算期限（開催から${AUTH_EXPIRE_DAYS}日）: ${deadline()}`,
    ].join("\n"));
    expect(text.includes("secret-path")).toBe(false);
  });

  it("差し戻し中：主催者には理由を新しい順に返す", async () => {
    const text = await status(await mcpAs("org", "organizer"), `MCPV rejected ${ts}`);
    expect(text.split("\n").slice(2, 3)).toEqual(["  - 確認状況: 差し戻し中（直して再提出が必要）"]);
    expect(text.split("\n").slice(-3)).toEqual([
      "これまでの差し戻しの理由（新しい順）",
      `  - ${jstDateTime(new Date(NOW.getTime() - 0.5 * DAY).toISOString())}：来場者数の根拠を添えてください`,
      `  - ${jstDateTime(new Date(NOW.getTime() - 1.5 * DAY).toISOString())}：写真が暗くて会場が分かりません`,
    ]);
  });

  it("担当エージェントには差し戻しの理由を返さない（画面で見られないため）", async () => {
    const text = await status(await mcpAs("ag", "agent"), `MCPV rejected ${ts}`);
    expect(text.split("\n").slice(-1)).toEqual(["差し戻しの理由：主催者に通知されています（エージェントの画面には表示されません）"]);
    expect(text.includes("来場者数の根拠")).toBe(false);
  });

  it("運営には理由を返す。別の主催者からは見つからない", async () => {
    expect((await status(await mcpAs("adm", "admin"), `MCPV rejected ${ts}`)).includes("来場者数の根拠を添えてください")).toBe(true);
    expect(await status(await mcpAs("x", "organizer"), `MCPV rejected ${ts}`)).toBe(`「MCPV rejected ${ts}」に当てはまる、あなたが主催・担当するイベントは見つかりませんでした。`);
  });

  it("精算済み：期限は出さない", async () => {
    const text = await status(await mcpAs("org", "organizer"), `MCPV settled ${ts}`);
    expect(text.split("\n").slice(1, 3)).toEqual(["  - イベントの状態: 精算済み", "  - 確認状況: 精算済み"]);
    expect(text.includes("精算期限")).toBe(false);
  });
});
