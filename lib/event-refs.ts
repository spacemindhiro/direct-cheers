import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * リクエストで指定されたQR・QRグループが、そのイベントのもの（削除されていない）か。
 *
 * 表示まわりのAPI（QRグループ・スケジュール・トラック）はイベントの権限だけを見て、
 * 指定IDの持ち主を確かめていなかったため、自分のイベントのIDを使って
 * 他人のイベントのQRグループの中身を差し替えられた（2026-10-13修正）。
 */
export async function qrConfigsBelongToEvent(
  admin: AdminClient,
  eventId: string,
  qrConfigIds: (string | null | undefined)[],
): Promise<boolean> {
  const ids = [...new Set(qrConfigIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return true;
  const { data } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .in("qr_config_id", ids);
  return (data ?? []).length === ids.length;
}

export async function qrGroupBelongsToEvent(
  admin: AdminClient,
  eventId: string,
  qrGroupId: string | null | undefined,
): Promise<boolean> {
  if (!qrGroupId) return true;
  const { data } = await admin
    .from("qr_groups")
    .select("qr_group_id")
    .eq("qr_group_id", qrGroupId)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}
