// チアリー(AI) の会話は端末にだけ保存する（requirements.md 5.4）。アカウントごとに分け、ログアウトで消す。
// サーバーには保存しない（毎回、端末の履歴を送る）。
import type { CheeryRef } from "@/lib/ai/refs";
import type { CardDone, CheeryCard } from "@/lib/cheery/cards";

// cards：確認カード（イベントの下書き・会場の登録）。done：ボタンを押して済んだカード（card_id ごと）
export type CheeryMessage = {
  role: "user" | "assistant" | "error";
  text: string;
  refs?: CheeryRef[];
  cards?: CheeryCard[];
  done?: Record<string, CardDone>;
};

const PREFIX = "cheery:v1:";
const MAX_STORED = 60;

const keyOf = (userId: string) => `${PREFIX}${userId}`;

export function loadConversation(userId: string): CheeryMessage[] {
  try {
    const raw = localStorage.getItem(keyOf(userId));
    const list = raw ? (JSON.parse(raw) as CheeryMessage[]) : [];
    return Array.isArray(list) ? list.filter((m) => m && typeof m.text === "string") : [];
  } catch {
    return [];
  }
}

export function saveConversation(userId: string, messages: CheeryMessage[]): void {
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    // 保存できない（プライベートブラウズ等）ときは、この画面を開いている間だけの会話になる
  }
}

export function clearConversation(userId: string): void {
  try { localStorage.removeItem(keyOf(userId)); } catch { /* 何もしない */ }
}

// ログアウト時：この端末にあるすべてのアカウントの会話を消す
export function clearAllConversations(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch { /* 何もしない */ }
}
