/**
 * TC-CB: チャージバック（stripe/webhook）の統合テスト
 *
 * webhook の署名検証をモックでバイパスし、dispute イベントを手動構築して
 * ハンドラを呼び出す。DB の状態変化（frozen、debt_claims）を検証する。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
  createTestPaymentIntent,
  captureAndGetDestinationTransfer,
  captureAndTransfer,
  stripe,
} from "../helpers/stripe-fixtures";
import {
  insertProfile,
  deleteAuthUsers,
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
  return { ...StripeModule, default: MockStripe };
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
  await deleteAuthUsers(cleanup.profileIds);
  await Promise.all([
    deleteTestConnectAccount(organizerConnectId),
    deleteTestConnectAccount(artistConnectId),
  ]);
});

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

// ── TC-CB-01: チャージバック発生 → 分配凍結・debt_claim 作成 ──────────
describe("TC-CB-01: dispute.created — 凍結と debt_claim 作成", () => {
  const GROSS = 10_000;
  let transactionId: string;
  let chargeId: string;
  let piId: string;
  let disputeId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "CB テスト オーガナイザー",
      email: `organizer-cb01-${ts}@test.local`,
      stripeConnectId: organizerConnectId,
    });
    const artistProfileId = await insertProfile({
      role: "artist",
      displayName: "CB テスト アーティスト",
      email: `artist-cb01-${ts}@test.local`,
      stripeConnectId: artistConnectId,
    });
    cleanup.profileIds.push(organizerProfileId, artistProfileId);

    const eventId = await insertEvent({ organizerProfileId, title: "TC-CB-01 イベント" });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: GROSS, organizerConnectId });
    piId = pi.id;

    transactionId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: GROSS - Math.floor(GROSS * 0.0396) - Math.floor(GROSS * 0.10),
      stripeFee: Math.floor(GROSS * 0.0396),
      platformFee: Math.floor(GROSS * 0.10),
      stripePaymentIntentId: piId,
    });
    cleanup.transactionIds.push(transactionId);

    const artistAmount = Math.floor((GROSS - Math.floor(GROSS * 0.0396) - Math.floor(GROSS * 0.10)) * 0.5);
    const { chargeId: cid, transferId } = await captureAndTransfer({ piId: pi.id, amount: artistAmount, destination: artistConnectId });
    chargeId = cid;
    cleanup.settleTransferIds.push(transferId);
    await insertSettleTransfer({ eventId, profileId: artistProfileId, stripeTransferId: transferId, amount: artistAmount });

    const artistDistId = await insertDistribution({
      transactionId,
      eventId,
      profileId: artistProfileId,
      role: "artist",
      actualAmount: artistAmount,
      status: "paid",
    });
    cleanup.distributionIds.push(artistDistId);

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

    disputeId = `dp_test_${ts}`;
  }, 60_000);

  it("dispute.created → distributions が凍結・debt_claim が 1 件作成される", async () => {
    const stripeEventId = `evt_test_${disputeId}`;
    await testAdmin.from("webhook_processed_events").delete().eq("stripe_event_id", stripeEventId);

    const event = {
      id: stripeEventId,
      type: "charge.dispute.created",
      data: {
        object: {
          id: disputeId,
          object: "dispute",
          charge: chargeId,
          amount: GROSS,
          currency: "jpy",
          status: "needs_response",
          reason: "fraudulent",
        },
      },
    };

    const res = await webhookPOST(buildWebhookRequest(event));
    expect(res.status).toBe(200);

    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("is_frozen")
      .eq("transaction_id", transactionId);
    expect(dists?.every((d) => d.is_frozen)).toBe(true);

    const { data: claim } = await testAdmin
      .from("debt_claims")
      .select("claim_id, status, claim_amount")
      .eq("stripe_dispute_id", disputeId)
      .maybeSingle();
    expect(claim).not.toBeNull();
    expect(claim!.status).toBe("active");
    expect(claim!.claim_amount).toBeGreaterThan(0);
    if (claim) cleanup.debtClaimIds.push(claim.claim_id);
  });

  it("同一 dispute の二重配信 → debt_claim が増えない（冪等）", async () => {
    const stripeEventId = `evt_test_dup_${disputeId}`;
    await testAdmin.from("webhook_processed_events").delete().eq("stripe_event_id", stripeEventId);

    const event = {
      id: stripeEventId,
      type: "charge.dispute.created",
      data: {
        object: {
          id: disputeId,
          object: "dispute",
          charge: chargeId,
          amount: GROSS,
          currency: "jpy",
          status: "needs_response",
          reason: "fraudulent",
        },
      },
    };

    const res = await webhookPOST(buildWebhookRequest(event));
    expect(res.status).toBe(200);

    const { count } = await testAdmin
      .from("debt_claims")
      .select("claim_id", { count: "exact", head: true })
      .eq("stripe_dispute_id", disputeId);
    expect(count).toBe(1);
  });
});

// ── TC-CB-03: チャージバック勝訴 → 凍結解除 ──────────────────────────
describe("TC-CB-03: dispute.closed（won）— 凍結解除", () => {
  const GROSS = 8_000;
  let transactionId: string;
  let chargeId: string;
  let piId: string;
  let disputeId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "CB 勝訴 オーガナイザー",
      email: `organizer-cb03-${ts}@test.local`,
      stripeConnectId: null,
    });
    cleanup.profileIds.push(organizerProfileId);

    const eventId = await insertEvent({ organizerProfileId });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: GROSS, organizerConnectId });
    piId = pi.id;
    await captureAndGetDestinationTransfer(pi.id);

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
      profileId: organizerProfileId,
      role: "organizer",
      actualAmount: 4_000,
      status: "accrued",
    });
    cleanup.distributionIds.push(distId);

    disputeId = `dp_won_${ts}`;

    // dispute.created を先に発火して debt_claim を作成
    const createdEventId = `evt_created_${disputeId}`;
    await testAdmin.from("webhook_processed_events").delete().eq("stripe_event_id", createdEventId);
    const createdEvent = {
      id: createdEventId,
      type: "charge.dispute.created",
      data: { object: { id: disputeId, object: "dispute", charge: chargeId, amount: GROSS, currency: "jpy", status: "needs_response", reason: "fraudulent" } },
    };
    await webhookPOST(buildWebhookRequest(createdEvent));

    const { data: claim } = await testAdmin
      .from("debt_claims")
      .select("claim_id")
      .eq("stripe_dispute_id", disputeId)
      .maybeSingle();
    if (claim) cleanup.debtClaimIds.push(claim.claim_id);
  }, 60_000);

  it("dispute.closed（won）→ 凍結解除・debt_claim が closed_won", async () => {
    const closedEventId = `evt_closed_${disputeId}`;
    await testAdmin.from("webhook_processed_events").delete().eq("stripe_event_id", closedEventId);

    const event = {
      id: closedEventId,
      type: "charge.dispute.closed",
      data: { object: { id: disputeId, object: "dispute", status: "won" } },
    };

    const res = await webhookPOST(buildWebhookRequest(event));
    expect(res.status).toBe(200);

    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("is_frozen")
      .eq("transaction_id", transactionId);
    expect(dists?.every((d) => !d.is_frozen)).toBe(true);

    const { data: claim } = await testAdmin
      .from("debt_claims")
      .select("status")
      .eq("stripe_dispute_id", disputeId)
      .maybeSingle();
    expect(claim?.status).toBe("closed_won");
  });
});
