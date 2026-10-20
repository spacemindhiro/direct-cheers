// 知識データの登録簿。ヘルプ画面とチアリー(AI)はここだけを読む。
// 並び順＝ヘルプの表示順で、①②…の番号もこの順から自動で振る（手で番号を書かない）。
import type { KnowledgeItem, KnowledgeSection, KnowledgeFaq } from "./types";
import { HELP_TABS, HELP_GROUPS, type HelpTab, type HelpGroup } from "./placement";
import { USER_ITEMS } from "./items/user";
import { ARTIST_ITEMS } from "./items/artist";
import { ORGANIZER_ITEMS } from "./items/organizer";

export const KNOWLEDGE_ITEMS: KnowledgeItem[] = [...USER_ITEMS, ...ARTIST_ITEMS, ...ORGANIZER_ITEMS];

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

export function helpSections(tab: HelpTab, group?: HelpGroup, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): KnowledgeSection[] {
  return items.filter(
    (i): i is KnowledgeSection => i.kind === "section" && i.help?.tab === tab && i.help?.group === group,
  );
}

export function helpFaqs(tab: HelpTab, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): KnowledgeFaq[] {
  return items.filter((i): i is KnowledgeFaq => i.kind === "faq" && i.help?.tab === tab);
}

export function findItem(id: string, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): KnowledgeItem {
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error(`知識データに存在しないID: ${id}`);
  return item;
}

// ヘルプ上の番号（①…）。ヘルプに載っていない項目は null
export function helpNumber(id: string, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): string | null {
  const item = findItem(id, items);
  if (item.kind !== "section" || !item.help) return null;
  const idx = helpSections(item.help.tab, item.help.group, items).findIndex((s) => s.id === id);
  if (idx >= CIRCLED.length) throw new Error(`ヘルプの項目数が${CIRCLED.length}を超えた: ${item.help.tab}/${item.help.group}`);
  return CIRCLED[idx];
}

// 「① 支払い方法の準備（いちばん大事）」の形の見出し
export function helpTitle(section: KnowledgeSection, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): string {
  const no = helpNumber(section.id, items);
  return no ? `${no} ${section.title}` : section.title;
}

export type RefMode = "title" | "no" | "group";

// [[id]] / [[id|no]] / [[id|group]] の置き換え文字列
export function refLabel(id: string, mode: RefMode, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): string {
  const item = findItem(id, items);
  if (item.kind !== "section") throw new Error(`参照先が見出し項目ではない: ${id}`);
  const no = helpNumber(id, items);
  if (!no || !item.help) throw new Error(`参照先がヘルプに載っていない: ${id}`);
  if (mode === "no") return no;
  if (mode === "group") {
    const group = HELP_GROUPS[item.help.tab].find((g) => g.id === item.help!.group);
    if (!group) throw new Error(`参照先にグループが無い: ${id}`);
    return `${group.label}グループの${no}`;
  }
  return `「${no} ${item.title}」`;
}

export function helpTabLabel(tab: HelpTab): string {
  return HELP_TABS.find((t) => t.id === tab)!.label;
}

export { HELP_TABS, HELP_GROUPS };
export type { HelpTab, HelpGroup };
