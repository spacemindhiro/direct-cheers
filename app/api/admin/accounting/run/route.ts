import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (me?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // 対象月を指定可能（省略時は前月）
  const body = await req.json().catch(() => ({}));
  const { year, month } = body as { year?: number; month?: number };

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret)
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL("/api/cron/monthly-accounting", baseUrl);
  if (year && month) {
    url.searchParams.set("year", String(year));
    url.searchParams.set("month", String(month));
  }

  const cronRes = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${cronSecret}` },
  });

  const data = await cronRes.json();
  return NextResponse.json(data, { status: cronRes.status });
}
