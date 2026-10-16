import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowedTypes, isStepUpFresh, parseTypes, resolveDirectoryViewer, searchDirectory, type DirectoryType } from "@/lib/directory";

// GET /api/directory/search?types=artist,organizer&q=xxx
// 照会画面の検索。organizer はアーティストのみ、agent/admin はオーガナイザーも検索できる（両方同時も可）。
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
  const types = parseTypes(searchParams.get("types") ?? "artist");
  // 1つでも権限外の種別が混ざっていたら全体を拒否する（黙って落とさない）
  const allowed = allowedTypes(viewer?.role);
  if (!viewer || types.length === 0 || !types.every((t) => (allowed as string[]).includes(t))) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const results = await searchDirectory(admin, {
      viewerId: user.id,
      types: types as DirectoryType[],
      q: searchParams.get("q") ?? "",
    });
    return NextResponse.json({ results });
  } catch (e) {
    console.error("[directory/search]", e);
    return NextResponse.json({ error: "検索に失敗しました" }, { status: 500 });
  }
}
