// OpenAI で会話を1回分実行する。store: false で OpenAI 側に会話を保存させない（requirements.md 5.1）。
import OpenAI from "openai";
import { z } from "zod";
import { addUsage, emptyUsage, runTool, type ChatProvider, type ChatRequest, type ChatResult, type ChatUsage } from "../types";

function usageOf(u: OpenAI.CompletionUsage | undefined): ChatUsage {
  if (!u) return emptyUsage();
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  return { inputTokens: u.prompt_tokens - cached, cacheReadTokens: cached, cacheWriteTokens: 0, outputTokens: u.completion_tokens };
}

export function createOpenAIProvider(client: OpenAI = new OpenAI()): ChatProvider {
  return {
    async run(req: ChatRequest): Promise<ChatResult> {
      const tools: OpenAI.Chat.ChatCompletionTool[] = req.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: z.toJSONSchema(t.input) as Record<string, unknown> },
      }));
      // OpenAI は先頭が同じなら自動でキャッシュされるので、変わらない部分を前に置く
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: req.systemVolatile ? `${req.systemStable}\n\n${req.systemVolatile}` : req.systemStable },
        ...req.turns.map((t) => ({ role: t.role, content: t.text }) as OpenAI.Chat.ChatCompletionMessageParam),
      ];

      let usage = emptyUsage();
      for (let round = 0; ; round++) {
        const stream = client.chat.completions.stream(
          {
            model: req.model,
            max_completion_tokens: req.maxOutputTokens,
            store: false,
            stream_options: { include_usage: true },
            messages,
            ...(tools.length ? { tools } : {}),
          },
          { signal: req.signal },
        );
        stream.on("content", (delta) => req.onText(delta));
        const completion = await stream.finalChatCompletion();
        usage = addUsage(usage, usageOf(completion.usage));

        const choice = completion.choices[0];
        if (!choice) return { usage, finish: "end" };
        if (choice.finish_reason === "content_filter" || choice.message.refusal) return { usage, finish: "refusal" };
        if (choice.finish_reason === "length") return { usage, finish: "max_tokens" };
        const calls = (choice.message.tool_calls ?? []).filter((c) => c.type === "function");
        if (choice.finish_reason !== "tool_calls" || calls.length === 0) return { usage, finish: "end" };
        if (round + 1 >= req.maxToolRounds) return { usage, finish: "tool_rounds" };

        messages.push({ role: "assistant", content: choice.message.content ?? null, tool_calls: calls });
        for (const call of calls) {
          let input: unknown = {};
          try { input = JSON.parse(call.function.arguments || "{}"); } catch { input = null; }
          const r = await runTool(req.tools, call.function.name, input);
          messages.push({ role: "tool", tool_call_id: call.id, content: r.content });
        }
      }
    },
  };
}
