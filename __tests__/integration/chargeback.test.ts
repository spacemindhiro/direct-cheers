/**
 * TC-CB: チャージバック（stripe/webhook）の統合テスト
 *
 * Stripe の dispute イベントを構築してウェブフックハンドラを呼び出し、
 * DB の状態変化（frozen、debt_claims、reversal）を検証する。
 *
 * 注意: stripe.webhooks.constructEvent の署名検証はモックでバイパスする。
 *       Stripe テストモードの dispute は実際には作成せず、イベントオブジェクトを手動構築する。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
  createTestPaymentIntent,
  captureAndGetDestinationTransfer,
  createTestTransfer,
  stripe,
} from "../helpers/stripe-fixtures";
import {
  insertProfile,
  insertEvent,
  insertQrConfig,
  insertTransaction,
  insertDistribution,
  insertSettleTransfer,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

// webhook の署名検証をバイパス
vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;

  class MockStripe extends OrigStripe {
    webhooks = {
      ...super.webhooks,
      constructEvent: (body: string, _sig: string, _secret: string) => JSON.parse(body),
    };
  }

  return { default: MockStripe, ...StripeModule };
});

import { POST as webhookPOST } from "@/app/api/stripe/webhook/route";

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  distributionIds: [] as string[],
  debtClaimIds: [] as string[],
  settleTransferIds: [] as string[],
};

let organizerConnectId: string;
let artistConnectId: string;

beforeAll(async () => {
  [organizerConnectId, artistConnectId] = await Promise.all([
    createTestConnectAccount(),
    createTestConnectAccount(),
  ]);
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await Promise.all([
    deleteTestConnectAccount(organizerConnectId),
    deleteTestConnectAccount(artistConnectId),
  ]);
});

// ── ウェブフック Request を構築するヘルパー ───────────────────────────
function buildWebhookRequest(event: object): Request {
  const body = JSON.stringify(event);
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "t=1,v1=mock_signature",
    },
    body,
  });
}

// Stripe dispute イベントオブジェクトを構築
function buildDisputeEvent(params: {
  eventId: string;
  chargeId: string;
  paymentIntentId: string;
  disputeId: string;
  gross: number;
}): object {
  return {
    id: `evt_test_${params.disputeId}`,
    type: "charge.dispute.created",
    data: {
      object: {
        id: params.disputeId,
        object: "dispute",
        charge: params.chargeId,
        amount: params.gross,
        currency: "jpy",
        status: "needs_response",
        reason: "fraudulent",
      },
    },
  };
}

// ── TC-CB-01: チャージバック発生 — 分配の凍結と debt_claim 作成 ──────
describe("TC-CB-01: チャージバック発生時の基本フロー", () => {
  const GROSS = 10_000;
  let organizerProfileId: string;
  let artistProfileId: string;
  let transactionId: string;
  let stripeChargeId: string;
  let stripePaymentIntentId: string;
  let artistTransferId: string;
  let artistDistId: string;
  let disputeId: string;

  beforeAll(async () => {
    // プロファイル
    organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "CB テスト オーガナイザー",
      email: "organizer-cb01@test.local",
      stripeConnectId: organizerConnectId,
    });
    artistProfileId = await insertProfile({
      role: "artist",
      displayName: "CB テスト アーティスト",
      email: "artist-cb01@test.local",
      stripeConnectId: artistConnectId,
    });
    cleanup.profileIds.push(organizerProfileId, artistProfileId);

    const eventId = await insertEvent({ organizerProfileId, title: "TC-CB-01 イベント" });
    const qrConfigId = await insertQrConfig({ eventId, recipientProfileId: artistProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    // Stripe: destination charge & capture
    const appFee = Math.floor(GROSS * 0.10) + Math.floor(GROSS * 0.0396);
    const pi = await createTestPaymentIntent({
      amount: GROSS,
      organizerConnectId,
      applicationFeeAmount: appFee,
    });
    const destTransferId = await captureAndGetDestinationTransfer(pi.id);
    stripePaymentIntentId = pi.id;

    // charge ID 取得
    const piRetrieved = await stripe.paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] });
    stripeChargeId = (piRetrieved.latest_charge as any)?.id ?? "";

    transactionId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: GROSS - Math.floor(GROSS * 0.0396) - Math.floor(GROSS * 0.10),
      stripeFee: Math.floor(GROSS * 0.0396),
      platformFee: Math.floor(GROSS * 0.10),
      stripePaymentIntentId,
      destinationTransferId: destTransferId,
    });
    cleanup.transactionIds.push(transactionId);

    // artist: sub-transfer（settle 済みとして paid 扱い）
    const artistAmount = Math.floor((GROSS - Math.floor(GROSS * 0.0396) - Math.floor(GROSS * 0.10)) * 0.5);
    const transfer = await createTestTransfer({
      amount: artistAmount,
      destination: artistConnectId,
    });
    artistTransferId = transfer.id;
    cleanup.settleTransferIds.push(artistTransferId);

    await insertSettleTransfer({
      eventId,
      profileId: artistProfileId,
      stripeTransferId: artistTransferId,
      amount: artistAmount,
    });

    artistDistId = await insertDistribution({
      transactionId,
      eventId,
      profileId: artistProfileId,
      role: "artist",
      actualAmount: artistAmount,
      status: "paid", // settle 済み
    });
    cleanup.distributionIds.push(artistDistId);

    // organizer: accrued（settle 前として扱う）
    const orgAmount = Math.floor((GROSS - Math.floor(GROSS * 0.0396) - Math.floor(GROSS * 0.10)) * 0.5);
    const orgDistId = await insertDistribution({
      transactionId,
      eventId,
      profileId: organizerProfileId,
      role: "organizer",
      actualAmount: orgAmount,
      status: "accrued",
    });
    cleanup.distributionIds.push(orgDistId);

    disputeId = `dp_test_${Date.now()}`;
  }, 60_000);

  it("dispute.created → distributions が凍結され debt_claim が作成される", async () => {
    // webhook_processed_events の事前チェック（冪等）をクリア
    await testAdmin.from("webhook_processed_events").delete().eq("stripe_event_id", `evt_test_${disputeId}`);

    const event = buildDisputeEvent({
      eventId: "",
      chargeId: stripeChargeId,
      paymentIntentId: stripePaymentIntentId,
      disputeId,
      gross: GROSS,
    });

    const req = buildWebhookRequest(event);
    const res = await webhookPOST(req);
    expect(res.status).toBe(200);

    // transaction_distributions が凍結されているか
    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("is_frozen, distribution_status")
      .eq("transaction_id", transactionId);

    expect(dists?.every((d) => d.is_frozen)).toBe(true);

    // debt_claims が作成されているか
    const { data: claim } = await testAdmin
      .from("debt_claims")
      .select("claim_id, status, claim_amount, stripe_dispute_id")
      .eq("stripe_dispute_id", disputeId)
      .maybeSingle();

    expect(claim).not.toBeNull();
    expect(claim!.status).toBe("active");
    expect(claim!.claim_amount).toBeGreaterThan(0);
    if (claim) cleanup.debtClaimIds.push(claim.claim_id);
  });

  it("同一 dispute の二重処理は冪等（二重の debt_claim 作成なし）", async () => {
    // 再送
    const event = buildDisputeEvent({
      eventId: "",
      chargeId: stripeChargeId,
      paymentIntentId: stripePaymentIntentId,
      disputeId,
      gross: GROSS,
    });

    const req = buildWebhookRequest(event);
    const res = await webhookPOST(req);
    expect(res.status).toBe(200);

    // debt_claims の件数が増えていないか
    const { count } = await testAdmin
      .from("debt_claims")
      .select("claim_id", { count: "exact", head: true })
      .eq("stripe_dispute_id", disputeId);
    expect(count).toBe(1);
  });
});

// ── TC-CB-02: チャージバック決着（勝訴）────────────────────────────────
describe("TC-CB-03: チャージバック勝訴 — 再 Transfer と凍結解除", () => {
  const GROSS = 8_000;
  let organizerProfileId2: string;
  let transactionId: string;
  let chargeId: string;
  let piId: string;
  let disputeId: string;

  beforeAll(async () => {
    const orgConnId2 = organizerConnectId; // 同一 Connect ID を再利用

    organizerProfileId2 = await insertProfile({
      role: "organizer",
      displayName: "CB 勝訴 オーガナイザー",
      email: "organizer-cb03@test.local",
      stripeConnectId: orgConnId2,
    });
    cleanup.profileIds.push(organizerProfileId2);

    const eventId = await insertEvent({ organizerProfileId: organizerProfileId2 });
    const qrConfigId = await insertQrConfig({ eventId, recipientProfileId: organizerProfileId2 });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const appFee = Math.floor(GROSS * 0.10) + Math.floor(GROSS * 0.0396);
    const pi = await createTestPaymentIntent({ amount: GROSS, organizerConnectId, applicationFeeAmount: appFee });
    await captureAndGetDestinationTransfer(pi.id);
    piId = pi.id;

    const piRetrieved = await stripe.paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] });
    chargeId = (piRetrieved.latest_charge as any)?.id ?? "";

    transactionId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: GROSS - Math.floor(GROSS * 0.0396) - Math.floor(GROSS * 0.10),
      stripeFee: Math.floor(GROSS * 0.0396),
      platformFee: Math.floor(GROSS * 0.10),
      stripePaymentIntentId: piId,
    });
    cleanup.transactionIds.push(transactionId);

    const distId = await insertDistribution({
      transactionId,
      eventId,
      profileId: organizerProfileId2,
      role: "organizer",
      actualAmount: 4_000,
      status: "accrued",
    });
    cleanup.distributionIds.push(distId);

    disputeId = `dp_won_${Date.now()}`;

    // dispute.created を先に処理
    await testAdmin.from("webhook_processed_events").delete().eq("stripe_event_id", `evt_test_${disputeId}`);
    const createdEvent = buildDisputeEvent({ eventId: "", chargeId, paymentIntentId: piId, disputeId, gross: GROSS });
    const req1 = buildWebhookRequest(createdEvent);
    const res1 = await webhookPOST(req1);
    expect(res1.status).toBe(200);

    const { data: claim } = await testAdmin
      .from("debt_claims")
      .select("claim_id")
      .eq("stripe_dispute_id", disputeId)
      .maybeSingle();
    if (claim) cleanup.debtClaimIds.push(claim.claim_id);
  }, 60_000);

  it("dispute.closed（won）→ 凍結が解除される", async () => {
    const closedEventId = `evt_closed_${disputeId}`;
    await testAdmin.from("webhook_processed_events").delete().eq("stripe_event_id", closedEventId);

    const event = {
      id: closedEventId,
      type: "charge.dispute.closed",
      data: {
        object: {
          id: disputeId,
          object: "dispute",
          status: "won",
        },
      },
    };

    const req = buildWebhookRequest(event);
    const res = await webhookPOST(req);
    expect(res.status).toBe(200);

    // distributions の凍結が解除されているか
    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("is_frozen")
      .eq("transaction_id", transactionId);

    expect(dists?.every((d) => !d.is_frozen)).toBe(true);

    // debt_claim が closed_won になっているか
    const { data: claim } = await testAdmin
      .from("debt_claims")
      .select("status")
      .eq("stripe_dispute_id", disputeId)
      .maybeSingle();
    expect(claim?.status).toBe("closed_won");
  });
});
