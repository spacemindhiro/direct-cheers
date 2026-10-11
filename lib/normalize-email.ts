// 入力されたメールアドレスの表記ゆれを吸収する。
// 日本語IMEの全角文字（＠・．・全角英数字・全角スペース）やコピペで混入する
// 不可視の書式制御文字（ゼロ幅文字・LRM/RLM 等の方向制御・ソフトハイフン・BOM）があると
// ブラウザ標準の type="email" 検証や照合で弾かれるため、
// NFKC で半角化 → 書式制御文字(\p{Cf})と空白を全除去 → 小文字化（Supabase Auth は小文字で保持）する。
// メールアドレスに空白は含まれ得ないので途中の空白も除去してよい。
export function normalizeEmail(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\p{Cf}\s]/gu, "")
    .toLowerCase();
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
