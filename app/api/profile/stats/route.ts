import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("follower_count, follower_milestone, role, display_name")
    .eq("profile_id", user.id)
    .single();

  return NextResponse.json({
    follower_count: data?.follower_count ?? 0,
    follower_milestone: data?.follower_milestone ?? 0,
    role: data?.role,
    display_name: data?.display_name,
  });
}
