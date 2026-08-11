/**
 * GET /api/income-summary/csv?year=2026&month=8
 *
 * 個人の確定申告・青色申告記帳用の月次収支CSV。
 * 「日付, 区分名称, 金額」のシンプル3列形式（弥生会計の複式仕訳CSVとは別物）。
 */
import { NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonthBoundsUtc, getPreviousMonthBounds, getMonthLastDay } from "@/lib/accounting/date-utils";

const HIRO_LINKED_PROFILE_IDS = ["a7407a12-20fa-49e3-b201-416f438a89cd"];

const LAYER_LABELS = {
  platform: "プラットフォーム純利",
  agent: "エージェント報酬",
  organizer_artist: "ダイレクト着金",
} as const;

function csvEscape(v: string | number): string {
  const s = String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
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
  const { data: summary, error } = await admin.rpc("get_role_income_summary", {
    p_profile_ids: profileIds,
    p_start_utc: bounds.startUtc.toISOString(),
    p_end_utc: bounds.endUtc.toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const visibleLayers: (keyof typeof LAYER_LABELS)[] =
    profile.role === "admin"
      ? ["platform", "agent", "organizer_artist"]
      : profile.role === "agent"
      ? ["agent", "organizer_artist"]
      : ["organizer_artist"];

  const date = getMonthLastDay(bounds.targetYear, bounds.targetMonth);
  const rows: string[][] = [];
  for (const key of visibleLayers) {
    const layer = summary[key] as { gross: number; reversed: number };
    if (layer.gross > 0) {
      rows.push([date, LAYER_LABELS[key], String(layer.gross)]);
    }
    if (layer.reversed > 0) {
      rows.push([date, `${LAYER_LABELS[key]}（取消分）`, String(-layer.reversed)]);
    }
  }

  const header = ["日付", "区分名称", "金額"];
  const csvLines = [header, ...rows].map((r) => r.map(csvEscape).join(","));
  const csv = "﻿" + csvLines.join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="income_${bounds.targetYear}${String(bounds.targetMonth).padStart(2, "0")}.csv"`,
    },
  });
}
