// 外部AIに送る前に、電話番号・メールアドレス・口座番号などの番号を伏せる（requirements.md 5.3）。
// 本人のものか他人のものかは区別できないので、見つけたものはすべて伏せる。
// 金額（¥1,000 / 1000000円）は答えに必要なので伏せない。

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 日本の電話番号：0から始まる10〜11桁（ハイフン・空白あり／なし）、+81 形式
const PHONE = /(?:\+81[-\s]?\d{1,4}|(?<![0-9])0\d{1,4})[-\s]?\d{1,4}[-\s]?\d{3,4}(?![0-9])/g;
// 7桁以上続く数字（口座番号・マイナンバー・カード番号など）。直前が ¥、直後が 円 のものは金額なので除く
const LONG_NUMBER = /(?<![0-9¥￥,])\d{7,}(?![0-9]*円)(?![0-9,])/g;

export function maskSensitive(text: string): string {
  return text
    .replace(EMAIL, "[メールアドレス]")
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 10 ? "[電話番号]" : m))
    .replace(LONG_NUMBER, "[番号]");
}
