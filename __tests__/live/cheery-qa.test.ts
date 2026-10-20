/**
 * TC-CHEERY-LIVE: 答え合わせ質問集（lib/knowledge/qa-set.ts）を実際のAIに投げる。
 * 実際に課金されるため、通常のテスト・CIでは動かない。動かすときだけ：
 *   CHEERY_LIVE=1 npx vitest run __tests__/live/cheery-qa.test.ts
 * - APIキーは .env.local から読む（表示・記録しない）。モデルは lib/ai/config.ts の既定（CHEERY_MODEL_FAQ で変更可）
 * - 費用の合計が LIVE_BUDGET_USD を超えたら残りは飛ばす
 * - 結果（質問・答え・判定・費用）は knowhow/ai-concierge/qa-results/ に書き出す（リポジトリには入れない）
 * - 判定は「答えに expect の文言が入っているか」の機械判定。言い換えで外れることがあるので、最後は目で確かめる
 */
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import { QA_SET } from "@/lib/knowledge/qa-set";
import { modelFor, costUsd, MAX_OUTPUT_TOKENS } from "@/lib/ai/config";
import { providerFor } from "@/lib/ai/providers";
import { buildStableSystem, buildVolatileSystem } from "@/lib/ai/prompt";
import { addUsage, emptyUsage } from "@/lib/ai/types";

const LIVE = process.env.CHEERY_LIVE === "1";
const LIVE_BUDGET_USD = 0.2;
const OUT_DIR = "/Users/Hiro/Documents/Dev/knowhow/ai-concierge/qa-results";

if (LIVE) {
  // .env.local から必要なキーだけを読む（.env.test のローカルDB設定は上書きしない）
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^(OPENAI_API_KEY|ANTHROPIC_API_KEY|CHEERY_MODEL_FAQ)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const results: { id: string; role: string; q: string; answer: string; hits: string[]; misses: string[]; costUsd: number; finish: string }[] = [];
let spent = 0;

describe.skipIf(!LIVE)("TC-CHEERY-LIVE: 質問集を実際のAIに投げる", () => {
  const spec = LIVE ? modelFor("faq") : null;

  afterAll(() => {
    if (!spec) return;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const passed = results.filter((r) => r.misses.length === 0).length;
    const md = [
      `# 答え合わせ結果 ${stamp}`,
      "",
      `- モデル: ${spec.key}`,
      `- 機械判定: ${passed}/${results.length} 問で expect の文言をすべて含む（言い換えで外れることがあるので要目視）`,
      `- 費用: $${spent.toFixed(5)}（約${Math.round(spent * 150 * 100) / 100}円）`,
      "",
      ...results.flatMap((r) => [
        `## ${r.id}（${r.role}）${r.misses.length === 0 ? "✅" : "⚠️"} ${r.q}`,
        "",
        r.answer,
        "",
        `- 含まれていた: ${r.hits.join(" / ") || "なし"}`,
        `- 含まれていなかった: ${r.misses.join(" / ") || "なし"}`,
        `- 費用: $${r.costUsd.toFixed(6)}・終わり方: ${r.finish}`,
        "",
      ]),
    ].join("\n");
    fs.writeFileSync(`${OUT_DIR}/${stamp}.md`, md);
    console.log(`結果: ${OUT_DIR}/${stamp}.md（${passed}/${results.length}、$${spent.toFixed(5)}）`);
  });

  for (const c of QA_SET) {
    it(`${c.id}（${c.role}）${c.q}`, async () => {
      if (spent > LIVE_BUDGET_USD) return; // 予算を超えたら残りは飛ばす
      const provider = providerFor(spec!.provider);
      let answer = "";
      const r = await provider.run({
        model: spec!.model,
        systemStable: buildStableSystem(c.role),
        systemVolatile: buildVolatileSystem(undefined),
        turns: [{ role: "user", text: c.q }],
        tools: [],
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxToolRounds: 1,
        onText: (d) => { answer += d; },
      });
      const cost = costUsd(spec!, addUsage(emptyUsage(), r.usage));
      spent += cost;
      const hits = c.expect.filter((e) => answer.includes(e));
      results.push({ id: c.id, role: c.role, q: c.q, answer, hits, misses: c.expect.filter((e) => !answer.includes(e)), costUsd: cost, finish: r.finish });
      expect(answer.length > 0).toBe(true);
    }, 60_000);
  }
});
