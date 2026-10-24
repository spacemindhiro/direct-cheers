// QR の編集のツール（organizer 以上。QR 詳細画面の編集と同じ範囲）。アクセス範囲表は knowhow/ai-concierge/p5-access-matrix.md の D 段
//   読み取り（AI に渡す）：prepare_qr_edit … 変える前と後を並べた確認カードを出す。QR は変えない
//   書き込み（AI に渡さない。本人がカードの［変更する］を押したときに /api/cheery/action から呼ぶ）：edit_qr
// チャットで変えられるのはラベル・金額・販売上限数（エントランス）・宛先と配分（決済がまだのときだけ）。
// 画像・色・タッチ決済・入場確定・まとめ買い・削除は画面を案内する。
// 編集画面・API より狭くしている所（2026-10-24 Hiro に報告済み）：
//   精算済み・中止・終了のイベントは変えない／決済があったあとは宛先も変えない（すでに払ったお客様の Wallet の販売者名が変わるため）／
//   宛先は配分先の中から／代理の下書き（未送信）は名義の主催者から見えない
// 判定と更新は編集 API と同じ関数（lib/qr/update-qr.ts）。AI に返すのは名前・金額だけで、ID は _meta のカードにだけ入れる。
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { claimCard, finishCard, releaseCard } from "@/lib/cheery/card-claim";
import { slotDecided, type QrEditCard, type QrPersonSlot } from "@/lib/cheery/cards";
import { qrCandidateEvent } from "@/lib/qr/candidates";
import { updateQr } from "@/lib/qr/update-qr";
import { LABEL_GUIDE, labelFromUser, labelSuggestions } from "@/lib/qr/label";
import { RECIPIENT_GUIDE } from "@/lib/qr/guide";
import { isProxyDraftHiddenFrom } from "@/lib/proxy-draft";
import { isEventEditable } from "@/lib/purchase-window";
import { pickOperableEvent } from "../event-pick";
import type { DcMcpContext } from "../context";
import { stripHonorific } from "./event-draft";
import { findQrPerson } from "./qr-create";

export type QrEditToolOutput = { text: string; cards?: QrEditCard[] };

const ORGANIZER_WORDS = ["主催者", "オーガナイザー"];
const TYPE_LABEL: Record<string, string> = { standard: "スタンダード", message: "メッセージ", entrance: "エントランス", custom: "カスタム" };
const yen = (n: number) => `¥${n.toLocaleString()}`;

export const PREPARE_QR_EDIT = {
  name: "prepare_qr_edit",
  minRole: "organizer",
  title: "QR の変更の確認カードを出す",
  description:
    "作ってある QR のラベル・金額・販売上限数（エントランス）・宛先と配分を変えるときに、変える前と後を並べた確認カードを本人に見せる。QR は変えない（本人がカードの［変更する］を押したときだけ変わる）。" +
    "QR は今のラベルで指定する。変えない項目は省く。宛先と配分は、その QR に決済がまだないときだけ変えられる。画像・色・タッチ決済・削除は画面を案内する。",
  inputSchema: {
    event: z.string().min(1).max(100).describe("イベント名"),
    qr: z.string().min(1).max(50).describe("変えたい QR の今のラベル"),
    new_label: z.string().min(1).max(50).optional().describe("新しいラベル。本人が「ラベルを〇〇に」と決めたときだけ、その文字を一字一句そのまま入れる。決まっていなければ省き、change_label を true にする"),
    change_label: z.boolean().optional().describe("ラベルを変えたいが、新しいラベルがまだ決まっていないとき true（カードで本人が決める）"),
    price: z.number().int().optional().describe("新しいワンプライスの金額（円）"),
    min_price: z.number().int().optional().describe("金額を選べるようにするときの新しい下限（円。スタンダード・メッセージだけ）"),
    max_price: z.number().int().optional().describe("新しい上限（円）"),
    stock_limit: z.number().int().min(1).max(100000).optional().describe("エントランスの新しい販売上限数"),
    recipient: z.string().min(1).max(100).optional().describe("新しい宛先の名前（必ず1人。お客様の支払い画面とカード明細に出る販売者の名前）。本人が決めたときだけ"),
    targets: z.array(z.object({ name: z.string().min(1).max(100), percent: z.number().min(0).max(100) })).max(10).optional().describe("新しい配分先と割合（%）。変えるときだけ。宛先も必ず含める"),
  },
} as const;

