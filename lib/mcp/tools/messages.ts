// my_conversations・read_conversation：本人が当事者のメッセージ（requirements.md 7.3）。
//   - 本人が頼んだときだけ使う（要約・返信案の材料）。返信は下書きまでで、送るのは本人。結果は本人にだけ返し、保存しない
//   - 本人のセッション（RLS）で読む＝当事者でない会話は DB が返さない（メッセージ画面の /api/messages と同じ）
//   - 本文は外部のAIに渡す前に伏せ字にする（電話番号・メールアドレス・長い番号：lib/ai/mask.ts）
//   - 読んでも既読にしない（画面の未読表示を変えない）
// 返さないもの：相手の連絡先・内部ID
import { z } from "zod";
import { maskSensitive } from "@/lib/ai/mask";
import type { DcMcpContext } from "../context";
import { jstDateTime, lines } from "../format";

const ONLY_WHEN_ASKED = "本人がメッセージの確認・要約・返信の下書きをはっきり頼んだときだけ使う（それ以外の質問の材料集めには使わない）。";

export const MY_CONVERSATIONS = {
  name: "my_conversations",
  minRole: "user",
  title: "メッセージの一覧",
  description: `${ONLY_WHEN_ASKED}この人が参加しているメッセージの会話を新しい順に返す。相手の名前・会話の種類（出演依頼／ダイレクト／担当エージェントとの連絡）・関係するイベント・最終更新・未読の数・最新メッセージの冒頭。中身を読むときは read_conversation。`,
  inputSchema: {
    limit: z.number().int().min(1).max(20).optional().describe("返す件数（既定10）"),
  },
} as const;

export const READ_CONVERSATION = {
  name: "read_conversation",
  minRole: "user",
  title: "メッセージを読む",
  description: `${ONLY_WHEN_ASKED}この人が参加している会話を1つ選んで、直近のメッセージを古い順に返す（要約・返信の下書きの材料）。会話は相手の名前かイベント名の一部で指定する（候補が複数なら一覧を返す）。返信は下書きを示すまでにし、送るのは本人がメッセージ画面で行う。`,
  inputSchema: {
    with: z.string().min(1).max(100).describe("相手の名前、またはイベント名の一部"),
    limit: z.number().int().min(1).max(100).optional().describe("読むメッセージの数（直近から。既定30）"),
  },
} as const;

const TYPE_LABEL: Record<string, string> = { booking: "出演依頼", direct: "ダイレクト", agent: "担当エージェントとの連絡" };

type Conv = { id: string; type: string; updatedAt: string; lastReadAt: string | null; eventTitle: string | null; other: string };

