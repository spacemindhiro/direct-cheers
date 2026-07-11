import { createAdminClient } from "@/lib/supabase/admin";

/**
 * タッチ決済（Case④）のサインアップQRから辿ってきたticket_idを起点に、
 * そのticketのcard_fingerprintを解決し、同じfingerprintを持つ過去の匿名決済を
 * すべて本人アカウントに名寄せする。
 * 生のcard_fingerprintはクライアントに渡さず、常にサーバー側でticket_id経由で解決する。
 */
export async function reconcileTicketForUser(
  ticketId: string,
  profileId: string,
  email: string | null,
): Promise<{ reconciled: number }> {
  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("tickets")
    .select("card_fingerprint")
    .eq("ticket_id", ticketId)
    .maybeSingle();

  const fingerprint = ticket?.card_fingerprint;
  if (!fingerprint) return { reconciled: 0 };

  const { data: count } = await admin.rpc("reconcile_anonymous_tickets_by_fingerprint", {
    p_fingerprint: fingerprint,
    p_profile_id: profileId,
    p_email: email,
  });

  return { reconciled: (count as number | null) ?? 0 };
}
