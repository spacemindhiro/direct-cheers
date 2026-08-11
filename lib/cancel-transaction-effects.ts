import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

// キャンセル・返金された取引について、accrued状態の分配行を無効化し、
// 発行済みチケット(チアカード含む)を失効させてWalletへプッシュ通知する。
// distributionStatus: settle前(Transfer未発生)は"voided"、settle後(Transfer逆転済み)は"reversed"。
export async function voidTransactionSideEffects(
  admin: ReturnType<typeof createAdminClient>,
  transactionIds: string[],
  distributionStatus: "voided" | "reversed"
) {
  if (transactionIds.length === 0) return;

  await admin
    .from("transaction_distributions")
    .update({ distribution_status: distributionStatus })
    .in("transaction_id", transactionIds)
    .eq("distribution_status", "accrued");

  const { data: tickets } = await admin
    .from("tickets")
    .update({ status: "cancelled" })
    .in("transaction_id", transactionIds)
    .neq("status", "cancelled")
    .select("ticket_id");

  for (const t of tickets ?? []) {
    pushWalletUpdateBySerial(t.ticket_id).catch(() => {});
  }
}
