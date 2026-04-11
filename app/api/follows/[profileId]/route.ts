import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 特定プロファイルへのフォロー状態確認（ログイン不要でフォロワー数は返す）
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();

  // フォロワー数
  const { count: followerCount } = await admin
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("followee_id", profileId);

  // 自分がフォロー中か
  let isFollowing = false;
  if (user) {
    const { data: existing } = await admin
      .from("follows")
      .select("follow_id")
      .eq("follower_id", user.id)
      .eq("followee_id", profileId)
      .maybeSingle();
    isFollowing = !!existing;
  }

  return NextResponse.json({
    is_following: isFollowing,
    follower_count: followerCount ?? 0,
  });
}
