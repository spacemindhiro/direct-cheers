// イベントの下書きのツール（organizer 以上。イベント作成画面と同じ範囲）。
//   読み取り（AI に渡す）：prepare_event_draft
//     名義・会場・日時・出演者を確かめて、確認カードを出す。下書きは作らない
//   書き込み（AI に渡さない。本人がカードの［下書きを作る］を押したときに /api/cheery/action から呼ぶ）：create_event_draft
// 名義に選べる主催者・出演者に選べる人は作成画面と同じ（lib/events/create-draft.ts・照会検索）。
// 照会検索はダッシュボードのパスキー確認（24時間）が済んでいるときだけ（directory/search と同じ判定。ctx.stepUpFresh）。
// AI に返すのは名前・会場名・日時だけ。profile_id・venue_id は _meta のカードにだけ入れる。
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { allowedTypes, searchDirectory } from "@/lib/directory";
import { connectedArtists, createEventDraft, proxyOrganizerOptions } from "@/lib/events/create-draft";
import { searchVenues } from "@/lib/venues";
import { claimCard, finishCard, releaseCard } from "@/lib/cheery/card-claim";
import { slotDecided, type EventDraftCard, type PerformerSlot } from "@/lib/cheery/cards";
import type { DcMcpContext } from "../context";
import { jstDateTime } from "../format";

export type DraftToolOutput = { text: string; cards?: EventDraftCard[] };

