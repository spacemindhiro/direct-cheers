import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/artists/search?q=xxx
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ artists: [] });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("profile_id, display_name, avatar_url")
    .eq("role", "artist")
    .eq("status", "active")
    .ilike("display_name", `%${q}%`)
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ artists: data ?? [] });
}
