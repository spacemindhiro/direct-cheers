/**
 * GET /api/income-summary?year=2026&month=8
 *
 * ログインユーザーのロールに応じた収支内訳（プラットフォーム純利/エージェント報酬/
 * ダイレクト着金）を月次で返す。個人の確定申告・青色申告記帳用。
 *
 * ロール別スコープ:
 *   admin(Owner Hiro): platform(自分) + agent(Hiro個人のagentプロフィール) + organizer/artist
 *   agent            : agent(自分) + organizer/artist(自分が同一profileで受けた分があれば)
 *   organizer/artist : organizer/artist(自分)のみ
 */
import { NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonthBoundsUtc, getPreviousMonthBounds } from "@/lib/accounting/date-utils";

// Hiro個人の確定申告用に、admin(Owner Hiro)プロフィールへ合算するHiro自身の
// 他プロフィールID。現状agent/organizer/artistロールの実運用アカウントはHiro本人の
// ものしか存在しないため、admin判定時に固定で合算する（DBに人物リンク機構は作らない）。
const HIRO_LINKED_PROFILE_IDS = ["a7407a12-20fa-49e3-b201-416f438a89cd"];

export async function GET(req: Request) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("profile_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const url = new URL(req.url);
  const qYear = url.searchParams.get("year");
  const qMonth = url.searchParams.get("month");
  const bounds =
    qYear && qMonth
      ? getMonthBoundsUtc(parseInt(qYear, 10), parseInt(qMonth, 10))
      : getPreviousMonthBounds();

  const profileIds =
    profile.role === "admin" ? [user.id, ...HIRO_LINKED_PROFILE_IDS] : [user.id];

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_role_income_summary", {
    p_profile_ids: profileIds,
    p_start_utc: bounds.startUtc.toISOString(),
    p_end_utc: bounds.endUtc.toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    role: profile.role,
    label: bounds.label,
    targetYear: bounds.targetYear,
    targetMonth: bounds.targetMonth,
    summary: data,
  });
}
