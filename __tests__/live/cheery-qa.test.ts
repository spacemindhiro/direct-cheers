/**
 * TC-CHEERY-LIVE: 答え合わせ質問集（lib/knowledge/qa-set.ts）を実際のAIに投げる。
 * 実際に課金されるため、通常のテスト・CIでは動かない。動かすときだけ：
 *   CHEERY_LIVE=1 npx vitest run __tests__/live/cheery-qa.test.ts
 *   同じ質問を何回か流して揺れを見るときは CHEERY_LIVE_REPEAT=3（問いごとに「何回中何回通ったか」を出す）
 * - APIキーは .env.local から読む（表示・記録しない）。モデルは lib/ai/config.ts の既定（CHEERY_MODEL_FAQ で変更可）
 * - 費用の合計が LIVE_BUDGET_USD を超えたら残りは飛ばす
 * - 結果（質問・答え・判定・費用）は knowhow/ai-concierge/qa-results/ に書き出す（リポジトリには入れない）
 * - 判定は「答えに expect の文言が入っているか」の機械判定。言い換えで外れることがあるので、最後は目で確かめる
 */
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import { QA_SET, answerHas, expectLabel } from "@/lib/knowledge/qa-set";
import { modelFor, costUsd, MAX_OUTPUT_TOKENS } from "@/lib/ai/config";
import { providerFor } from "@/lib/ai/providers";
import { buildStableSystem, buildVolatileSystem } from "@/lib/ai/prompt";
import { addUsage, emptyUsage } from "@/lib/ai/types";
import { connectDcMcp } from "@/lib/mcp/in-process";
import { testAdmin } from "../helpers/db-reset";

const LIVE = process.env.CHEERY_LIVE === "1";
const REPEAT = Math.max(1, Math.min(5, Number(process.env.CHEERY_LIVE_REPEAT ?? 1) || 1));
const LIVE_BUDGET_USD = 0.2 * REPEAT;
const OUT_DIR = "/Users/Hiro/Documents/Dev/knowhow/ai-concierge/qa-results";

if (LIVE) {
  // .env.local から必要なキーだけを読む（.env.test のローカルDB設定は上書きしない）
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^(OPENAI_API_KEY|ANTHROPIC_API_KEY|CHEERY_MODEL_FAQ)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const results: { id: string; run: number; role: string; q: string; answer: string; hits: string[]; misses: string[]; costUsd: number; finish: string; detail: string }[] = [];
let spent = 0;

describe.skipIf(!LIVE)("TC-CHEERY-LIVE: 質問集を実際のAIに投げる", () => {
  const spec = LIVE ? modelFor("faq") : null;

  afterAll(() => {
    if (!spec) return;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const passed = results.filter((r) => r.misses.length === 0).length;
    // 問いごとの通過回数（揺れを見る）
    const byId = new Map<string, { q: string; role: string; ok: number; n: number }>();
    for (const r of results) {
      const b = byId.get(r.id) ?? { q: r.q, role: r.role, ok: 0, n: 0 };
      b.n += 1;
      if (r.misses.length === 0) b.ok += 1;
      byId.set(r.id, b);
    }
    const shaky = [...byId.entries()].filter(([, b]) => b.ok < b.n);
    const md = [
      `# 答え合わせ結果 ${stamp}`,
      "",
      `- モデル: ${spec.key}`,
      `- 回数: 各問 ${REPEAT} 回`,
      `- 機械判定: ${passed}/${results.length} 回答で expect の文言をすべて含む（言い換えの組はどれか1つ。最後は目視）`,
      `- 全回で通った問い: ${byId.size - shaky.length}/${byId.size}`,
      `- 費用: $${spent.toFixed(5)}（約${Math.round(spent * 150 * 100) / 100}円）、1回答あたり平均 $${(spent / Math.max(1, results.length)).toFixed(6)}`,
      "",
      ...(shaky.length ? ["## 外れた回がある問い", "", ...shaky.map(([id, b]) => `- ${id}（${b.role}）${b.ok}/${b.n}：${b.q}`), ""] : []),
      ...results.flatMap((r) => [
        `## ${r.id}${REPEAT > 1 ? `-${r.run}` : ""}（${r.role}）${r.misses.length === 0 ? "✅" : "⚠️"} ${r.q}`,
        "",
        r.answer,
        "",
        `- 含まれていた: ${r.hits.join(" / ") || "なし"}`,
        `- 含まれていなかった: ${r.misses.join(" / ") || "なし"}`,
        `- 費用: $${r.costUsd.toFixed(6)}・終わり方: ${r.finish}`,
        `- 読んだ詳細: ${r.detail || "なし"}`,
        "",
      ]),
    ].join("\n");
    fs.writeFileSync(`${OUT_DIR}/${stamp}.md`, md);
    console.log(`結果: ${OUT_DIR}/${stamp}.md（${passed}/${results.length}、$${spent.toFixed(5)}）`);
  });

  for (const c of QA_SET) for (let run = 1; run <= REPEAT; run++) {
    it(`${c.id}${REPEAT > 1 ? `-${run}` : ""}（${c.role}）${c.q}`, async () => {
      if (spent > LIVE_BUDGET_USD) return; // 予算を超えたら残りは飛ばす
      const provider = providerFor(spec!.provider);
      // 本番と同じく MCP 経由で知識集の詳細を読めるようにする（本人のデータを読むツールは質問集には関係しないので渡さない）
      const mcp = await connectDcMcp({ userId: "00000000-0000-0000-0000-000000000000", email: null, role: c.role, supabase: testAdmin, admin: testAdmin });
      const tools = mcp.tools.filter((t) => t.name === "knowledge_detail");
      const usedTools: string[] = [];
      let answer = "";
      const r = await provider.run({
        model: spec!.model,
        systemStable: buildStableSystem(c.role),
        systemVolatile: buildVolatileSystem(undefined),
        turns: [{ role: "user", text: c.q }],
        tools: tools.map((t) => ({ ...t, run: async (input: Record<string, unknown>) => { usedTools.push(JSON.stringify(input)); return t.run(input); } })),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxToolRounds: 4,
        onText: (d) => { answer += d; },
      });
      await mcp.close();
      const cost = costUsd(spec!, addUsage(emptyUsage(), r.usage));
      spent += cost;
      const hits = c.expect.filter((e) => answerHas(answer, e)).map(expectLabel);
      results.push({ id: c.id, run, role: c.role, q: c.q, answer, hits, misses: c.expect.filter((e) => !answerHas(answer, e)).map(expectLabel), costUsd: cost, finish: r.finish, detail: usedTools.join(" ") });
      expect(answer.length > 0).toBe(true);
    }, 60_000);
  }
});
