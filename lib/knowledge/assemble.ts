// チアリー(AI)に渡す知識をロール別に組み立てる。サーバー側で profiles.role から呼ぶこと
// （クライアントが申告したロールを信用しない）。「言わないように指示する」のではなく
// 「そもそも渡さない」ことで、上位ロール向けの情報が漏れないようにする。
import { roleRank } from "@/lib/role-rank";
import type { KnowledgeItem, KnowledgeRole, KnowledgeBlock } from "./types";
import { KNOWLEDGE_ITEMS, helpNumber, helpTabLabel, HELP_GROUPS } from "./index";
import { toPlainText } from "./markup";

export function itemsForRole(role: string | null | undefined, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): KnowledgeItem[] {
  const rank = roleRank(role);
  return items.filter(
    (i) => rank >= roleRank(i.minRole) && !(i.exceptRoles ?? []).includes(role as KnowledgeRole),
  );
}

function blockText(b: KnowledgeBlock, items: KnowledgeItem[]): string {
  const plain = (s: string) => toPlainText(s, items);
  switch (b.type) {
    case "p":
      return plain(b.text);
    case "ul":
      return b.items.map((s) => `- ${plain(s)}`).join("\n");
    case "warn":
      return `⚠ ${plain(b.title)}\n${plain(b.text)}`;
    case "phase":
      return `【${b.label}】\n${b.items.map((s) => `- ${plain(s)}`).join("\n")}`;
  }
}

// ヘルプ上の場所。「ヘルプ：オーガナイザー＞準備・機能 ⑫」
function helpLocation(item: KnowledgeItem, items: KnowledgeItem[]): string | null {
  if (!item.help) return null;
  const tab = helpTabLabel(item.help.tab);
  if (item.kind === "faq") return `ヘルプ：${tab}＞よくある質問`;
  const group = HELP_GROUPS[item.help.tab].find((g) => g.id === item.help!.group);
  return `ヘルプ：${tab}${group ? `＞${group.label}` : ""} ${helpNumber(item.id, items)}`;
}

export function itemText(item: KnowledgeItem, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): string {
  const loc = helpLocation(item, items);
  const suffix = loc ? `（${loc}）` : "";
  if (item.kind === "faq") return `### Q. ${toPlainText(item.q, items)}${suffix}\nA. ${toPlainText(item.a, items)}`;
  return `### ${item.title}${suffix}\n${item.body.map((b) => blockText(b, items)).join("\n")}`;
}

function titleOf(item: KnowledgeItem, items: KnowledgeItem[]): string {
  return item.kind === "faq" ? `Q. ${toPlainText(item.q, items)}` : item.title;
}

// 詳細（tier: detail）の目次。AI はここから ID を選んで knowledge_detail で本文を読む
export function detailIndexForRole(role: string | null | undefined, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): string {
  const details = itemsForRole(role, items).filter((i) => i.tier === "detail");
  if (details.length === 0) return "";
  return ["## 詳細の目次（本文は knowledge_detail で ID を指定して読む）", ...details.map((i) => `- ${i.id}：${titleOf(i, items)}${i.indexHint ? `（${i.indexHint}）` : ""}`)].join("\n");
}

// ロールに見せてよい知識のうち、毎回渡す要点（core）の本文＋詳細の目次。システムプロンプトに入れる
export function knowledgeTextForRole(role: string | null | undefined, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): string {
  const core = itemsForRole(role, items).filter((i) => i.tier !== "detail").map((i) => itemText(i, items)).join("\n\n");
  const index = detailIndexForRole(role, items);
  return index ? `${core}\n\n${index}` : core;
}

// ロールに見せてよい知識の全文（要点＋詳細）。答え合わせで「答えの根拠が AI の手の届く所にあるか」を確かめるのに使う
export function fullKnowledgeTextForRole(role: string | null | undefined, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): string {
  return itemsForRole(role, items).map((i) => itemText(i, items)).join("\n\n");
}

// ID を指定して本文を返す（MCP ツール knowledge_detail）。ロールに見せてよい項目だけ。
// 見せてはいけない項目は「存在しない」と同じ扱いにする（ID を言い当てても読めない）
export function knowledgeDetailForRole(role: string | null | undefined, ids: string[], items: KnowledgeItem[] = KNOWLEDGE_ITEMS): string {
  const allowed = new Map(itemsForRole(role, items).map((i) => [i.id, i]));
  return ids.map((id) => {
    const item = allowed.get(id);
    return item ? itemText(item, items) : `### ${id}\n（この ID の項目はありません）`;
  }).join("\n\n");
}
