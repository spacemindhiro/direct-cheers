// チアリー(AI) のプロバイダー共通の型。Anthropic / OpenAI の違いは providers/ の中に閉じ込める。
export type ChatTurn = { role: "user" | "assistant"; text: string };

// AIが呼べる機能。DC のデータに触るものはすべて DC の MCP サーバー（lib/mcp）のツールで、
// ここにはその一覧（MCP の tools/list）と呼び出し口（tools/call）が入る。入力の検査は MCP サーバー側で行う
export type AiTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
  run: (input: Record<string, unknown>) => Promise<{ content: string; isError: boolean }>;
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
  // その周がツールの呼び出しで終わった（その周の文章は前置きで、最後の答えでまた同じことを書く）。
  // 画面は前置きを消して、最後の周の文章だけを残す（同じことを2回言ったように見えるのを防ぐ）
  onToolRound?: () => void;
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

// AIが求めた機能を呼ぶ。モデルの出力は信用しない（オブジェクトでなければ呼ばない。中身の検査は MCP サーバー側）
export async function runTool(tools: AiTool[], name: string, rawInput: unknown): Promise<{ content: string; isError: boolean }> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { content: `未知の機能です: ${name}`, isError: true };
  const input = rawInput ?? {};
  if (typeof input !== "object" || Array.isArray(input)) return { content: "入力の形式が正しくありません", isError: true };
  try {
    return await tool.run(input as Record<string, unknown>);
  } catch {
    // 例外の中身（データが含まれうる）はAIにもログにも出さない
    return { content: "データの取得に失敗しました", isError: true };
  }
}

export const REPEATED_CALL_TEXT = "この内容はすでに調べました（結果は上にあります）。もう一度呼ばずに、その結果を使って答えてください。";

// 1回の質問の中で使う runTool。同じ機能を同じ入力でもう一度呼ばれたら、動かさずに断る
// （AI が同じ呼び出しを繰り返して上限まで空回りすることがある。カードが2枚出るのも防ぐ）。エラーで返った呼び出しは、呼び直せるよう数えない
export function toolRunner(tools: AiTool[]): (name: string, rawInput: unknown) => Promise<{ content: string; isError: boolean }> {
  const done = new Set<string>();
  return async (name, rawInput) => {
    const key = `${name}\n${JSON.stringify(rawInput ?? {})}`;
    if (done.has(key)) return { content: REPEATED_CALL_TEXT, isError: false };
    const r = await runTool(tools, name, rawInput);
    if (!r.isError) done.add(key);
    return r;
  };
}
