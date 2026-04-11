import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 自分がフォローしている一覧を取得
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("follows")
    .select(`
      follow_id,
      followee_id,
      created_at,
      followee:profiles!followee_id(
        profile_id,
        display_name,
        avatar_url,
        role
      )
    `)
    .eq("follower_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ follows: data ?? [] });
}

// フォロー / アンフォロー トグル
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { followee_id } = await req.json() as { followee_id: string };
  if (!followee_id) return NextResponse.json({ error: "followee_id is required" }, { status: 400 });
  if (followee_id === user.id)
    return NextResponse.json({ error: "自分自身はフォローできません" }, { status: 400 });

  const admin = createAdminClient();

  // followee のプロフィールを取得（表示名・ロール確認）
  const { data: followee } = await admin
    .from("profiles")
    .select("profile_id, display_name, role")
    .eq("profile_id", followee_id)
    .maybeSingle();

  if (!followee) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // フォロー可能ロールのチェック（artist / organizer のみフォロー対象）
  if (!["artist", "organizer"].includes(followee.role)) {
    return NextResponse.json(
      { error: "アーティストまたはオーガナイザーのみフォローできます" },
      { status: 400 }
    );
  }

  // 既存フォロー確認
  const { data: existing } = await admin
    .from("follows")
    .select("follow_id")
    .eq("follower_id", user.id)
    .eq("followee_id", followee_id)
    .maybeSingle();

  if (existing) {
    // アンフォロー
    await admin.from("follows").delete().eq("follow_id", existing.follow_id);
    return NextResponse.json({ followed: false, display_name: followee.display_name });
  } else {
    // フォロー
    await admin.from("follows").insert({ follower_id: user.id, followee_id });
    return NextResponse.json({ followed: true, display_name: followee.display_name });
  }
}
