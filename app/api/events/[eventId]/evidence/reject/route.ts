import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (me?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { comment } = await req.json() as { comment: string };
  if (!comment?.trim())
    return NextResponse.json({ error: "コメントを入力してください" }, { status: 400 });

  const { data: event } = await admin
    .from("events")
    .select("event_id, title, organizer_profile_id, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.lifecycle_status === "settled")
    return NextResponse.json({ error: "Already settled" }, { status: 400 });

  // 差戻し状態をsettlement_summariesに保存
  const { data: existingSummary } = await admin
    .from("settlement_summaries")
    .select("summary_id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingSummary) {
    await admin
      .from("settlement_summaries")
      .update({ is_approved_for_payout: false })
      .eq("summary_id", existingSummary.summary_id);
  } else {
    await admin.from("settlement_summaries").insert({
      event_id: eventId,
      is_approved_for_payout: false,
      total_gross_amount: 0,
    });
  }

  // オーガナイザーに通知
  await admin.from("notifications").insert({
    profile_id: event.organizer_profile_id,
    type: "evidence_rejected",
    title: "エビデンス差戻し",
    body: `「${event.title}」のエビデンスが差し戻されました。\n\n【差戻しコメント】\n${comment.trim()}`,
    metadata: { event_id: eventId, rejected_by: user.id, comment: comment.trim() },
  });

  return NextResponse.json({ success: true });
}
