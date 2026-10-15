import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowedTypes, isStepUpFresh, resolveDirectoryViewer, searchDirectory, type DirectoryType } from "@/lib/directory";

// GET /api/directory/search?type=artist|organizer&q=xxx
// 照会画面の検索。organizer はアーティストのみ、agent/admin はオーガナイザーも検索できる。
// 登録内容を横断的に引ける機能のため、画面と同じくステップアップ認証済みを必須にする。
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  if (!isStepUpFresh(cookieStore.get("dc_stepup")?.value)) {
    return NextResponse.json({ error: "Step-up required" }, { status: 401 });
  }

  const admin = createAdminClient();
  const viewer = await resolveDirectoryViewer(admin, user.id);

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") ?? "artist") as DirectoryType;
  if (!viewer || !allowedTypes(viewer.role).includes(type)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const results = await searchDirectory(admin, { viewerId: user.id, type, q: searchParams.get("q") ?? "" });
    return NextResponse.json({ results });
  } catch (e) {
    console.error("[directory/search]", e);
    return NextResponse.json({ error: "検索に失敗しました" }, { status: 500 });
  }
}
