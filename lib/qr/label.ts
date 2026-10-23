// QR のラベル（お客様の画面に出る唯一の名前）の案内と候補。チアリー(AI) の確認カードとサーバーで共用。
// ラベルは支払い画面の見出し・支払い後の画面・メールにこの文字のまま出る（app/c/[qrConfigId]、products.name）。
// 候補は「誰に・何を払うものか」が分かる形で、宛先とタイプから決まった形で作る（AI には考えさせない）。
// 決めるのは本人（カードで選ぶか書くかして、印を付けるまで作れない）。
// ラベルで誰に何を払ったか分からないと、お客様が身に覚えのない支払いとして異議（チャージバック）を出しやすい。

export const LABEL_GUIDE =
  "お客様が支払う画面の見出しや、支払い後の画面・メールに、この文字のまま出ます。誰に・何を払うものかが一目で分かる名前にしてください（分からないと、身に覚えのない支払いとして異議を出されることがあります）";

// 誰に・何を払うものか分かりにくいラベルへの注意（止めはしない。本人が見たうえで印を付ける）
export function labelWarning(productType: string, label: string, recipientName: string | null): string | null {
  const l = label.trim();
  if (!l) return null;
  if (productType === "entrance") {
    return /入場|券|チケット|ticket|entry/i.test(l) ? null : "入場のための支払いだと分かる言葉（入場・券・チケットなど）が入っていません";
  }
  if (recipientName && !l.includes(recipientName)) return `誰へのチアか分かりません（宛先の「${recipientName}」が入っていません）`;
  return null;
}

export function labelSuggestions(productType: string, paymentType: string | null, recipientName: string | null): string[] {
  if (productType === "entrance") return [paymentType === "C" ? "当日入場券" : "前売入場券"];
  if (!recipientName) return [];
  if (productType === "message") return [`${recipientName} へのメッセージチア`];
  return [`${recipientName} へのチア`];
}

// 本人がこの会話で書いた文字にそのまま含まれているか（AI が考えた・言い換えた・全角半角を変えたラベルを、カードに入れないため）
export function labelFromUser(userTexts: string[] | undefined, label: string): boolean {
  const l = label.trim();
  return l.length > 0 && (userTexts ?? []).some((t) => t.includes(l));
}
