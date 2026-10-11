import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { canOperateEvent } from "@/lib/event-operator";
import { currentTouchpaySignupToken } from "@/lib/touchpay-signup-token";

/**
 * GET /api/events/[eventId]/touchpay-signup?device_id=...
 *
 * 子機（ログイン済みのイベント操作者の端末）が、タッチ決済完了の合図を受けたときに
 * 自分宛てのサインアップQRの合言葉を取りに来る。合言葉は公開Realtimeチャンネルには
 * 載せない（イベントIDが分かれば誰でも購読できるため）。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("profile_id", user.id).maybeSingle();
  if (!(await canOperateEvent(admin, user.id, profile?.role, eventId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deviceId = new URL(req.url).searchParams.get("device_id");
  const token = await currentTouchpaySignupToken(admin, eventId, deviceId);
  return NextResponse.json({ token });
}
