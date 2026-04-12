import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST: admin がプラットフォーム審査を承認 or 却下
export async function POST(
  req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { action } = await req.json() as { action: "approve" | "reject" };
  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const admin = createAdminClient();

  const newStatus = action === "approve" ? "verified" : "rejected";

  const { error } = await admin
    .from("profiles")
    .update({ verification_status: newStatus })
    .eq("profile_id", profileId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 対象者に結果を通知
  const { data: target } = await admin
    .from("profiles")
    .select("display_name, role")
    .eq("profile_id", profileId)
    .single();

  try {
    await admin.from("notifications").insert({
      profile_id: profileId,
      type: action === "approve" ? "connect_approved" : "connect_rejected",
      title: action === "approve" ? "口座審査が完了しました" : "口座審査が却下されました",
      body: action === "approve"
        ? "プラットフォーム審査が完了しました。売上の受取が可能です。"
        : "プラットフォーム審査が却下されました。詳細はエージェントにお問い合わせください。",
      metadata: { reviewer_id: user.id },
    });
  } catch { /* notifications テーブルがなければスキップ */ }

  return NextResponse.json({ ok: true, status: newStatus, role: target?.role });
}
