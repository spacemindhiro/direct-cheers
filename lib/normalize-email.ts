// 入力されたメールアドレスの表記ゆれを吸収する。
// 日本語IMEの全角文字（＠・．・全角英数字・全角スペース）やコピペで混入する
// ゼロ幅文字があるとブラウザ標準の type="email" 検証や照合で弾かれるため、
// NFKC で半角化 → 不可視文字除去 → trim → 小文字化（Supabase Auth は小文字で保持）する。
export function normalizeEmail(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿]/g, "")
    .trim()
    .toLowerCase();
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