const MAX_OPTIONS = 5;
const JST_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// 日本時間の「2026-11-10T19:00」を UTC の ISO にする。形が違えば null
export function jstLocalToIso(s: string): string | null {
  const m = JST_LOCAL.exec(s.trim());
  if (!m) return null;
  const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`);
  if (Number.isNaN(t)) return null;
  const iso = new Date(t).toISOString();
  // 2月30日などの、ありえない日付を弾く（Date が繰り上げた日と一致しない）
  const back = new Date(t + 9 * 3600_000);
  if (back.getUTCDate() !== Number(m[3]) || back.getUTCMonth() + 1 !== Number(m[2])) return null;
  return iso;
}

export const PREPARE_EVENT_DRAFT = {
  name: "prepare_event_draft",
  minRole: "organizer",
  title: "イベントの下書きの確認カードを出す",
  description:
    "会話で聞き取ったイベントの内容（タイトル・会場・開始と終了の日時・名義・出演者）を確かめて、下書きの確認カードを本人に見せる。下書きは作らない（本人がカードの［下書きを作る］を押したときだけ作られる）。会場は会場マスタにある名前だけ使える（無ければ先に find_venue）。出演者は名前で探し、同じ名前が複数いればカードで本人が選ぶ。日時は日本時間で「YYYY-MM-DDTHH:mm」。年が言われていなければ、今日以降でいちばん近い日として本人に確かめる。",
  inputSchema: {
    title: z.string().min(1).max(100).describe("イベントのタイトル"),
    venue_name: z.string().min(1).max(100).describe("会場名（会場マスタにある名前）"),
    start: z.string().describe("開始（日本時間、例 2026-11-10T19:00）"),
    end: z.string().describe("終了（日本時間、例 2026-11-10T22:00）"),
    organizer_name: z.string().max(100).optional().describe("代理で作るときの名義の主催者名（エージェント・運営だけ。自分名義なら省く）"),
    performers: z.array(z.string().min(1).max(100)).max(20).optional().describe("出演者の名前"),
  },
} as const;

type PrepareInput = { title: string; venue_name: string; start: string; end: string; organizer_name?: string; performers?: string[] };

async function findPerformers(ctx: DcMcpContext, organizerId: string, query: string): Promise<Omit<PerformerSlot, "query">> {
  const q = query.trim().toLowerCase();
  const connected = (await connectedArtists(ctx.admin, organizerId))
    .filter((a) => a.display_name.toLowerCase().includes(q))
    .map((a) => ({ profile_id: a.profile_id, name: a.display_name, sub: null as string | null, connected: true }));
  const found = new Map(connected.map((a) => [a.profile_id, a]));
  if (ctx.stepUpFresh && allowedTypes(ctx.role).includes("artist")) {
    for (const r of await searchDirectory(ctx.admin, { types: ["artist"], q: query })) {
      if (!found.has(r.profile_id)) found.set(r.profile_id, { profile_id: r.profile_id, name: r.name, sub: r.sub, connected: false });
    }
  }
  const all = [...found.values()];
  const exact = all.filter((a) => a.name.toLowerCase() === q);
  // 名前が完全に同じ人がいれば、その人たちだけを候補にする。コネクション済みを先に
  const options = (exact.length > 0 ? exact : all)
    .sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name, "ja"))
    .slice(0, MAX_OPTIONS);
  return { exact: exact.length > 0, options };
}

export async function prepareEventDraft(ctx: DcMcpContext, input: PrepareInput): Promise<DraftToolOutput> {
  const { data: me } = await ctx.supabase.from("profiles").select("role, responsible_agent_id").eq("profile_id", ctx.userId).single();
  const role = me?.role ?? ctx.role;
  if (!["organizer", "agent", "admin"].includes(role)) return { text: "この人はイベントを作れません。" };
  if (role === "organizer" && !me?.responsible_agent_id) {
    return { text: "担当エージェントが決まっていないため、まだイベントを作れません。運営（support@direct-cheers.com）に担当エージェントの割り当てを依頼するよう案内してください。" };
  }

  // 名義
  let organizer: EventDraftCard["organizer"] = { profile_id: null, name: "自分" };
  const orgName = input.organizer_name?.trim();
  if (orgName && (role === "agent" || role === "admin")) {
    const options = await proxyOrganizerOptions(ctx.admin, role, ctx.userId);
    const exact = options.filter((o) => o.name === orgName);
    const partial = options.filter((o) => o.name.includes(orgName));
    // 担当外の主催者は「見つからない」とだけ返す（他人の担当かどうかも言わない）
    if (exact.length === 0 && partial.length === 0) return { text: `代理で作れる主催者の中に「${orgName}」は見つかりません。` };
    // 名義は完全に同じ名前の主催者が1人だけのときだけ決める。部分的に合うだけなら聞き返す（勝手に決めない）
    if (exact.length === 0) return { text: `「${orgName}」と完全に同じ名前の主催者はいません。候補：${partial.map((o) => o.name).join("、")}。どの主催者か本人に聞き返し、決まったらその名前どおりに organizer_name を入れて呼び直してください。` };
    if (exact.length > 1) return { text: `「${orgName}」という名前の主催者が${exact.length}人います。担当の主催者一覧（作成画面）で名義を選んで作ってもらってください。` };
    organizer = { profile_id: exact[0].profile_id, name: exact[0].name };
  }
  const organizerId = organizer.profile_id ?? ctx.userId;

  // 会場（会場マスタにある名前だけ）
  const venue = (await searchVenues(ctx.admin, input.venue_name.trim())).find((v) => v.name === input.venue_name.trim());
  if (!venue) return { text: `会場マスタに「${input.venue_name}」がありません。先に find_venue で会場を探して登録してください。` };

  // 日時
  const startAt = jstLocalToIso(input.start);
  const endAt = jstLocalToIso(input.end);
  if (!startAt || !endAt) return { text: "日時の形が正しくありません。日本時間の「YYYY-MM-DDTHH:mm」で指定してください。" };
  if (Date.parse(endAt) <= Date.parse(startAt)) return { text: "終了が開始より前（または同じ）になっています。本人に確かめてください。" };

  // 出演者
  const slots: PerformerSlot[] = [];
  const notes: string[] = [];
  for (const q of input.performers ?? []) {
    const { exact, options } = await findPerformers(ctx, organizerId, q);
    if (options.length === 0) {
      notes.push(`出演者「${q}」は見つかりませんでした${ctx.stepUpFresh ? "" : "（コネクション済みの中だけを探しました）"}。下書きを作った後、イベントの編集画面で検索して追加できます。`);
      continue;
    }
    const slot: PerformerSlot = { query: q, exact, options };
    slots.push(slot);
    // 決まりにしない出演者は、本人に聞き返す（勝手に決めない）
    if (!exact) notes.push(`出演者「${q}」と完全に同じ名前の人はいません。候補：${options.map((o) => o.name).join("、")}。どの人か（入れないか）本人に聞き返してください。カードでも選べます。`);
    else if (!slotDecided(slot)) notes.push(`出演者「${q}」と同じ名前の人が${options.length}人います（${options.map((o) => o.sub ? `${o.name}（${o.sub}）` : o.name).join("、")}）。どの人か本人に聞き返してください。カードでも選べます。`);
  }

  const card: EventDraftCard = {
    kind: "event_draft",
    card_id: randomUUID(),
    title: input.title.trim(),
    venue: { venue_id: venue.venue_id, name: venue.name, place: `${venue.prefecture}${venue.city}` },
    start_at: startAt,
    end_at: endAt,
    organizer,
    performers: slots,
  };
  const past = Date.parse(startAt) < Date.now() ? "（注意：開始が過去の日時です。本人に確かめてください）" : "";
  return {
    text: [
      "下書きの確認カードを出しました。本人が［下書きを作る］を押すまで作られません。作っても、承認依頼を送るまで誰にも届きません。",
      `- タイトル：${card.title}`,
      `- 会場：${venue.name}（${card.venue.place}）`,
      `- 開始：${jstDateTime(startAt)}${past}`,
      `- 終了：${jstDateTime(endAt)}`,
      `- 名義：${organizer.name}${organizer.profile_id ? "（代理。主催者に確認を依頼するまで主催者からは見えません）" : ""}`,
      `- 出演者：${slots.length > 0 ? slots.map((s) => (slotDecided(s) ? s.options[0].name : `${s.query}（本人が選ぶまで決まりません）`)).join("、") : "なし"}`,
      ...notes,
    ].join("\n"),
    cards: [card],
  };
}

// ── 書き込み（AI に渡さない）──────────────────────────────

export const CREATE_EVENT_DRAFT = {
  name: "create_event_draft",
  minRole: "organizer",
  title: "イベントの下書きを作る（本人の確認後）",
  description: "確認カードで本人が［下書きを作る］を押したときに、DC のサーバーが呼ぶ。AI には渡さない。",
  inputSchema: {
    card_id: z.string().uuid(),
    title: z.string().min(1).max(100),
    venue_id: z.string().uuid(),
    start_at: z.string(),
    end_at: z.string(),
    organizer_profile_id: z.string().uuid().nullable(),
    performer_ids: z.array(z.string().uuid()).max(20),
  },
} as const;

export type CreateDraftToolInput = {
  card_id: string; title: string; venue_id: string; start_at: string; end_at: string;
  organizer_profile_id: string | null; performer_ids: string[];
};

export type DraftWriteResult = { ok: true; eventId: string; title: string; already: boolean } | { ok: false; error: string };

export async function createEventDraftTool(ctx: DcMcpContext, input: CreateDraftToolInput): Promise<DraftWriteResult> {
  const { data: venue } = await ctx.admin.from("venues").select("venue_id, name").eq("venue_id", input.venue_id).is("deleted_at", null).maybeSingle();
  if (!venue) return { ok: false, error: "会場が見つかりません" };
  const claim = await claimCard(ctx.admin, input.card_id, ctx.userId, "event_draft");
  if (claim === "invalid") return { ok: false, error: "このカードは使えません" };
  if (!claim.fresh) {
    if (!claim.resultId) return { ok: false, error: "作成の途中です。少し待ってから会話を開き直してください" };
    const { data } = await ctx.admin.from("events").select("event_id, title").eq("event_id", claim.resultId).maybeSingle();
    return data ? { ok: true, eventId: data.event_id, title: data.title, already: true } : { ok: false, error: "作った下書きが見つかりません" };
  }
  // 中身の判定（ロール・担当エージェント・代理の範囲・出演者の資格・日時の前後・代理の下書きを隠す）は作成画面と同じ関数
  const r = await createEventDraft(ctx.supabase, ctx.admin, ctx.userId, {
    title: input.title,
    venue: venue.name,
    venue_id: venue.venue_id,
    start_at: input.start_at,
    end_at: input.end_at,
    artists: [...new Set(input.performer_ids)].map((id) => ({ profile_id: id, invite_message: null })),
    organizer_profile_id: input.organizer_profile_id,
  });
  if (!r.ok) {
    await releaseCard(ctx.admin, input.card_id);
    return { ok: false, error: r.error };
  }
  await finishCard(ctx.admin, input.card_id, r.eventId);
  return { ok: true, eventId: r.eventId, title: input.title, already: false };
}
