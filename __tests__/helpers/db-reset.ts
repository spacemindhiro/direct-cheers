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
  // テストが把握していない子の行（API・アプリが作った QR・決済・配分の明細など）も、親から辿って一緒に消す。
  // 子が残ると親の削除が外部キーで失敗し、架空の決済の行が溜まって後のテスト（自動キャンセル等）を壊すため
  const eventIds = [...new Set(ctx.eventIds ?? [])];
  const qrIds = new Set(ctx.qrConfigIds ?? []);
  for (const id of await selectIds("qr_configs", "qr_config_id", "event_id", eventIds)) qrIds.add(id);
  const txIds = new Set(ctx.transactionIds ?? []);
  for (const id of await selectIds("transactions", "transaction_id", "qr_config_id", [...qrIds])) txIds.add(id);
  const qrs = [...qrIds];
  const txs = [...txIds];

  const errors: string[] = [];
  const del = async (table: string, column: string, ids: string[] | undefined) => {
    if (!ids?.length) return;
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await admin.from(table).delete().in(column, ids.slice(i, i + 200));
      if (error) errors.push(`${table}.${column}: ${error.message}`);
    }
  };

  await del("payout_requests", "request_id", ctx.payoutRequestIds);
  await del("debt_claims", "claim_id", ctx.debtClaimIds);
  await del("debt_claims", "original_transaction_id", txs);
  await del("settle_transfers", "stripe_transfer_id", ctx.settleTransferIds);
  await del("settle_transfers", "event_id", eventIds);
  await del("transaction_distributions", "transaction_distribution_id", ctx.distributionIds);
  await del("transaction_distributions", "transaction_id", txs);
  await del("transaction_distributions", "event_id", eventIds);
  await del("receipts", "transaction_id", txs);
  await del("asset_access_logs", "transaction_id", txs);
  await del("invitation_codes", "transaction_id", txs);
  await del("invitation_codes", "qr_config_id", qrs);
  await del("invitation_codes", "event_id", eventIds);
  await del("tickets", "event_id", eventIds);
  await del("transactions", "transaction_id", txs);
  await del("event_evidences", "evidence_id", ctx.evidenceIds);
  await del("settlement_summaries", "summary_id", ctx.summaryIds);
  await del("settlement_summaries", "event_id", eventIds);
  await del("qr_config_targets", "qr_config_id", qrs);
  await del("qr_configs", "qr_config_id", qrs);
  await del("products", "event_id", eventIds);
  await del("distribution_configs", "event_id", eventIds);
  await del("event_artists", "event_id", eventIds);
  await del("events", "event_id", eventIds);
  await del("profiles", "profile_id", ctx.profileIds);

  // 削除の失敗を握りつぶさない（以前は黙って失敗し、ローカルDBに残りかすが溜まっていた）
  if (errors.length) throw new Error(`cleanupTestData: 削除に失敗\n${errors.join("\n")}`);
}

async function selectIds(table: string, idColumn: string, column: string, ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from(table).select(idColumn).in(column, ids.slice(i, i + 200));
    if (error) throw new Error(`cleanupTestData: ${table} の検索に失敗: ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, string>[]) out.push(row[idColumn]);
  }
  return out;
}
