// 収支レポート（確定申告・青色申告記帳用の月次内訳）の集計。収支レポートAPI（app/api/income-summary）と
// チアリー(AI) の MCP ツールで共用する（APIから切り出したまま）。
//
// ロール別スコープ:
//   admin(Owner Hiro): platform(自分) + agent(Hiro個人のagentプロフィール) + organizer/artist
//   agent            : agent(自分) + organizer/artist(自分が同一profileで受けた分があれば)
//   organizer/artist : organizer/artist(自分)のみ
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMonthBoundsUtc, getPreviousMonthBounds } from "@/lib/accounting/date-utils";

// Hiro個人の確定申告用に、admin(Owner Hiro)プロフィールへ合算するHiro自身の
// 他プロフィールID。現状agent/organizer/artistロールの実運用アカウントはHiro本人の
// ものしか存在しないため、admin判定時に固定で合算する（DBに人物リンク機構は作らない）。
const HIRO_LINKED_PROFILE_IDS = ["a7407a12-20fa-49e3-b201-416f438a89cd"];

export type IncomeSummary = {
  platform: { gross: number; reversed: number; net: number };
  agent: { gross: number; reversed: number; net: number; outstanding_balance: number };
  organizer_artist: { gross: number; reversed: number; net: number; outstanding_balance: number };
  total_net: number;
};

// year・month を省略したら前月。admin は service_role
export async function getIncomeSummary(
  admin: SupabaseClient,
  userId: string,
  role: string,
  year?: number,
  month?: number,
): Promise<{ bounds: ReturnType<typeof getPreviousMonthBounds>; summary: IncomeSummary | null; error: string | null }> {
  const bounds = year !== undefined && month !== undefined ? getMonthBoundsUtc(year, month) : getPreviousMonthBounds();
  const profileIds = role === "admin" ? [userId, ...HIRO_LINKED_PROFILE_IDS] : [userId];
  const { data, error } = await admin.rpc("get_role_income_summary", {
    p_profile_ids: profileIds,
    p_start_utc: bounds.startUtc.toISOString(),
    p_end_utc: bounds.endUtc.toISOString(),
  });
  return { bounds, summary: (data as IncomeSummary | null) ?? null, error: error?.message ?? null };
}
