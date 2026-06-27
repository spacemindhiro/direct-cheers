import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export { admin as testAdmin };

// FK 制約を考慮した削除順（子から親へ）
const CLEANUP_ORDER = [
  "payout_requests",
  "debt_claims",
  "settle_transfers",
  "transaction_distributions",
  "transactions",
  "provisional_users",
  "event_evidences",
  "settlement_summaries",
  "qr_config_targets",
  "qr_configs",
  "event_artists",
  "events",
  "profiles",
] as const;

export async function deleteByIds(
  table: string,
  column: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await admin.from(table).delete().in(column, ids);
}

export async function cleanupTestData(ctx: {
  payoutRequestIds?: string[];
  debtClaimIds?: string[];
  settleTransferIds?: string[];
  distributionIds?: string[];
  transactionIds?: string[];
  evidenceIds?: string[];
  summaryIds?: string[];
  qrConfigIds?: string[];
  eventIds?: string[];
  profileIds?: string[];
}): Promise<void> {
  if (ctx.payoutRequestIds?.length) {
    await admin.from("payout_requests").delete().in("request_id", ctx.payoutRequestIds);
  }
  if (ctx.debtClaimIds?.length) {
    await admin.from("debt_claims").delete().in("claim_id", ctx.debtClaimIds);
  }
  if (ctx.settleTransferIds?.length) {
    await admin.from("settle_transfers").delete().in("stripe_transfer_id", ctx.settleTransferIds);
  }
  if (ctx.distributionIds?.length) {
    await admin.from("transaction_distributions").delete().in("transaction_distribution_id", ctx.distributionIds);
  }
  if (ctx.transactionIds?.length) {
    await admin.from("transactions").delete().in("transaction_id", ctx.transactionIds);
  }
  if (ctx.evidenceIds?.length) {
    await admin.from("event_evidences").delete().in("evidence_id", ctx.evidenceIds);
  }
  if (ctx.summaryIds?.length) {
    await admin.from("settlement_summaries").delete().in("summary_id", ctx.summaryIds);
  }
  if (ctx.qrConfigIds?.length) {
    await admin.from("qr_config_targets").delete().in("qr_config_id", ctx.qrConfigIds);
    await admin.from("qr_configs").delete().in("qr_config_id", ctx.qrConfigIds);
  }
  if (ctx.eventIds?.length) {
    await admin.from("event_artists").delete().in("event_id", ctx.eventIds);
    await admin.from("events").delete().in("event_id", ctx.eventIds);
  }
  if (ctx.profileIds?.length) {
    await admin.from("profiles").delete().in("profile_id", ctx.profileIds);
  }
}
