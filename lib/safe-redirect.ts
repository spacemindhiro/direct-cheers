/**
 * ログイン前後の遷移先（?redirect= / user_metadata.post_auth_redirect / redirect_path）を
 * 自サイト内のパスに限定する。
 *
 * 以前は `${origin}${redirect}` や router.push(redirect) にそのまま渡していたため、
 * `@evil.com`（origin と連結すると https://direct-cheers.com@evil.com = evil.com）や
 * `https://evil.com`（router.push は外部URLへ遷移する）で外部サイトへ飛ばせた。
 * さらに send-magic-link は他人の post_auth_redirect を書き換えられたため、本物の
 * ログインメールから偽サイトへ誘導できた（2026-10-11修正）。
 */
export const DEFAULT_REDIRECT_PATH = "/dashboard";

export function safeRedirectPath(value: unknown, fallback: string = DEFAULT_REDIRECT_PATH): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return fallback;
  // 先頭は単一の "/"。"//host" と "/\host"（ブラウザは "\" を "/" とみなす）はプロトコル相対URL
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // 制御文字（改行・タブ等）は URL 解釈をずらすのに使われるため一切認めない
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  // 最終確認: ダミーの origin に対して解決し、origin が変わらないこと
  try {
    const base = "https://redirect-check.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
