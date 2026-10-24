import { createAdminClient } from "@/lib/supabase/admin";
import { stopQrSales } from "@/lib/qr/sales-stop";

type AdminClient = ReturnType<typeof createAdminClient>;

// 出演者がイベントから外れたとき（本人の辞退・主催者が外す）の QR の後始末。
// 以前は辞退で配分先の行を消すだけだったため、精算（配分先の表から計算し直す）でその人の割合の分が
// 誰にも払われず、その人だけが配分先の QR は配分が0になっていた（2026-10-24）。
//   ・配分先：その人の割合をオーガナイザーに付け替える（オーガナイザーが配分先にいれば足す）
//   ・宛先：決済がまだならオーガナイザー（主催者名義）に付け替える。決済があれば宛先は替えない
//     （払ったお客様の明細の名前と食い違うため）。代わりにその QR の販売を止める

const round = (r: number) => Math.round(r * 1e6) / 1e6;

async function qrHasPayments(admin: AdminClient, qrConfigId: string): Promise<boolean> {
  const { count } = await admin.from("transactions").select("transaction_id", { count: "exact", head: true }).eq("qr_config_id", qrConfigId);
  return !!count && count > 0;
}

/** 主催者が外そうとしている人のうち、決済のある QR の宛先になっている人（外すのを止める） */
export async function findRecipientsWithPayments(admin: AdminClient, eventId: string, artistIds: string[]): Promise<{ profileId: string; label: string | null }[]> {
  if (artistIds.length === 0) return [];
  const { data: qrs } = await admin
    .from("qr_configs")
    .select("qr_config_id, label, recipient_profile_id")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .in("recipient_profile_id", artistIds);
  const found: { profileId: string; label: string | null }[] = [];
  for (const q of qrs ?? []) {
    if (await qrHasPayments(admin, q.qr_config_id)) found.push({ profileId: q.recipient_profile_id as string, label: q.label as string | null });
  }
  return found;
}

export async function reassignLineupToOrganizer(
  admin: AdminClient,
  opts: { eventId: string; artistId: string; organizerId: string; actorId: string | null },
): Promise<{ stoppedQrIds: string[] }> {
  const { eventId, artistId, organizerId } = opts;
  if (artistId === organizerId) return { stoppedQrIds: [] };
  const { data: qrs } = await admin
    .from("qr_configs")
    .select("qr_config_id, recipient_profile_id")
    .eq("event_id", eventId)
    .is("deleted_at", null);
  const qrIds = (qrs ?? []).map((q) => q.qr_config_id as string);
  if (qrIds.length === 0) return { stoppedQrIds: [] };
  const { data: targets } = await admin
    .from("qr_config_targets")
    .select("qr_config_target_id, qr_config_id, profile_id, distribution_ratio")
    .in("qr_config_id", qrIds)
    .is("deleted_at", null);

  const toStop: string[] = [];
  const now = new Date().toISOString();
  for (const qr of qrs ?? []) {
    const rows = (targets ?? []).filter((t) => t.qr_config_id === qr.qr_config_id);
    const mine = rows.find((t) => t.profile_id === artistId);
    if (mine) {
      const org = rows.find((t) => t.profile_id === organizerId);
      const { error: delError } = await admin.from("qr_config_targets").update({ deleted_at: now }).eq("qr_config_target_id", mine.qr_config_target_id);
      if (delError) throw new Error(delError.message);
      const { error } = org
        ? await admin.from("qr_config_targets")
          .update({ distribution_ratio: round(Number(org.distribution_ratio) + Number(mine.distribution_ratio)) })
          .eq("qr_config_target_id", org.qr_config_target_id)
        : await admin.from("qr_config_targets")
          .insert({ qr_config_id: qr.qr_config_id, profile_id: organizerId, distribution_ratio: Number(mine.distribution_ratio) });
      if (error) throw new Error(error.message);
    }
    if (qr.recipient_profile_id === artistId) {
      if (await qrHasPayments(admin, qr.qr_config_id)) {
        toStop.push(qr.qr_config_id);
      } else {
        const { error } = await admin.from("qr_configs")
          .update({ recipient_profile_id: organizerId, recipient_name_context: "organizer" })
          .eq("qr_config_id", qr.qr_config_id);
        if (error) throw new Error(error.message);
      }
    }
  }
  const stoppedQrIds = await stopQrSales(admin, toStop, { reason: "lineup_declined", actorId: opts.actorId });
  return { stoppedQrIds };
}
