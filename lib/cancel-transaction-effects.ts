import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";
import { releaseStockForTransactions } from "@/lib/stock-hold";

// キャンセル・返金された取引について、accrued状態の分配行を無効化し、
// 発行済みチケット(チアカード含む)を失効させてWalletへプッシュ通知し、数えた在庫を戻す。
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

  // その決済で数えた在庫を戻す（冪等。台帳に無い昔の販売は戻さない）
  await releaseStockForTransactions(admin, transactionIds);
}
