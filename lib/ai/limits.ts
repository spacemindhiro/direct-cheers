// チアリー(AI) の利用上限（requirements.md 8章）。記録するのは回数とトークン数・概算費用だけ。
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAILY_REQUEST_LIMIT, MONTHLY_LIMIT_USD, costUsd, type ModelSpec } from "./config";
import type { ChatUsage } from "./types";

// 日本時間の日付（YYYY-MM-DD）と、その月の範囲
export function jstPeriod(now: Date = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${y}-${pad(m + 1)}-${pad(jst.getUTCDate())}`;
  const next = new Date(Date.UTC(y, m + 1, 1));
  return {
    date,
    month: `${y}-${pad(m + 1)}`,
    monthStart: `${y}-${pad(m + 1)}-01`,
    monthEnd: `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-01`,
  };
}

export type ReserveResult = "ok" | "daily_limit" | "monthly_limit";

// 1回分の利用枠を確保する（service_role のクライアントで呼ぶこと）
export async function reserveRequest(admin: SupabaseClient, profileId: string, now: Date = new Date()): Promise<ReserveResult> {
  const p = jstPeriod(now);
  const { data, error } = await admin.rpc("cheery_reserve_request", {
    p_profile_id: profileId,
    p_usage_date: p.date,
    p_daily_limit: DAILY_REQUEST_LIMIT,
    p_month: p.month,
    p_month_start: p.monthStart,
    p_month_end: p.monthEnd,
    p_monthly_limit_usd: MONTHLY_LIMIT_USD,
  });
  if (error) throw new Error(`cheery_reserve_request: ${error.message}`);
  return data as ReserveResult;
}

// 使った分を記録し、月の上限を超えたら止める。運営への通知が必要なとき（その月に初めて止めたとき）は true
export async function recordUsage(
  admin: SupabaseClient,
  profileId: string,
  spec: ModelSpec,
  usage: ChatUsage,
  now: Date = new Date(),
): Promise<{ costUsd: number; notifyStop: boolean }> {
  const p = jstPeriod(now);
  const cost = costUsd(spec, usage);
  const { error } = await admin.rpc("cheery_record_usage", {
    p_profile_id: profileId,
    p_usage_date: p.date,
    p_input_tokens: usage.inputTokens,
    p_cache_read_tokens: usage.cacheReadTokens,
    p_cache_write_tokens: usage.cacheWriteTokens,
    p_output_tokens: usage.outputTokens,
    p_cost_usd: cost,
  });
  if (error) throw new Error(`cheery_record_usage: ${error.message}`);
  const { data: notifyStop, error: stopError } = await admin.rpc("cheery_stop_month_if_over", {
    p_month: p.month,
    p_month_start: p.monthStart,
    p_month_end: p.monthEnd,
    p_monthly_limit_usd: MONTHLY_LIMIT_USD,
  });
  if (stopError) throw new Error(`cheery_stop_month_if_over: ${stopError.message}`);
  return { costUsd: cost, notifyStop: notifyStop === true };
}
