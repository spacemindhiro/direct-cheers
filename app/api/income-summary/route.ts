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
import { getIncomeSummary } from "@/lib/income-summary";

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
  // 集計とロール別スコープは lib/income-summary.ts（チアリー(AI)と共用）
  const { bounds, summary: data, error } = await getIncomeSummary(
    createAdminClient(),
    user.id,
    profile.role,
    qYear && qMonth ? parseInt(qYear, 10) : undefined,
    qYear && qMonth ? parseInt(qMonth, 10) : undefined,
  );

  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({
    role: profile.role,
    label: bounds.label,
    targetYear: bounds.targetYear,
    targetMonth: bounds.targetMonth,
    summary: data,
  });
}
