import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseVenues, searchVenues } from "@/lib/venues";

// GET /api/venues/search?q=xxx
// 会場マスタは組織横断で共有（同じハコに主催者ごとの別設定を作らないため）、
// created_byによる絞り込みは行わない。中身は lib/venues.ts（チアリー(AI) の会場検索も同じ関数を通す）
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!(await canUseVenues(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  try {
    return NextResponse.json({ venues: await searchVenues(admin, searchParams.get("q") ?? "") });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