type PrepareInput = {
  event: string; qr: string; new_label?: string; change_label?: boolean;
  price?: number; min_price?: number; max_price?: number; stock_limit?: number;
  recipient?: string; targets?: { name: string; percent: number }[];
};

type QrRow = {
  qr_config_id: string; label: string | null; recipient_profile_id: string; recipient_name_context: string;
  product: { type: string; payment_type: string | null; min_amount: number; max_amount: number; stock_limit: number | null; sold_count: number } | null;
};

async function eventQrs(ctx: DcMcpContext, eventId: string): Promise<QrRow[]> {
  const { data } = await ctx.admin
    .from("qr_configs")
    .select("qr_config_id, label, recipient_profile_id, recipient_name_context, product:products(type, payment_type, min_amount, max_amount, stock_limit, sold_count)")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .eq("is_welcome_cheer_default", false);
  return (data ?? []) as unknown as QrRow[];
}

const hasPayments = async (ctx: DcMcpContext, qrConfigId: string) =>
  ((await ctx.admin.from("transactions").select("transaction_id", { count: "exact", head: true }).eq("qr_config_id", qrConfigId)).count ?? 0) > 0;

export async function prepareQrEdit(ctx: DcMcpContext, input: PrepareInput): Promise<QrEditToolOutput> {
  const picked = await pickOperableEvent(ctx, input.event);
  if ("message" in picked) return { text: picked.message };
  const ev = await qrCandidateEvent(ctx.admin, picked.event.event_id);
  if (!ev) return { text: "イベントが見つかりません。" };
  if (!isEventEditable(ev.lifecycle_status, ev.end_at)) return { text: `「${ev.title}」は終わった（または中止の）イベントなので、チャットでは QR を変えません。` };

  // QR を今のラベルで探す（完全に同じラベルが1つなら決まり。それ以外は聞き返す）
  const qrs = await eventQrs(ctx, ev.event_id);
  const q = input.qr.trim();
  const exact = qrs.filter((r) => (r.label ?? "") === q);
  const partial = qrs.filter((r) => (r.label ?? "").includes(q));
  const list = qrs.map((r) => `「${r.label ?? "（ラベルなし）"}」`).join("、") || "なし";
  if (exact.length === 0 && partial.length !== 1) {
    return { text: partial.length > 1 ? `「${q}」に当たる QR が${partial.length}つあります（${partial.map((r) => `「${r.label}」`).join("、")}）。どれか本人に聞いてください。` : `「${ev.title}」に「${q}」という QR はありません。この イベントの QR：${list}。` };
  }
  if (exact.length > 1) return { text: `「${q}」というラベルの QR が${exact.length}つあります。QR 詳細画面で選んで変えてもらってください。` };
  const qr = exact[0] ?? partial[0];
  const product = qr.product;
  if (!product) return { text: "この QR は商品の情報が無いので、画面で変えてもらってください。" };
  const paid = await hasPayments(ctx, qr.qr_config_id);

  const { data: currentTargets } = await ctx.admin.from("qr_config_targets").select("profile_id, distribution_ratio").eq("qr_config_id", qr.qr_config_id).is("deleted_at", null);
  const nameOf = (id: string, role?: string) => ev.targets.find((c) => c.profile_id === id && (!role || c.role === role))?.display_name ?? "（イベントにいない人）";
  const current: QrEditCard["current"] = {
    label: qr.label,
    min_amount: product.min_amount,
    max_amount: product.max_amount,
    stock_limit: product.stock_limit,
    recipient: nameOf(qr.recipient_profile_id, qr.recipient_name_context),
    targets: (currentTargets ?? []).map((t) => ({ name: nameOf(t.profile_id as string), percent: Math.round(Number(t.distribution_ratio) * 1000) / 10 })),
  };

  const notes: string[] = [];
  const change: QrEditCard["change"] = {};

  // ラベル（QR 作成と同じ：本人の言葉だけ。決まっていなければカードで本人が決める）
  if (input.new_label !== undefined || input.change_label) {
    change.label = input.new_label !== undefined && labelFromUser(ctx.userTexts, input.new_label) ? input.new_label.trim() : null;
  }

  // 金額（範囲は product_type_configs。エントランスはワンプライスだけ）
  if (input.price != null || input.min_price != null || input.max_price != null) {
    let min: number, max: number;
    if (input.price != null) min = max = input.price;
    else if (input.min_price != null && input.max_price != null && product.type !== "entrance") {
      min = input.min_price; max = input.max_price;
      if (min % 100 !== 0 || max % 100 !== 0 || min >= max) return { text: "金額を選べるようにするときは、下限と上限を100円単位で、下限＜上限にしてください。" };
    } else return { text: product.type === "entrance" ? "エントランスの金額はワンプライスです。新しい金額を本人に聞いてください。" : "新しい金額（ワンプライスか、下限と上限）を本人に聞いてください。" };
    const { data: cfg } = await ctx.admin.from("product_type_configs").select("min_amount, max_amount").eq("type", product.type).maybeSingle();
    if (cfg && (min < cfg.min_amount || max > cfg.max_amount)) return { text: `${TYPE_LABEL[product.type] ?? product.type}の金額は${yen(cfg.min_amount)}〜${yen(cfg.max_amount)}の範囲です。本人に確かめてください。` };
    change.min_amount = min; change.max_amount = max;
  }

  // 販売上限数（エントランスだけ。販売済み数より下げない）
  if (input.stock_limit != null) {
    if (product.type !== "entrance") return { text: "販売上限数を変えられるのはエントランスの QR だけです。" };
    if (input.stock_limit < product.sold_count) return { text: `販売上限数は、すでに売れた${product.sold_count}枚より少なくできません。` };
    change.stock_limit = input.stock_limit;
  }

  // 宛先・配分（決済がまだのときだけ。宛先は配分先の中から）
  const people: QrPersonSlot[] = [];
  if (input.recipient || input.targets?.length) {
    if (paid) return { text: "この QR はもう決済があるので、宛先と配分は変えられません（すでに払ったお客様の明細・カードの販売者名が変わってしまうため）。変えたいときは新しい QR を作ってもらってください。" };
    const indexOf = (name: string, forRecipient: boolean) => {
      const n = stripHonorific(name);
      const i = people.findIndex((p) => p.query === n);
      if (i >= 0) return i;
      people.push(findQrPerson(ev.targets, n, forRecipient));
      return people.length - 1;
    };
    const recipientName = input.recipient ?? current.recipient;
    const recipient = indexOf(recipientName, true);
    const targets = input.targets?.length
      ? input.targets.map((t) => ({ person: indexOf(t.name, false), percent: t.percent }))
      : current.targets.map((t) => ({ person: indexOf(t.name, false), percent: t.percent }));
    const missing = people.filter((p) => p.options.length === 0);
    if (missing.length > 0) {
      const allNames = ev.targets.map((c) => (c.role === "organizer" ? `${c.display_name}（主催者）` : c.display_name)).join("、");
      return { text: `${missing.map((p) => `「${p.query}」`).join("")}は、このイベントの主催者・出演者にいません。選べるのは：${allNames}。` };
    }
    if (!targets.some((t) => t.person === recipient)) return { text: "宛先の人を配分先にも入れてください（宛先は配分を受け取る人の1人です）。配分も一緒に変えるか、本人に聞いてください。" };
    if (new Set(targets.map((t) => t.person)).size !== targets.length) return { text: "配分先に同じ人が2回入っています。" };
    const total = targets.reduce((s, t) => s + t.percent, 0);
    if (Math.abs(total - 100) > 0.1) return { text: `配分の合計が${total}%です。合計を100%にしてください。` };
    // 宛先を決まりにするのは、本人が名前を言っていて、配分先が1人か配分は変えないときだけ（QR 作成と同じ考え方）
    const q0 = people[recipient].query;
    const said = ORGANIZER_WORDS.includes(q0)
      ? [...ORGANIZER_WORDS, ev.targets.find((c) => c.role === "organizer")?.display_name ?? ""].some((w) => w && labelFromUser(ctx.userTexts, w))
      : labelFromUser(ctx.userTexts, q0);
    const recipientSaid = Boolean(input.recipient) && said && (targets.length === 1 || !input.targets?.length);
    change.recipient = { person: recipient, said: recipientSaid };
    change.targets = targets;
    for (const p of people) {
      if (!slotDecided(p)) notes.push(`「${p.query}」に当たる候補が複数あります（${p.options.map((o) => o.name).join("、")}）。どれか本人に聞き返してください。カードでも選べます。`);
    }
  }

  if (Object.keys(change).length === 0) return { text: "何を変えるか（ラベル・金額・販売上限数・宛先・配分）を本人に聞いてください。" };

  const card: QrEditCard = {
    kind: "qr_edit",
    card_id: randomUUID(),
    event: { event_id: ev.event_id, title: ev.title },
    qr_config_id: qr.qr_config_id,
    product_type: product.type,
    payment_type: product.payment_type,
    current,
    change,
    people,
  };
  const suggestions = labelSuggestions(product.type, product.payment_type, change.recipient && slotDecided(people[change.recipient.person]) ? people[change.recipient.person].options[0].name : current.recipient);
  const lines = [
    `「${qr.label ?? "（ラベルなし）"}」の変更の確認カードを出しました。本人が［変更する］を押すまで変わりません。`,
    ...(change.label !== undefined ? [change.label
      ? `- ラベル：${current.label ?? "なし"} → ${change.label}（本人の言葉。本人がカードで確かめて印を付けるまで変わりません）`
      : `- ラベル：${current.label ?? "なし"} → 未定（本人がカードで決めます。${LABEL_GUIDE}。${suggestions.length ? `候補：${suggestions.join("、")}。この候補を案として示し、` : ""}カードで選ぶか書いてもらってください。あなたは決めません）`] : []),
    ...(change.min_amount !== undefined ? [`- 金額：${current.min_amount === current.max_amount ? yen(current.min_amount) : `${yen(current.min_amount)}〜${yen(current.max_amount)}`} → ${change.min_amount === change.max_amount ? yen(change.min_amount) : `${yen(change.min_amount)}〜${yen(change.max_amount!)}`}（これからの決済だけに効きます）`] : []),
    ...(change.stock_limit !== undefined ? [`- 販売上限数：${current.stock_limit ?? "無制限"} → ${change.stock_limit}`] : []),
    ...(change.recipient ? [`- 宛先：${current.recipient} → ${change.recipient.said && slotDecided(people[change.recipient.person]) ? people[change.recipient.person].options[0].name : `未定（本人がカードで選びます。${RECIPIENT_GUIDE}。あなたは決めません）`}`] : []),
    ...(change.targets ? [`- 配分：${current.targets.map((t) => `${t.name} ${t.percent}%`).join("、")} → ${change.targets.map((t) => `${slotDecided(people[t.person]) ? people[t.person].options[0].name : people[t.person].query} ${t.percent}%`).join("、")}`] : []),
    ...notes,
    ...(change.label !== undefined || change.recipient ? ["ラベルや宛先を変えると、すでに買ったお客様の Wallet のカード・チケットにも新しい名前が出ます。本人にそう伝えてください。"] : []),
    "画像・色・タッチ決済・削除は、QR の詳細画面で変えてもらいます。",
  ];
  return { text: lines.join("\n"), cards: [card] };
}

