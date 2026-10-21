// チアリー(AI) の答えの「行き先ボタン」と「動画カード」。
// AI には URL や画面名を作らせず、答えの最後に根拠の項目IDを〔参照:ID,ID〕で書かせる。
// サーバーがそのIDを本人のロールで見てよい項目か確かめ、知識集からボタン・カードの材料を作って画面へ渡す。
import { itemsForRole, helpLocation } from "@/lib/knowledge/assemble";
import { toPlainText } from "@/lib/knowledge/markup";
import { TUTORIAL_VIDEO_IDS } from "@/lib/tutorial-videos";

import { REF_PATTERN } from "@/lib/cheery/stream";

export { REFS_SEPARATOR, stripRefs } from "@/lib/cheery/stream";
export const MAX_REFS = 3;

export type CheeryRef = {
  id: string;
  title: string;
  help?: { href: string; label: string };   // ヘルプの該当項目（ヘルプに載っている項目だけ）
  goto?: { href: string; label: string };   // その操作をする画面
  video?: { youtubeId: string; label: string };
};

export function extractRefs(text: string, role: string | null | undefined): CheeryRef[] {
  const allowed = new Map(itemsForRole(role).map((i) => [i.id, i]));
  const ids: string[] = [];
  for (const m of text.matchAll(REF_PATTERN)) {
    for (const raw of m[1].split(/[,、，\s]+/)) {
      const id = raw.trim();
      if (id && allowed.has(id) && !ids.includes(id)) ids.push(id);
    }
  }
  return ids.slice(0, MAX_REFS).map((id) => {
    const item = allowed.get(id)!;
    const title = item.kind === "faq" ? toPlainText(item.q) : item.title;
    const loc = helpLocation(item);
    const videoKey = item.kind === "section" ? item.help?.video : undefined;
    const youtubeId = videoKey ? TUTORIAL_VIDEO_IDS[videoKey] : undefined;
    return {
      id,
      title,
      ...(loc ? { help: { href: `/dashboard/help?item=${encodeURIComponent(id)}`, label: loc } } : {}),
      ...(item.goto ? { goto: item.goto } : {}),
      ...(youtubeId ? { video: { youtubeId, label: `動画で見る：${title}` } } : {}),
    };
  });
}
