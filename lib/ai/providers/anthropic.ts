// Anthropic（Claude）で会話を1回分実行する。ツール（本人の実データ取得）があれば、決めた回数まで繰り返す。
import Anthropic from "@anthropic-ai/sdk";
import { REPEATED_CALL_TEXT, addUsage, emptyUsage, toolRunner, type ChatProvider, type ChatRequest, type ChatResult, type ChatUsage } from "../types";

function usageOf(u: Anthropic.Usage): ChatUsage {
  return {
    inputTokens: u.input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
  };
}

export function createAnthropicProvider(client: Anthropic = new Anthropic()): ChatProvider {
  return {
    async run(req: ChatRequest): Promise<ChatResult> {
      // ツールは毎回同じ順番で渡す（順番が変わるとキャッシュが外れる）
      const tools: Anthropic.Tool[] = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        eager_input_streaming: true,
      }));
      // 人格・ルール・知識集はロールごとに同じなのでキャッシュする。今の画面などはその後ろに置く
      const system: Anthropic.TextBlockParam[] = [
        { type: "text", text: req.systemStable, cache_control: { type: "ephemeral" } },
        ...(req.systemVolatile ? [{ type: "text" as const, text: req.systemVolatile }] : []),
      ];
      const messages: Anthropic.MessageParam[] = req.turns.map((t) => ({ role: t.role, content: t.text }));

      let usage = emptyUsage();
      const runTool = toolRunner(req.tools);
      // 同じ呼び出しを断った次の周と最後の周は、ツールを使わせず答えだけを書かせる（openai.ts と同じ）
      let forceAnswer = false;
      for (let round = 0; ; round++) {
        const answerOnly = forceAnswer || round + 1 >= req.maxToolRounds;
        const stream = client.messages.stream(
          {
            model: req.model,
            max_tokens: req.maxOutputTokens,
            // 案内用途なので考える過程は不要（費用と待ち時間を抑える）
            thinking: { type: "disabled" },
            system,
            messages,
            // 一覧は毎回同じに渡し（キャッシュのため）、使わせないときは tool_choice で止める
            ...(tools.length ? { tools, ...(answerOnly ? { tool_choice: { type: "none" as const } } : {}) } : {}),
          },
          { signal: req.signal },
        );
        stream.on("text", (delta) => req.onText(delta));
        const message = await stream.finalMessage();
        usage = addUsage(usage, usageOf(message.usage));

        if (message.stop_reason === "refusal") return { usage, finish: "refusal" };
        const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        if (message.stop_reason === "max_tokens") return { usage, finish: "max_tokens" };
        if (message.stop_reason !== "tool_use" || toolUses.length === 0) return { usage, finish: "end" };
        if (round + 1 >= req.maxToolRounds) return { usage, finish: "tool_rounds" };
        req.onToolRound?.();

        // 前置きの文は画面から消すので、AI にも戻さない（見えない文を「もう言った」と受け取って同じことを繰り返すのを防ぐ）
        messages.push({ role: "assistant", content: toolUses });
        const results: Anthropic.ToolResultBlockParam[] = [];
        forceAnswer = false;
        for (const tu of toolUses) {
          const r = await runTool(tu.name, tu.input);
          if (r.content === REPEATED_CALL_TEXT) forceAnswer = true;
          results.push({ type: "tool_result", tool_use_id: tu.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
        }
        messages.push({ role: "user", content: results });
      }
    },
  };
}