// ── 書き込み（AI に渡さない）──────────────────────────────

export const EDIT_QR = {
  name: "edit_qr",
  minRole: "organizer",
  title: "QR を変える（本人の確認後）",
  description: "確認カードで本人が［変更する］を押したときに、DC のサーバーが呼ぶ。AI には渡さない。",
  inputSchema: {
    card_id: z.string().uuid(),
    qr_config_id: z.string().uuid(),
    label: z.string().min(1).max(50).optional(),
    min_amount: z.number().int().optional(),
    max_amount: z.number().int().optional(),
    stock_limit: z.number().int().min(1).max(100000).optional(),
    recipient_profile_id: z.string().uuid().optional(),
    recipient_name_context: z.enum(["organizer", "artist"]).optional(),
    targets: z.array(z.object({ profile_id: z.string().uuid(), distribution_ratio: z.number().min(0).max(1) })).min(1).max(10).optional(),
  },
} as const;

export type EditQrToolInput = {
  card_id: string; qr_config_id: string; label?: string; min_amount?: number; max_amount?: number; stock_limit?: number;
  recipient_profile_id?: string; recipient_name_context?: "organizer" | "artist"; targets?: { profile_id: string; distribution_ratio: number }[];
};

export type QrEditWriteResult = { ok: true; eventId: string; qrConfigId: string; label: string | null; already: boolean } | { ok: false; error: string };

