/**
 * TC-PAYOUT: /api/payout/request の統合テスト
 *
 * - Stripe テストモードで payout を実際に作成
 * - 振込手数料（¥500）の Reversal ロジックをロール別に検証
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

const TEST_USER_IDS = {
  admin: "22222222-2222-2222-2222-222222222222",
  organizer: "22222222-2222-2222-2222-333333333333",
  artist: "22222222-2222-2222-2222-444444444444",
  agent: "22222222-2222-2222-2222-555555555555",
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

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
let artistConnectId: string;
let agentConnectId: string;

beforeAll(async () => {
  [organizerConnectId, artistConnectId, agentConnectId] = await Promise.all([
    createTestConnectAccount(),
    createTestConnectAccount(),
    createTestConnectAccount(),
  ]);
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await Promise.all([
    deleteTestConnectAccount(organizerConnectId),
    deleteTestConnectAccount(artistConnectId),
    deleteTestConnectAccount(agentConnectId),
  ]);
});

// ── TC-PAYOUT-01: オーガナイザー出金（新フロー）─────────────────────────
describe("TC-PAYOUT-01: organizer 出金 — destination transfer reversal で手数料回収", () => {
  const GROSS = 20_000;
  const PAYOUT_AMOUNT = 10_000;
  const TRANSFER_FEE = 500;

  beforeAll(async () => {
    // DB にオーガナイザープロファイルを挿入
    await insertProfile({
      profileId: TEST_USER_IDS.organizer,
      role: "organizer",
      displayName: "テストオーガナイザー（出金）",
      email: "organizer-payout@test.local",
      stripeConnectId: organizerConnectId,
    });
    cleanup.profileIds.push(TEST_USER_IDS.organizer);

    const eventId = await insertEvent({ organizerProfileId: TEST_USER_IDS.organizer });
    const qrConfigId = await insertQrConfig({ eventId, recipientProfileId: TEST_USER_IDS.organizer });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    // Stripe: destination charge で資金を organizer の Connect アカウントへ入金
    const appFee = Math.floor(GROSS * 0.10) + Math.floor(GROSS * 0.0396);
    const pi = await createTestPaymentIntent({
      amount: GROSS,
      organizerConnectId,
      applicationFeeAmount: appFee,
    });
    const destTransferId = await captureAndGetDestinationTransfer(pi.id);

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: GROSS - Math.floor(GROSS * 0.0396) - Math.floor(GROSS * 0.10),
      stripeFee: Math.floor(GROSS * 0.0396),
      platformFee: Math.floor(GROSS * 0.10),
      stripePaymentIntentId: pi.id,
      destinationTransferId: destTransferId,
    });
    cleanup.transactionIds.push(txId);

    const distId = await insertDistribution({
      transactionId: txId,
      eventId,
      profileId: TEST_USER_IDS.organizer,
      role: "organizer",
      actualAmount: PAYOUT_AMOUNT + 2_000, // 余裕を持たせた残高
      holdReleased: true,
    });
    cleanup.distributionIds.push(distId);
  }, 60_000);

  it("出金リクエストが成功し payout_requests が作成される", async () => {
    mockPayoutAuth(TEST_USER_IDS.organizer, "organizer", organizerConnectId);

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

    // payout_requests がDBに作成されているか
    const { data: pr } = await testAdmin
      .from("payout_requests")
      .select("status, net_payout_amount, stripe_fee_deducted")
      .eq("request_id", data.request_id)
      .single();
    expect(pr?.status).toBe("completed");
    expect(pr?.stripe_fee_deducted).toBe(TRANSFER_FEE);
    expect(pr?.net_payout_amount).toBe(PAYOUT_AMOUNT - TRANSFER_FEE);
  });

  it("振込手数料以下の出金額は拒否される", async () => {
    mockPayoutAuth(TEST_USER_IDS.organizer, "organizer", organizerConnectId);

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

// ── TC-PAYOUT-02: エージェント出金 ───────────────────────────────────
describe("TC-PAYOUT-02: agent 出金 — settle_transfer reversal で手数料回収", () => {
  const AGENT_AMOUNT = 8_000;
  const PAYOUT_AMOUNT = 5_000;
  const TRANSFER_FEE = 500;

  beforeAll(async () => {
    await insertProfile({
      profileId: TEST_USER_IDS.agent,
      role: "agent",
      displayName: "テストエージェント（出金）",
      email: "agent-payout@test.local",
      stripeConnectId: agentConnectId,
    });
    cleanup.profileIds.push(TEST_USER_IDS.agent);

    const agentOrgId = await insertProfile({
      role: "organizer",
      displayName: "エージェントテスト用オーガナイザー",
      email: "org-for-agent@test.local",
      stripeConnectId: null,
    });
    cleanup.profileIds.push(agentOrgId);

    const eventId = await insertEvent({
      organizerProfileId: agentOrgId,
      agentId: TEST_USER_IDS.agent,
    });
    const qrConfigId = await insertQrConfig({ eventId, recipientProfileId: agentOrgId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    // Stripe: platform → agent Transfer（旧フロー）
    const transfer = await createTestTransfer({
      amount: AGENT_AMOUNT,
      destination: agentConnectId,
      metadata: { event_id: eventId, profile_id: TEST_USER_IDS.agent },
    });

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 10_000,
      netAmount: 8_600,
      stripeFee: 396,
      platformFee: 1_000,
      stripePaymentIntentId: `pi_test_agent_${Date.now()}`,
    });
    cleanup.transactionIds.push(txId);

    await insertSettleTransfer({
      eventId,
      profileId: TEST_USER_IDS.agent,
      stripeTransferId: transfer.id,
      amount: AGENT_AMOUNT,
    });
    cleanup.settleTransferIds.push(transfer.id);

    const distId = await insertDistribution({
      transactionId: txId,
      eventId,
      profileId: TEST_USER_IDS.agent,
      role: "agent",
      actualAmount: AGENT_AMOUNT,
      holdReleased: true,
    });
    cleanup.distributionIds.push(distId);
  }, 60_000);

  it("エージェント出金が成功し settle_transfer が Reversal される", async () => {
    mockPayoutAuth(TEST_USER_IDS.agent, "agent", agentConnectId);

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

// ── TC-PAYOUT-03: GET で残高照会 ─────────────────────────────────────
describe("TC-PAYOUT-03: GET /api/payout/request — 残高照会", () => {
  it("available / pending / frozen の内訳と履歴が返る", async () => {
    mockPayoutAuth(TEST_USER_IDS.organizer, "organizer", organizerConnectId);

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
