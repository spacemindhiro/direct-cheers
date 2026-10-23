// QR の作成のツール（organizer 以上。作成画面と同じ範囲）。
//   読み取り（AI に渡す）：prepare_qr
//     イベント・タイプ・金額・宛先・配分先を確かめて、確認カードを出す。QR は作らない
//   書き込み（AI に渡さない。本人がカードの［QRを作る］を押したときに /api/cheery/action から呼ぶ）：create_qr
// 最初の版で扱うのはスタンダード・メッセージ・エントランス A/B/C だけ（Hiro 決定 2026-10-23）。
// カスタム・ウェルカムチア・タッチ決済・入場確定・色・まとめ買い・画像のアップロードは作成画面を案内する（あとで足す）。
// 宛先・配分先に選べる人は作成画面と同じ（lib/qr/candidates.ts）。判定と作成は作成 API と同じ関数（lib/qr/create-qr.ts）。
// AI に返すのは名前・金額・日時だけ。event_id・profile_id・画像の URL は _meta のカードにだけ入れる。
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { claimCard, finishCard, releaseCard } from "@/lib/cheery/card-claim";
import { slotDecided, type QrCreateCard, type QrPersonOption, type QrPersonSlot } from "@/lib/cheery/cards";
import { qrCandidateEvent, type QrCandidate } from "@/lib/qr/candidates";
import { createQr } from "@/lib/qr/create-qr";
import { needsQrImage, organizerBalance, salesPeriodError, typeBReserveRequired } from "@/lib/qr/rules";
import { LABEL_GUIDE, labelFromUser, labelSuggestions } from "@/lib/qr/label";
import { IMAGE_RIGHTS_GUIDE, QR_AFTER_NOTES, RECIPIENT_GUIDE } from "@/lib/qr/guide";
import { getFeeConfig } from "@/lib/fee-config";
import { pickOperableEvent } from "../event-pick";
import type { DcMcpContext } from "../context";
import { jstDateTime } from "../format";
import { jstLocalToIso } from "./event-draft";

export type QrToolOutput = { text: string; cards?: QrCreateCard[] };

const QR_LIFECYCLES = ["draft", "review_requested", "published", "ongoing"];
const TYPE_LABEL = { standard: "スタンダード", message: "メッセージ", entrance: "エントランス" } as const;
const PAYMENT_LABEL = { A: "前売事後確定タイプ（5日前確定）", B: "前売即時確定タイプ（即時確定）", C: "当日決済タイプ" } as const;
// 主催者を名前でなく立場で言われたとき
const ORGANIZER_WORDS = ["主催者", "オーガナイザー"];

export const PREPARE_QR = {
  name: "prepare_qr",
  minRole: "organizer",
  title: "QR の確認カードを出す",
  description:
    "会話で聞き取った QR の内容（イベント・タイプ・金額・宛先・配分。ラベルは本人が決めたときだけ）を確かめて、確認カードを本人に見せる。QR は作らない（本人がカードの［QRを作る］を押したときだけ作られる）。" +
    "作れるのはスタンダード・メッセージ・エントランス（決済タイプ A/B/C）だけ。宛先・配分先はそのイベントの主催者と出演者（断った人を除く）だけで、名前で指定する（主催者は「主催者」でもよい）。" +
    "配分を言われていなければ宛先に100%。販売期間は日本時間で「YYYY-MM-DDTHH:mm」。",
  inputSchema: {
    event: z.string().min(1).max(100).describe("イベント名（本人が主催・担当するイベント）"),
    product_type: z.enum(["standard", "message", "entrance"]).describe("standard＝スタンダード、message＝メッセージ、entrance＝エントランス（入場チケット）"),
    label: z.string().min(1).max(50).optional().describe("ラベル（お客様の画面に出る唯一の名前）。本人が「ラベルは〇〇」と決めたときだけ、その文字を一字一句そのまま入れる。決まっていなければ省く（カードで本人が候補から選ぶか書く）。本人の発言にそのまま無い文字はカードに入らない"),
    price: z.number().int().optional().describe("ワンプライスの金額（円）。エントランスは必ずこれ"),
    min_price: z.number().int().optional().describe("金額を選べるようにするときの下限（円。スタンダード・メッセージだけ）"),
    max_price: z.number().int().optional().describe("金額を選べるようにするときの上限（円）"),
    payment_type: z.enum(["A", "B", "C"]).optional().describe("エントランスの決済タイプ。A＝前売事後確定（5日前確定）、B＝前売即時確定、C＝当日決済"),
    stock_limit: z.number().int().min(1).max(100000).optional().describe("エントランスの販売上限数（B は必須。A・C は言われたときだけ）"),
    sales_start: z.string().optional().describe("前売り（A/B）の販売開始（日本時間、例 2026-11-01T10:00）"),
    sales_end: z.string().optional().describe("前売り（A/B）の販売終了（日本時間）"),
    recipient: z.string().min(1).max(100).describe("宛先の名前。必ず1人。お客様の支払い画面とカード明細に出る販売者の名前。本人が決めた人だけ入れる（本人が言っていない人はカードで本人が選び直す）。迷っていれば代表の主催者を勧め、そのときは主催者を配分先にも入れる（0%でもよい）"),
    targets: z.array(z.object({ name: z.string().min(1).max(100), percent: z.number().min(0).max(100) })).max(10).optional()
      .describe("配分先と割合（%）。言われていなければ省く（宛先に100%）。宛先も必ず含める"),
  },
} as const;

