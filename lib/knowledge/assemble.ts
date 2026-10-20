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

// ロールに見せてよい知識だけを、AIに渡す1つの文書にする
export function knowledgeTextForRole(role: string | null | undefined, items: KnowledgeItem[] = KNOWLEDGE_ITEMS): string {
  return itemsForRole(role, items).map((i) => itemText(i, items)).join("\n\n");
}
