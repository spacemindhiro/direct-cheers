import { testAdmin } from "./db-reset";

function newId(): string {
  return crypto.randomUUID();
}

export type TestContext = {
  adminProfileId: string;
  organizerProfileId: string;
  artistProfileId: string;
  agentProfileId: string;
  organizerConnectId: string | null;
  artistConnectId: string | null;
  agentConnectId: string | null;
  eventId: string;
  qrConfigId: string;
};

// テスト用プロファイルを挿入
export async function insertProfile(params: {
  profileId?: string;
  role: "admin" | "organizer" | "artist" | "agent";
  displayName: string;
  email: string;
  stripeConnectId?: string | null;
}): Promise<string> {
  const id = params.profileId ?? newId();
  const { error } = await testAdmin.from("profiles").insert({
    profile_id: id,
    role: params.role,
    display_name: params.displayName,
    email: params.email,
    stripe_connect_id: params.stripeConnectId ?? null,
    status: "active",
  });
  if (error) throw new Error(`プロファイル挿入失敗 [${params.role}]: ${error.message}`);
  return id;
}

// テスト用イベントを挿入
export async function insertEvent(params: {
  eventId?: string;
  organizerProfileId: string;
  agentId?: string | null;
  title?: string;
}): Promise<string> {
  const id = params.eventId ?? newId();
  const { error } = await testAdmin.from("events").insert({
    event_id: id,
    title: params.title ?? "テストイベント",
    organizer_profile_id: params.organizerProfileId,
    agent_id: params.agentId ?? null,
    lifecycle_status: "active",
    start_at: new Date(Date.now() + 86400_000).toISOString(),
    end_at: new Date(Date.now() + 172800_000).toISOString(),
  });
  if (error) throw new Error(`イベント挿入失敗: ${error.message}`);
  return id;
}

// テスト用 qr_config を挿入
export async function insertQrConfig(params: {
  qrConfigId?: string;
  eventId: string;
  recipientProfileId: string;
  productId?: string | null;
}): Promise<string> {
  const id = params.qrConfigId ?? newId();
  const productId = params.productId ?? null;

  const { error } = await testAdmin.from("qr_configs").insert({
    qr_config_id: id,
    event_id: params.eventId,
    recipient_profile_id: params.recipientProfileId,
    product_id: productId,
    slug: `test-${id.slice(0, 8)}`,
  });
  if (error) throw new Error(`QR config 挿入失敗: ${error.message}`);
  return id;
}

// qr_config_targets（分配先・比率）を挿入
export async function insertQrConfigTargets(
  qrConfigId: string,
  targets: { profileId: string; ratio: number }[],
): Promise<void> {
  const rows = targets.map((t) => ({
    qr_config_id: qrConfigId,
    profile_id: t.profileId,
    distribution_ratio: t.ratio,
  }));
  const { error } = await testAdmin.from("qr_config_targets").insert(rows);
  if (error) throw new Error(`qr_config_targets 挿入失敗: ${error.message}`);
}

// テスト用トランザクションを挿入
export async function insertTransaction(params: {
  transactionId?: string;
  qrConfigId: string;
  grossAmount: number;
  netAmount: number;
  stripeFee: number;
  platformFee: number;
  stripePaymentIntentId: string;
  status?: string;
  reconciled?: boolean;
  destinationTransferId?: string | null;
}): Promise<string> {
  const id = params.transactionId ?? newId();
  const { error } = await testAdmin.from("transactions").insert({
    transaction_id: id,
    qr_config_id: params.qrConfigId,
    total_gross_amount: params.grossAmount,
    net_amount: params.netAmount,
    stripe_fee: params.stripeFee,
    platform_fee: params.platformFee,
    stripe_payment_intent_id: params.stripePaymentIntentId,
    status: params.status ?? "completed",
    transaction_type: "cheers",
    payment_method: "card",
    amount_verified: true,
    amount_mismatch: 0,
    reconciled_at: params.reconciled !== false ? new Date().toISOString() : null,
    destination_transfer_id: params.destinationTransferId ?? null,
  });
  if (error) throw new Error(`トランザクション挿入失敗: ${error.message}`);
  return id;
}

// transaction_distributions を挿入
export async function insertDistribution(params: {
  transactionId: string;
  eventId: string;
  profileId: string;
  role: "organizer" | "artist" | "agent";
  actualAmount: number;
  status?: "accrued" | "paid";
  holdReleased?: boolean;
  isFrozen?: boolean;
}): Promise<string> {
  const { data, error } = await testAdmin
    .from("transaction_distributions")
    .insert({
      transaction_id: params.transactionId,
      event_id: params.eventId,
      profile_id: params.profileId,
      distribution_role: params.role,
      actual_amount: params.actualAmount,
      distribution_status: params.status ?? "accrued",
      hold_released: params.holdReleased ?? true,
      is_frozen: params.isFrozen ?? false,
    })
    .select("transaction_distribution_id")
    .single();
  if (error) throw new Error(`distribution 挿入失敗: ${error.message}`);
  return data.transaction_distribution_id;
}

// event_artists を挿入（confirmed）
export async function insertEventArtist(params: {
  eventId: string;
  artistProfileId: string;
  status?: "confirmed" | "pending";
}): Promise<void> {
  const { error } = await testAdmin.from("event_artists").insert({
    event_id: params.eventId,
    artist_profile_id: params.artistProfileId,
    status: params.status ?? "confirmed",
  });
  if (error) throw new Error(`event_artist 挿入失敗: ${error.message}`);
}

// event_evidences を挿入（settle の前提条件）
export async function insertEventEvidence(params: {
  eventId: string;
  submittedByProfileId: string;
}): Promise<string> {
  const { data, error } = await testAdmin
    .from("event_evidences")
    .insert({
      event_id: params.eventId,
      submitted_by_profile_id: params.submittedByProfileId,
      evidence_url: "https://example.com/test-evidence.pdf",
    })
    .select("evidence_id")
    .single();
  if (error) throw new Error(`evidence 挿入失敗: ${error.message}`);
  return data.evidence_id;
}

// settle_transfers を挿入
export async function insertSettleTransfer(params: {
  eventId: string;
  profileId: string;
  stripeTransferId: string;
  amount: number;
}): Promise<void> {
  const { error } = await testAdmin.from("settle_transfers").insert({
    event_id: params.eventId,
    profile_id: params.profileId,
    stripe_transfer_id: params.stripeTransferId,
    amount: params.amount,
  });
  if (error) throw new Error(`settle_transfer 挿入失敗: ${error.message}`);
}
