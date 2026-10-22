// チアリー(AI) の1回の応答：入力の検査 → 伏せ字 → 利用枠の確保 → AI実行 → 使用量の記録。
// 会話の中身はどこにも保存せず、ログにも出さない（requirements.md 5.1）。
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORY_MAX_CHARS, HISTORY_MAX_TURNS, INPUT_MAX_CHARS, MAX_OUTPUT_TOKENS, MAX_TOOL_ROUNDS, MONTHLY_LIMIT_JPY, type ModelSpec } from "./config";
import { maskSensitive } from "./mask";
import { reserveRequest, recordUsage, jstPeriod, type ReserveResult } from "./limits";
import { buildStableSystem, buildVolatileSystem } from "./prompt";
import type { AiTool, ChatProvider, ChatResult, ChatTurn } from "./types";

export const ChatBody = z.object({
  turns: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })).min(1).max(200),
  screen: z.string().max(40).optional(),
});

export type PrepareResult = { ok: true; turns: ChatTurn[] } | { ok: false; reason: "empty" | "too_long" | "not_user" };

// 端末から来た会話を、AIに渡せる形に整える。最後は本人の発言で、2,000文字以内であること。
// 履歴は直近だけにし（費用を抑える）、すべて伏せ字にする
export function prepareTurns(turns: ChatTurn[]): PrepareResult {
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") return { ok: false, reason: "not_user" };
  if (last.text.trim().length === 0) return { ok: false, reason: "empty" };
  if (last.text.length > INPUT_MAX_CHARS) return { ok: false, reason: "too_long" };

  let kept = turns.slice(-HISTORY_MAX_TURNS);
  while (kept.length > 1 && kept.reduce((n, t) => n + t.text.length, 0) > HISTORY_MAX_CHARS) kept = kept.slice(1);
  // 会話はAIの発言から始められないので、先頭のAIの発言は落とす
  while (kept.length > 1 && kept[0].role !== "user") kept = kept.slice(1);
  // 同じ話し手が続いたら1つにまとめる（確認カードが済んだときに画面が足す一行など。交互でないと受け付けない AI がある）
  const merged: ChatTurn[] = [];
  for (const t of kept) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.text = `${last.text}\n${t.text}`;
    else merged.push({ ...t });
  }
  return { ok: true, turns: merged.map((t) => ({ role: t.role, text: maskSensitive(t.text) })) };
}

export type CheeryDeps = {
  admin: SupabaseClient;       // service_role（利用枠の記録用）
  provider: ChatProvider;
  spec: ModelSpec;
  tools: AiTool[];
  notifyMonthlyStop?: (info: { month: string; limitJpy: number }) => Promise<void>;
  now?: Date;
};

export async function reserve(deps: CheeryDeps, profileId: string): Promise<ReserveResult> {
  return reserveRequest(deps.admin, profileId, deps.now);
}

// 利用枠を確保したあとに呼ぶ。AIの返答は onText に少しずつ流す
export async function runAndRecord(
  deps: CheeryDeps,
  args: { profileId: string; role: string | null; turns: ChatTurn[]; screen?: string; onText: (d: string) => void; signal?: AbortSignal },
): Promise<ChatResult> {
  const result = await deps.provider.run({
    model: deps.spec.model,
    systemStable: buildStableSystem(args.role),
    systemVolatile: buildVolatileSystem(args.screen, deps.now),
    turns: args.turns,
    tools: deps.tools,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxToolRounds: MAX_TOOL_ROUNDS,
    onText: args.onText,
    signal: args.signal,
  });
  const { notifyStop } = await recordUsage(deps.admin, args.profileId, deps.spec, result.usage, deps.now);
  if (notifyStop && deps.notifyMonthlyStop) {
    await deps.notifyMonthlyStop({ month: jstPeriod(deps.now).month, limitJpy: MONTHLY_LIMIT_JPY }).catch(() => {});
  }
  return result;
}

// 画面に出す、上限・入力エラーの文言
export const LIMIT_MESSAGES: Record<Exclude<ReserveResult, "ok">, string> = {
  daily_limit: "今日の利用回数の上限に達しました。明日またお試しください。",
  monthly_limit: "チアリー(AI)は今月の利用上限に達したため、一時的にお休みしています。ヘルプをご覧いただくか、support@direct-cheers.com までお問い合わせください。",
};
export const INPUT_MESSAGES: Record<Exclude<PrepareResult, { ok: true }>["reason"], string> = {
  empty: "質問を入力してください。",
  too_long: `質問は${INPUT_MAX_CHARS.toLocaleString("ja-JP")}文字以内で入力してください。`,
  not_user: "質問を入力してください。",
};
export const FINISH_NOTES: Partial<Record<ChatResult["finish"], string>> = {
  refusal: "この質問にはお答えできません。DCの使い方についてお聞きください。",
  max_tokens: "（長くなったため、ここで区切りました。続きは質問を分けてお聞きください）",
  tool_rounds: "（データの確認が多くなったため、ここで区切りました。質問を分けてお聞きください）",
};