function editErrorText(error: string): string {
  if (error === "Forbidden" || error === "Not found") return "この QR は変えられません";
  const range = /^Amount must be between (\d+) and (\d+)$/.exec(error);
  if (range) return `金額は${yen(Number(range[1]))}〜${yen(Number(range[2]))}の範囲にしてください`;
  return error;
}

export async function editQrTool(ctx: DcMcpContext, input: EditQrToolInput): Promise<QrEditWriteResult> {
  const { data: qr } = await ctx.admin.from("qr_configs").select("qr_config_id, event_id, label, recipient_profile_id, recipient_name_context").eq("qr_config_id", input.qr_config_id).is("deleted_at", null).maybeSingle();
  if (!qr) return { ok: false, error: "この QR は変えられません" };
  const { data: ev } = await ctx.admin.from("events").select("lifecycle_status, agent_id, end_at").eq("event_id", qr.event_id).maybeSingle();
  // 編集画面・API より狭くする所：終わったイベント・代理の下書き（未送信）の名義の主催者・決済のあとの宛先・配分先にいない宛先
  if (!ev || !isEventEditable(ev.lifecycle_status, ev.end_at)) return { ok: false, error: "終わった（または中止の）イベントの QR は、チャットでは変えません" };
  if (ctx.role !== "admin" && ev.agent_id !== ctx.userId && await isProxyDraftHiddenFrom(ctx.admin as never, qr.event_id, ctx.userId)) {
    return { ok: false, error: "この QR は変えられません" };
  }
  const recipientChanges = input.recipient_profile_id !== undefined || input.recipient_name_context !== undefined || input.targets !== undefined;
  if (recipientChanges && await hasPayments(ctx, qr.qr_config_id)) {
    return { ok: false, error: "この QR はもう決済があるので、宛先と配分は変えられません" };
  }
  if (recipientChanges) {
    const finalRecipient = input.recipient_profile_id ?? qr.recipient_profile_id;
    const finalTargets = input.targets?.map((t) => t.profile_id)
      ?? ((await ctx.admin.from("qr_config_targets").select("profile_id").eq("qr_config_id", qr.qr_config_id).is("deleted_at", null)).data ?? []).map((t) => t.profile_id as string);
    if (!finalTargets.includes(finalRecipient)) return { ok: false, error: "宛先を配分先に含めてください" };
    if (input.targets && new Set(input.targets.map((t) => t.profile_id)).size !== input.targets.length) return { ok: false, error: "配分先に同じ人が2回入っています" };
  }

  const claim = await claimCard(ctx.admin, input.card_id, ctx.userId, "qr_edit");
  if (claim === "invalid") return { ok: false, error: "このカードは使えません" };
  if (!claim.fresh) {
    if (!claim.resultId) return { ok: false, error: "変更の途中です。少し待ってから会話を開き直してください" };
    return { ok: true, eventId: qr.event_id, qrConfigId: qr.qr_config_id, label: qr.label, already: true };
  }
  // ラベルを変えるときは商品名（チケット・カード・メールの名前）も同じ文字にそろえる（作成時と同じ）
  const body: Record<string, unknown> = {
    ...(input.label !== undefined && { label: input.label.trim(), product_name: input.label.trim() }),
    ...(input.min_amount !== undefined && { min_amount: input.min_amount }),
    ...(input.max_amount !== undefined && { max_amount: input.max_amount }),
    ...(input.stock_limit !== undefined && { stock_limit: input.stock_limit }),
    ...(input.recipient_profile_id !== undefined && { recipient_profile_id: input.recipient_profile_id }),
    ...(input.recipient_name_context !== undefined && { recipient_name_context: input.recipient_name_context }),
    ...(input.targets !== undefined && { targets: input.targets }),
  };
  if (Object.keys(body).length === 0) {
    await releaseCard(ctx.admin, input.card_id);
    return { ok: false, error: "変える項目がありません" };
  }
  const r = await updateQr(ctx.supabase, ctx.userId, qr.qr_config_id, body);
  if (!r.ok) {
    await releaseCard(ctx.admin, input.card_id);
    return { ok: false, error: editErrorText(r.error) };
  }
  await finishCard(ctx.admin, input.card_id, qr.qr_config_id);
  return { ok: true, eventId: qr.event_id, qrConfigId: qr.qr_config_id, label: input.label?.trim() ?? qr.label, already: false };
}