type PrepareInput = {
  event: string; product_type: "standard" | "message" | "entrance"; label?: string;
  price?: number; min_price?: number; max_price?: number;
  payment_type?: "A" | "B" | "C"; stock_limit?: number; sales_start?: string; sales_end?: string;
  recipient: string; targets?: { name: string; percent: number }[];
};

const toOption = (c: QrCandidate): QrPersonOption => ({
  profile_id: c.profile_id, role: c.role, name: c.display_name, avatar_url: c.avatar_url, avatar_original_url: c.avatar_original_url,
});

// 名前から候補を探す。完全に同じ名前の人がいればその人たちだけ。forRecipient でなければ、同じ人の名義違いは1つにまとめる
export function findQrPerson(candidates: QrCandidate[], query: string, forRecipient: boolean): QrPersonSlot {
  const q = query.trim();
  const lower = q.toLowerCase();
  let exact: QrCandidate[];
  let partial: QrCandidate[];
  if (ORGANIZER_WORDS.includes(q)) {
    exact = candidates.filter((c) => c.role === "organizer");
    partial = [];
  } else {
    exact = candidates.filter((c) => c.display_name.toLowerCase() === lower);
    partial = candidates.filter((c) => c.display_name.toLowerCase().includes(lower));
  }
  let options = (exact.length > 0 ? exact : partial).map(toOption);
  if (!forRecipient) options = options.filter((o, i) => options.findIndex((x) => x.profile_id === o.profile_id) === i);
  return { query: q, exact: exact.length > 0, options };
}

const yen = (n: number) => `¥${n.toLocaleString()}`;

