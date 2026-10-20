/**
 * TC-KNOWLEDGE-QA: 答え合わせ質問集（lib/knowledge/qa-set.ts）とロール別の知識
 *
 * AIを呼ばずに確かめられる部分：そのロールの AI の手の届く知識（毎回渡す要点＋knowledge_detail で読める詳細）に
 * 「答えの根拠が入っている」こと、
 * 「入っていてはいけない文言（上位ロール向け・内部情報）が無い」こと。
 * 仕様変更で知識集の文言が変わり答えの根拠が消えたら、ここで落ちる。
 */
import { describe, it, expect } from "vitest";
import { QA_SET, GLOBAL_FORBIDDEN } from "@/lib/knowledge/qa-set";
import { fullKnowledgeTextForRole as knowledgeTextForRole } from "@/lib/knowledge/assemble";
import type { KnowledgeRole } from "@/lib/knowledge/types";

const ROLES: KnowledgeRole[] = ["user", "artist", "organizer", "agent", "admin"];

describe("TC-KNOWLEDGE-QA: 質問集", () => {
  it("30〜50問、IDが重複しない、全ロールに1問以上", () => {
    expect(QA_SET.length >= 30 && QA_SET.length <= 50).toBe(true);
    expect(new Set(QA_SET.map((c) => c.id)).size).toBe(QA_SET.length);
    for (const r of ROLES) expect(`${r}:${QA_SET.some((c) => c.role === r)}`).toBe(`${r}:true`);
  });

  for (const c of QA_SET) {
    it(`${c.id}（${c.role}）${c.q}`, () => {
      const text = knowledgeTextForRole(c.role);
      for (const e of c.expect) expect(`入っているべき「${e}」:${text.includes(e)}`).toBe(`入っているべき「${e}」:true`);
      for (const f of c.forbid ?? []) expect(`入っていてはいけない「${f}」:${text.includes(f)}`).toBe(`入っていてはいけない「${f}」:false`);
    });
  }
});

describe("TC-KNOWLEDGE-QA: どのロールにも渡さない内部情報", () => {
  for (const r of ROLES) {
    it(`${r} の知識に内部情報が無い`, () => {
      const text = knowledgeTextForRole(r);
      for (const f of GLOBAL_FORBIDDEN) expect(`${r}「${f}」:${text.includes(f)}`).toBe(`${r}「${f}」:false`);
    });
  }

  it("検査そのものが効いている（内部情報を混ぜた文書なら検出する）", () => {
    const polluted = `${knowledgeTextForRole("agent")}\nエージェント報酬の割合は50%`;
    expect(GLOBAL_FORBIDDEN.filter((f) => polluted.includes(f))).toEqual(["50%", "エージェント報酬の割合"]);
  });
});
