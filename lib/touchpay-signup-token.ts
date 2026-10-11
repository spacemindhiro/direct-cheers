import type { NextResponse } from "next/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { reconcileTicketForUser } from "@/lib/touchpay-reconcile";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * タッチ決済後に子機へ表示するサインアップQRの使い切り合言葉（touchpay_signup_tokens）。
 *
 * 以前はQRにチケットIDを載せ、チケットIDだけで入場パスの入手や「同じカードの匿名購入を
 * まとめて自分のアカウントへ取り込む」ができた。QRの中身は公開Realtimeチャンネルでも
 * 配信していた（2026-10-11修正）。
 *
 * 守り方は「時間」ではなく「最初に開いたブラウザ」:
 *   - QRのページを最初に開いたブラウザ（httpOnly Cookie の端末キー）専用になる
 *   - そのブラウザからなら30日以内いつでも登録できる（会場ではすぐ登録しないため）
 *   - 後から別の端末で同じQRを開いても使えない（写真で読まれても無効）
 *   - 最後の紐付けは「開いたブラウザ」か「開いたブラウザで入力したメールでログインした人」
 *     （ログインリンクはメールアプリ等の別ブラウザで開かれうるため）
 */
export const SIGNUP_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SIGNUP_DEVICE_COOKIE = "dc_tps";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ClaimFailureReason = "invalid" | "expired" | "used" | "opened_elsewhere" | "other_email";

export function claimFailureMessage(reason: ClaimFailureReason): string {
  switch (reason) {
    case "expired": return "このQRコードの有効期限（30日）が切れています。";
    case "used": return "このQRコードは既に使用されています。心当たりがない場合はスタッフにお声がけください。";
    case "opened_elsewhere": return "このQRコードは別の端末で既に開かれています。心当たりがない場合はスタッフにお声がけください。";
    case "other_email": return "このQRコードは別のメールアドレスで手続き中です。QRコードを読み取ったスマホで入力したメールアドレスでログインしてください。";
    case "invalid": return "このQRコードは無効です。";
  }
}

export async function issueTouchpaySignupToken(
  admin: AdminClient,
  params: { ticketId: string; eventId: string; targetDeviceId: string | null },
): Promise<string | null> {
  const { data, error } = await admin
    .from("touchpay_signup_tokens")
    .insert({
      ticket_id: params.ticketId,
      event_id: params.eventId,
      target_device_id: params.targetDeviceId,
      expires_at: new Date(Date.now() + SIGNUP_TOKEN_TTL_MS).toISOString(),
    })
    .select("token")
    .single();
  if (error) {
    console.error("[touchpay-signup] トークン発行失敗:", error.message);
    return null;
  }
  return data.token;
}

/**
 * 子機（ログイン済みのイベント操作者）が、決済直後に自分宛てのサインアップQRを取りに来る。
 * 返すのは「その子機宛ての一番新しい決済」の合言葉だけで、既に開かれていれば返さない
 * （それより前の決済の未使用の合言葉を拾わない）。
 */
