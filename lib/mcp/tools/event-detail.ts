// event_detail：イベント1件の詳細（イベント詳細画面の運営側の見え方）。
//   - 対象は本人が操作できるイベント（主催者・担当エージェント。admin は全イベント）。lib/event-access.ts の canOperate で確かめる
//     （代理作成で未送信の下書きは主催者から見えない。出演者の見え方は my_lineups・my_qr_targets で返す）
//   - イベントは名前の一部で探す（内部IDは受け取らない・返さない）。複数当たったら候補を返して絞ってもらう
//   - 「この人が今できる操作」は画面と同じ判定（lib/event-actions.ts）
//   - 売上は保存値の足し算（再計算しない）。全件をページ送りで取る
// 返さないもの：お客様の名前・メールアドレス・コメント・決済ID・内部ID
import { z } from "zod";
import { getEventAccess } from "@/lib/event-access";
import { eventActions, qrProductTypeLabel } from "@/lib/event-actions";
import { findUnsentLineupInvites } from "@/lib/lineup-invite";
import { hiddenProxyDraftIds } from "@/lib/proxy-draft";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import type { DcMcpContext } from "../context";
import { LIFECYCLE_LABEL, jstDateTime, lines, yen } from "../format";

export const EVENT_DETAIL = {
  name: "event_detail",
  minRole: "organizer",
  title: "イベントの詳細",
  description:
    "この人が主催・担当するイベント1件の詳細を返す（admin は全イベント）。イベントは名前の一部で指定する（候補が複数なら一覧を返すので、より詳しい名前で呼び直す）。状態・日時・会場・担当エージェント・出演者と承諾状況（出演確定／交渉中／依頼予定）・QR一覧とQRごとの売上・売上合計（支払額・決済手数料・プラットフォーム手数料・配分対象額）・開催証跡の提出数・代打の依頼状況・この人が今この画面でできる操作。",
  inputSchema: {
    event: z.string().min(1).max(100).describe("イベント名の一部"),
  },
} as const;

type EventRow = { event_id: string; title: string; start_at: string | null; lifecycle_status: string };
type Tx = { qr_config_id: string; total_gross_amount: number | null; stripe_fee: number | null; platform_fee: number | null; net_amount: number | null };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function findEvents(ctx: DcMcpContext, query: string): Promise<EventRow[]> {
  let q = ctx.admin.from("events").select("event_id, title, start_at, lifecycle_status").is("deleted_at", null).ilike("title", `%${escapeLike(query)}%`);
  if (ctx.role !== "admin") {
    q = q.or(`organizer_profile_id.eq.${ctx.userId},agent_id.eq.${ctx.userId}`);
    const hidden = await hiddenProxyDraftIds(ctx.admin as never, ctx.userId);
    if (hidden.length > 0) q = q.not("event_id", "in", `(${hidden.join(",")})`);
  }
  const { data, error } = await q.order("start_at", { ascending: false }).limit(20);
  if (error) throw new Error("events");
  // 画面と同じ判定で最終確認（操作できるイベントだけ）
  const out: EventRow[] = [];
  for (const e of (data ?? []) as EventRow[]) {
    const access = await getEventAccess(ctx.admin as never, e.event_id, ctx.userId, ctx.role);
    if (access?.canOperate) out.push(e);
  }
  return out;
}

