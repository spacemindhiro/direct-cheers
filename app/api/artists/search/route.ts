import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/artists/search?q=xxx
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  // カンマ・括弧は PostgREST の or() 構文を壊し、検索語に条件を混ぜ込めるため除去する
  // （電話番号など表示しない列で他人を絞り込めた）。% _ \ は ILIKE の特殊文字としてエスケープ
  const q = (searchParams.get("q") ?? "").replace(/[,()]/g, "").trim()
    .replace(/\\/g, "\\\\").replace(/[%_]/g, (c) => `\\${c}`);
  if (q.length < 1) return NextResponse.json({ artists: [] });

  const admin = createAdminClient();

  // display_name と artist_name の両方を検索。出演依頼の宛先なので、
  // 出演しうるロール(artist/organizer/agent)のみに絞る。adminは出演しないため対象外。
  // role='user'（審査未了の一般ユーザー）が候補に出てしまう不具合があったため
  // statusではなくroleで絞り込む（statusはOAuthログインだけでも進み得るため、
  // 出演依頼の可否を判定する材料としては不適切）。
  const { data, error } = await admin
    .from("profiles")
    .select("profile_id, display_name, artist_name, avatar_url")
    .in("role", ["artist", "organizer", "agent"])
    .is("deleted_at", null)
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