export async function prepareQr(ctx: DcMcpContext, input: PrepareInput): Promise<QrToolOutput> {
  const picked = await pickOperableEvent(ctx, input.event);
  if ("message" in picked) return { text: picked.message };
  const ev = await qrCandidateEvent(ctx.admin, picked.event.event_id);
  if (!ev) return { text: "イベントが見つかりません。" };
  if (!QR_LIFECYCLES.includes(ev.lifecycle_status)) return { text: `「${ev.title}」はもう QR を作れない状態です（中止・終了・精算済み）。` };

  // 金額（商品タイプの範囲は作成 API と同じ product_type_configs）
  const { data: cfg } = await ctx.supabase.from("product_type_configs").select("type, min_amount, max_amount, is_enabled").eq("type", input.product_type).maybeSingle();
  if (cfg && !cfg.is_enabled) return { text: `${TYPE_LABEL[input.product_type]}は今は作れません。` };
  const range = { min: cfg?.min_amount ?? 50, max: cfg?.max_amount ?? 3000 };
  let min: number, max: number;
  if (input.price != null) {
    min = max = input.price;
  } else if (input.min_price != null && input.max_price != null && input.product_type !== "entrance") {
    min = input.min_price;
    max = input.max_price;
    if (min % 100 !== 0 || max % 100 !== 0 || min >= max) return { text: "金額を選べるようにするときは、下限と上限を100円単位で、下限＜上限にしてください。" };
  } else {
    return { text: input.product_type === "entrance" ? "エントランスの金額（ワンプライス）を本人に聞いてください。" : "金額（ワンプライスか、下限と上限）を本人に聞いてください。" };
  }
  if (min < range.min || max > range.max) return { text: `${TYPE_LABEL[input.product_type]}の金額は${yen(range.min)}〜${yen(range.max)}の範囲です。本人に確かめてください。` };

  // エントランスの決済タイプ・在庫・販売期間・残高
  let paymentType: QrCreateCard["payment_type"] = null;
  let stock: number | null = null;
  let salesStart: string | null = null;
  let salesEnd: string | null = null;
  const notes: string[] = [];
  if (input.product_type === "entrance") {
    if (!input.payment_type) return { text: "エントランスの決済タイプ（前売事後確定・前売即時確定・当日決済）を本人に聞いてください。" };
    paymentType = input.payment_type;
    stock = input.stock_limit ?? null;
    if (paymentType === "B" && stock == null) return { text: "前売即時確定タイプは、中止のときの手数料を見積もるため販売上限数が必要です。本人に聞いてください。" };
    if (paymentType !== "C") {
      if (!input.sales_start || !input.sales_end) return { text: "前売りは販売開始と終了の日時が必要です。本人に聞いてください。" };
      salesStart = jstLocalToIso(input.sales_start);
      salesEnd = jstLocalToIso(input.sales_end);
      if (!salesStart || !salesEnd) return { text: "販売期間の形が正しくありません。日本時間の「YYYY-MM-DDTHH:mm」で指定してください。" };
      const err = salesPeriodError("entrance", paymentType, salesStart, salesEnd);
      if (err) return { text: `${err}。本人に確かめてください。` };
    }
    const reserve = typeBReserveRequired({ productType: "entrance", paymentType, stockLimit: stock, maxAmount: max, stripeRate: (await getFeeConfig()).stripe_rate });
    if (reserve > 0) {
      const balance = await organizerBalance(ctx.admin, ev.organizer_profile_id);
      if (balance < reserve) {
        return { text: `前売即時確定タイプは、主催者の残高が${yen(reserve)}以上必要です（今は${yen(balance)}）。在庫を減らすか、前売事後確定タイプにするか、本人に相談してください。` };
      }
    }
  }

  // 宛先・配分先（言われた人だけ。同じ名前は1つにまとめる）
  const people: QrPersonSlot[] = [];
  const indexOf = (name: string, forRecipient: boolean) => {
    const q = name.trim();
    const i = people.findIndex((p) => p.query === q);
    if (i >= 0) return i;
    people.push(findQrPerson(ev.targets, q, forRecipient));
    return people.length - 1;
  };
  const recipient = indexOf(input.recipient, true);
  const targets = (input.targets?.length ? input.targets : [{ name: input.recipient, percent: 100 }])
    .map((t) => ({ person: indexOf(t.name, false), percent: t.percent }));
  const allNames = ev.targets.map((c) => (c.role === "organizer" ? `${c.display_name}（主催者）` : c.display_name)).join("、");
  const missing = people.filter((p) => p.options.length === 0);
  if (missing.length > 0) {
    return { text: `${missing.map((p) => `「${p.query}」`).join("")}は、このイベントの主催者・出演者にいません。宛先・配分先に選べるのは：${allNames}。出演者を足すときは、先にイベントの編集画面で追加してもらってください。` };
  }
  if (!targets.some((t) => t.person === recipient)) return { text: "宛先の人を配分先にも入れてください（宛先は配分を受け取る人の1人です）。" };
  if (new Set(targets.map((t) => t.person)).size !== targets.length) return { text: "配分先に同じ人が2回入っています。" };
  const total = targets.reduce((s, t) => s + t.percent, 0);
  if (Math.abs(total - 100) > 0.1) return { text: `配分の合計が${total}%です。合計を100%にしてください。` };
  for (const p of people) {
    if (slotDecided(p)) continue;
    notes.push(p.exact
      ? `「${p.query}」に当たる候補が${p.options.length}つあります（${p.options.map((o) => `${o.name}（${o.role === "organizer" ? "主催者名義" : "出演者名義"}）`).join("、")}）。どれか本人に聞き返してください。カードでも選べます。`
      : `「${p.query}」と完全に同じ名前の人はいません。候補：${p.options.map((o) => o.name).join("、")}。どの人か本人に聞き返してください。カードでも選べます。`);
  }

  // ラベル：本人がこの会話でそのまま書いた文字だけをカードに入れる（AI が考えた・言い換えたものは入れない）。
  // 決まっていなければ空欄で、カードに「誰に・何を払うものか」が分かる候補と案内を出し、本人が決めて印を付けるまで作れない
  const saidLabel = input.label != null && labelFromUser(ctx.userTexts, input.label) ? input.label.trim() : null;
  // 宛先：決まりにするのは「配分先が1人で、本人がその人の名前（主催者なら「主催者」「オーガナイザー」か主催者の名前）を言った」ときだけ。
  // 配分先が2人以上なら、名前が出ていても誰を宛先にするかは AI が選んだことになるので、カードで本人が選ぶ
  const organizerName = ev.targets.find((c) => c.role === "organizer")?.display_name ?? "";
  const recipientQuery = people[recipient].query;
  const recipientSaid = targets.length === 1 && (ORGANIZER_WORDS.includes(recipientQuery)
    ? [...ORGANIZER_WORDS, organizerName].some((w) => w && labelFromUser(ctx.userTexts, w))
    : labelFromUser(ctx.userTexts, recipientQuery));
  const recipientName = recipientSaid && slotDecided(people[recipient]) ? people[recipient].options[0].name : null;
  const suggestions = labelSuggestions(input.product_type, paymentType, recipientName);
  const labelLine = saidLabel
    ? `- ラベル：${saidLabel}（本人の言葉。お客様の画面に出る名前なので、本人がカードで確かめて印を付けるまで作れません）`
    : `- ラベル：未定（本人がカードで決めます。${LABEL_GUIDE}。${suggestions.length ? `カードの候補：${suggestions.join("、")}。この候補を案として本人に示し、` : "宛先が決まると候補が出ます。"}カードで選ぶか書いてもらってください。あなたは決めません）`;

  const needsImage = needsQrImage(input.product_type, paymentType ?? "A");
  const card: QrCreateCard = {
    kind: "qr_create",
    card_id: randomUUID(),
    event: { event_id: ev.event_id, title: ev.title, draft: ev.lifecycle_status === "draft" },
    product_type: input.product_type,
    payment_type: paymentType,
    label: saidLabel,
    min_amount: min,
    max_amount: max,
    stock_limit: stock,
    sales_start_at: salesStart,
    sales_end_at: salesEnd,
    people,
    recipient,
    recipient_said: recipientSaid,
    targets,
    needs_image: needsImage,
    flyer_url: ev.base_flyer_url,
  };
  const name = (i: number) => (slotDecided(people[i]) ? people[i].options[0].name : `${people[i].query}（本人が選ぶまで決まりません）`);
  return {
    text: [
      "QR の確認カードを出しました。本人が［QRを作る］を押すまで作られません。作っても、宛先・配分先の人に通知は届きません。",
      ...(card.event.draft ? ["このイベントは下書きなので、この QR ではまだ決済できません（確認用の QR になります。イベントが承認されると使えます）。"] : []),
      needsImage ? `QR の画像は、カードで「宛先の画像」か「フライヤー」から選んでもらいます。${IMAGE_RIGHTS_GUIDE}。本人がカードで確かめて印を付けるまで作れません。ほかの画像を使うときは作成画面でアップロードしてもらってください。` : "",
      `- イベント：${ev.title}`,
      `- タイプ：${TYPE_LABEL[input.product_type]}${paymentType ? `・${PAYMENT_LABEL[paymentType]}` : ""}`,
      labelLine,
      `- 金額：${min === max ? yen(min) : `${yen(min)}〜${yen(max)}（100円単位）`}`,
      ...(paymentType ? [`- 販売上限数：${stock ?? "無制限"}`] : []),
      ...(salesStart && salesEnd ? [`- 販売期間：${jstDateTime(salesStart)}〜${jstDateTime(salesEnd)}`] : []),
      recipientSaid
        ? `- 宛先：${name(recipient)}`
        : `- 宛先：未定（本人がカードで配分先の中から選びます。${RECIPIENT_GUIDE}。${targets.length > 1 ? "配分先が2人以上なので、宛先は必ずカードで本人が選びます。" : ""}本人に誰にするか聞いてください。あなたは決めません）`,
      `- 配分：${targets.map((t) => `${name(t.person)} ${t.percent}%`).join("、")}`,
      ...notes,
      "色・タッチ決済・ウェルカムチア・入場確定などは、作ったあとや作成画面で設定してもらいます。",
      `作ったあとの注意（本人に伝えてください）：${QR_AFTER_NOTES.join("。")}。`,
    ].filter(Boolean).join("\n"),
    cards: [card],
  };
}

