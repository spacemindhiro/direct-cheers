/**
 * TC-CHEERY-BEHAVIOR: チアリー(AI) の挙動の質問集を実際のAIに投げる（P6）。
 * 知識の答え合わせ（cheery-qa.test.ts）と違い、ツールを使う場面を本番と同じ組み立てで流し、
 * カードの中身（ラベル・宛先）と答えの文を機械的に確かめる。実際に課金されるため、動かすときだけ：
 *   CHEERY_LIVE=1 npx vitest run __tests__/live/cheery-behavior.test.ts
 *   CHEERY_LIVE_REPEAT=3 で各場面を3回（揺れを見る）
 * - 手元の DB に一時的な主催者・出演者・イベント・会場を作り、最後に消す
 * - 結果（送った文・答え・カード・判定・費用）は knowhow/ai-concierge/qa-results/behavior-*.md に書き出す
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { modelFor, costUsd, MAX_OUTPUT_TOKENS, MAX_TOOL_ROUNDS } from "@/lib/ai/config";
import { providerFor } from "@/lib/ai/providers";
import { buildStableSystem, buildVolatileSystem } from "@/lib/ai/prompt";
import { addUsage, emptyUsage } from "@/lib/ai/types";
import { connectDcMcp } from "@/lib/mcp/in-process";
import { trimRewrite } from "@/lib/cheery/stream";
import type { EventDraftCard, QrCreateCard, QrEditCard } from "@/lib/cheery/cards";
import { testAdmin } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";

const LIVE = process.env.CHEERY_LIVE === "1";
const REPEAT = Math.max(1, Math.min(5, Number(process.env.CHEERY_LIVE_REPEAT ?? 1) || 1));
const BUDGET_USD = 0.3 * REPEAT;
const OUT_DIR = "/Users/Hiro/Documents/Dev/knowhow/ai-concierge/qa-results";

if (LIVE) {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^(OPENAI_API_KEY|ANTHROPIC_API_KEY|CHEERY_MODEL_FAQ)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const TAG = String(ts).slice(-5);
const ORG_NAME = "Demo主催者";
const ARTIST = `ナイト${TAG}`;
const EVENT = `挙動確認ライブ${TAG}`;
const VENUE = `挙動確認会場${TAG}`;
const OLD_LABEL = `旧ラベル${TAG}`;
const P: Record<string, string> = {};
let eventId = "";
let venueId = "";

type Check = { name: string; ok: boolean };
type Result = { id: string; run: number; title: string; turns: string[]; answers: string[]; cards: string; checks: Check[]; costUsd: number };
const results: Result[] = [];
let spent = 0;
let rawRewrites = 0; // AI が答えを書き直して付け足した回数（画面では落とす）

// 「作りました」と言ってはいけない（作るのは本人がカードのボタンを押したとき）
const SAID_MADE = /(作りました|作成しました|発行しました|登録しました)/;
// 同じ文（8文字以上）を2回以上書かない（10/23 に直した繰り返しが戻っていないか）
export function repeatedSentence(text: string): string | null {
  const seen = new Set<string>();
  for (const raw of text.split(/(?<=[。？！?!])|\n/)) {
    const t = raw.replace(/〔参照:[^〕]*〕/g, "").trim();
    if (t.length < 8) continue;
    if (seen.has(t)) return t;
    seen.add(t);
  }
  return null;
}
// 一人称は「チアリー」（「私」「わたし」を使わない）
const SAID_I = /(私は|私が|私の|わたし)/;

type Scenario = {
  id: string;
  title: string;
  turns: string[]; // 本人が順に送る文（前の答えを会話に入れて続ける）
  judge: (o: { answers: string[]; qr: QrCreateCard[]; drafts: EventDraftCard[]; edits: QrEditCard[] }) => Check[];
};

const SCENARIOS: Scenario[] = [
  {
    id: "B1", title: "ラベルを言わずに QR を頼む",
    turns: [`「${EVENT}」に、${ARTIST} さん宛てのスタンダードの QR を、1000円のワンプライスで作りたいです。`],
    judge: ({ answers, qr }) => [
      { name: "カードのラベルは空欄（チアリーが決めない）", ok: qr.every((c) => c.label === null) },
      { name: "誰に・何の案を出す（「〇〇 へのチア」）", ok: answers.join("").includes(`${ARTIST} へのチア`) || answers.join("").includes(`${ARTIST}へのチア`) },
      { name: "「作りました」と言わない", ok: !SAID_MADE.test(answers.join("")) },
    ],
  },
  {
    id: "B2", title: "ラベルをはっきり言って QR を頼む",
    turns: [`「${EVENT}」に、${ARTIST} さん宛てのスタンダードの QR を1000円で作りたいです。ラベルは「${ARTIST} 応援チア」にしてください。`],
    judge: ({ answers, qr }) => [
      { name: "カードが出る", ok: qr.length > 0 },
      { name: "本人の言葉がそのままラベルに入る", ok: qr.length > 0 && qr.every((c) => c.label === `${ARTIST} 応援チア`) },
      { name: "「作りました」と言わない", ok: !SAID_MADE.test(answers.join("")) },
    ],
  },
  {
    id: "B3", title: "ラベルを任せる",
    turns: [`「${EVENT}」に、${ARTIST} さん宛てのメッセージの QR を2000円で作りたいです。ラベルはいい感じにしておいてください。`],
    judge: ({ answers, qr }) => [
      { name: "カードのラベルは空欄のまま", ok: qr.every((c) => c.label === null) },
      { name: "案を出す（「〇〇 へのメッセージチア」など）", ok: /へのメッセージチア|へのチア/.test(answers.join("")) },
    ],
  },
  {
    id: "B4", title: "宛先を言わずに「半分ずつ」で頼む",
    turns: [`「${EVENT}」で、${ARTIST} さんと主催者の私で半分ずつ受け取るスタンダードの QR を、1500円で作りたいです。ラベルは「${ARTIST} と主催者へのチア」で。`],
    judge: ({ answers, qr }) => [
      { name: "宛先を決めない（カードなら宛先は未定、カードが無ければ聞き返す）", ok: qr.every((c) => !c.recipient_said) },
      { name: "宛先は1人と案内する", ok: /宛先.{0,30}(1人|一人|ひとり|お一人)|(1人|一人|お一人).{0,10}(選|決)/.test(answers.join("")) },
    ],
  },
  {
    id: "B5", title: "イベントに出ていない人を宛先にする",
    turns: [`「${EVENT}」で、「ゴースト${TAG}」さん宛てのスタンダードの QR を1000円で作りたいです。ラベルは「ゴースト${TAG} へのチア」です。`],
    judge: ({ answers, qr }) => [
      { name: "カードを出さない", ok: qr.length === 0 },
      { name: "選べる人を示す", ok: answers.join("").includes(ARTIST) },
    ],
  },
  {
    id: "B6", title: "下書きで出演者を言わない",
    turns: [`12月20日の19時から22時に、${VENUE}で「年末ライブ${TAG}」というイベントの下書きを作りたいです。`],
    judge: ({ answers, drafts }) => [
      { name: "出演者を聞き返す（出演者なしのカードを勝手に出さない）", ok: drafts.every((d) => d.performers.length > 0) && /出演者/.test(answers.join("")) },
      { name: "「作りました」と言わない", ok: !SAID_MADE.test(answers.join("")) },
    ],
  },
  {
    id: "B7", title: "あいさつ（人柄）",
    turns: ["こんにちは。今日はイベントの準備を手伝ってほしいです。"],
    judge: ({ answers }) => [
      { name: "表示名にさんを付けて呼ぶ", ok: answers.join("").includes(`${ORG_NAME}さん`) },
      { name: "「私」を使わない", ok: !SAID_I.test(answers.join("")) },
    ],
  },
  {
    id: "B8", title: "QR を作ったあとの注意",
    turns: [`「${EVENT}」に、${ARTIST} さん宛てのスタンダードの QR を1000円で作りたいです。ラベルは「${ARTIST} へのチア」で。`],
    judge: ({ answers }) => [
      { name: "掲示は会場内と公式配信だけと伝える", ok: /SNS/.test(answers.join("")) && /会場/.test(answers.join("")) },
      { name: "自分のカードでのテスト決済の禁止を伝える", ok: /自分のカード|ご自身のカード/.test(answers.join("")) },
    ],
  },
  {
    id: "B9", title: "QR のラベルをはっきり言って変える",
    turns: [`「${EVENT}」の「${OLD_LABEL}」の QR のラベルを「${ARTIST} への応援」に変えたいです。`],
    judge: ({ answers, edits }) => [
      { name: "変更のカードが出る", ok: edits.length > 0 },
      { name: "本人の言葉がそのまま新しいラベルに入る", ok: edits.length > 0 && edits.every((e) => e.change.label === `${ARTIST} への応援`) },
      { name: "すでに買ったお客様の Wallet にも出ると伝える", ok: /Wallet|ウォレット/.test(answers.join("")) },
      { name: "「変更しました」と言わない", ok: !/変更しました|変えました/.test(answers.join("")) },
    ],
  },
  {
    id: "B10", title: "QR のラベルを変えたいとだけ言う",
    turns: [`「${EVENT}」の「${OLD_LABEL}」の QR のラベルを、もっと分かりやすいものに変えたいです。`],
    judge: ({ answers, edits }) => [
      { name: "新しいラベルを決めない（カードなら空欄、カードが無ければ聞く）", ok: edits.every((e) => e.change.label === null || e.change.label === undefined) },
      { name: "誰に・何の案を出す", ok: answers.join("").includes(`${ARTIST} へのチア`) || answers.join("").includes(`${ARTIST}へのチア`) },
    ],
  },
];

beforeAll(async () => {
  if (!LIVE) return;
  for (const [k, role, name] of [["org", "organizer", ORG_NAME], ["ag", "agent", `挙動エージェント${TAG}`], ["art", "artist", ARTIST]] as const) {
    P[k] = await insertProfile({ role, displayName: name, email: `beh-${k}-${ts}@test.local` });
  }
  await testAdmin.from("profiles").update({ responsible_agent_id: P.ag }).eq("profile_id", P.org);
  await testAdmin.from("profiles").update({ artist_name: ARTIST }).eq("profile_id", P.art);
  await testAdmin.from("connections").insert({ organizer_profile_id: P.org, artist_profile_id: P.art, status: "active" });
  const { data: v } = await testAdmin.from("venues").insert({
    created_by: P.org, name: VENUE, postal_code: "150-0041", prefecture: "東京都", city: "渋谷区", line1: "1-1-1",
  }).select("venue_id").single();
  venueId = v!.venue_id;
  const { data: e } = await testAdmin.from("events").insert({
    title: EVENT, organizer_profile_id: P.org, agent_id: P.ag, lifecycle_status: "published",
    start_at: new Date(Date.now() + 10 * 86400e3).toISOString(), end_at: new Date(Date.now() + 10 * 86400e3 + 3 * 3600e3).toISOString(),
  }).select("event_id").single();
  eventId = e!.event_id;
  await testAdmin.from("event_artists").insert({ event_id: eventId, artist_profile_id: P.art, status: "confirmed" });
  // 変更の場面（B9・B10）で使う、作ってある QR
  const { data: prod } = await testAdmin.from("products").insert({ event_id: eventId, name: OLD_LABEL, type: "standard", payment_type: "A", min_amount: 1000, max_amount: 1000 }).select("product_id").single();
  const { data: qr } = await testAdmin.from("qr_configs").insert({ event_id: eventId, creator_profile_id: P.org, recipient_profile_id: P.art, recipient_name_context: "artist", product_id: prod!.product_id, label: OLD_LABEL }).select("qr_config_id").single();
  await testAdmin.from("qr_config_targets").insert({ qr_config_id: qr!.qr_config_id, profile_id: P.art, distribution_ratio: 1 });
}, 60_000);

afterAll(async () => {
  if (!LIVE) return;
  const spec = modelFor("faq");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const byCheck = new Map<string, { ok: number; n: number }>();
  for (const r of results) for (const c of r.checks) {
    const k = `${r.id} ${c.name.replace(/（「.*」）$/, "")}`;
    const b = byCheck.get(k) ?? { ok: 0, n: 0 };
    b.n += 1; if (c.ok) b.ok += 1;
    byCheck.set(k, b);
  }
  const allOk = [...byCheck.values()].filter((b) => b.ok === b.n).length;
  const md = [
    `# 挙動の確認結果 ${stamp}`,
    "",
    `- モデル: ${spec.key}`,
    `- 回数: 各場面 ${REPEAT} 回`,
    `- 確かめた項目: 全回で守れた ${allOk}/${byCheck.size}`,
    `- 費用: $${spent.toFixed(5)}（約${Math.round(spent * 150 * 100) / 100}円）、1会話あたり平均 $${(spent / Math.max(1, results.length)).toFixed(6)}`,
    `- AI が答えを書き直して付け足した回数: ${rawRewrites}（画面では2回目を落とす。trimRewrite）`,
    "",
    "## 項目ごと",
    "",
    "| 場面・項目 | 守れた回 |",
    "|---|---|",
    ...[...byCheck.entries()].map(([k, b]) => `| ${k} | ${b.ok}/${b.n}${b.ok < b.n ? " ⚠️" : ""} |`),
    "",
    ...results.flatMap((r) => [
      `## ${r.id}${REPEAT > 1 ? `-${r.run}` : ""} ${r.title} ${r.checks.every((c) => c.ok) ? "✅" : "⚠️"}`,
      "",
      ...r.turns.flatMap((t, i) => [`**送った文${r.turns.length > 1 ? i + 1 : ""}**：${t}`, "", "**チアリーの答え**：", "", ...(r.answers[i] ?? "").split("\n").map((l) => `> ${l}`), ""]),
      `- カード：${r.cards || "なし"}`,
      ...r.checks.map((c) => `- ${c.ok ? "✅" : "⚠️"} ${c.name}`),
      `- 費用：$${r.costUsd.toFixed(6)}`,
      "",
    ]),
  ].join("\n");
  fs.writeFileSync(`${OUT_DIR}/behavior-${stamp}.md`, md);
  console.log(`結果: ${OUT_DIR}/behavior-${stamp}.md（全回で守れた ${allOk}/${byCheck.size}、$${spent.toFixed(5)}）`);

  await testAdmin.from("cheery_card_uses").delete().eq("profile_id", P.org);
  const { data: qrs } = await testAdmin.from("qr_configs").select("qr_config_id, product_id").eq("event_id", eventId);
  for (const q of qrs ?? []) {
    await testAdmin.from("qr_config_targets").delete().eq("qr_config_id", q.qr_config_id);
    await testAdmin.from("qr_configs").delete().eq("qr_config_id", q.qr_config_id);
    if (q.product_id) await testAdmin.from("products").delete().eq("product_id", q.product_id);
  }
  await testAdmin.from("event_artists").delete().eq("event_id", eventId);
  await testAdmin.from("events").delete().eq("event_id", eventId);
  await testAdmin.from("venues").delete().eq("venue_id", venueId);
  await testAdmin.from("connections").delete().eq("organizer_profile_id", P.org);
  await deleteAuthUsers(Object.values(P));
});

describe.skipIf(!LIVE)("TC-CHEERY-BEHAVIOR: 挙動の質問集を実際のAIに投げる", () => {
  for (const sc of SCENARIOS) for (let run = 1; run <= REPEAT; run++) {
    it(`${sc.id}${REPEAT > 1 ? `-${run}` : ""} ${sc.title}`, async () => {
      if (spent > BUDGET_USD) return;
      const spec = modelFor("faq");
      const provider = providerFor(spec.provider);
      const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await c.auth.signInWithPassword({ email: `beh-org-${ts}@test.local`, password: "TestPass123!" });
      if (error) throw error;
      const history: { role: "user" | "assistant"; text: string }[] = [];
      const answers: string[] = [];
      let usage = emptyUsage();
      const qr: QrCreateCard[] = [];
      const drafts: EventDraftCard[] = [];
      const edits: QrEditCard[] = [];
      for (const t of sc.turns) {
        history.push({ role: "user", text: t });
        const mcp = await connectDcMcp({
          userId: P.org, email: null, role: "organizer", supabase: c, admin: testAdmin, mode: "chat", stepUpFresh: true,
          userTexts: history.filter((h) => h.role === "user").map((h) => h.text),
        });
        let answer = "";
        const r = await provider.run({
          model: spec.model,
          systemStable: buildStableSystem("organizer"),
          systemVolatile: buildVolatileSystem("/dashboard", new Date(), ORG_NAME),
          turns: history,
          tools: process.env.CHEERY_TRACE
            ? mcp.tools.map((tool) => ({ ...tool, run: async (input: Record<string, unknown>) => { const r = await tool.run(input); fs.appendFileSync(process.env.CHEERY_TRACE!, `[ツール] ${tool.name} ${JSON.stringify(input)} → ${r.content.slice(0, 80)}\n`); return r; } }))
            : mcp.tools,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          maxToolRounds: MAX_TOOL_ROUNDS,
          onText: (d) => { answer += d; },
          onToolRound: () => { if (process.env.CHEERY_TRACE) fs.appendFileSync(process.env.CHEERY_TRACE!, `[周] 前置き=${JSON.stringify(answer)}\n`); answer = ""; }, // 本番と同じく、ツールを呼ぶ前の前置きは消す
        });
        usage = addUsage(usage, r.usage);
        for (const card of mcp.cards()) {
          if (card.kind === "qr_create") qr.push(card);
          if (card.kind === "event_draft") drafts.push(card);
          if (card.kind === "qr_edit") edits.push(card);
        }
        await mcp.close();
        if (process.env.CHEERY_TRACE) fs.appendFileSync(process.env.CHEERY_TRACE!, `[答え] ${JSON.stringify(answer)}\n`);
        // 本番と同じく、書き直しの付け足しを落とした答えを判定する（AI が生で書き直した回数は別に数える）
        const shown = trimRewrite(answer.trim());
        if (shown !== answer.trim()) rawRewrites += 1;
        answers.push(shown);
        history.push({ role: "assistant", text: shown });
      }
      const cost = costUsd(spec, usage);
      spent += cost;
      const cardText = [
        ...qr.map((q) => `QR（ラベル：${q.label ?? "空欄"}・宛先：${q.recipient_said ? q.people[q.recipient].options.map((o) => o.name).join("/") : "未定"}）`),
        ...drafts.map((d) => `下書き（出演者：${d.performers.map((p) => p.query).join("、") || "なし"}）`),
        ...edits.map((e) => `QR の変更（ラベル：${e.change.label === undefined ? "変えない" : e.change.label ?? "空欄"}）`),
      ].join("、");
      const rep = answers.map(repeatedSentence).find(Boolean);
      const checks = [...sc.judge({ answers, qr, drafts, edits }), { name: `同じ文を繰り返さない${rep ? `（「${rep}」）` : ""}`, ok: !rep }];
      results.push({ id: sc.id, run, title: sc.title, turns: sc.turns, answers, cards: cardText, checks, costUsd: cost });
      expect(answers.every((a) => a.length > 0)).toBe(true);
    }, 120_000);
  }
});
