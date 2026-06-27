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

  // display_name と artist_name の両方を検索
  const { data, error } = await admin
    .from("profiles")
    .select("profile_id, display_name, artist_name, avatar_url")
    .eq("status", "active")
    .or(`display_name.ilike.%${q}%,artist_name.ilike.%${q}%`)
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 表示名として artist_name を優先
  const artists = (data ?? []).map((p) => ({
    profile_id: p.profile_id,
    display_name: p.artist_name ?? p.display_name,
    avatar_url: p.avatar_url,
  }));

  return NextResponse.json({ artists });
}
