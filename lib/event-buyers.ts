import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// このイベントに「お客様がいる」か：QR の決済・入場チケット・カード登録まで済んだ前売予約のどれかがある。
// いれば日程・会場を変えない（買った日・場所と違うイベントになるため）。
// 取り消し・返金済みの決済も含める（お客様の明細には残っているため）
export async function eventHasBuyers(admin: AdminClient, eventId: string): Promise<boolean> {
  const { data: qrs } = await admin.from("qr_configs").select("qr_config_id").eq("event_id", eventId);
  const qrIds = (qrs ?? []).map((q) => q.qr_config_id as string);
  if (qrIds.length > 0) {
    const { count } = await admin.from("transactions").select("transaction_id", { count: "exact", head: true }).in("qr_config_id", qrIds);
    if (count && count > 0) return true;
  }
  const { count: tickets } = await admin.from("tickets").select("ticket_id", { count: "exact", head: true }).eq("event_id", eventId);
  if (tickets && tickets > 0) return true;
  // pending はカード登録の途中（SetupIntent 未確認）で、まだ買っていない
  const { count: reservations } = await admin.from("entrance_reservations").select("reservation_id", { count: "exact", head: true })
    .eq("event_id", eventId).neq("status", "pending");
  return !!reservations && reservations > 0;
}
