import type { createAdminClient } from "@/lib/supabase/admin";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

// 再送の連打抑止（同一予約への発行間隔）
export const CARD_UPDATE_RESEND_INTERVAL_SEC = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * カード無効メールに載せる「カードを再登録する」URLを発行する。
 *
 * 予約ごとにワンタイムトークンを振り直し（古いリンクは無効になる）、
 * トークンを持つ人＝そのメールを受け取った本人だけがカード更新できるようにする。
 * トークンはカード更新完了時（/api/entrance/complete）に消える。
 */
export async function issueCardUpdateUrl(admin: AdminClient, reservationId: string): Promise<string> {
  const token = crypto.randomUUID();
  const { error } = await admin
    .from("entrance_reservations")
    .update({ card_update_token: token, card_update_token_issued_at: new Date().toISOString() })
    .eq("reservation_id", reservationId);
  if (error) throw new Error(`[card-update] トークン発行失敗: ${error.message}`);
  return buildCardUpdateUrl(reservationId, token);
}

export function buildCardUpdateUrl(reservationId: string, token: string): string {
  return `${SITE_URL}/entrance/reservations/${reservationId}/update-card?t=${token}`;
}

/** 予約IDとトークンの組が一致したときだけ true（形式不正は DB に問い合わせず false） */
export async function verifyCardUpdateToken(
  admin: AdminClient,
  reservationId: string | null | undefined,
  token: string | null | undefined,
): Promise<boolean> {
  if (!reservationId || !token || !UUID_RE.test(reservationId) || !UUID_RE.test(token)) return false;
  const { data } = await admin
    .from("entrance_reservations")
    .select("reservation_id")
    .eq("reservation_id", reservationId)
    .eq("card_update_token", token)
    .maybeSingle();
  return !!data;
}

export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}
