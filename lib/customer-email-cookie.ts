import type { NextResponse } from "next/server";

// 簡易ログイン用Cookie（前回決済したメールアドレス）。QRページの名前表示・
// メール事前入力にだけ使う。httpOnly にしてブラウザ側から書き換えられないよう
// にする（任意のメールをセットして開くと、その人の表示名が引けてしまうため）。
// 書き込みは決済開始/完了のサーバールートと proxy.ts の期限延長のみ。
export const CUSTOMER_EMAIL_COOKIE = "dc_ce";

export function setCustomerEmailCookie(response: NextResponse, email: string): void {
  response.cookies.set(CUSTOMER_EMAIL_COOKIE, email, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
}