// ── 書き込み（AI に渡さない）──────────────────────────────

export const CREATE_QR = {
  name: "create_qr",
  minRole: "organizer",
  title: "QR を作る（本人の確認後）",
  description: "確認カードで本人が［QRを作る］を押したときに、DC のサーバーが呼ぶ。AI には渡さない。",
  inputSchema: {
    card_id: z.string().uuid(),
    event_id: z.string().uuid(),
    product_type: z.enum(["standard", "message", "entrance"]),
    payment_type: z.enum(["A", "B", "C"]).nullable(),
    label: z.string().min(1).max(50),
    min_amount: z.number().int(),
    max_amount: z.number().int(),
    stock_limit: z.number().int().min(1).max(100000).nullable(),
    sales_start_at: z.string().max(40).nullable(),
    sales_end_at: z.string().max(40).nullable(),
    recipient_profile_id: z.string().uuid(),
    recipient_name_context: z.enum(["organizer", "artist"]),
    targets: z.array(z.object({ profile_id: z.string().uuid(), distribution_ratio: z.number().min(0).max(1) })).min(1).max(10),
    image_url: z.string().max(500).nullable(),
  },
} as const;

export type CreateQrToolInput = {
  card_id: string; event_id: string; product_type: "standard" | "message" | "entrance"; payment_type: "A" | "B" | "C" | null;
  label: string; min_amount: number; max_amount: number; stock_limit: number | null;
  sales_start_at: string | null; sales_end_at: string | null;
  recipient_profile_id: string; recipient_name_context: "organizer" | "artist";
  targets: { profile_id: string; distribution_ratio: number }[]; image_url: string | null;
};

