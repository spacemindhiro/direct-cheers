import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ yearMonth: string }> },
) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (me?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // yearMonth: "2026-05" 形式
  const { yearMonth } = await params;
  const match = yearMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match)
    return NextResponse.json({ error: "Invalid format. Use YYYY-MM." }, { status: 400 });

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  const { data: report, error } = await admin
    .from("monthly_accounting_reports")
    .select("csv_content, status, error_message")
    .eq("target_year", year)
    .eq("target_month", month)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!report) return NextResponse.json({ error: "レポートが見つかりません" }, { status: 404 });
  if (report.status !== "completed" || !report.csv_content)
    return NextResponse.json({ error: `ステータス: ${report.status} / ${report.error_message ?? "未生成"}` }, { status: 409 });

  const filename = `yayoi_${yearMonth}.csv`;

  return new Response(report.csv_content, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
