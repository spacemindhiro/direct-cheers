// my_cheers：本人が送ったチアの履歴（カードコレクション画面と同じ範囲 lib/cheer-collection.ts）。
// 宛先名はカードと同じ判定（resolveCheerCardIdentity）。返さないもの：決済ID・内部ID・メールアドレス
/* eslint-disable @typescript-eslint/no-explicit-any -- 埋め込み select の行を画面と同じ書き方で扱うため */
import { z } from "zod";
import { applyCheerCollectionFilters } from "@/lib/cheer-collection";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { resolveCheerCardIdentity } from "@/lib/statement-descriptor";
import type { DcMcpContext } from "../context";
import { jstDateTime, lines, yen } from "../format";

export const MY_CHEERS = {
  name: "my_cheers",
  minRole: "user",
  title: "応援履歴",
  description:
    "この人がこれまでに送ったチア（応援）の件数・合計金額と、新しい順の履歴（日時・金額・宛先・イベント・自分のコメント・お礼メッセージが届いているか）を返す。カードコレクションと同じ範囲。",
  inputSchema: { limit: z.number().int().min(1).max(20).optional().describe("履歴の件数（既定10）") },
} as const;

const SELECT = `
  total_gross_amount, created_at, sender_comment,
  product:products!product_id!inner(name, type, artist_id),
  qr_config:qr_configs!qr_config_id(qr_config_id, recipient_profile_id, recipient_name_context, event:events!event_id(title))
`;

export async function myCheers(ctx: DcMcpContext, input: { limit?: number }): Promise<string> {
  if (!ctx.email) return "応援履歴を確認できませんでした（メールアドレスが未設定）。";
  const limit = input.limit ?? 10;
  const [all, { data: recent, error }] = await Promise.all([
    fetchAllPages<{ total_gross_amount: number }>(
      ctx.admin as never, "transactions", "total_gross_amount, product:products!product_id!inner(type)",
      (q) => applyCheerCollectionFilters(q, ctx.userId, ctx.email!),
    ),
    applyCheerCollectionFilters(ctx.admin.from("transactions").select(SELECT), ctx.userId, ctx.email)
      .order("created_at", { ascending: false })
      .order("transaction_id", { ascending: true })
      .range(0, limit - 1),
  ]);
  if (error) throw new Error("cheers");
  if (all.length === 0) return "まだチアを送っていません。";
  const total = all.reduce((n, t) => n + Number(t.total_gross_amount ?? 0), 0);

  const rows = (recent ?? []) as any[];
  const qrIds = [...new Set(rows.map((r) => r.qr_config?.qr_config_id).filter(Boolean))];
  const profileIds = [...new Set(rows.flatMap((r) => [r.qr_config?.recipient_profile_id, r.product?.artist_id]).filter(Boolean))];
  const [{ data: thanks }, { data: profiles }] = await Promise.all([
    qrIds.length ? ctx.admin.from("qr_config_thanks").select("qr_config_id, published_at").in("qr_config_id", qrIds) : Promise.resolve({ data: [] as any[] }),
    profileIds.length ? ctx.admin.from("profiles").select("profile_id, display_name, artist_name, organizer_name").in("profile_id", profileIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const thanked = new Set((thanks ?? []).filter((t: any) => t.published_at).map((t: any) => t.qr_config_id));
  const pmap = new Map((profiles ?? []).map((p: any) => [p.profile_id, p]));

  const body = rows.map((r, i) => {
    const recipient = pmap.get(r.qr_config?.recipient_profile_id);
    const artist = pmap.get(r.product?.artist_id);
    const { name } = resolveCheerCardIdentity({
      recipientNameContext: r.qr_config?.recipient_name_context ?? "artist",
      recipient: recipient ? { organizerName: recipient.organizer_name, artistName: recipient.artist_name, displayName: recipient.display_name } : null,
      productArtist: artist ? { artistName: artist.artist_name, displayName: artist.display_name } : null,
    });
    return lines(`${i + 1}. ${jstDateTime(r.created_at)} ${yen(Number(r.total_gross_amount ?? 0))}`, [
      ["宛先", name],
      ["イベント", r.qr_config?.event?.title],
      ["あなたのコメント", r.sender_comment || null],
      ["お礼メッセージ", thanked.has(r.qr_config?.qr_config_id) ? "届いています（カードコレクションでカードをタップすると見られます）" : null],
    ]);
  });
  return [`送ったチア ${all.length}件・合計${yen(total)}（新しい順に${rows.length}件）`, ...body].join("\n");
}
