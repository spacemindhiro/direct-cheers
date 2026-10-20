// 本文の記法（lib/knowledge/types.ts の冒頭を参照）を部品に分解する。
// ヘルプ（React）とチアリー(AI)向けの平文の両方がこの結果を使う。
import { KNOWLEDGE_CONSTANTS } from "./constants";
import { refLabel, type RefMode } from "./index";
import type { KnowledgeItem } from "./types";

export type MarkupToken =
  | { t: "text"; v: string }
  | { t: "b"; v: string }
  | { t: "hl"; v: string }
  | { t: "a"; v: string; href: string };

const REF_MODES: RefMode[] = ["title", "no", "group"];

// {{KEY}} と [[id|mode]] を文字に置き換える。未知のキー・IDは例外にして、壊れた案内を出さない
export function expand(text: string, items?: KnowledgeItem[]): string {
  return text
    .replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key: string) => {
      const v = KNOWLEDGE_CONSTANTS[key];
      if (v === undefined) throw new Error(`知識データの未定義の定数: ${key}`);
      return v;
    })
    .replace(/\[\[([a-z0-9.-]+)(?:\|([a-z]+))?\]\]/g, (_, id: string, mode?: string) => {
      const m = (mode ?? "title") as RefMode;
      if (!REF_MODES.includes(m)) throw new Error(`知識データの参照の書き方が不正: [[${id}|${mode}]]`);
      return refLabel(id, m, items);
    });
}

const INLINE = /\*\*(.+?)\*\*|==(.+?)==|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseMarkup(text: string, items?: KnowledgeItem[]): MarkupToken[] {
  const s = expand(text, items);
  const out: MarkupToken[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "b", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "hl", v: m[2] });
    else out.push({ t: "a", v: m[3], href: m[4] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

// 平文（AI向け）。リンクは表示とURLが同じなら表示だけ、違えば「表示（URL）」
export function toPlainText(text: string, items?: KnowledgeItem[]): string {
  return parseMarkup(text, items)
    .map((tok) => {
      if (tok.t !== "a") return tok.v;
      return tok.href.replace(/^mailto:/, "") === tok.v ? tok.v : `${tok.v}（${tok.href}）`;
    })
    .join("");
}
