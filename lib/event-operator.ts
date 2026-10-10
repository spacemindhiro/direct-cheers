import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * そのイベントの現場操作（対面タッチ決済・子機のQR表示操作など）ができるか。
 * 入場処理（entrance/checkin の再入場）と同じ基準：そのイベントの主催者、
 * そのイベントのエージェント、または管理者。
 *
 * 以前の対面決済APIはロール（organizer/agent/admin）しか見ておらず、
 * 他の主催者のイベントの商品でも決済を起こせた（2026-10-11修正）。
 */
export async function canOperateEvent(
  admin: AdminClient,
  userId: string,
  role: string | null | undefined,
  eventId: string | null | undefined,
): Promise<boolean> {
  if (role === "admin") return true;
  if (!eventId) return false;
  const { data: event } = await admin
    .from("events")
    .select("organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (!event) return false;
  return event.organizer_profile_id === userId || event.agent_id === userId;
}
