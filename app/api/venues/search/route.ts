import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/venues/search?q=xxx
// 会場マスタは組織横断で共有（同じハコに主催者ごとの別設定を作らないため）、
// created_byによる絞り込みは行わない。
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (!["organizer", "agent", "admin"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ venues: [] });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("venues")
    .select("venue_id, name, prefecture, city")
    .is("deleted_at", null)
    .ilike("name", `%${q}%`)
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ venues: data ?? [] });
}
