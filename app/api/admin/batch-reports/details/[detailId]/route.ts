import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ detailId: string }> }
) {
  const { detailId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("role").eq("profile_id", user.id).single();
  if (me?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action_status } = await req.json() as { action_status: "未対応" | "対応済" };
  if (!["未対応", "対応済"].includes(action_status))
    return NextResponse.json({ error: "Invalid action_status" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("uncollected_revenue_details")
    .update({ action_status })
    .eq("id", detailId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, action_status });
}