export async function currentTouchpaySignupToken(
  admin: AdminClient,
  eventId: string,
  deviceId: string | null,
): Promise<string | null> {
  let q = admin
    .from("touchpay_signup_tokens")
    .select("token, opened_device_key, used_at, expires_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1);
  q = deviceId ? q.eq("target_device_id", deviceId) : q.is("target_device_id", null);
  const { data } = await q.maybeSingle();
  if (!data || data.opened_device_key || data.used_at || new Date(data.expires_at) <= new Date()) return null;
  return data.token;
}

/** このブラウザの端末キー（無ければ新しく作り、レスポンスで Cookie に保存する） */
export function deviceKeyFrom(cookieValue: string | null | undefined): { key: string; isNew: boolean } {
  return cookieValue && UUID_RE.test(cookieValue)
    ? { key: cookieValue, isNew: false }
    : { key: crypto.randomUUID(), isNew: true };
}

export function setDeviceKeyCookie(response: NextResponse, key: string): void {
  response.cookies.set(SIGNUP_DEVICE_COOKIE, key, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

type Row = {
  ticket_id: string;
  expires_at: string;
  opened_device_key: string | null;
  bound_email: string | null;
  used_at: string | null;
  used_by_profile_id: string | null;
};

async function loadRow(admin: AdminClient, token: string): Promise<Row | null> {
  if (!UUID_RE.test(token)) return null;
  const { data } = await admin
    .from("touchpay_signup_tokens")
    .select("ticket_id, expires_at, opened_device_key, bound_email, used_at, used_by_profile_id")
    .eq("token", token)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

/**
 * QRのページを開いたとき。最初に開いたブラウザ専用にする。
 * 同じブラウザでの再表示は通す。別のブラウザ（後から写真で読んだ人など）は opened_elsewhere。
 */
export async function openTouchpaySignupToken(
  admin: AdminClient,
  token: string,
  deviceKey: string,
): Promise<{ ok: true } | { ok: false; reason: ClaimFailureReason }> {
  const row = await loadRow(admin, token);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (new Date(row.expires_at) <= new Date()) return { ok: false, reason: "expired" };
  if (row.opened_device_key) {
    return row.opened_device_key === deviceKey ? { ok: true } : { ok: false, reason: "opened_elsewhere" };
  }

  // 同時に2台が開いた場合も、先に書き込めた1台だけ
  const { data } = await admin
    .from("touchpay_signup_tokens")
    .update({ opened_device_key: deviceKey, opened_at: new Date().toISOString() })
    .eq("token", token)
    .is("opened_device_key", null)
    .select("token");
  return (data?.length ?? 0) === 1 ? { ok: true } : { ok: false, reason: "opened_elsewhere" };
}

/** 開いたブラウザでメールを入力したとき。ログインリンクから戻ってきた人の照合に使う */
export async function bindTouchpaySignupToken(
  admin: AdminClient,
  token: string,
  email: string,
  deviceKey: string | null,
): Promise<{ ok: true } | { ok: false; reason: ClaimFailureReason }> {
  const row = await loadRow(admin, token);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (new Date(row.expires_at) <= new Date()) return { ok: false, reason: "expired" };
  if (!row.opened_device_key || row.opened_device_key !== deviceKey) return { ok: false, reason: "opened_elsewhere" };

  await admin
    .from("touchpay_signup_tokens")
    .update({ bound_email: email.trim().toLowerCase(), bound_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null);
  return { ok: true };
}

export type ClaimResult =
  | { ok: true; ticketId: string; reconciled: number }
  | { ok: false; reason: ClaimFailureReason };

/**
 * ログイン済みの本人がチケット（と同じカードの過去の匿名購入）を自分のアカウントへ紐付ける。1回だけ。
 * 通すのは「QRを開いたブラウザ」か「そのブラウザで入力したメールでログインした人」。
 */
export async function claimTouchpaySignupToken(
  admin: AdminClient,
  token: string,
  user: { id: string; email?: string | null },
  deviceKey: string | null,
): Promise<ClaimResult> {
  const row = await loadRow(admin, token);
  if (!row) return { ok: false, reason: "invalid" };
  // 本人による再表示（リンクの再読込）は成功扱い
  if (row.used_at) {
    return row.used_by_profile_id === user.id
      ? { ok: true, ticketId: row.ticket_id, reconciled: 0 }
      : { ok: false, reason: "used" };
  }
  if (new Date(row.expires_at) <= new Date()) return { ok: false, reason: "expired" };

  const fromOpenedDevice = !!row.opened_device_key && row.opened_device_key === deviceKey;
  const byBoundEmail = !!row.bound_email && row.bound_email === (user.email ?? "").toLowerCase();
  if (!fromOpenedDevice && !byBoundEmail) {
    return { ok: false, reason: row.bound_email ? "other_email" : "opened_elsewhere" };
  }

  // 使用済みにできた1人だけが紐付けを実行する
  const { data: claimed } = await admin
    .from("touchpay_signup_tokens")
    .update({ used_at: new Date().toISOString(), used_by_profile_id: user.id })
    .eq("token", token)
    .is("used_at", null)
    .select("ticket_id");
  if ((claimed?.length ?? 0) !== 1) return { ok: false, reason: "used" };

  const { reconciled } = await reconcileTicketForUser(row.ticket_id, user.id, user.email ?? null);
  return { ok: true, ticketId: row.ticket_id, reconciled };
}