export async function eventDetail(ctx: DcMcpContext, input: { event: string }): Promise<string> {
  const query = input.event.trim();
  const found = await findEvents(ctx, query);
  if (found.length === 0) return `「${query}」に当てはまる、あなたが主催・担当するイベントは見つかりませんでした。`;
  const exact = found.filter((e) => e.title === query);
  const picked = exact.length === 1 ? exact[0] : found.length === 1 ? found[0] : null;
  if (!picked) {
    return [
      `「${query}」に当てはまるイベントが${found.length}件あります。どれか分かる名前で指定してください。`,
      ...found.slice(0, 5).map((e, i) => `${i + 1}. ${e.title}（${jstDateTime(e.start_at)}・${LIFECYCLE_LABEL[e.lifecycle_status] ?? e.lifecycle_status}）`),
    ].join("\n");
  }
  const eventId = picked.event_id;

  const { data: event } = await ctx.admin
    .from("events")
    .select("title, venue, start_at, end_at, lifecycle_status, organizer_profile_id, agent_id, agent:profiles!agent_id(display_name), event_artists(artist_profile_id, status, deleted_at, artist:profiles!artist_profile_id(display_name, artist_name, credit_name))")
    .eq("event_id", eventId)
    .single();
  if (!event) throw new Error("event");

  const { data: handoff } = await ctx.admin
    .from("event_agent_handoffs")
    .select("to_agent_id, to_agent:profiles!to_agent_id(display_name, organizer_name), from_agent:profiles!from_agent_id(display_name, organizer_name)")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .maybeSingle();

  const artists = ((event.event_artists ?? []) as unknown as { artist_profile_id: string; status: string; deleted_at: string | null; artist: { display_name: string | null; artist_name: string | null; credit_name: string | null } | null }[])
    .filter((ea) => ea.deleted_at === null && ea.status !== "rejected");
  const a = eventActions({
    userId: ctx.userId,
    role: ctx.role,
    event: event as never,
    isLineupArtist: artists.some((ea) => ea.artist_profile_id === ctx.userId),
    pendingHandoff: handoff as never,
    now: ctx.now,
  });
  const unsent = new Set((await findUnsentLineupInvites(ctx.admin as never, eventId)).map((u) => u.artist_profile_id));

  // QR と売上（live-stats と同じ範囲：削除していないQRの、完了・招待以外の決済）
  const { data: qrRows } = await ctx.admin
    .from("qr_configs")
    .select("qr_config_id, label, is_welcome_cheer_default, product:products!product_id(type, payment_type, name), recipient:profiles!recipient_profile_id(display_name)")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const qrs = (qrRows ?? []) as unknown as { qr_config_id: string; label: string | null; is_welcome_cheer_default: boolean; product: { type: string; payment_type: string | null; name: string | null } | null; recipient: { display_name: string | null } | null }[];
  const txs = qrs.length === 0 ? [] : await fetchAllPages<Tx>(ctx.admin as never, "transactions", "qr_config_id, total_gross_amount, stripe_fee, platform_fee, net_amount",
    (q) => q.in("qr_config_id", qrs.map((r) => r.qr_config_id)).eq("status", "completed").neq("transaction_type", "invitation"));
  const perQr = new Map<string, { count: number; gross: number }>();
  const total = { count: 0, gross: 0, stripe: 0, platform: 0, net: 0 };
  for (const t of txs) {
    const s = perQr.get(t.qr_config_id) ?? { count: 0, gross: 0 };
    s.count += 1;
    s.gross += t.total_gross_amount ?? 0;
    perQr.set(t.qr_config_id, s);
    total.count += 1;
    total.gross += t.total_gross_amount ?? 0;
    total.stripe += t.stripe_fee ?? 0;
    total.platform += t.platform_fee ?? 0;
    total.net += t.net_amount ?? 0;
  }
  const { count: evidenceCount } = await ctx.admin.from("event_evidences").select("evidence_id", { count: "exact", head: true }).eq("event_id", eventId);

  const name = (p: { display_name?: string | null; organizer_name?: string | null } | null | undefined) => p?.organizer_name ?? p?.display_name ?? "—";
  const relation = a.isAdmin && !a.isEventOrganizer && !a.isEventAgent ? "運営" : a.isEventOrganizer ? (a.isEventAgent ? "主催（自主開催のエージェント）" : "主催") : "担当エージェント";
  const actions = [
    a.canRequestReview && "担当エージェントに承認依頼を送る（下書き。依頼予定の出演者にはこの時点で出演依頼が届く）",
    a.canProxyNotify && "代理で作った下書きを主催者に送って確認を依頼する",
    a.canApprove && "公開を承認する",
    a.canCreateQR && "QRを作る",
    a.canEndEvent && "イベントを終了する",
    a.canSubmitEvidence && "開催証跡を提出する",
    a.canRequestCancel && "中止を申請する",
    a.canApproveCancellation && "中止申請を承認・却下する",
    a.canRequestHandoff && "代打（別のエージェントへの担当の引き継ぎ）を依頼する",
    a.isHandoffCandidate && "自分宛ての代打の依頼に返事をする",
    a.canEdit && "イベントを編集する",
  ].filter(Boolean) as string[];

  const out = [
    lines(event.title, [
      ["あなたとの関係", relation],
      ["状態", LIFECYCLE_LABEL[event.lifecycle_status] ?? event.lifecycle_status],
      ["開催", `${jstDateTime(event.start_at)} 〜 ${jstDateTime(event.end_at)}`],
      ["会場", event.venue],
      ["担当エージェント", a.isSelfOrganized ? "主催者自身（自主開催）" : name(event.agent as never)],
      ["開催証跡", (evidenceCount ?? 0) > 0 ? `${evidenceCount}件提出済み` : "未提出"],
      ["代打の依頼", handoff ? `${name(handoff.from_agent as never)} → ${name(handoff.to_agent as never)}（返事待ち）` : null],
    ]),
    `出演者 ${artists.length}人`,
    // 出演確定 → 交渉中 → 依頼予定、同じ状態の中は名前順（DB から取った順は決まっていないため）
    ...artists
      .map((ea) => {
        const n = ea.artist?.artist_name ?? ea.artist?.display_name ?? ea.artist?.credit_name ?? "—";
        const rank = ea.status === "confirmed" ? 0 : unsent.has(ea.artist_profile_id) ? 2 : 1;
        return { n, rank, label: ["出演確定", "交渉中（返事待ち）", "依頼予定（まだ出演依頼を送っていない）"][rank] };
      })
      .sort((x, y) => x.rank - y.rank || x.n.localeCompare(y.n, "ja"))
      .map((x) => `  - ${x.n}: ${x.label}`),
    lines(`売上（完了した決済 ${total.count}件）`, [
      ["お客様の支払額の合計", yen(total.gross)],
      ["決済手数料", yen(total.stripe)],
      ["プラットフォーム手数料", yen(total.platform)],
      ["配分対象額（手数料を引いた額）", yen(total.net)],
    ]),
  ];
  const listed = qrs.filter((q) => !q.is_welcome_cheer_default);
  out.push(`QR ${listed.length}件`);
  for (const q of listed) {
    const s = perQr.get(q.qr_config_id) ?? { count: 0, gross: 0 };
    const label = q.product?.name || q.label;
    out.push(`  - ${qrProductTypeLabel(q.product?.type, q.product?.payment_type)}${label ? `「${label}」` : ""}・宛先 ${q.recipient?.display_name ?? "—"}・${s.count}件 ${yen(s.gross)}`);
  }
  out.push(actions.length ? `あなたが今できる操作（イベント詳細画面）：${actions.join("／")}` : "あなたが今できる操作：なし");
  return out.join("\n");
}
