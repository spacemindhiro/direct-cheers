// チアリー(AI) のプロバイダー共通の型。Anthropic / OpenAI の違いは providers/ の中に閉じ込める。
import type { z } from "zod";

export type ChatTurn = { role: "user" | "assistant"; text: string };

// AIが呼べる機能（本人の実データを読むもの）。run は本人の権限のまま実行すること
export type AiTool = {
  name: string;
  description: string;
  input: z.ZodType<Record<string, unknown>>;
  run: (input: Record<string, unknown>) => Promise<string>;
};

export type ChatUsage = {
  inputTokens: number;      // キャッシュを使わなかった入力
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
};

export type ChatRequest = {
  model: string;
  // 毎回同じ部分（人格・ルール・ロール別の知識集）。キャッシュの対象
  systemStable: string;
  // 回ごとに変わる部分（今の画面など）
  systemVolatile?: string;
  turns: ChatTurn[];
  tools: AiTool[];
  maxOutputTokens: number;
  maxToolRounds: number;
  onText: (delta: string) => void;
  signal?: AbortSignal;
};

export type ChatResult = {
  usage: ChatUsage;
  // end: 答え終わった / refusal: 安全のため答えなかった / max_tokens: 長すぎて途中で切れた / tool_rounds: データ取得の上限に達した
  finish: "end" | "refusal" | "max_tokens" | "tool_rounds";
};

export interface ChatProvider {
  run(req: ChatRequest): Promise<ChatResult>;
}

export function emptyUsage(): ChatUsage {
  return { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
}

export function addUsage(a: ChatUsage, b: ChatUsage): ChatUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

// ツールの入力を検査して実行する。モデルの出力は信用しない（型が合わなければ実行せずエラーを返す）
export async function runTool(tools: AiTool[], name: string, rawInput: unknown): Promise<{ content: string; isError: boolean }> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { content: `未知の機能です: ${name}`, isError: true };
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) return { content: "入力の形式が正しくありません", isError: true };
  try {
    return { content: await tool.run(parsed.data), isError: false };
  } catch {
    // 例外の中身（データが含まれうる）はAIにもログにも出さない
    return { content: "データの取得に失敗しました", isError: true };
  }
}
