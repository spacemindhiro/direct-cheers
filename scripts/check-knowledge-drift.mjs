#!/usr/bin/env node
// 元コードを変えたのに知識集（lib/knowledge/items/）が直っていない PR を止める（main への PR の必須チェックで実行）。
//
// 知識集の各項目は sources に「内容の根拠になっているコード」を持つ。PR がそのコードを変えたのに、
// その項目の文面が変わっていなければ、ヘルプとチアリー(AI)が古い仕様を案内し続ける（＝案内の迷子）。
// 文面を直すか、PRの説明に「知識集：変更なし」と理由（案内している内容に影響しない根拠）を書けば通る。
//
// 使い方（CI）: PR_BODY / BASE_SHA / HEAD_SHA を環境変数で渡して実行する。
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const ITEMS_DIR = "lib/knowledge/items";
export const HEADING = "## 知識集";

// 項目ファイルの本文を { id → 項目のソース片 } に分ける。各項目は `kind: "..."` で始まり、直後に id を持つ
export function splitItems(fileText) {
  const out = new Map();
  for (const chunk of (fileText ?? "").split(/\n\s*kind: "/).slice(1)) {
    const id = chunk.match(/\bid: "([^"]+)"/);
    if (id) out.set(id[1], chunk);
  }
  return out;
}

export function sourcesOf(chunk) {
  // パスに [eventId] のような角括弧を含むので、文字列の外の ] で閉じる
  const m = chunk.match(/sources: \[((?:"[^"]*"|[\s,])*)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

// changed: 変更ファイル一覧 / head, base: { id → 項目片 }（base に無い項目は新規）
// 戻り値: 根拠のコードが変わったのに文面が変わっていない項目 [{ id, files }]
export function findStaleItems(changed, head, base) {
  const changedSet = new Set(changed);
  const stale = [];
  for (const [id, chunk] of head) {
    const files = sourcesOf(chunk).filter((f) => changedSet.has(f));
    if (files.length === 0) continue;
    if (base.has(id) && base.get(id) === chunk) stale.push({ id, files });
  }
  return stale;
}

// 戻り値: { ok: boolean, reason: string }
export function checkDeclaration(body) {
  const text = (body ?? "").replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  const start = text.indexOf(HEADING);
  if (start < 0) return { ok: false, reason: `PRの説明に「${HEADING}」の見出しがありません` };
  const rest = text.slice(start + HEADING.length);
  const next = rest.search(/\n## /);
  const section = next < 0 ? rest : rest.slice(0, next);
  if (!/知識集[：:]\s*変更なし/.test(section)) {
    return { ok: false, reason: "「知識集：変更なし」の記載がありません（文面を直すか、影響しない理由を書いてください）" };
  }
  const reason = section.match(/理由[：:]\s*(.+)/);
  if (!reason || reason[1].trim().length < 10 || /〈[^〉]*〉/.test(reason[1])) {
    return { ok: false, reason: "「理由：」に、案内している内容に影響しない根拠を10文字以上で書いてください" };
  }
  return { ok: true, reason: "変更なし（理由あり）" };
}

function readItems(rev) {
  const map = new Map();
  const files = rev
    ? execSync(`git ls-tree --name-only ${rev} ${ITEMS_DIR}/`, { encoding: "utf8" }).split("\n").filter(Boolean)
    : existsSync(ITEMS_DIR) ? readdirSync(ITEMS_DIR).map((f) => `${ITEMS_DIR}/${f}`) : [];
  for (const f of files.filter((f) => f.endsWith(".ts"))) {
    const text = rev ? execSync(`git show ${rev}:${f}`, { encoding: "utf8" }) : readFileSync(f, "utf8");
    for (const [id, chunk] of splitItems(text)) map.set(id, chunk);
  }
  return map;
}

function main() {
  const { PR_BODY = "", BASE_SHA, HEAD_SHA } = process.env;
  if (!BASE_SHA || !HEAD_SHA) {
    console.error("BASE_SHA / HEAD_SHA が必要です");
    process.exit(2);
  }
  const changed = execSync(`git diff --name-only ${BASE_SHA}...${HEAD_SHA}`, { encoding: "utf8" }).split("\n").filter(Boolean);
  const mergeBase = execSync(`git merge-base ${BASE_SHA} ${HEAD_SHA}`, { encoding: "utf8" }).trim();
  const stale = findStaleItems(changed, readItems(HEAD_SHA), readItems(mergeBase));
  if (stale.length === 0) {
    console.log("✅ 知識集：根拠のコードを変えた項目はすべて文面も更新済み（または対象なし）");
    return;
  }
  const result = checkDeclaration(PR_BODY);
  if (!result.ok) {
    console.error(`❌ 知識集：${result.reason}`);
    console.error("根拠のコードが変わったのに文面が変わっていない項目:");
    for (const s of stale) console.error(`  - ${s.id}（${s.files.join(", ")}）`);
    console.error(`文面は ${ITEMS_DIR}/ で直す。書き方は .github/pull_request_template.md を参照。`);
    process.exit(1);
  }
  console.log(`✅ 知識集：${result.reason}（対象 ${stale.map((s) => s.id).join(", ")}）`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
