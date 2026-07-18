import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/venues — 新規会場登録
// stripe_terminal_location_idはここでは作成しない（遅延作成。タッチ決済の
// 接続時に初めて必要になった時点でStripe APIを呼びキャッシュする）。
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (!["organizer", "agent", "admin"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, postal_code, prefecture, city, town, line1 } = body as {
    name: string;
    postal_code: string;
    prefecture: string;
    city: string;
    town?: string | null;
    line1: string;
  };

  if (!name?.trim() || !postal_code?.trim() || !prefecture?.trim() || !city?.trim() || !line1?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("venues")
    .insert({
      created_by: user.id,
      name: name.trim(),
      postal_code: postal_code.trim(),
      prefecture: prefecture.trim(),
      city: city.trim(),
      town: town?.trim() || null,
      line1: line1.trim(),
    })
    .select("venue_id, name, prefecture, city")
    .single();

  if (error) {
    // unique制約違反（同名会場が既に存在）
    if (error.code === "23505") {
      return NextResponse.json({ error: "同じ名前の会場が既に登録されています" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ venue: data });
}