// 作成 API の英語のエラーを、画面に出す文にする
function qrErrorText(error: string): string {
  if (error === "Forbidden" || error === "Event not found") return "このイベントの QR は作れません";
  const range = /^Amount must be between (\d+) and (\d+)$/.exec(error);
  if (range) return `金額は${yen(Number(range[1]))}〜${yen(Number(range[2]))}の範囲にしてください`;
  if (error === "Invalid product type") return "このタイプの QR は今は作れません";
  return error;
}

export type QrWriteResult = { ok: true; eventId: string; qrConfigId: string; label: string; already: boolean } | { ok: false; error: string };

export async function createQrTool(ctx: DcMcpContext, input: CreateQrToolInput): Promise<QrWriteResult> {
  const entrance = input.product_type === "entrance";
  // チャットで作れる範囲（作成 API より狭い）。エントランスは決済タイプ必須・ワンプライス。前売即時確定は在庫必須（作成画面と同じ）
  if (entrance !== (input.payment_type != null)) return { ok: false, error: "決済タイプの指定が正しくありません" };
  if (entrance && input.min_amount !== input.max_amount) return { ok: false, error: "エントランスの金額は1つにしてください" };
  if (input.payment_type === "B" && input.stock_limit == null) return { ok: false, error: "前売即時確定タイプは販売上限数を入力してください" };
  if (new Set(input.targets.map((t) => t.profile_id)).size !== input.targets.length) return { ok: false, error: "配分先に同じ人が2回入っています" };

  const claim = await claimCard(ctx.admin, input.card_id, ctx.userId, "qr_create");
  if (claim === "invalid") return { ok: false, error: "このカードは使えません" };
  if (!claim.fresh) {
    if (!claim.resultId) return { ok: false, error: "作成の途中です。少し待ってから会話を開き直してください" };
    const { data } = await ctx.admin.from("qr_configs").select("qr_config_id, event_id, label").eq("qr_config_id", claim.resultId).maybeSingle();
    return data ? { ok: true, eventId: data.event_id, qrConfigId: data.qr_config_id, label: data.label, already: true } : { ok: false, error: "作った QR が見つかりません" };
  }
  // 中身の判定（イベントを操作できるか・状態・代理の下書き・金額・宛先と配分先・販売期間・残高・画像）は作成 API と同じ関数
  const r = await createQr(ctx.supabase, ctx.userId, {
    event_id: input.event_id,
    label: input.label,
    product_type: input.product_type,
    min_amount: input.min_amount,
    max_amount: input.max_amount,
    default_amount: input.min_amount,
    amount_step: 100,
    recipient_profile_id: input.recipient_profile_id,
    recipient_name_context: input.recipient_name_context,
    targets: input.targets,
    image_url: input.image_url,
    serial_scope: "artist",
    ...(entrance && {
      payment_type: input.payment_type,
      stock_limit: input.stock_limit,
      track_inventory: input.payment_type === "C" ? input.stock_limit != null : true,
      sales_start_at: input.payment_type === "C" ? null : input.sales_start_at,
      sales_end_at: input.payment_type === "C" ? null : input.sales_end_at,
    }),
  });
  if (!r.ok) {
    await releaseCard(ctx.admin, input.card_id);
    return { ok: false, error: qrErrorText(r.error) };
  }
  await finishCard(ctx.admin, input.card_id, r.qr_config_id);
  return { ok: true, eventId: input.event_id, qrConfigId: r.qr_config_id, label: input.label, already: false };
}
