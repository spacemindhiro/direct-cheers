/* eslint-disable @typescript-eslint/no-explicit-any -- SDK・Supabaseクライアントの偽物を最小限の形で作るため */
/**
 * TC-CHEERY-PROVIDER: プロバイダー切り替え層（偽のSDKクライアントで、送る内容と受け取り方を確かめる）
 *   Anthropic：thinking無効・知識集のキャッシュ指定・ツールの繰り返し・使用量の合計・停止理由
 *   OpenAI：store:false・使用量（キャッシュ分の差し引き）・ツールの繰り返し
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createAnthropicProvider } from "@/lib/ai/providers/anthropic";
import { createOpenAIProvider } from "@/lib/ai/providers/openai";
import type { AiTool, ChatRequest } from "@/lib/ai/types";

function req(over: Partial<ChatRequest> = {}): ChatRequest & { texts: string[] } {
  const texts: string[] = [];
  return {
    model: "test-model",
    systemStable: "STABLE",
    systemVolatile: "VOLATILE",
    turns: [{ role: "user", text: "質問" }],
    tools: [],
    maxOutputTokens: 100,
    maxToolRounds: 3,
    onText: (d) => texts.push(d),
    texts,
    ...over,
  };
}

const echoTool = (calls: unknown[]): AiTool => ({
  name: "my_events",
  description: "自分のイベント",
  input: z.object({ limit: z.number().int().max(10) }),
  run: async (input) => { calls.push(input); return `events:${input.limit}`; },
});

// ── Anthropic の偽クライアント ──
type AMsg = { content: unknown[]; stop_reason: string; usage: Record<string, number | null> };
function fakeAnthropic(replies: { text?: string; msg: AMsg }[]) {
  const sent: any[] = [];
  let i = 0;
  const client = {
    messages: {
      stream(params: any) {
        sent.push(JSON.parse(JSON.stringify(params)));
        const r = replies[i++];
        let onText: ((d: string) => void) | undefined;
        return {
          on(ev: string, fn: (d: string) => void) { if (ev === "text") onText = fn; return this; },
          async finalMessage() { if (r.text) onText?.(r.text); return r.msg; },
        };
      },
    },
  };
  return { client: client as any, sent };
}
const aUsage = (input: number, out: number, read = 0, write = 0) => ({ input_tokens: input, output_tokens: out, cache_read_input_tokens: read, cache_creation_input_tokens: write });

describe("TC-CHEERY-PROVIDER: Anthropic", () => {
  it("送る内容：thinking無効、知識集にキャッシュ指定、画面情報はその後ろ、ツールなしなら tools を送らない", async () => {
    const { client, sent } = fakeAnthropic([{ text: "こんにちは", msg: { content: [{ type: "text", text: "こんにちは" }], stop_reason: "end_turn", usage: aUsage(10, 5, 1000, 0) } }]);
    const r = req();
    const result = await createAnthropicProvider(client).run(r);
    expect(sent[0].thinking).toEqual({ type: "disabled" });
    expect(sent[0].system).toEqual([
      { type: "text", text: "STABLE", cache_control: { type: "ephemeral" } },
      { type: "text", text: "VOLATILE" },
    ]);
    expect(sent[0].messages).toEqual([{ role: "user", content: "質問" }]);
    expect("tools" in sent[0]).toBe(false);
    expect(r.texts).toEqual(["こんにちは"]);
    expect(result).toEqual({ finish: "end", usage: { inputTokens: 10, cacheReadTokens: 1000, cacheWriteTokens: 0, outputTokens: 5 } });
  });

  it("ツールを呼ばれたら実行して結果を返し、使用量は合計する", async () => {
    const calls: unknown[] = [];
    const { client, sent } = fakeAnthropic([
      { msg: { content: [{ type: "tool_use", id: "tu1", name: "my_events", input: { limit: 3 } }], stop_reason: "tool_use", usage: aUsage(100, 20, 0, 900) } },
      { text: "3件です", msg: { content: [{ type: "text", text: "3件です" }], stop_reason: "end_turn", usage: aUsage(50, 10, 900, 0) } },
    ]);
    const result = await createAnthropicProvider(client).run(req({ tools: [echoTool(calls)] }));
    expect(calls).toEqual([{ limit: 3 }]);
    expect(sent[0].tools[0].name).toBe("my_events");
    expect(sent[0].tools[0].eager_input_streaming).toBe(true);
    expect(sent[0].tools[0].input_schema.properties.limit.type).toBe("integer");
    expect(sent[1].messages[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "tu1", content: "events:3" }] });
    expect(result).toEqual({ finish: "end", usage: { inputTokens: 150, cacheReadTokens: 900, cacheWriteTokens: 900, outputTokens: 30 } });
  });

  it("ツールの入力が型に合わなければ実行せず、エラーとして返す", async () => {
    const calls: unknown[] = [];
    const { client, sent } = fakeAnthropic([
      { msg: { content: [{ type: "tool_use", id: "tu1", name: "my_events", input: { limit: 999 } }], stop_reason: "tool_use", usage: aUsage(1, 1) } },
      { msg: { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: aUsage(1, 1) } },
    ]);
    await createAnthropicProvider(client).run(req({ tools: [echoTool(calls)] }));
    expect(calls).toEqual([]);
    expect(sent[1].messages[2].content[0]).toEqual({ type: "tool_result", tool_use_id: "tu1", content: "入力の形式が正しくありません", is_error: true });
  });

  it("停止理由：refusal / max_tokens（ツールは実行しない）/ ツールの繰り返し上限", async () => {
    const calls: unknown[] = [];
    const toolTurn = { content: [{ type: "tool_use", id: "t", name: "my_events", input: { limit: 1 } }], stop_reason: "tool_use", usage: aUsage(1, 1) };
    expect((await createAnthropicProvider(fakeAnthropic([{ msg: { content: [], stop_reason: "refusal", usage: aUsage(1, 1) } }]).client).run(req())).finish).toBe("refusal");
    expect((await createAnthropicProvider(fakeAnthropic([{ msg: { ...toolTurn, stop_reason: "max_tokens" } }]).client).run(req({ tools: [echoTool(calls)] }))).finish).toBe("max_tokens");
    expect(calls).toEqual([]);
    const loop = fakeAnthropic([{ msg: toolTurn }, { msg: toolTurn }, { msg: toolTurn }, { msg: toolTurn }]);
    const r = await createAnthropicProvider(loop.client).run(req({ tools: [echoTool(calls)], maxToolRounds: 2 }));
    expect(r.finish).toBe("tool_rounds");
    expect(loop.sent.length).toBe(2);
  });
});

// ── OpenAI の偽クライアント ──
function fakeOpenAI(replies: { text?: string; completion: any }[]) {
  const sent: any[] = [];
  let i = 0;
  const client = {
    chat: {
      completions: {
        stream(params: any) {
          sent.push(JSON.parse(JSON.stringify(params)));
          const r = replies[i++];
          let onContent: ((d: string) => void) | undefined;
          return {
            on(ev: string, fn: (d: string) => void) { if (ev === "content") onContent = fn; return this; },
            async finalChatCompletion() { if (r.text) onContent?.(r.text); return r.completion; },
          };
        },
      },
    },
  };
  return { client: client as any, sent };
}
const oUsage = (prompt: number, completion: number, cached = 0) => ({ prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion, prompt_tokens_details: { cached_tokens: cached } });

describe("TC-CHEERY-PROVIDER: OpenAI", () => {
  it("store:false・使用量の取得を指定し、キャッシュ分は入力から差し引く", async () => {
    const { client, sent } = fakeOpenAI([{ text: "はい", completion: { choices: [{ finish_reason: "stop", message: { content: "はい", refusal: null } }], usage: oUsage(1000, 20, 800) } }]);
    const r = req();
    const result = await createOpenAIProvider(client).run(r);
    expect(sent[0].store).toBe(false);
    expect(sent[0].stream_options).toEqual({ include_usage: true });
    expect(sent[0].messages[0]).toEqual({ role: "system", content: "STABLE\n\nVOLATILE" });
    expect(r.texts).toEqual(["はい"]);
    expect(result).toEqual({ finish: "end", usage: { inputTokens: 200, cacheReadTokens: 800, cacheWriteTokens: 0, outputTokens: 20 } });
  });

  it("ツール呼び出しを実行して結果を返す", async () => {
    const calls: unknown[] = [];
    const { client, sent } = fakeOpenAI([
      { completion: { choices: [{ finish_reason: "tool_calls", message: { content: null, refusal: null, tool_calls: [{ id: "c1", type: "function", function: { name: "my_events", arguments: "{\"limit\":2}" } }] } }], usage: oUsage(10, 5) } },
      { completion: { choices: [{ finish_reason: "stop", message: { content: "2件", refusal: null } }], usage: oUsage(20, 5) } },
    ]);
    const result = await createOpenAIProvider(client).run(req({ tools: [echoTool(calls)] }));
    expect(calls).toEqual([{ limit: 2 }]);
    expect(sent[0].tools[0].function.name).toBe("my_events");
    expect(sent[1].messages.at(-1)).toEqual({ role: "tool", tool_call_id: "c1", content: "events:2" });
    expect(result.usage).toEqual({ inputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 10 });
  });

  it("壊れた引数・拒否・長さ切れ", async () => {
    const calls: unknown[] = [];
    const broken = fakeOpenAI([
      { completion: { choices: [{ finish_reason: "tool_calls", message: { content: null, refusal: null, tool_calls: [{ id: "c1", type: "function", function: { name: "my_events", arguments: "{壊れ" } }] } }], usage: oUsage(1, 1) } },
      { completion: { choices: [{ finish_reason: "stop", message: { content: "x", refusal: null } }], usage: oUsage(1, 1) } },
    ]);
    await createOpenAIProvider(broken.client).run(req({ tools: [echoTool(calls)] }));
    expect(calls).toEqual([]);
    expect(broken.sent[1].messages.at(-1)).toEqual({ role: "tool", tool_call_id: "c1", content: "入力の形式が正しくありません" });
    expect((await createOpenAIProvider(fakeOpenAI([{ completion: { choices: [{ finish_reason: "stop", message: { content: null, refusal: "no" } }], usage: oUsage(1, 1) } }]).client).run(req())).finish).toBe("refusal");
    expect((await createOpenAIProvider(fakeOpenAI([{ completion: { choices: [{ finish_reason: "length", message: { content: "途中", refusal: null } }], usage: oUsage(1, 1) } }]).client).run(req())).finish).toBe("max_tokens");
  });
});
