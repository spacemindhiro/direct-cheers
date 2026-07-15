/**
 * TC-PAYOUT: /api/payout/request の統合テスト
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
  createTestPaymentIntent,
  captureAndTransfer,
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
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

// stripe.payouts.create をモック（test mode では source_transaction Transfer の残高が pending のため payout 不可）
// 振込手数料 Reversal・DB 書き込み・分配ステータス更新は実 Stripe/DB で検証する
vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.payouts as any).create = async (params: any) => ({
        id: `po_test_${Date.now()}`,
        amount: params.amount,
        currency: params.currency || "jpy",
        status: "paid",
        object: "payout",
      });
    }
  }
  return { ...StripeModule, default: InstrumentedStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as payoutPOST, GET as payoutGET } from "@/app/api/payout/request/route";

function mockPayoutAuth(userId: string, role: string, connectId: string | null) {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { role, balance_frozen: false, stripe_connect_id: connectId },
          }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  distributionIds: [] as string[],
  payoutRequestIds: [] as string[],
  settleTransferIds: [] as string[],
};

let organizerConnectId: string;
let agentConnectId: string;

beforeAll(async () => {
  [organizerConnectId, agentConnectId] = await Promise.all([
    createTestConnectAccount(),
    createTestConnectAccount(),
  ]);
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
  await Promise.all([
    deleteTestConnectAccount(organizerConnectId),
    deleteTestConnectAccount(agentConnectId),
  ]);
});

// ── TC-PAYOUT-01: organizer 出金 ─────────────────────────────────────────
describe("TC-PAYOUT-01: organizer 出金 — settle_transfer reversal で手数料回収", () => {
  const GROSS = 20_000;
  const NET = GROSS - Math.ceil(GROSS * 0.0396) - Math.floor(GROSS * 0.10);
  const PAYOUT_AMOUNT = 10_000;
  const TRANSFER_FEE = 500;
  let organizerProfileId: string;

  beforeAll(async () => {
    const ts = Date.now();
    organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "テストオーガナイザー（出金）",
      email: `organizer-payout-${ts}@test.local`,
      stripeConnectId: organizerConnectId,
    });
    cleanup.profileIds.push(organizerProfileId);

    const eventId = await insertEvent({ organizerProfileId });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    // source_transaction Transfer を作成（settle route が行う処理の再現）
    const pi = await createTestPaymentIntent({ amount: GROSS, organizerConnectId });
    const { transferId } = await captureAndTransfer({
      piId: pi.id,
      amount: NET,
      destination: organizerConnectId,
    });

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: NET,
      stripeFee: Math.ceil(GROSS * 0.0396),
      platformFee: Math.floor(GROSS * 0.10),
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    await insertSettleTransfer({ eventId, profileId: organizerProfileId, stripeTransferId: transferId, amount: NET });
    cleanup.settleTransferIds.push(transferId);

    const distId = await insertDistribution({
      transactionId: txId,
      eventId,
      profileId: organizerProfileId,
      role: "organizer",
      actualAmount: PAYOUT_AMOUNT + 2_000,
      holdReleased: true,
    });
    cleanup.distributionIds.push(distId);
  }, 60_000);

  it("出金成功・payout_requests 作成・net_payout が手数料差引後の金額", async () => {
    mockPayoutAuth(organizerProfileId, "organizer", organizerConnectId);

    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: PAYOUT_AMOUNT }),
    });

    const res = await payoutPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.stripe_transfer_id).toMatch(/^po_/);
    expect(data.net_payout).toBe(PAYOUT_AMOUNT - TRANSFER_FEE);

    cleanup.payoutRequestIds.push(data.request_id);

    const { data: pr } = await testAdmin
      .from("payout_requests")
      .select("status, net_payout_amount, stripe_fee_deducted")
      .eq("request_id", data.request_id)
      .single();
    expect(pr?.status).toBe("completed");
    expect(pr?.stripe_fee_deducted).toBe(TRANSFER_FEE);
    expect(pr?.net_payout_amount).toBe(PAYOUT_AMOUNT - TRANSFER_FEE);
  });

  it("振込手数料以下の出金額 → 400", async () => {
    mockPayoutAuth(organizerProfileId, "organizer", organizerConnectId);

    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: TRANSFER_FEE }),
    });

    const res = await payoutPOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/振込手数料/);
  });
});

// ── TC-PAYOUT-02: agent 出金 ──────────────────────────────────────────
describe("TC-PAYOUT-02: agent 出金 — settle_transfer reversal で手数料回収", () => {
  const AGENT_AMOUNT = 8_000;
  const PAYOUT_AMOUNT = 5_000;
  const TRANSFER_FEE = 500;
  let agentProfileId: string;

  beforeAll(async () => {
    const ts = Date.now();
    agentProfileId = await insertProfile({
      role: "agent",
      displayName: "テストエージェント（出金）",
      email: `agent-payout-${ts}@test.local`,
      stripeConnectId: agentConnectId,
    });
    const agentOrgId = await insertProfile({
      role: "organizer",
      displayName: "エージェントテスト用オーガナイザー",
      email: `org-for-agent-${ts}@test.local`,
      stripeConnectId: null,
    });
    cleanup.profileIds.push(agentProfileId, agentOrgId);

    const eventId = await insertEvent({ organizerProfileId: agentOrgId, agentId: agentProfileId });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: agentOrgId, recipientProfileId: agentOrgId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: 10_000, organizerConnectId });
    const { transferId } = await captureAndTransfer({
      piId: pi.id,
      amount: AGENT_AMOUNT,
      destination: agentConnectId,
    });

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 10_000,
      netAmount: 8_604,
      stripeFee: 396,
      platformFee: 1_000,
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    await insertSettleTransfer({ eventId, profileId: agentProfileId, stripeTransferId: transferId, amount: AGENT_AMOUNT });
    cleanup.settleTransferIds.push(transferId);

    const distId = await insertDistribution({
      transactionId: txId,
      eventId,
      profileId: agentProfileId,
      role: "agent",
      actualAmount: AGENT_AMOUNT,
      holdReleased: true,
    });
    cleanup.distributionIds.push(distId);
  }, 60_000);

  it("エージェント出金が成功する", async () => {
    mockPayoutAuth(agentProfileId, "agent", agentConnectId);

    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: PAYOUT_AMOUNT }),
    });

    const res = await payoutPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.net_payout).toBe(PAYOUT_AMOUNT - TRANSFER_FEE);
    cleanup.payoutRequestIds.push(data.request_id);
  });
});

// ── TC-PAYOUT-04: 未照合distributionが他の照合済み売上をブロックしない ──────
// 過去の不具合: 1件でも「14日超過なのに未照合」なdistributionがあると、
// 無関係な他イベントの照合済み・出金可能な売上ごとリクエスト自体が400で弾かれていた。
// eligibleDists側では個別に正しく除外されているため、ブロックせず除外分だけ
// 出金対象外にすればよい、という挙動に修正した。
describe("TC-PAYOUT-04: 未照合distributionによる誤ブロックの修正確認", () => {
  const ELIGIBLE_AMOUNT = 5_000;
  const STUCK_AMOUNT = 3_000;
  const TRANSFER_FEE = 500;
  let profileId: string;

  beforeAll(async () => {
    const ts = Date.now();
    // stripe.payouts.create はこのファイルで常にモックされているため、
    // 実在のConnectアカウントは不要(profiles.stripe_connect_idの一意制約を
    // 避けるためテスト固有のダミー値を使う)
    profileId = await insertProfile({
      role: "organizer",
      displayName: "未照合ブロック確認用",
      email: `stuck-payout-${ts}@test.local`,
      stripeConnectId: `acct_fake_stuck_${ts}`,
    });
    cleanup.profileIds.push(profileId);

    const OLD_DATE = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(); // 20日前(14日hold超過)

    // 照合済み・出金可能なイベント
    const eligibleEventId = await insertEvent({ organizerProfileId: profileId });
    const eligibleQrId = await insertQrConfig({ eventId: eligibleEventId, creatorProfileId: profileId, recipientProfileId: profileId });
    cleanup.eventIds.push(eligibleEventId);
    cleanup.qrConfigIds.push(eligibleQrId);
    const eligibleTxId = await insertTransaction({
      qrConfigId: eligibleQrId,
      grossAmount: ELIGIBLE_AMOUNT,
      netAmount: ELIGIBLE_AMOUNT,
      stripeFee: 0,
      platformFee: 0,
      stripePaymentIntentId: `pi_stuck_eligible_${ts}`,
      reconciled: true,
    });
    cleanup.transactionIds.push(eligibleTxId);
    await testAdmin.from("transactions").update({ created_at: OLD_DATE }).eq("transaction_id", eligibleTxId);
    // hold_released:false のまま、created_atの経過日数だけで14日holdを自然にクリアさせる
    // (実際のSTGの状態と同じ条件で検証するため)
    const eligibleDistId = await insertDistribution({
      transactionId: eligibleTxId, eventId: eligibleEventId, profileId, role: "organizer", actualAmount: ELIGIBLE_AMOUNT,
      holdReleased: false,
    });
    cleanup.distributionIds.push(eligibleDistId);

    // 未settled・未照合のまま放置された別イベント(STGで実際に見つかったのと同じ状態)
    const stuckEventId = await insertEvent({ organizerProfileId: profileId });
    const stuckQrId = await insertQrConfig({ eventId: stuckEventId, creatorProfileId: profileId, recipientProfileId: profileId });
    cleanup.eventIds.push(stuckEventId);
    cleanup.qrConfigIds.push(stuckQrId);
    const stuckTxId = await insertTransaction({
      qrConfigId: stuckQrId,
      grossAmount: STUCK_AMOUNT,
      netAmount: STUCK_AMOUNT,
      stripeFee: 0,
      platformFee: 0,
      stripePaymentIntentId: `pi_stuck_pending_${ts}`,
      reconciled: false, // 照合未完了のまま
    });
    cleanup.transactionIds.push(stuckTxId);
    await testAdmin.from("transactions").update({ created_at: OLD_DATE }).eq("transaction_id", stuckTxId);
    const stuckDistId = await insertDistribution({
      transactionId: stuckTxId, eventId: stuckEventId, profileId, role: "organizer", actualAmount: STUCK_AMOUNT,
      holdReleased: false,
    });
    cleanup.distributionIds.push(stuckDistId);
  }, 60_000);

  it("未照合の別イベント分があっても、照合済み分の出金は通常通り成功する", async () => {
    mockPayoutAuth(profileId, "organizer", organizerConnectId);
    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: ELIGIBLE_AMOUNT }),
    });
    const res = await payoutPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.net_payout).toBe(ELIGIBLE_AMOUNT - TRANSFER_FEE);
    cleanup.payoutRequestIds.push(data.request_id);
  });

  it("出金可能額を超える要求 → 400・未照合分の件数が案内文言に含まれる", async () => {
    // 上のテストで出金済みのため、この時点でのavailableは0(全額使い切り済み)
    mockPayoutAuth(profileId, "organizer", organizerConnectId);
    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: STUCK_AMOUNT }),
    });
    const res = await payoutPOST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/出金可能額/);
    expect(data.error).toMatch(/1 件は照合待ち/);
  });
});

// ── TC-PAYOUT-03: GET 残高照会 ────────────────────────────────────────
describe("TC-PAYOUT-03: GET /api/payout/request — 残高照会", () => {
  let probeProfileId: string;

  beforeAll(async () => {
    probeProfileId = await insertProfile({
      role: "organizer",
      displayName: "残高照会テスト",
      email: `probe-payout-${Date.now()}@test.local`,
      stripeConnectId: null,
    });
    cleanup.profileIds.push(probeProfileId);
  }, 30_000);

  it("available / pending / frozen / history / transfer_fee / hold_days が返る", async () => {
    mockPayoutAuth(probeProfileId, "organizer", organizerConnectId);

    const req = new Request("http://localhost/api/payout/request", { method: "GET" });
    const res = await payoutGET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(typeof data.available).toBe("number");
    expect(typeof data.pending).toBe("number");
    expect(typeof data.frozen).toBe("number");
    expect(Array.isArray(data.history)).toBe(true);
    expect(data.transfer_fee).toBe(500);
    expect(data.hold_days).toBe(14);
  });
});
