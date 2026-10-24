// チアリー(AI) の応答の受け取り方（画面とサーバーで共用。知識集など重いものは持ち込まない）。
// 応答は「本文」＋区切り記号＋「行き先ボタン・動画カードの材料(JSON)」の順に流れてくる（app/api/cheery/chat）。
import type { CheeryRef } from "@/lib/ai/refs";
import type { CheeryCard } from "@/lib/cheery/cards";

// 本文には現れない制御文字
export const REFS_SEPARATOR = "\u001e";
// 「ここまでの本文を消す」印。AI がツールを呼ぶ前に書いた前置きを、最後の答えと入れ替えるため（app/api/cheery/chat）
export const RESET_MARK = "\u001d";

// 本文のうち、最後の消す印より後ろだけ
const afterReset = (body: string) => body.slice(body.lastIndexOf(RESET_MARK) + 1);
export const REF_PATTERN = /〔参照[:：]\s*([^〕]*)〕/g;

// 本文から〔参照:…〕を取り除く。流れてくる途中で閉じていない〔参照… も隠す
export function stripRefs(text: string): string {
  let out = text.replace(REF_PATTERN, "");
  const open = out.lastIndexOf("〔");
  if (open >= 0 && !out.slice(open).includes("〕") && "〔参照".startsWith(out.slice(open, open + 3))) out = out.slice(0, open);
  return out.replace(/\s+$/, "");
}

// AI が書き終えた答えを、改行のあとに書き直して付け足すことがある（gpt-6-luna。2026-10-24 の挙動確認で、出演者を聞き返す場面の1〜3割。
// 指示文で止めようとすると逆に増えた）。同じ文（8文字以上）がもう一度出てきたら、
//   前の行に出ていた → その行から後ろを落とす（書き直しの始まり）
//   同じ行の中で重なった → その文だけ落とす
// 〔参照:…〕は残す（行き先ボタンの材料）。重なりが無ければそのまま返す
const MIN_SENTENCE = 8;
export function trimRewrite(text: string): string {
  const refs = [...new Set(text.match(REF_PATTERN) ?? [])];
  const lines = text.replace(REF_PATTERN, "").split("\n");
  const before = new Set<string>(); // 前の行までに出た文
  const out: string[] = [];
  let changed = false;
  for (const line of lines) {
    const inLine = new Set<string>();
    const kept: string[] = [];
    let rewrite = false;
    for (const part of line.split(/(?<=[。？！?!])/)) {
      const t = part.trim();
      if (t.length >= MIN_SENTENCE && before.has(t)) { rewrite = true; break; }
      if (t.length >= MIN_SENTENCE && inLine.has(t)) { changed = true; continue; }
      if (t.length >= MIN_SENTENCE) inLine.add(t);
      kept.push(part);
    }
    if (rewrite) { changed = true; break; }
    out.push(kept.join(""));
    for (const t of inLine) before.add(t);
  }
  if (!changed) return text;
  const body = out.join("\n").replace(/\s+$/, "");
  return refs.length ? `${body}\n${refs.join("")}` : body;
}

// 受け取った途中までの文字列を、画面に出す本文とカードに分ける（カードは届き切るまで null）。
// cards は確認カード（イベントの下書き・会場の登録）
export function splitAnswer(raw: string): { text: string; refs: CheeryRef[] | null; cards: CheeryCard[] | null } {
  const i = raw.indexOf(REFS_SEPARATOR);
  if (i < 0) return { text: stripRefs(afterReset(raw)), refs: null, cards: null };
  let refs: CheeryRef[] | null = null;
  let cards: CheeryCard[] | null = null;
  try {
    const parsed = JSON.parse(raw.slice(i + 1)) as { refs?: CheeryRef[]; cards?: CheeryCard[] };
    refs = Array.isArray(parsed.refs) ? parsed.refs : [];
    cards = Array.isArray(parsed.cards) ? parsed.cards : [];
  } catch {
    refs = null;
  }
  return { text: stripRefs(afterReset(raw.slice(0, i))), refs, cards };
}
