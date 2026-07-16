import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 招待権限のあるロール（PERMISSION_MATRIX のキーと揃える）
const INVITER_ROLES = ["admin", "agent", "organizer"];

// GET /api/invitations/search-users?q=xxx
// 招待の宛先候補となる既存ユーザーを検索する。
// メールアドレスは返さない（宛先解決はサーバー側で行う）。
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!profile || !INVITER_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  // カンマ・括弧は PostgREST の or() 構文を壊すため除去
  const q = (searchParams.get("q") ?? "").replace(/[,()]/g, "").trim();
  if (q.length < 1) return NextResponse.json({ users: [] });

  const admin = createAdminClient();

  // 表示名・アーティスト名・オーガナイザー名のいずれでもヒットさせる
  const { data, error } = await admin
    .from("profiles")
    .select("profile_id, display_name, artist_name, organizer_name, avatar_url, role")
    .is("deleted_at", null)
    .neq("profile_id", user.id)
    .or(`display_name.ilike.%${q}%,artist_name.ilike.%${q}%,organizer_name.ilike.%${q}%`)
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data ?? [] });
}