async function myConversations(ctx: DcMcpContext): Promise<Conv[]> {
  const { data: rows, error } = await ctx.supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at, conversation:conversations!conversation_id(conversation_id, type, updated_at, event:events!event_id(title), event_artist:event_artists!event_artist_id(event:events!event_id(title)))")
    .eq("profile_id", ctx.userId);
  if (error) throw new Error("conversations");
  const list = (rows ?? []) as unknown as {
    conversation_id: string;
    last_read_at: string | null;
    conversation: { type: string; updated_at: string; event: { title: string } | null; event_artist: { event: { title: string } | null } | null } | null;
  }[];
  if (list.length === 0) return [];
  // 相手の名前（他人の profiles は RLS で読めないため、本人が参加している会話の参加者に限って service_role で読む）
  const { data: others } = await ctx.admin
    .from("conversation_participants")
    .select("conversation_id, profile:profiles!profile_id(display_name)")
    .in("conversation_id", list.map((r) => r.conversation_id))
    .neq("profile_id", ctx.userId);
  const otherName = new Map<string, string>();
  for (const o of (others ?? []) as unknown as { conversation_id: string; profile: { display_name: string | null } | null }[]) {
    const prev = otherName.get(o.conversation_id);
    const n = o.profile?.display_name ?? "（名前未設定）";
    otherName.set(o.conversation_id, prev ? `${prev}・${n}` : n);
  }
  return list
    .filter((r) => r.conversation)
    .map((r) => ({
      id: r.conversation_id,
      type: r.conversation!.type,
      updatedAt: r.conversation!.updated_at,
      lastReadAt: r.last_read_at,
      eventTitle: r.conversation!.event?.title ?? r.conversation!.event_artist?.event?.title ?? null,
      other: otherName.get(r.conversation_id) ?? "（相手なし）",
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export async function listConversations(ctx: DcMcpContext, input: { limit?: number }): Promise<string> {
  const limit = input.limit ?? 10;
  const convs = await myConversations(ctx);
  if (convs.length === 0) return "メッセージの会話はありません。";
  const shown = convs.slice(0, limit);
  const body: string[] = [];
  for (const [i, c] of shown.entries()) {
    let unread = ctx.supabase.from("messages").select("message_id", { count: "exact", head: true }).eq("conversation_id", c.id).neq("sender_profile_id", ctx.userId);
    if (c.lastReadAt) unread = unread.gt("created_at", c.lastReadAt);
    const [{ count }, { data: last }] = await Promise.all([
      unread,
      ctx.supabase.from("messages").select("body, sender_profile_id, created_at").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const preview = last ? maskSensitive(String(last.body ?? "")).replace(/\s+/g, " ").slice(0, 40) : null;
    body.push(lines(`${i + 1}. ${c.other}`, [
      ["種類", TYPE_LABEL[c.type] ?? c.type],
      ["イベント", c.eventTitle],
      ["最終更新", jstDateTime(c.updatedAt)],
      ["未読", `${count ?? 0}件`],
      ["最新", preview ? `${last!.sender_profile_id === ctx.userId ? "あなた" : "相手"}「${preview}${String(last!.body ?? "").length > 40 ? "…" : ""}」` : null],
    ]));
  }
  return [`メッセージの会話 ${convs.length}件（${shown.length}件を表示。読むだけで既読にはしません）`, ...body].join("\n");
}

export async function readConversation(ctx: DcMcpContext, input: { with: string; limit?: number }): Promise<string> {
  const q = input.with.trim();
  const limit = input.limit ?? 30;
  const convs = await myConversations(ctx);
  const hits = convs.filter((c) => c.other.includes(q) || (c.eventTitle ?? "").includes(q));
  if (hits.length === 0) return `「${q}」に当てはまる、あなたが参加している会話は見つかりませんでした。`;
  if (hits.length > 1) {
    const exact = hits.filter((c) => c.other === q || c.eventTitle === q);
    if (exact.length !== 1) {
      return [
        `「${q}」に当てはまる会話が${hits.length}件あります。相手の名前やイベント名をもう少し詳しく指定してください。`,
        ...hits.slice(0, 5).map((c, i) => `${i + 1}. ${c.other}（${TYPE_LABEL[c.type] ?? c.type}${c.eventTitle ? `・${c.eventTitle}` : ""}・${jstDateTime(c.updatedAt)}）`),
      ].join("\n");
    }
    hits.splice(0, hits.length, exact[0]);
  }
  const c = hits[0];
  const { data, error } = await ctx.supabase
    .from("messages")
    .select("body, sender_profile_id, message_type, created_at")
    .eq("conversation_id", c.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("messages");
  const msgs = (data ?? []).reverse();
  const { count } = await ctx.supabase.from("messages").select("message_id", { count: "exact", head: true }).eq("conversation_id", c.id);
  const who = (m: { sender_profile_id: string | null; message_type: string }) =>
    m.message_type === "system" ? "お知らせ" : m.sender_profile_id === ctx.userId ? "あなた" : c.other;
  return [
    `${c.other} との会話（${TYPE_LABEL[c.type] ?? c.type}${c.eventTitle ? `・${c.eventTitle}` : ""}）全${count ?? msgs.length}件のうち直近${msgs.length}件・古い順`,
    "※ 本人の依頼で読んだ内容。電話番号・メールアドレス等は伏せてある。返信は下書きまで（送るのは本人）",
    ...msgs.map((m) => `- ${jstDateTime(m.created_at)} ${who(m)}：${maskSensitive(String(m.body ?? ""))}`),
  ].join("\n");
}
