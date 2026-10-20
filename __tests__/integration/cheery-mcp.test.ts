/* eslint-disable @typescript-eslint/no-explicit-any -- テストデータの行を最小限の形で扱うため */
/**
 * TC-CHEERY-MCP: DC の MCP サーバー（チアリー(AI) が DC のデータに触る唯一の入口）
 *
 * 実際に各ロールでログインした接続（RLSが効く）を渡し、MCP の tools/list・tools/call を通して確かめる。
 *
 * アクセス範囲表
 * | 関係者                         | 状態                         | my_tickets | my_events |
 * |--------------------------------|------------------------------|------------|-----------|
 * | 本人（チケットの持ち主）         | holder=本人                  | ○          | ―         |
 * | 本人（登録前のゲスト購入）       | holder=NULL・メール一致       | ○          | ―         |
 * | 別人                           | holder=別人（メールは本人と同じ）| ×        | ―         |
 * | 主催者                         | 自分の公開済みイベント         | ―          | ○（売上・証跡・期限） |
 * | 主催者                         | 代理作成・未送信の下書き       | ―          | ×         |
 * | 代理作成したエージェント        | 同上                         | ―          | ○         |
 * | 主催者                         | 削除済みイベント               | ―          | ×         |
 * | 主催者                         | 他の主催者のイベント           | ―          | ×         |
 * | 担当でない別のエージェント      | 他人の担当イベント             | ―          | ×         |
 * | 一般ユーザー・アーティスト      | ―                            | ○          | ×（ツール自体が無い） |
 * （my_lineups・my_payout_balance の表は cheery-mcp-artist.test.ts）
 * 返さない項目：チケットのコード（入場用QRの値）・お客様のメールアドレス・内部ID
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent, insertProduct, insertQrConfig, insertTransaction, insertTicket, insertEventEvidence } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { markProxyDraft } from "@/lib/proxy-draft";
import { jstDateTime } from "@/lib/mcp/format";
import { AUTH_EXPIRE_DAYS } from "@/lib/settlement-deadline";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;

const ids = { profiles: [] as string[], events: [] as string[], products: [] as string[], qrs: [] as string[], txs: [] as string[], tickets: [] as string[], evidences: [] as string[] };
const email = (k: string) => `mcp-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
let E1: string, E2: string, E3: string, E4: string, E5: string;
let secretCode: string;

async function signedIn(e: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: e, password: "TestPass123!" });
  if (error) throw error;
  return c;
}

const sessions: DcMcpSession[] = [];
async function mcpAs(key: string, role: string): Promise<DcMcpSession> {
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: await signedIn(email(key)), admin: testAdmin, now: NOW });
  sessions.push(s);
  return s;
}
async function call(s: DcMcpSession, name: string, input: Record<string, unknown> = {}) {
  const tool = s.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`ツールが無い: ${name}`);
  return tool.run(input);
}

beforeAll(async () => {
  for (const [k, role] of [["orgA", "organizer"], ["orgB", "organizer"], ["agentG", "agent"], ["agentH", "agent"], ["artist", "artist"], ["user", "user"], ["other", "user"]] as const) {
    P[k] = await insertProfile({ role, displayName: `MCP ${k}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  const start = new Date(NOW.getTime() + 2 * DAY), end = new Date(NOW.getTime() + 2 * DAY + 4 * 60 * 60 * 1000);
  // E1：主催A・担当G・公開済み（売上2件＋取消1件、証跡あり）
  E1 = await insertEvent({ organizerProfileId: P.orgA, agentId: P.agentG, title: `MCP E1 公開 ${ts}`, startAt: start, endAt: end });
  // E2：主催A名義で G が代理作成・未送信の下書き
  E2 = await insertEvent({ organizerProfileId: P.orgA, agentId: P.agentG, title: `MCP E2 代理下書き ${ts}`, startAt: start, endAt: end });
  await testAdmin.from("events").update({ lifecycle_status: "draft" }).eq("event_id", E2);
  await markProxyDraft(testAdmin, { eventId: E2, creatorId: P.agentG, organizerId: P.orgA });
  // E3：他の主催者B（担当はH）
  E3 = await insertEvent({ organizerProfileId: P.orgB, agentId: P.agentH, title: `MCP E3 他人 ${ts}`, startAt: start, endAt: end });
  // E4：主催Aの削除済み
  E4 = await insertEvent({ organizerProfileId: P.orgA, agentId: P.agentG, title: `MCP E4 削除済み ${ts}`, startAt: start, endAt: end });
  await testAdmin.from("events").update({ deleted_at: new Date().toISOString() }).eq("event_id", E4);
  // E5：主催Aの精算済み（過去）
  E5 = await insertEvent({ organizerProfileId: P.orgA, agentId: P.agentG, title: `MCP E5 精算済み ${ts}`, startAt: new Date(NOW.getTime() - 20 * DAY), endAt: new Date(NOW.getTime() - 20 * DAY + 3600e3) });
  await testAdmin.from("events").update({ lifecycle_status: "settled" }).eq("event_id", E5);
  ids.events.push(E1, E2, E3, E4, E5);

  const prod1 = await insertProduct({ eventId: E1, name: "前売券", type: "entrance", paymentType: "B", minAmount: 3000, maxAmount: 3000 });
  const prod3 = await insertProduct({ eventId: E3, name: "他人の券", type: "entrance", paymentType: "B", minAmount: 1000, maxAmount: 1000 });
  ids.products.push(prod1, prod3);
  const qr1 = await insertQrConfig({ eventId: E1, creatorProfileId: P.orgA, recipientProfileId: P.orgA, productId: prod1 });
  const qr3 = await insertQrConfig({ eventId: E3, creatorProfileId: P.orgB, recipientProfileId: P.orgB, productId: prod3 });
  ids.qrs.push(qr1, qr3);
  for (const [qr, gross, status] of [[qr1, 3000, "completed"], [qr1, 2000, "completed"], [qr1, 9000, "cancelled"], [qr3, 7777, "completed"]] as const) {
    ids.txs.push(await insertTransaction({ qrConfigId: qr, grossAmount: gross, netAmount: gross, stripeFee: 0, platformFee: 0, stripePaymentIntentId: `pi_mcp_${ts}_${ids.txs.length}`, status }));
  }
  ids.evidences.push(await insertEventEvidence({ eventId: E1, submittedByProfileId: P.orgA }));

  const t1 = await insertTicket({ eventId: E1, productId: prod1, holderProfileId: P.user, email: email("user"), quantity: 2 });
  secretCode = t1.ticketCode;
  const t2 = await insertTicket({ eventId: E3, productId: prod3, holderProfileId: null, email: email("user"), status: "used" });
  const t3 = await insertTicket({ eventId: E1, productId: prod1, holderProfileId: P.other, email: email("user") });
  ids.tickets.push(t1.ticketId, t2.ticketId, t3.ticketId);
}, 60_000);

afterAll(async () => {
  for (const s of sessions) await s.close().catch(() => {});
  await testAdmin.from("tickets").delete().in("ticket_id", ids.tickets);
  await testAdmin.from("notifications").delete().eq("type", "proxy_event_draft").filter("metadata->>event_id", "eq", E2);
  await cleanupTestData({ transactionIds: ids.txs, evidenceIds: ids.evidences, qrConfigIds: ids.qrs, eventIds: ids.events });
  await testAdmin.from("products").delete().in("product_id", ids.products);
  await deleteAuthUsers(ids.profiles);
});

describe("TC-CHEERY-MCP-A: ロールごとのツール一覧（tools/list）", () => {
  it("user は my_tickets だけ。artist は出演・出金も。organizer・agent は my_events も", async () => {
    expect((await mcpAs("user", "user")).tools.map((t) => t.name)).toEqual(["my_tickets", "my_account", "my_cheers"]);
    expect((await mcpAs("artist", "artist")).tools.map((t) => t.name)).toEqual(["my_tickets", "my_account", "my_cheers", "my_lineups", "my_payout_balance", "my_payout_history", "my_income"]);
    expect((await mcpAs("orgA", "organizer")).tools.map((t) => t.name)).toEqual(["my_tickets", "my_account", "my_cheers", "my_lineups", "my_payout_balance", "my_payout_history", "my_income", "my_events"]);
    expect((await mcpAs("agentG", "agent")).tools.map((t) => t.name)).toEqual(["my_tickets", "my_account", "my_cheers", "my_lineups", "my_payout_balance", "my_payout_history", "my_income", "my_events"]);
  });

  it("ツールの入力に「誰のデータか」を指定する項目が無い", async () => {
    const s = await mcpAs("orgA", "organizer");
    for (const t of s.tools) {
      const props = Object.keys((t.inputSchema as any).properties ?? {});
      expect(`${t.name}:${props.filter((p) => /profile|user|email|organizer|agent|id/i.test(p)).join(",")}`).toBe(`${t.name}:`);
    }
  });
});

describe("TC-CHEERY-MCP-B: my_tickets", () => {
  it("本人の持ち物と、登録前に同じメールで買った分だけ。別人の持ち物は出さない。コードは返さない", async () => {
    const r = await call(await mcpAs("user", "user"), "my_tickets");
    expect(r.isError).toBe(false);
    expect(r.content.startsWith("チケット 2件（新しい順に2件）")).toBe(true);
    expect(r.content.includes(`MCP E1 公開 ${ts}`)).toBe(true);
    expect(r.content.includes(`MCP E3 他人 ${ts}`)).toBe(true); // ゲスト購入分（holder なし・メール一致）
    expect(r.content.includes("  - 枚数: 2")).toBe(true);
    expect(r.content.includes("  - 状態: 入場済み（使用済み）")).toBe(true);
    expect(r.content.includes(secretCode)).toBe(false);
    expect(r.content.includes(email("user"))).toBe(false);
  });

  it("別人（holder=other）には other の持ち物だけ", async () => {
    const r = await call(await mcpAs("other", "user"), "my_tickets");
    expect(r.content.startsWith("チケット 1件（新しい順に1件）")).toBe(true);
  });

  it("チケットが無い人", async () => {
    expect((await call(await mcpAs("orgB", "organizer"), "my_tickets")).content).toBe("チケットはありません。");
  });
});

describe("TC-CHEERY-MCP-C: my_events", () => {
  it("主催者A：公開済みE1だけ（代理下書きE2・削除済みE4・他人のE3は出さない）。売上は完了分だけ・証跡・期限", async () => {
    const r = await call(await mcpAs("orgA", "organizer"), "my_events");
    const due = new Date(new Date((await testAdmin.from("events").select("start_at").eq("event_id", E1).single()).data!.start_at).getTime() + AUTH_EXPIRE_DAYS * DAY);
    const startAt = (await testAdmin.from("events").select("start_at, end_at").eq("event_id", E1).single()).data!;
    const days = Math.ceil((due.getTime() - NOW.getTime()) / DAY);
    expect(r.content).toBe([
      "これから・対応中のイベント 1件（1件を表示）",
      `1. MCP E1 公開 ${ts}`,
      "  - あなたとの関係: 主催",
      "  - 状態: 公開済み",
      `  - 開催: ${jstDateTime(startAt.start_at)} 〜 ${jstDateTime(startAt.end_at)}`,
      "  - 売上: 2件 ¥5,000（お客様の支払額の合計）",
      "  - 開催証跡: 提出済み",
      `  - 精算期限: ${jstDateTime(due.toISOString())}（あと${days}日）`,
    ].join("\n"));
  });

  it("代理作成したエージェントG：E1 と未送信の下書きE2 の両方", async () => {
    const r = await call(await mcpAs("agentG", "agent"), "my_events");
    expect(r.content.startsWith("これから・対応中のイベント 2件（2件を表示）")).toBe(true);
    expect(r.content.includes(`MCP E2 代理下書き ${ts}`)).toBe(true);
    expect(r.content.includes("  - あなたとの関係: 担当エージェント")).toBe(true);
    expect(r.content.includes(`MCP E3 他人 ${ts}`)).toBe(false);
    expect(r.content.includes(`MCP E4 削除済み ${ts}`)).toBe(false);
  });

  it("担当でないエージェントH：E3 だけ（Aのイベントは出さない）。売上はE3の分だけ", async () => {
    const r = await call(await mcpAs("agentH", "agent"), "my_events");
    expect(r.content.startsWith("これから・対応中のイベント 1件（1件を表示）")).toBe(true);
    expect(r.content.includes(`MCP E3 他人 ${ts}`)).toBe(true);
    expect(r.content.includes("  - 売上: 1件 ¥7,777（お客様の支払額の合計）")).toBe(true);
    expect(r.content.includes(`MCP E1 公開 ${ts}`)).toBe(false);
  });

  it("past：精算済みE5（期限は出さない）", async () => {
    const r = await call(await mcpAs("orgA", "organizer"), "my_events", { scope: "past" });
    expect(r.content.startsWith("終了のイベント 1件（1件を表示）")).toBe(true);
    expect(r.content.includes(`MCP E5 精算済み ${ts}`)).toBe(true);
    expect(r.content.includes("  - 状態: 精算済み")).toBe(true);
    expect(r.content.includes("精算期限")).toBe(false);
  });

  it("入力が型に合わなければ実行しない（MCPサーバー側の検査）", async () => {
    const s = await mcpAs("orgA", "organizer");
    expect(await call(s, "my_events", { scope: "all" })).toEqual({ content: "入力の形式が正しくありません", isError: true });
    expect(await call(s, "my_events", { limit: 1000 })).toEqual({ content: "入力の形式が正しくありません", isError: true });
  });

  it("artist・user のセッションには my_events が無い（呼べない）", async () => {
    const s = await mcpAs("artist", "artist");
    expect(s.tools.some((t) => t.name === "my_events")).toBe(false);
  });
});
