// チアリー(AI) の応答の受け取り方（画面とサーバーで共用。知識集など重いものは持ち込まない）。
// 応答は「本文」＋区切り記号＋「行き先ボタン・動画カードの材料(JSON)」の順に流れてくる（app/api/cheery/chat）。
import type { CheeryRef } from "@/lib/ai/refs";
import type { CheeryCard } from "@/lib/cheery/cards";

// 本文には現れない制御文字
export const REFS_SEPARATOR = "\u001e";
export const REF_PATTERN = /〔参照[:：]\s*([^〕]*)〕/g;

// 本文から〔参照:…〕を取り除く。流れてくる途中で閉じていない〔参照… も隠す
export function stripRefs(text: string): string {
  let out = text.replace(REF_PATTERN, "");
  const open = out.lastIndexOf("〔");
  if (open >= 0 && !out.slice(open).includes("〕") && "〔参照".startsWith(out.slice(open, open + 3))) out = out.slice(0, open);
  return out.replace(/\s+$/, "");
}

// 受け取った途中までの文字列を、画面に出す本文とカードに分ける（カードは届き切るまで null）。
// cards は確認カード（イベントの下書き・会場の登録）
export function splitAnswer(raw: string): { text: string; refs: CheeryRef[] | null; cards: CheeryCard[] | null } {
  const i = raw.indexOf(REFS_SEPARATOR);
  if (i < 0) return { text: stripRefs(raw), refs: null, cards: null };
  let refs: CheeryRef[] | null = null;
  let cards: CheeryCard[] | null = null;
  try {
    const parsed = JSON.parse(raw.slice(i + 1)) as { refs?: CheeryRef[]; cards?: CheeryCard[] };
    refs = Array.isArray(parsed.refs) ? parsed.refs : [];
    cards = Array.isArray(parsed.cards) ? parsed.cards : [];
  } catch {
    refs = null;
  }
  return { text: stripRefs(raw.slice(0, i)), refs, cards };
}
