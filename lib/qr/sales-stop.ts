import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;
export type SalesStopReason = "lineup_declined" | "admin";

// QR の販売停止・再開。止めている間は決済の入口がすべて断る（lib/purchase-window.ts の "stopped"）。
// 止めた・再開した記録は qr_sales_stop_logs に残す（誰が・いつ・なぜ）。
// すでに止まっている QR を止め直したり、動いている QR を再開したりはしない（記録が二重にならないように）

export async function stopQrSales(
  admin: AdminClient,
  qrConfigIds: string[],
  opts: { reason: SalesStopReason; actorId: string | null; note?: string | null },
): Promise<string[]> {
  if (qrConfigIds.length === 0) return [];
  const { data, error } = await admin
    .from("qr_configs")
    .update({ sales_stopped_at: new Date().toISOString(), sales_stopped_reason: opts.reason, sales_stopped_by: opts.actorId })
    .in("qr_config_id", qrConfigIds)
    .is("sales_stopped_at", null)
    .select("qr_config_id");
  if (error) throw new Error(error.message);
  const stopped = (data ?? []).map((r) => r.qr_config_id as string);
  if (stopped.length > 0) {
    const { error: logError } = await admin.from("qr_sales_stop_logs").insert(stopped.map((id) => ({
      qr_config_id: id, action: "stop", reason: opts.reason, note: opts.note ?? null, actor_profile_id: opts.actorId,
    })));
    if (logError) throw new Error(logError.message);
  }
  return stopped;
}

export async function resumeQrSales(
  admin: AdminClient,
  qrConfigIds: string[],
  opts: { actorId: string; note?: string | null },
): Promise<string[]> {
  if (qrConfigIds.length === 0) return [];
  const { data, error } = await admin
    .from("qr_configs")
    .update({ sales_stopped_at: null, sales_stopped_reason: null, sales_stopped_by: null })
    .in("qr_config_id", qrConfigIds)
    .not("sales_stopped_at", "is", null)
    .select("qr_config_id");
  if (error) throw new Error(error.message);
  const resumed = (data ?? []).map((r) => r.qr_config_id as string);
  if (resumed.length > 0) {
    const { error: logError } = await admin.from("qr_sales_stop_logs").insert(resumed.map((id) => ({
      qr_config_id: id, action: "resume", reason: null, note: opts.note ?? null, actor_profile_id: opts.actorId,
    })));
    if (logError) throw new Error(logError.message);
  }
  return resumed;
}
