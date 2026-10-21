// チアリー(AI)とヘルプの共通知識データの型。React を持ち込まない（サーバーでAIに渡す文面にも使うため）。
//
// 本文の文字列には次の記法が使える（lib/knowledge/markup.ts が解釈する）:
//   **太字**                 → 太字
//   ==強調==                 → 強調色（ヘルプでは text-indigo-300）
//   [表示](href)             → リンク
//   {{HOLD_DAYS}}            → コードの定数を差し込む（lib/knowledge/constants.ts）
//   [[organizer.evidence]]   → 「⑫ エビデンス提出」（番号は並び順から自動採番）
//   [[organizer.evidence|no]]    → ⑫
//   [[organizer.evidence|group]] → 準備・機能グループの⑫
import type { HelpTab, HelpGroup, HelpIconName } from "./placement";

export type KnowledgeRole = "user" | "artist" | "organizer" | "agent" | "admin";

export type KnowledgeBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "warn"; tone: "amber" | "red"; title: string; text: string }
  | { type: "phase"; label: string; items: string[] };

export type HelpIconTone = "pink" | "indigo" | "red";

type ItemBase = {
  id: string;
  // このロール以上に見せる（admin ⊇ agent ⊇ organizer ⊇ artist ⊇ user）
  minRole: KnowledgeRole;
  // 上位ロールでも当てはまらないもの（例: admin はチアを送れない）。AIに渡す時だけ外す。
  exceptRoles?: KnowledgeRole[];
  // 内容の根拠になっているコード。仕様が変わったときに直す箇所を辿るためのもの
  sources?: string[];
  // チアリー(AI)への渡し方。core（既定）＝毎回システムプロンプトに入れる／detail＝目次だけ入れ、
  // 本文は AI が必要なときに MCP ツール knowledge_detail で読む（毎回渡す量を抑えて精度を保つため）。
  // ヘルプ画面の表示には影響しない
  tier?: "core" | "detail";
  // detail の項目の目次に添える「中に何が書いてあるか」。AI が質問と関係あると気づけるよう、具体的な話題を並べる
  indexHint?: string;
  // チアリー(AI) の答えに出す「行き先ボタン」。その操作をする画面（URL にイベントIDなどを含まない固定の画面だけ）。
  // AI には URL を作らせず、AI が根拠に挙げた項目のここから画面がボタンを作る
  goto?: { href: string; label: string };
};

export type KnowledgeSection = ItemBase & {
  kind: "section";
  title: string;
  body: KnowledgeBlock[];
  help?: { tab: HelpTab; group?: HelpGroup; icon: HelpIconName; iconTone?: HelpIconTone; subtitle: string; video?: string };
};

export type KnowledgeFaq = ItemBase & {
  kind: "faq";
  q: string;
  a: string;
  help?: { tab: HelpTab };
};

export type KnowledgeItem = KnowledgeSection | KnowledgeFaq;
