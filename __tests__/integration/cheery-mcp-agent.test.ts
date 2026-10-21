/**
 * TC-CHEERY-MCP-AGT: エージェント向け MCP ツール agent_organizers・agent_handoffs・agent_proxy_drafts
 *
 * アクセス範囲表（agent_organizers：イベント作成画面の「代理作成できる主催者」と同じ）
 * | 主催者                              | エージェントAG | 運営 |
 * |-------------------------------------|----------------|------|
 * | 担当がAG                             | ○              | ○    |
 * | 担当が別のエージェントAG2             | ×              | ○    |
 * | 削除済み（担当はAG）                  | ×              | ×    |
 * 状態の表示名は照会画面と同じ（lib/directory.ts の REGISTRATION_STATUS_LABEL・VERIFICATION_STATUS_LABEL）
 *
 * アクセス範囲表（agent_handoffs）
 * | 依頼                     | AG に出すか |
 * |--------------------------|-------------|
 * | AG → AG2（返事待ち）      | ○（あなた → 相手） |
 * | AG2 → AG（承諾済み）      | ○（相手 → あなた） |
 * | AG2 → AG3（他人同士）     | ×           |
 *
 * アクセス範囲表（agent_proxy_drafts：イベント詳細画面の「主催者に確認を依頼する」と同じ条件）
 * | イベント                                  | AG に出すか |
 * |-------------------------------------------|-------------|
 * | AG担当・主催者は別・下書き・目印あり         | ○ 未送信    |
 * | AG担当・主催者は別・下書き・送信通知あり     | ○ 送信済み  |
 * | AG担当・主催者は別・下書き・どちらも無し     | ○ 主催者が作成中 |
 * | AG担当・公開済み                           | ×           |
 * | AG自身が主催（自主開催）                    | ×           |
 * | 別のエージェントの担当                      | ×           |
 * 返さない項目：連絡先・Stripe のアカウントID・内部ID
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { jstDateTime } from "@/lib/mcp/format";
import { markProxyDraft } from "@/lib/proxy-draft";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const email = (k: string) => `mcpg-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const ev: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], handoffs: [] as string[] };
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
async function event(key: string, organizer: string, agent: string, lifecycle: string, startDays: number) {
  ev[key] = await insertEvent({ organizerProfileId: P[organizer], agentId: P[agent], title: `MCPG ${key} ${ts}`, startAt: new Date(NOW + startDays * DAY), endAt: new Date(NOW + startDays * DAY + 3 * 3600e3) });
  await testAdmin.from("events").update({ lifecycle_status: lifecycle, created_at: new Date(NOW - (30 - startDays) * 60e3).toISOString() }).eq("event_id", ev[key]);
  ids.events.push(ev[key]);
}
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

beforeAll(async () => {
  for (const [k, role] of [["ag", "agent"], ["ag2", "agent"], ["ag3", "agent"], ["adm", "admin"], ["oA", "organizer"], ["oB", "organizer"], ["oC", "organizer"], ["oGone", "organizer"], ["oOther", "organizer"]] as const) {
    P[k] = await insertProfile({ role, displayName: `MCPG ${k} ${ts}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  // 主催者の担当・登録状況・口座
  await testAdmin.from("profiles").update({ responsible_agent_id: P.ag, organizer_name: `あ主催 ${ts}`, organization_name: "あ団体", status: "active", stripe_connect_id: `acct_mcpg_a_${ts}`, verification_status: "verified" }).eq("profile_id", P.oA);
  await testAdmin.from("profiles").update({ responsible_agent_id: P.ag, organizer_name: `い主催 ${ts}`, status: "pending_terms", verification_status: "pending", balance_frozen: true, chargeback_count: 2 }).eq("profile_id", P.oB);
  await testAdmin.from("profiles").update({ responsible_agent_id: P.ag, organizer_name: `う主催 ${ts}`, status: "pending_onboarding" }).eq("profile_id", P.oC);
  await testAdmin.from("profiles").update({ responsible_agent_id: P.ag, organizer_name: `削除主催 ${ts}`, deleted_at: new Date().toISOString() }).eq("profile_id", P.oGone);
  await testAdmin.from("profiles").update({ responsible_agent_id: P.ag2, organizer_name: `別担当主催 ${ts}` }).eq("profile_id", P.oOther);

  // 開催実績（あ主催：公開済み・終了の2件）と、下書き群
  await event("aPast", "oA", "ag", "ended", -20);
  await event("aPub", "oA", "ag", "published", 5);
  await event("draftUnsent", "oB", "ag", "draft", 10);
  await markProxyDraft(testAdmin, { eventId: ev.draftUnsent, creatorId: P.ag, organizerId: P.oB });
  await event("draftSent", "oC", "ag", "draft", 11);
  const { data: n } = await testAdmin.from("notifications").insert({ profile_id: P.oC, type: "proxy_event_created", title: "確認", body: "", metadata: { event_id: ev.draftSent, created_by: P.ag }, created_at: at(1) }).select("notification_id").single();
  void n;
  await event("draftByOrg", "oA", "ag", "draft", 12);
  await event("selfOrganized", "ag", "ag", "draft", 13);
  await event("otherAgent", "oOther", "ag2", "draft", 14);

  // 代打
  const ins = async (event: string, from: string, to: string, status: string, requestedDaysAgo: number, respondedDaysAgo: number | null) => {
    const { data, error } = await testAdmin.from("event_agent_handoffs").insert({ event_id: ev[event], from_agent_id: P[from], to_agent_id: P[to], status, requested_at: at(requestedDaysAgo), responded_at: respondedDaysAgo === null ? null : at(respondedDaysAgo) }).select("handoff_id").single();
    if (error) throw error;
    ids.handoffs.push(data.handoff_id);
  };
  await ins("aPast", "ag2", "ag", "accepted", 25, 24);
  await ins("aPub", "ag", "ag2", "pending", 1, null);
  await ins("otherAgent", "ag2", "ag3", "pending", 2, null);
}, 90_000);

afterAll(async () => {
  for (const s of sessions) await s.close();
  await testAdmin.from("event_agent_handoffs").delete().in("handoff_id", ids.handoffs);
  await testAdmin.from("notifications").delete().in("type", ["proxy_event_draft", "proxy_event_created"]).in("metadata->>event_id", ids.events);
  await cleanupTestData({ eventIds: ids.events });
  await testAdmin.from("profiles").update({ responsible_agent_id: null }).in("profile_id", ids.profiles);
  await deleteAuthUsers(ids.profiles);
}, 90_000);

const start = (k: string) => testAdmin.from("events").select("start_at").eq("event_id", ev[k]).single().then((r) => r.data!.start_at as string);

describe("TC-CHEERY-MCP-AGT: agent_organizers", () => {
  it("担当の主催者だけを名前順に、照会画面と同じ表示名で返す（削除済み・別担当は出さない）", async () => {
    expect(await call(await mcpAs("ag", "agent"), "agent_organizers")).toBe([
      "担当している主催者 3人（3人を表示）",
      `1. あ主催 ${ts}`,
      "  - 団体名: あ団体",
      "  - 登録状況: 承認済み",
      "  - 口座登録: 登録あり",
      "  - 口座審査: 承認済み",
      "  - 開催実績: 2件",
      `  - 直近の開催: MCPG aPub ${ts}（${jstDateTime(await start("aPub"))}・公開済み）`,
      `2. い主催 ${ts}`,
      "  - 登録状況: 規約未同意",
      "  - 口座登録: 未登録",
      "  - 口座審査: 審査中",
      "  - 残高凍結: 凍結中",
      "  - チャージバック: 2件",
      "  - 開催実績: 0件",
      `3. う主催 ${ts}`,
      "  - 登録状況: Stripe未完了",
      "  - 口座登録: 未登録",
      "  - 口座審査: 未申請",
      "  - 開催実績: 0件",
    ].join("\n"));
  });

  it("Stripe のアカウントIDは返さない。運営には別担当の主催者も出る", async () => {
    expect((await call(await mcpAs("ag", "agent"), "agent_organizers")).includes("acct_mcpg")).toBe(false);
    // 共有のローカルDBには他のテストの主催者もいるため、人数を DB と完全一致で確かめる（削除済みは数えない）
    const { count } = await testAdmin.from("profiles").select("profile_id", { count: "exact", head: true })
      .eq("role", "organizer").not("responsible_agent_id", "is", null).is("deleted_at", null);
    const all = await call(await mcpAs("adm", "admin"), "agent_organizers");
    expect(all.split("\n")[0]).toBe(`担当している主催者 ${count}人（${Math.min(15, count!)}人を表示）`);
    expect(count! >= 4).toBe(true); // 少なくともこのテストの4人（AG担当3人＋別担当1人）
  });

  it("担当の主催者がいなければその旨", async () => {
    expect(await call(await mcpAs("ag3", "agent"), "agent_organizers")).toBe("担当している主催者はいません。");
  });
});

describe("TC-CHEERY-MCP-AGT: agent_handoffs", () => {
  it("自分が依頼した・自分に来た依頼だけを、返事待ちを先に返す", async () => {
    expect(await call(await mcpAs("ag", "agent"), "agent_handoffs")).toBe([
      "代打の依頼 2件（返事待ち 1件・うちあなた宛て 0件。2件を表示）",
      `1. MCPG aPub ${ts}`,
      `  - 開催: ${jstDateTime(await start("aPub"))}`,
      "  - イベントの状態: 公開済み",
      `  - 向き: あなた → MCPG ag2 ${ts}`,
      "  - 状況: 返事待ち",
      `  - 依頼日時: ${jstDateTime(at(1))}`,
      `2. MCPG aPast ${ts}`,
      `  - 開催: ${jstDateTime(await start("aPast"))}`,
      "  - イベントの状態: 終了",
      `  - 向き: MCPG ag2 ${ts} → あなた`,
      "  - 状況: 承諾",
      `  - 依頼日時: ${jstDateTime(at(25))}`,
      `  - 返事の日時: ${jstDateTime(at(24))}`,
    ].join("\n"));
  });

  it("依頼先から見ると「あなた宛て」に数える", async () => {
    expect((await call(await mcpAs("ag3", "agent"), "agent_handoffs")).split("\n")[0]).toBe("代打の依頼 1件（返事待ち 1件・うちあなた宛て 1件。1件を表示）");
  });
});

describe("TC-CHEERY-MCP-AGT: agent_proxy_drafts", () => {
  it("担当・主催者が別・下書きのイベントだけを新しい順に、送信状況つきで返す", async () => {
    expect(await call(await mcpAs("ag", "agent"), "agent_proxy_drafts")).toBe([
      "担当イベントの下書き 3件（代理作成の未送信 1件・送信済み 1件。3件を表示）",
      `1. MCPG draftByOrg ${ts}`,
      `  - 主催者: あ主催 ${ts}`,
      `  - 開催: ${jstDateTime(await start("draftByOrg"))}`,
      "  - 状況: 主催者が作成中の下書き",
      `2. MCPG draftSent ${ts}`,
      `  - 主催者: う主催 ${ts}`,
      `  - 開催: ${jstDateTime(await start("draftSent"))}`,
      `  - 状況: 代理作成・主催者に送信済み（${jstDateTime(at(1))}）。主催者の承認依頼待ち`,
      `3. MCPG draftUnsent ${ts}`,
      `  - 主催者: い主催 ${ts}`,
      `  - 開催: ${jstDateTime(await start("draftUnsent"))}`,
      "  - 状況: 代理作成・主催者に未送信（主催者からはまだ見えない）",
    ].join("\n"));
  });
});

describe("TC-CHEERY-MCP-AGT: 登録するロール", () => {
  it("オーガナイザーにはエージェント向けの3本を渡さない", async () => {
    const s = await mcpAs("oA", "organizer");
    expect(s.tools.filter((t) => t.name.startsWith("agent_")).map((t) => t.name)).toEqual([]);
  });
});
