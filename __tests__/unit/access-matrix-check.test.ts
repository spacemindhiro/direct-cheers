/**
 * TC-ACCESS-MATRIX: PR の説明のアクセス範囲表チェック（scripts/check-access-matrix.mjs）
 *
 * 2026-10-16 本番セキュリティ障害（代理作成の下書きが主催者に丸見え）の再発防止ゲート。
 * 書いていない・雛形のまま・見せない相手（×）が無い PR はマージできないこと。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error 型定義のない .mjs
import { checkAccessMatrix, needsAccessMatrix } from "../../scripts/check-access-matrix.mjs";

const template = fs.readFileSync(path.resolve(__dirname, "../../.github/pull_request_template.md"), "utf8");

const filled = `## 変更内容
代理作成の下書きを送るまで主催者から隠す

## アクセス範囲表
| 関係者 | 状態 | 一覧 | 画面 | API操作 | DB(RLS) |
|---|---|---|---|---|---|
| 主催者 | 代理作成・未送信 | × | × | × | ○ |
| 主催者 | 送信後 | ○ | ○ | ○ | ○ |
| 担当エージェント | 全状態 | ○ | ○ | ○ | ○ |

## 確認
- テスト：TC-PROXY-CREATE-G
`;

describe("TC-ACCESS-MATRIX-A: 対象ファイルの判定", () => {
  it("A-01: app/lib/components/proxy.ts/migrations は対象、docs・テスト・scripts・.github は対象外", () => {
    expect(needsAccessMatrix([
      "app/api/events/create/route.ts",
      "lib/proxy-draft.ts",
      "components/event-create-form.tsx",
      "proxy.ts",
      "supabase/migrations/20261016000000_x.sql",
      "docs/a.md",
      "__tests__/unit/x.test.ts",
      "scripts/check-access-matrix.mjs",
      ".github/workflows/test.yml",
    ])).toEqual([
      "app/api/events/create/route.ts",
      "lib/proxy-draft.ts",
      "components/event-create-form.tsx",
      "proxy.ts",
      "supabase/migrations/20261016000000_x.sql",
    ]);
  });
});

describe("TC-ACCESS-MATRIX-B: 通る", () => {
  it("B-01: 関係者・状態の列があり、× の行を含む表", () => {
    expect(checkAccessMatrix(filled)).toEqual({ ok: true, reason: "表 3 行（× を含む）" });
  });

  it("B-02: 「変更なし」＋10文字以上の理由", () => {
    const body = "## アクセス範囲表\nアクセス範囲：変更なし\n理由：メール本文の文言だけを変更し、誰が何を見られるかは変わらない\n";
    expect(checkAccessMatrix(body)).toEqual({ ok: true, reason: "変更なし（理由あり）" });
  });

  it("B-03: テンプレートの説明コメントを残したまま表を書いても通る", () => {
    const body = template.replace(
      "| 〈主催者〉 | 〈代理作成・未送信〉 | 〈×〉 | 〈×〉 | 〈×〉 | 〈○〉 |",
      "| 主催者 | 代理作成・未送信 | × | × | × | ○ |",
    );
    expect(checkAccessMatrix(body)).toEqual({ ok: true, reason: "表 1 行（× を含む）" });
  });
});

describe("TC-ACCESS-MATRIX-C: 落ちる", () => {
  it("C-01: 説明が空", () => {
    expect(checkAccessMatrix("").ok).toBe(false);
    expect(checkAccessMatrix(null).ok).toBe(false);
  });

  it("C-02: 見出しが無い", () => {
    expect(checkAccessMatrix(filled.replace("## アクセス範囲表", "## 権限"))).toEqual({
      ok: false, reason: "PRの説明に「## アクセス範囲表」の見出しがありません",
    });
  });

  it("C-03: テンプレートのまま（〈〉が残っている）", () => {
    expect(checkAccessMatrix(template)).toEqual({
      ok: false, reason: "雛形の〈〉が残っています。実際の内容に書き換えてください",
    });
  });

  it("C-04: × の行が無い（見せない相手を考えていない）", () => {
    const body = filled.replace("| 主催者 | 代理作成・未送信 | × | × | × | ○ |\n", "");
    expect(checkAccessMatrix(body).ok).toBe(false);
    expect(checkAccessMatrix(body).reason).toContain("×");
  });

  it("C-05: 見出し行に「関係者」の列が無い", () => {
    const body = filled.replace("| 関係者 |", "| 人 |");
    expect(checkAccessMatrix(body)).toEqual({ ok: false, reason: "表の見出し行に「関係者」の列がありません" });
  });

  it("C-06: 「変更なし」で理由が短い・無い", () => {
    expect(checkAccessMatrix("## アクセス範囲表\nアクセス範囲：変更なし\n理由：文言\n").ok).toBe(false);
    expect(checkAccessMatrix("## アクセス範囲表\nアクセス範囲：変更なし\n").ok).toBe(false);
  });

  it("C-07: 表が別の見出しの下にあるだけ（アクセス範囲表の節には無い）", () => {
    const body = "## アクセス範囲表\n\n## 確認\n| 関係者 | 状態 |\n|---|---|\n| 主催者 | × |\n";
    expect(checkAccessMatrix(body)).toEqual({ ok: false, reason: "アクセス範囲表（| で始まる表）がありません" });
  });

  it("C-08: 「変更なし」がテンプレートのコメント内にあるだけ", () => {
    const body = "## アクセス範囲表\n<!-- アクセス範囲：変更なし\n理由：見える範囲が変わらない根拠をここに書く -->\n";
    expect(checkAccessMatrix(body).ok).toBe(false);
  });
});
