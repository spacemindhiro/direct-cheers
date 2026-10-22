import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerVenue, type RegisterVenueInput } from "@/lib/venues";

// POST /api/venues — 新規会場登録（中身は lib/venues.ts。チアリー(AI) の会場登録も同じ関数を通す）
// 画面からはピンの位置を受け付けない（作成画面に地図が無いため。チアリーで登録したときだけ入る）
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, postal_code, prefecture, city, town, line1 } = (await req.json()) as RegisterVenueInput;
  const result = await registerVenue(supabase, createAdminClient(), user.id, { name, postal_code, prefecture, city, town, line1 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ venue: result.venue });
}
