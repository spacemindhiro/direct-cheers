/**
 * TC-CHEERY-MCP-MSG: MCP ツール my_conversations・read_conversation（本人が当事者のメッセージ。requirements.md 7.3）
 *
 * アクセス範囲表（本人のセッション＝RLS で読む。メッセージ画面の /api/messages と同じ）
 * | 会話                     | 本人U | 出すか |
 * |--------------------------|-------|--------|
 * | U と A のダイレクト        | 当事者 | ○      |
 * | U と B の出演依頼（イベント付き） | 当事者 | ○ |
 * | A と B の会話              | 当事者でない | ×（一覧に出ず、名前で指定しても見つからない） |
 *
 * 決まり
 * - 本文の電話番号・メールアドレス・長い番号は伏せ字にしてから返す（外部のAIに渡すため）
 * - 読んでも既読にしない（last_read_at を変えない）
 * - 直近 limit 件を古い順に。全体の件数も添える
 * - システムのお知らせは「お知らせ」、本人の発言は「あなた」
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin, cleanupTestData } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers, insertEvent } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { jstDateTime } from "@/lib/mcp/format";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const BASE = Date.now() - 2 * 24 * 60 * 60 * 1000;
const email = (k: string) => `mcpm-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const C: Record<string, string> = {};
const ids = { profiles: [] as string[], events: [] as string[], convs: [] as string[] };
const sessions: DcMcpSession[] = [];
const at = (min: number) => new Date(BASE + min * 60e3).toISOString();

async function mcpAs(key: string, role: string) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin });
  sessions.push(s);
  return s;
}
async function call(s: DcMcpSession, name: string, input: Record<string, unknown> = {}) {
  const r = await s.tools.find((t) => t.name === name)!.run(input);
  expect(r.isError).toBe(false);
  return r.content;
}
async function conv(key: string, type: string, members: string[], updatedMin: number, extra: Record<string, unknown> = {}) {
  const { data, error } = await testAdmin.from("conversations").insert({ type, updated_at: at(updatedMin), ...extra }).select("conversation_id").single();
  if (error) throw error;
  C[key] = data.conversation_id;
  ids.convs.push(C[key]);
  const { error: e2 } = await testAdmin.from("conversation_participants").insert(members.map((m) => ({ conversation_id: C[key], profile_id: P[m], last_read_at: m === "u" ? at(10) : null })));
  if (e2) throw e2;
}
async function msg(key: string, sender: string | null, body: string, min: number, type = "text") {
  const { error } = await testAdmin.from("messages").insert({ conversation_id: C[key], sender_profile_id: sender ? P[sender] : null, body, message_type: type, created_at: at(min) });
  if (error) throw error;
}

beforeAll(async () => {
  for (const [k, role, name] of [["u", "organizer", "ユー"], ["a", "artist", "エー"], ["b", "artist", "ビー"]] as const) {
    P[k] = await insertProfile({ role, displayName: `${name}${ts}`, email: email(k) });
    ids.profiles.push(P[k]);
  }
  const ev = await insertEvent({ organizerProfileId: P.u, title: `MCPM 出演イベント ${ts}` });
  ids.events.push(ev);

  await conv("ua", "direct", ["u", "a"], 50);
  await msg("ua", "u", "こんにちは、来月の件です", 5);
  await msg("ua", "a", "電話は 090-1234-5678、メールは a@example.com です", 20);
  await msg("ua", "a", "口座は 1234567 です", 30);
  await msg("ua", null, "出演が確定しました", 40, "system");

  await conv("ub", "booking", ["u", "b"], 100, { event_id: ev });
  for (let i = 0; i < 35; i++) await msg("ub", i % 2 ? "b" : "u", `やり取り${i + 1}`, 20 + i);

  await conv("ab", "direct", ["a", "b"], 200);
  await msg("ab", "a", "ここだけの話", 30);
  // メッセージを入れると DB のトリガーで会話の更新日時が「今」になるため、最後に決まった値へ戻す
  for (const [k, min] of [["ua", 50], ["ub", 100], ["ab", 200]] as const) await testAdmin.from("conversations").update({ updated_at: at(min) }).eq("conversation_id", C[k]);
}, 90_000);

afterAll(async () => {
  for (const s of sessions) await s.close();
  await testAdmin.from("messages").delete().in("conversation_id", ids.convs);
  await testAdmin.from("conversation_participants").delete().in("conversation_id", ids.convs);
  await testAdmin.from("conversations").delete().in("conversation_id", ids.convs);
  await cleanupTestData({ eventIds: ids.events });
  await deleteAuthUsers(ids.profiles);
}, 90_000);

describe("TC-CHEERY-MCP-MSG: my_conversations", () => {
  it("本人が当事者の会話だけを新しい順に。未読は相手の発言のうち最後に読んだ後のもの。冒頭は伏せ字", async () => {
    expect(await call(await mcpAs("u", "organizer"), "my_conversations")).toBe([
      "メッセージの会話 2件（2件を表示。読むだけで既読にはしません）",
      `1. ビー${ts}`,
      "  - 種類: 出演依頼",
      `  - イベント: MCPM 出演イベント ${ts}`,
      `  - 最終更新: ${jstDateTime(at(100))}`,
      "  - 未読: 17件",
      "  - 最新: あなた「やり取り35」",
      `2. エー${ts}`,
      "  - 種類: ダイレクト",
      `  - 最終更新: ${jstDateTime(at(50))}`,
      "  - 未読: 2件",
      "  - 最新: 相手「出演が確定しました」",
    ].join("\n"));
  });
});

describe("TC-CHEERY-MCP-MSG: read_conversation", () => {
  it("相手の名前で選び、古い順に。電話番号・メール・長い番号は伏せ字、お知らせ・あなたの区別", async () => {
    expect(await call(await mcpAs("u", "organizer"), "read_conversation", { with: `エー${ts}` })).toBe([
      `エー${ts} との会話（ダイレクト）全4件のうち直近4件・古い順`,
      "※ 本人の依頼で読んだ内容。電話番号・メールアドレス等は伏せてある。返信は下書きまで（送るのは本人）",
      `- ${jstDateTime(at(5))} あなた：こんにちは、来月の件です`,
      `- ${jstDateTime(at(20))} エー${ts}：電話は [電話番号]、メールは [メールアドレス] です`,
      `- ${jstDateTime(at(30))} エー${ts}：口座は [番号] です`,
      `- ${jstDateTime(at(40))} お知らせ：出演が確定しました`,
    ].join("\n"));
  });

  it("イベント名でも選べる。直近 limit 件だけ（全体の件数も添える）", async () => {
    const text = await call(await mcpAs("u", "organizer"), "read_conversation", { with: `出演イベント ${ts}`, limit: 3 });
    expect(text.split("\n")[0]).toBe(`ビー${ts} との会話（出演依頼・MCPM 出演イベント ${ts}）全35件のうち直近3件・古い順`);
    expect(text.split("\n").slice(2).map((l) => l.split("：")[1])).toEqual(["やり取り33", "やり取り34", "やり取り35"]);
  });

  it("当事者でない会話は見つからない", async () => {
    expect(await call(await mcpAs("u", "organizer"), "read_conversation", { with: "ここだけ" })).toBe("「ここだけ」に当てはまる、あなたが参加している会話は見つかりませんでした。");
    expect((await call(await mcpAs("a", "artist"), "my_conversations")).includes(`ビー${ts}`)).toBe(true); // A から見ると A-B の会話は見える
  });

  it("複数当たれば候補を返す", async () => {
    const text = await call(await mcpAs("u", "organizer"), "read_conversation", { with: `${ts}` });
    expect(text.split("\n")[0]).toBe(`「${ts}」に当てはまる会話が2件あります。相手の名前やイベント名をもう少し詳しく指定してください。`);
  });

  it("読んでも既読にしない", async () => {
    await call(await mcpAs("u", "organizer"), "read_conversation", { with: `エー${ts}` });
    const { data } = await testAdmin.from("conversation_participants").select("last_read_at").eq("conversation_id", C.ua).eq("profile_id", P.u).single();
    expect(new Date(data!.last_read_at).toISOString()).toBe(at(10));
  });
});
