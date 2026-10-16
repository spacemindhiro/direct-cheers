#!/usr/bin/env node
// PR の説明に「アクセス範囲表」があるかを検査する（main への PR の必須チェックの先頭で実行）。
//
// 2026-10-16 本番セキュリティ障害の再発防止：代理作成した下書きを「主催者に送らない」＝通知を止めることだと
// 解釈し、主催者の一覧・画面に丸見えのまま本番に出した。設計・テスト・検証のすべてで「誰に送られるか」だけを
// 追い、「誰が読めるか・操作できるか」を確かめていなかった。コードに触る PR は、関係者ごとに
// 「一覧／画面／API／DB（RLS）」で見える・操作できるかを表にし、見えてはいけない側（×）を必ず書く。
//
// 使い方（CI）: PR_BODY / BASE_SHA / HEAD_SHA を環境変数で渡して実行する。
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// 見える範囲・操作できる範囲に影響しうるファイル
export const TARGET_PATTERNS = [/^app\//, /^lib\//, /^components\//, /^proxy\.ts$/, /^supabase\/migrations\//];

export const HEADING = "## アクセス範囲表";
const PLACEHOLDER = /〈[^〉]*〉/;

export function needsAccessMatrix(changedFiles) {
  return changedFiles.filter((f) => TARGET_PATTERNS.some((re) => re.test(f)));
}

// 戻り値: { ok: boolean, reason: string }
export function checkAccessMatrix(body) {
  // テンプレートの説明（HTMLコメント）は判定に含めない（中に〈〉や「変更なし」の例がある）
  const text = (body ?? "").replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  const start = text.indexOf(HEADING);
  if (start < 0) return { ok: false, reason: `PRの説明に「${HEADING}」の見出しがありません` };

  // 見出しの次の行から、次の「## 」見出しの手前までがこの節
  const rest = text.slice(start + HEADING.length);
  const next = rest.search(/\n## /);
  const section = next < 0 ? rest : rest.slice(0, next);

  if (PLACEHOLDER.test(section)) return { ok: false, reason: "雛形の〈〉が残っています。実際の内容に書き換えてください" };

  // 見える範囲が変わらない PR：「アクセス範囲：変更なし」＋理由（10文字以上）
  const noChange = section.match(/アクセス範囲[：:]\s*変更なし/);
  if (noChange) {
    const reason = section.match(/理由[：:]\s*(.+)/);
    if (!reason || reason[1].trim().length < 10) {
      return { ok: false, reason: "「変更なし」とする場合は「理由：」に、見える範囲が変わらない根拠を10文字以上で書いてください" };
    }
    return { ok: true, reason: "変更なし（理由あり）" };
  }

  const rows = section.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (rows.length === 0) return { ok: false, reason: "アクセス範囲表（| で始まる表）がありません" };
  const header = rows[0];
  for (const col of ["関係者", "状態"]) {
    if (!header.includes(col)) return { ok: false, reason: `表の見出し行に「${col}」の列がありません` };
  }
  const dataRows = rows.slice(1).filter((r) => !/^\|[\s:|-]+\|?$/.test(r));
  if (dataRows.length === 0) return { ok: false, reason: "表にデータ行がありません" };
  if (!dataRows.some((r) => r.includes("×"))) {
    return { ok: false, reason: "表に「×」（見えてはいけない・操作できてはいけない）の行がありません。見せない相手を必ず書いてください" };
  }
  return { ok: true, reason: `表 ${dataRows.length} 行（× を含む）` };
}

function main() {
  const { PR_BODY = "", BASE_SHA, HEAD_SHA } = process.env;
  if (!BASE_SHA || !HEAD_SHA) {
    console.error("BASE_SHA / HEAD_SHA が必要です");
    process.exit(2);
  }
  const changed = execSync(`git diff --name-only ${BASE_SHA}...${HEAD_SHA}`, { encoding: "utf8" })
    .split("\n").filter(Boolean);
  const targets = needsAccessMatrix(changed);
  if (targets.length === 0) {
    console.log("✅ アクセス範囲表：対象ファイルの変更なし（チェック不要）");
    return;
  }
  const result = checkAccessMatrix(PR_BODY);
  if (!result.ok) {
    console.error(`❌ アクセス範囲表：${result.reason}`);
    console.error("対象ファイル:");
    for (const f of targets.slice(0, 20)) console.error(`  - ${f}`);
    console.error("書き方は .github/pull_request_template.md を参照。PRの説明を直すとこのチェックは再実行されます。");
    process.exit(1);
  }
  console.log(`✅ アクセス範囲表：${result.reason}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
