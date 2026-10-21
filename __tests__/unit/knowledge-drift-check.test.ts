/**
 * TC-KNOWLEDGE-DRIFT: 知識集の直し忘れチェック（scripts/check-knowledge-drift.mjs）
 *
 * 根拠のコード（sources）を変えたのに項目の文面が変わっていない PR を止める。
 * 文面を直した／新規項目／根拠に触れていない場合は通す。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
// @ts-expect-error -- .mjs（型定義なし）
import { splitItems, sourcesOf, findStaleItems, checkDeclaration } from "../../scripts/check-knowledge-drift.mjs";
import { KNOWLEDGE_ITEMS } from "@/lib/knowledge";

const FILE = `import type { KnowledgeItem } from "../types";
export const X: KnowledgeItem[] = [
  {
    kind: "section",
    id: "a.one",
    minRole: "user",
    title: "一",
    sources: ["lib/a.ts", "app/api/b/route.ts"],
    body: [{ type: "p", text: "一の本文" }],
  },
  {
    kind: "faq",
    id: "a.two",
    minRole: "user",
    q: "二？",
    a: "二の答え",
  },
];
`;

describe("TC-KNOWLEDGE-DRIFT: 項目の切り出し", () => {
  it("項目ごとに id と sources が取れる", () => {
    const items = splitItems(FILE);
    expect([...items.keys()]).toEqual(["a.one", "a.two"]);
    expect(sourcesOf(items.get("a.one"))).toEqual(["lib/a.ts", "app/api/b/route.ts"]);
    expect(sourcesOf(items.get("a.two"))).toEqual([]);
  });

  it("実際の知識集ファイルから、登録簿と同じ項目・同じ sources が取れる", () => {
    const parsed = new Map<string, string>();
    for (const f of readdirSync("lib/knowledge/items")) {
      for (const [id, chunk] of splitItems(readFileSync(`lib/knowledge/items/${f}`, "utf8"))) parsed.set(id, chunk);
    }
    expect([...parsed.keys()].sort()).toEqual(KNOWLEDGE_ITEMS.map((i) => i.id).sort());
    for (const item of KNOWLEDGE_ITEMS) expect(`${item.id}:${JSON.stringify(sourcesOf(parsed.get(item.id)))}`).toBe(`${item.id}:${JSON.stringify(item.sources ?? [])}`);
  });

  it("sources に書いたファイルはすべて実在する", () => {
    for (const item of KNOWLEDGE_ITEMS) {
      for (const f of item.sources ?? []) {
        let exists = true;
        try { readFileSync(f); } catch { exists = false; }
        expect(`${item.id}:${f}:${exists}`).toBe(`${item.id}:${f}:true`);
      }
    }
  });

  // 行き先ボタンの画面が実在する（ロケール付きの画面は app/[locale] の下にある）
  it("goto（行き先ボタン）の画面がすべて実在する", () => {
    for (const item of KNOWLEDGE_ITEMS) {
      if (!item.goto) continue;
      const href = item.goto.href;
      const exists = [`app/[locale]${href}/page.tsx`, `app${href}/page.tsx`].some((f) => { try { readFileSync(f); return true; } catch { return false; } });
      expect(`${item.id}:${href}:${href.startsWith("/") && !href.includes("[") && exists}`).toBe(`${item.id}:${href}:true`);
    }
  });

  // sources が無い項目は、画面や仕様が変わっても直し忘れを検知できない（PR182 のサンクス特典のお知らせが素通りした）
  it("すべての項目に sources（案内の根拠のコード）がある", () => {
    const without = KNOWLEDGE_ITEMS.filter((i) => !i.sources?.length).map((i) => i.id);
    expect(without).toEqual([]);
  });
});

describe("TC-KNOWLEDGE-DRIFT: 直し忘れの判定", () => {
  const base = splitItems(FILE);

  it("根拠のコードを変えたのに文面が同じ → 止める", () => {
    expect(findStaleItems(["app/api/b/route.ts", "README.md"], splitItems(FILE), base)).toEqual([{ id: "a.one", files: ["app/api/b/route.ts"] }]);
  });

  it("文面も直していれば通す", () => {
    const head = splitItems(FILE.replace("一の本文", "一の本文（改）"));
    expect(findStaleItems(["lib/a.ts"], head, base)).toEqual([]);
  });

  it("根拠に触れていない変更は通す", () => {
    expect(findStaleItems(["lib/other.ts"], splitItems(FILE), base)).toEqual([]);
  });

  it("新しく足した項目（base に無い）は通す", () => {
    expect(findStaleItems(["lib/a.ts"], splitItems(FILE), new Map())).toEqual([]);
  });
});

describe("TC-KNOWLEDGE-DRIFT: 「変更なし」の申告", () => {
  it("見出し＋変更なし＋理由10文字以上 → 通す", () => {
    expect(checkDeclaration("## 知識集\n知識集：変更なし\n理由：内部の変数名を変えただけで動きは同じ\n\n## 確認\n")).toEqual({ ok: true, reason: "変更なし（理由あり）" });
  });

  it("見出しが無い → 止める", () => {
    expect(checkDeclaration("## 変更内容\nなし").ok).toBe(false);
  });

  it("理由が短い・雛形のまま → 止める", () => {
    expect(checkDeclaration("## 知識集\n知識集：変更なし\n理由：同じ").ok).toBe(false);
    expect(checkDeclaration("## 知識集\n知識集：変更なし\n理由：〈案内している内容に影響しない根拠〉").ok).toBe(false);
  });

  it("テンプレートの説明（HTMLコメント）の中の例文では通さない", () => {
    expect(checkDeclaration("## 知識集\n<!--\n  知識集：変更なし\n  理由：〈案内している内容に影響しない根拠〉\n-->\n").ok).toBe(false);
  });

  it("別の節に書いた「変更なし」は数えない", () => {
    expect(checkDeclaration("## 知識集\n\n## 確認\n知識集：変更なし\n理由：内部の変数名を変えただけで動きは同じ").ok).toBe(false);
  });
});
