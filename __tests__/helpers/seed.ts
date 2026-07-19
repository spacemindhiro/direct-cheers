import { testAdmin } from "./db-reset";

function newId(): string {
  return crypto.randomUUID();
}

// auth.users + profiles をセットで作成して profile_id を返す
// profiles.profile_id は auth.users への FK があるため auth user 先作成が必須
export async function insertProfile(params: {
  role: "admin" | "organizer" | "artist" | "agent" | "user";
  displayName: string;
  email: string;
  stripeConnectId?: string | null;
}): Promise<string> {
  const { data: authData, error: authErr } = await testAdmin.auth.admin.createUser({
    email: params.email,
    password: "TestPass123!",
    email_confirm: true,
  });
  if (authErr) throw new Error(`auth user 作成失敗 [${params.email}]: ${authErr.message}`);

  const id = authData.user.id;
  const { error } = await testAdmin.from("profiles").insert({
    profile_id: id,
    role: params.role,
    display_name: params.displayName,
    stripe_connect_id: params.stripeConnectId ?? null,
    status: "active",
  });
  if (error) throw new Error(`プロファイル挿入失敗 [${params.role}]: ${error.message}`);
  return id;
}

// auth user を削除（afterAll のクリーンアップ用）
export async function deleteAuthUsers(profileIds: string[]): Promise<void> {
  await Promise.all(
    profileIds.map((id) => testAdmin.auth.admin.deleteUser(id).catch(() => {})),
  );
}

// テスト用イベントを挿入
export async function insertEvent(params: {
  eventId?: string;
  organizerProfileId: string;
  agentId?: string | null;
  title?: string;
  startAt?: Date;
  endAt?: Date;
}): Promise<string> {
  const id = params.eventId ?? newId();
  // agent_id は NOT NULL。指定がない場合は organizer を代入（テスト用の自己参照）
  const { error } = await testAdmin.from("events").insert({
    event_id: id,
    title: params.title ?? "テストイベント",
    organizer_profile_id: params.organizerProfileId,
    agent_id: params.agentId ?? params.organizerProfileId,
    lifecycle_status: "published",
    start_at: (params.startAt ?? new Date(Date.now() + 86400_000)).toISOString(),
    end_at: (params.endAt ?? new Date(Date.now() + 172800_000)).toISOString(),
  });
  if (error) throw new Error(`イベント挿入失敗: ${error.message}`);
  return id;
}

// テスト用 qr_config を挿入
export async function insertQrConfig(params: {
  qrConfigId?: string;
  eventId: string;
  creatorProfileId: string;
  recipientProfileId: string;
  productId?: string | null;
}): Promise<string> {
  const id = params.qrConfigId ?? newId();
  const productId = params.productId ?? null;

  const { error } = await testAdmin.from("qr_configs").insert({
    qr_config_id: id,
    event_id: params.eventId,
    creator_profile_id: params.creatorProfileId,
    recipient_profile_id: params.recipientProfileId,
    product_id: productId,
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
  stripePiSequence?: number;
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
    transaction_type: "purchase",
    payment_method: "card",
    amount_verified: true,
    amount_mismatch: 0,
    reconciled_at: params.reconciled !== false ? new Date().toISOString() : null,
    destination_transfer_id: params.destinationTransferId ?? null,
    stripe_pi_sequence: params.stripePiSequence ?? 0,
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
      submitted_by: params.submittedByProfileId,
      photo_paths: [],
    })
    .select("evidence_id")
    .single();
  if (error) throw new Error(`evidence 挿入失敗: ${error.message}`);
  return data.evidence_id;
}

// products を挿入（入場チケット・バウチャー等）
export async function insertProduct(params: {
  eventId: string;
  name?: string;
  type?: string;
  paymentType?: "A" | "B" | "C" | "V";
  minAmount?: number;
  maxAmount?: number;
  stockLimit?: number;
  soldCount?: number;
  trackInventory?: boolean;
  artistId?: string | null;
  welcomeCheerAmount?: number | null;
  welcomeCheerDefaultProductId?: string | null;
}): Promise<string> {
  const id = newId();
  const { error } = await testAdmin.from("products").insert({
    product_id: id,
    event_id: params.eventId,
    name: params.name ?? "テスト入場券",
    type: params.type ?? "entrance",
    payment_type: params.paymentType ?? "B",
    min_amount: params.minAmount ?? 3000,
    max_amount: params.maxAmount ?? 5000,
    stock_limit: params.stockLimit ?? 100,
    sold_count: params.soldCount ?? 0,
    track_inventory: params.trackInventory ?? true,
    artist_id: params.artistId ?? null,
    welcome_cheer_amount: params.welcomeCheerAmount ?? null,
    welcome_cheer_default_product_id: params.welcomeCheerDefaultProductId ?? null,
  });
  if (error) throw new Error(`product 挿入失敗: ${error.message}`);
  return id;
}

// tickets を挿入
export async function insertTicket(params: {
  eventId: string;
  productId: string;
  status?: "valid" | "used" | "cancelled";
  email?: string | null;
  holderProfileId?: string | null;
  reservationId?: string | null;
  transactionId?: string | null;
  cardFingerprint?: string | null;
  quantity?: number;
}): Promise<{ ticketId: string; ticketCode: string }> {
  const ticketId = newId();
  const ticketCode = `tkt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await testAdmin.from("tickets").insert({
    ticket_id: ticketId,
    ticket_code: ticketCode,
    status: params.status ?? "valid",
    event_id: params.eventId,
    product_id: params.productId,
    email: params.email === undefined ? "test@test.local" : params.email,
    holder_profile_id: params.holderProfileId ?? null,
    reservation_id: params.reservationId ?? null,
    transaction_id: params.transactionId ?? null,
    card_fingerprint: params.cardFingerprint ?? null,
    quantity: params.quantity ?? 1,
  });
  if (error) throw new Error(`ticket 挿入失敗: ${error.message}`);
  return { ticketId, ticketCode };
}

// entrance_reservations を挿入
export async function insertReservation(params: {
  productId: string;
  eventId: string;
  stripeCustomerId: string;
  stripeSetupIntentId?: string | null;
  stripePaymentIntentId?: string | null;
  stripePaymentMethodId?: string | null;
  email?: string;
  holderName?: string | null;
  chargeAmount?: number;
  status?: "pending" | "reserved" | "charged" | "cancelled" | "card_error";
  cardErrorMessage?: string | null;
}): Promise<string> {
  const id = newId();
  const { error } = await testAdmin.from("entrance_reservations").insert({
    reservation_id: id,
    product_id: params.productId,
    event_id: params.eventId,
    stripe_customer_id: params.stripeCustomerId,
    stripe_setup_intent_id: params.stripeSetupIntentId ?? null,
    stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
    stripe_payment_method_id: params.stripePaymentMethodId ?? null,
    email: params.email ?? "test@test.local",
    holder_name: params.holderName ?? null,
    charge_amount: params.chargeAmount ?? 3000,
    status: params.status ?? "pending",
    card_error_message: params.cardErrorMessage ?? null,
  });
  if (error) throw new Error(`reservation 挿入失敗: ${error.message}`);
  return id;
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
