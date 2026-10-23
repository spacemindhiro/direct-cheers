// QR の作成・編集で、これまで画面だけが確かめていたことをサーバーでも確かめる（2026-10-23）。
// 画面を通さずに API を呼ぶと、イベントと関係ない人を宛先・配分先にしたり、残高の足りない前売即時確定を作れたりした。
import type { SupabaseClient } from "@supabase/supabase-js";

// 宛先・配分先に選べる人：主催者本人＋そのイベントの出演者（断った人・外された人を除く）。作成・編集画面の候補と同じ
export type QrPeople = { organizerId: string; artistIds: Set<string> };

export async function qrPeople(admin: SupabaseClient, eventId: string, organizerId: string): Promise<QrPeople> {
  const { data } = await admin
    .from("event_artists")
    .select("artist_profile_id, status")
    .eq("event_id", eventId)
    .is("deleted_at", null);
  const artistIds = new Set((data ?? []).filter((r) => r.status !== "rejected").map((r) => r.artist_profile_id as string));
  return { organizerId, artistIds };
}

const inEvent = (p: QrPeople, id: string) => id === p.organizerId || p.artistIds.has(id);

// 主催者名義なら主催者本人、アーティスト名義なら出演者。keep は編集で、すでに入っている宛先をそのまま通すため
export function recipientError(p: QrPeople, recipientId: string, context: string, keep?: { id: string; context: string }): string | null {
  if (keep && keep.id === recipientId && keep.context === context) return null;
  const ok = context === "organizer" ? recipientId === p.organizerId : p.artistIds.has(recipientId);
  return ok ? null : "宛先はこのイベントの主催者か出演者から選んでください";
}

// keep は編集で、すでに配分先に入っている人をそのまま通すため（あとで出演を断った人がいても、ほかの項目を直せるように）
export function targetsError(p: QrPeople, targets: { profile_id: string }[], keep: Set<string> = new Set()): string | null {
  const ok = targets.every((t) => typeof t.profile_id === "string" && (inEvent(p, t.profile_id) || keep.has(t.profile_id)));
  return ok ? null : "配分先はこのイベントの主催者か出演者から選んでください";
}

// 主催者の今の残高（前売即時確定の残高確認用）。凍結分は除く
export async function organizerBalance(admin: SupabaseClient, organizerId: string): Promise<number> {
  const { data } = await admin
    .from("transaction_distributions")
    .select("actual_amount, is_frozen")
    .eq("profile_id", organizerId)
    .eq("distribution_status", "accrued")
    .is("deleted_at", null);
  return (data ?? []).reduce((sum, d) => (d.is_frozen ? sum : sum + (d.actual_amount ?? 0)), 0);
}

// 前売即時確定（エントランス×B）で在庫があるときに必要な残高：上限金額×在庫×オンライン決済の手数料率
export function typeBReserveRequired(input: { productType: string; paymentType: string; stockLimit: number | null; maxAmount: number; stripeRate: number }): number {
  if (input.productType !== "entrance" || input.paymentType !== "B" || !input.stockLimit) return 0;
  return Math.ceil(input.maxAmount * input.stockLimit * input.stripeRate);
}

// 前売り（エントランス×A/B）の販売期間：必須・終了が開始より後
export function salesPeriodError(productType: string, paymentType: string, start: string | null, end: string | null): string | null {
  if (productType !== "entrance" || (paymentType !== "A" && paymentType !== "B")) return null;
  if (!start || !end) return "前売り（前売事後確定／前売即時確定タイプ）は販売開始・終了日時を入力してください";
  const s = Date.parse(start), e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return "販売期間の形式が正しくありません";
  if (e <= s) return "販売終了日時は開始日時より後にしてください";
  return null;
}

// QR 画像が要るタイプ（エントランス・バウチャー・ドリンクチケット以外）
export function needsQrImage(productType: string, paymentType: string): boolean {
  return productType !== "entrance" && !(productType === "custom" && (paymentType === "V" || paymentType === "D"));
}
