import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDirectoryProfile, isStepUpFresh, resolveDirectoryViewer } from "@/lib/directory";

// GET /api/directory/:profileId
// 照会画面の詳細。organizer には公開項目のみ、agent/admin には実績・口座状況も返す。
// 画面と同じくステップアップ認証済みを必須にする。
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  if (!isStepUpFresh(cookieStore.get("dc_stepup")?.value)) {
    return NextResponse.json({ error: "Step-up required" }, { status: 401 });
  }

  const admin = createAdminClient();
  const viewer = await resolveDirectoryViewer(admin, user.id);
  if (!viewer) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  try {
    const profile = await getDirectoryProfile(admin, { viewerRole: viewer.role, profileId });
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (e) {
    console.error("[directory/detail]", e);
    return NextResponse.json({ error: "照会に失敗しました" }, { status: 500 });
  }
}
