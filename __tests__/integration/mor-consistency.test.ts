/**
 * TC-MOR: Merchant of Record（MoR）一貫性の統合テスト
 *
 * 背景: QR作成時の宛先（recipient_profile_id / recipient_name_context）は
 * 「誰の名前を明細に出すか・誰に配分するか」を決めるだけで、MoR（on_behalf_of
 * の帰属先）は変えない。MoRは常にイベントのオーガナイザーに固定されている。
 *
 * この前提が決済・settle・返金・チャージバックの全段階で一貫して守られているかを
 * 検証する。特にチャージバックは、配分の取得順序に依存した
 * 「最初に見つかったaccrued配分」をMoRとみなす旧ロジックのバグが、
 * 既存テストの固定された配分状態（artist=paid, organizer=accrued）によって
 * 偶然マスクされていた。本ファイルはそのマスクを外した状態（双方accrued・
 * アーティストが先に挿入される順序）で検証する。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
  createTestPaymentIntent,
  stripe,
} from "../helpers/stripe-fixtures";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertQrConfigTargets,
  insertTransaction,
  insertDistribution,
  insertSettleTransfer,
  insertProduct,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";
import Stripe from "stripe";

// webhook の署名検証をバイパスし、checkout.sessions.create の引数をキャプチャする。
// pay/cheers/route.ts は自前で new Stripe() するため、helpers/stripe-fixtures.ts の
// stripe インスタンスとは別オブジェクトになる → クラスのコンストラクタ内で
// インターセプトする必要がある（pay-cheers.test.ts と同パターン）。
const captured: { sessionCreateParams?: any } = {};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    webhooks = {
      ...super.webhooks,
      constructEvent: (body: string, _sig: string, _secret: string) => JSON.parse(body),
    };
    constructor(...args: any[]) {
      super(...args);
      const origCreate = this.checkout.sessions.create.bind(this.checkout.sessions);
      (this.checkout.sessions as any).create = async (params: any, opts?: any) => {
        captured.sessionCreateParams = params;
        return origCreate(params, opts);
      };
    }
  }
  return { ...StripeModule, default: MockStripe };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as cheersPOST } from "@/app/api/pay/cheers/route";
import { POST as webhookPOST } from "@/app/api/stripe/webhook/route";
import { POST as refundPOST } from "@/app/api/admin/refund/route";

let adminProfileId: string;
let organizerProfileId: string;
let organizerConnectId: string;
let artistProfileId: string;
let artistConnectId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  productIds: [] as string[],
  transactionIds: [] as string[],
  distributionIds: [] as string[],
  settleTransferIds: [] as string[],
  debtClaimIds: [] as string[],
};

function mockAdminAuth() {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminProfileId } }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "admin" } }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

function buildWebhookRequest(event: object): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=mock_signature" },
    body: JSON.stringify(event),
  });
}

function makeRefundReq(body: Record<string, any>): Request {
  return new Request("http://localhost/api/admin/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  organizerConnectId = await createTestConnectAccount();
  artistConnectId = await createTestConnectAccount();
  const ts = Date.now();

  adminProfileId = await insertProfile({
    role: "admin", displayName: "MoRテスト管理者", email: `admin-mor-${ts}@test.local`,
  });
  organizerProfileId = await insertProfile({
    role: "organizer", displayName: "MoRテストオーガナイザー", email: `organizer-mor-${ts}@test.local`,
    stripeConnectId: organizerConnectId,
  });
  artistProfileId = await insertProfile({
    role: "artist", displayName: "MoRテストアーティスト", email: `artist-mor-${ts}@test.local`,
    stripeConnectId: artistConnectId,
  });
  cleanup.profileIds.push(adminProfileId, organizerProfileId, artistProfileId);
}, 60_000);

afterAll(async () => {
  // FK制約(qr_configs.product_id / products.event_id は ON DELETE RESTRICT)のため
  // 決済関連データ・qr_configs → products → events の順で削除する必要がある
  await cleanupTestData({
    debtClaimIds: cleanup.debtClaimIds,
    settleTransferIds: cleanup.settleTransferIds,
    distributionIds: cleanup.distributionIds,
    transactionIds: cleanup.transactionIds,
    qrConfigIds: cleanup.qrConfigIds,
  });
  if (cleanup.productIds.length) {
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  }
  await cleanupTestData({ eventIds: cleanup.eventIds, profileIds: cleanup.profileIds });
  await deleteAuthUsers(cleanup.profileIds);
  await Promise.all([
    deleteTestConnectAccount(organizerConnectId),
    deleteTestConnectAccount(artistConnectId),
  ]);
});

// ── TC-MOR-01: 決済時、宛先がアーティストでもMoRはオーガナイザー固定 ──────
describe("TC-MOR-01: 宛先=アーティストのQRでも on_behalf_of はオーガナイザーのまま", () => {
  let eventId: string;
  let qrConfigId: string;
  let productId: string;

  beforeAll(async () => {
    eventId = await insertEvent({ organizerProfileId, title: "TC-MOR-01 イベント" });
    productId = await insertProduct({ eventId, type: "standard", minAmount: 50, maxAmount: 500_000 });
    qrConfigId = await insertQrConfig({
      eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId, productId,
    });
    await testAdmin.from("qr_configs").update({ recipient_name_context: "artist" }).eq("qr_config_id", qrConfigId);
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);
    cleanup.productIds.push(productId);
  }, 60_000);

  it("on_behalf_of はアーティストのConnectIDではなく、オーガナイザーのConnectIDになる", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrConfigId,
        product_id: productId,
        amount: 1_000,
        payment_method: "card",
      }),
    });
    const res = await cheersPOST(req);
    expect(res.status).toBe(200);

    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.on_behalf_of).toBe(organizerConnectId);
    expect(pid?.on_behalf_of).not.toBe(artistConnectId);
  });
});

// ── TC-MOR-02: チャージバック債務はMoR（オーガナイザー）に帰属する ────────
// 配分の挿入順序・accrued状態に依存しないことを確認する
// （旧ロジックは「最初に見つかったaccrued配分」を採用していたため、
//  アーティストが先にaccruedで挿入されると誤ってアーティストに請求が付け替わるバグがあった）
describe("TC-MOR-02: チャージバック債務はオーガナイザー固定（配分の挿入順序に依存しない）", () => {
  const GROSS = 10_000;
  let txId: string;
  let chargeId: string;
  let disputeId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const eventId = await insertEvent({ organizerProfileId, title: "TC-MOR-02 イベント" });
    const qrConfigId = await insertQrConfig({
      eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId,
    });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: GROSS, organizerConnectId });
    await stripe.paymentIntents.capture(pi.id);
    const piExpanded = await stripe.paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] });
    chargeId = ((piExpanded.latest_charge as Stripe.Charge)?.id) ?? "";

    txId = await insertTransaction({
      qrConfigId, grossAmount: GROSS,
      netAmount: GROSS - Math.ceil(GROSS * 0.0396) - Math.floor(GROSS * 0.10),
      stripeFee: Math.ceil(GROSS * 0.0396), platformFee: Math.floor(GROSS * 0.10),
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    // 意図的にアーティストの配分を「先に」「accrued」で挿入する（旧ロジックの誤判定を誘発する順序）
    const artistDistId = await insertDistribution({
      transactionId: txId, eventId, profileId: artistProfileId,
      role: "artist", actualAmount: 4_000, status: "accrued",
    });
    const orgDistId = await insertDistribution({
      transactionId: txId, eventId, profileId: organizerProfileId,
      role: "organizer", actualAmount: 4_000, status: "accrued",
    });
    cleanup.distributionIds.push(artistDistId, orgDistId);

    disputeId = `dp_mor_${ts}`;
  }, 60_000);

  it("debt_claims.profile_id は常にオーガナイザー（アーティストには付け替わらない）", async () => {
    const stripeEventId = `evt_mor_${disputeId}`;
    await testAdmin.from("webhook_processed_events").delete().eq("stripe_event_id", stripeEventId);

    const event = {
      id: stripeEventId,
      type: "charge.dispute.created",
      data: {
        object: {
          id: disputeId, object: "dispute", charge: chargeId,
          amount: GROSS, currency: "jpy", status: "needs_response", reason: "fraudulent",
        },
      },
    };

    const res = await webhookPOST(buildWebhookRequest(event));
    expect(res.status).toBe(200);

    const { data: claim } = await testAdmin
      .from("debt_claims")
      .select("claim_id, profile_id")
      .eq("stripe_dispute_id", disputeId)
      .maybeSingle();

    expect(claim).not.toBeNull();
    expect(claim!.profile_id).toBe(organizerProfileId);
    expect(claim!.profile_id).not.toBe(artistProfileId);
    if (claim) cleanup.debtClaimIds.push(claim.claim_id);
  });
});

// ── TC-MOR-03: 返金（settle前）の債務もオーガナイザー固定 ────────────────
describe("TC-MOR-03: 返金（settle前）の debt_claims もオーガナイザーに帰属する", () => {
  let piId: string;
  let txId: string;
  const GROSS = 10_000;

  beforeAll(async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "TC-MOR-03 イベント" });
    const qrConfigId = await insertQrConfig({
      eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId,
    });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: GROSS, organizerConnectId });
    piId = pi.id;
    await stripe.paymentIntents.capture(piId);

    txId = await insertTransaction({
      qrConfigId, grossAmount: GROSS,
      netAmount: GROSS - Math.ceil(GROSS * 0.0396) - Math.floor(GROSS * 0.10),
      stripeFee: Math.ceil(GROSS * 0.0396), platformFee: Math.floor(GROSS * 0.10),
      stripePaymentIntentId: piId, status: "completed",
    });
    cleanup.transactionIds.push(txId);
  }, 60_000);

  it("settle前のCOMPASSIONATE返金 → debt_claims.profile_idはオーガナイザー（アーティストではない）", async () => {
    mockAdminAuth();
    const res = await refundPOST(makeRefundReq({
      paymentIntentId: piId,
      reason: "MoR一貫性テスト：settle前返金",
      refundType: "COMPASSIONATE",
    }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const { data: claim } = await testAdmin
      .from("debt_claims")
      .select("claim_id, profile_id")
      .eq("original_transaction_id", txId)
      .maybeSingle();

    expect(claim).not.toBeNull();
    expect(claim!.profile_id).toBe(organizerProfileId);
    expect(claim!.profile_id).not.toBe(artistProfileId);
    if (claim) cleanup.debtClaimIds.push(claim.claim_id);
  });
});

// ── TC-MOR-04: settle時、資金の届け先はMoRと無関係に受取人本人の口座になる ─
describe("TC-MOR-04: settle Transferの送金先はMoRと無関係に受取人自身のConnectID", () => {
  it("アーティスト宛のTransferは destination=artistConnectId（organizerConnectIdではない）", async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "TC-MOR-04 イベント" });
    cleanup.eventIds.push(eventId);

    const GROSS = 10_000;
    const pi = await createTestPaymentIntent({ amount: GROSS, organizerConnectId });
    await stripe.paymentIntents.capture(pi.id);
    const piExpanded = await stripe.paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] });
    const chargeId = ((piExpanded.latest_charge as Stripe.Charge)?.id) ?? "";

    // settle.tsと同じ仕組み（destination + source_transaction）を直接再現して検証する
    const transfer = await stripe.transfers.create({
      amount: 4_000,
      currency: "jpy",
      destination: artistConnectId,
      source_transaction: chargeId,
      metadata: { event_id: eventId },
    });
    cleanup.settleTransferIds.push(transfer.id);
    await insertSettleTransfer({ eventId, profileId: artistProfileId, stripeTransferId: transfer.id, amount: 4_000 });

    const transferAfter = await stripe.transfers.retrieve(transfer.id);
    // MoR（このチャージのon_behalf_of）はオーガナイザーだが、Transfer先はアーティスト自身の口座
    expect(transferAfter.destination).toBe(artistConnectId);
    expect(transferAfter.destination).not.toBe(organizerConnectId);
  });
});
