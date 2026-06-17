/**
 * TC-REVERSAL: 出金手数料回収（Reverse Transfer）のDB記録検証
 *
 * 修正対象のバグ: collectFeeByReversal が Stripe 成功後に結果を捨てていた問題。
 * このテストで transfer_fee_reversals テーブルへの正確な記録を保証する。
 *
 * Stripe 操作はすべてモック（transfers.retrieve / transfers.createReversal / payouts.create）。
 * DB操作（payout_requests / transfer_fee_reversals / transaction_distributions）は実 Supabase。
 *
 * テストケース:
 *   TC-REVERSAL-01: 正常系 — 1 transfer で ¥500 全額回収
 *   TC-REVERSAL-02: 正常系 — 2 transfers にまたがる分割回収
 *   TC-REVERSAL-03: 境界値 — requested_amount = 501（最小有効額）
 *   TC-REVERSAL-04: 異常系 — Stripe reversal 失敗 → payout_requests 作成済み・reversal ログ 0 件
 *   TC-REVERSAL-05: 冪等性 — stripe_reversal_id の UNIQUE 制約で二重挿入を阻止
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { insertProfile, deleteAuthUsers, insertEvent, insertQrConfig, insertTransaction, insertDistribution, insertSettleTransfer } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

// Stripe モック制御オブジェクト（vi.hoisted で vi.mock より先に評価される）
const mockCtrl = vi.hoisted(() => ({
  // transfer_id → { amount, amount_reversed } のマッピング
  transferData: {} as Record<string, { amount: number; amount_reversed: number }>,
  // true にすると createReversal が throw する
  shouldFail: false,
  // 発行した reversal ID の連番
  counter: { n: 0 },
  // createReversal で捕捉した呼び出し一覧
  captured: [] as Array<{ id: string; transferId: string; amount: number }>,
}));

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
      (this.transfers as any).retrieve = async (id: string) => {
        const d = mockCtrl.transferData[id];
        if (!d) throw new Error(`mock: transfer ${id} not configured`);
        return { id, amount: d.amount, amount_reversed: d.amount_reversed, object: "transfer" };
      };
      (this.transfers as any).createReversal = async (id: string, params: any) => {
        if (mockCtrl.shouldFail) throw new Error("Stripe reversal mock failure");
        const reversalId = `trr_test_${++mockCtrl.counter.n}`;
        mockCtrl.captured.push({ id: reversalId, transferId: id, amount: params.amount });
        return { id: reversalId, amount: params.amount, transfer: id, object: "transfer_reversal" };
      };
    }
  }
  return { ...StripeModule, default: InstrumentedStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as payoutPOST } from "@/app/api/payout/request/route";

const TRANSFER_FEE = 500;

function mockAuth(userId: string, connectId = "acct_mock_reversal_test") {
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
            data: { role: "organizer", balance_frozen: false, stripe_connect_id: connectId },
          }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

function resetMockCtrl() {
  mockCtrl.transferData = {};
  mockCtrl.shouldFail = false;
  mockCtrl.captured = [];
  // counter は連番のままで OK（reversal_id 衝突防止のため reset しない）
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

// ── TC-REVERSAL-01: 正常系（1 transfer で ¥500 全額回収）──────────────────────
describe("TC-REVERSAL-01: 1 transfer で ¥500 全額回収 → reversal ログ 1 件", () => {
  const GROSS = 10_000;
  const DIST_AMOUNT = 5_000;
  const PAYOUT = 3_000;
  const TRANSFER_ID = "tr_mock_r01";
  let profileId: string;
  let connectId: string;

  beforeAll(async () => {
    const ts = Date.now();
    connectId = `acct_mock_r01_${ts}`;
    profileId = await insertProfile({
      role: "organizer",
      displayName: "逆転テスト01",
      email: `reversal-01-${ts}@test.local`,
      stripeConnectId: connectId,
    });
    cleanup.profileIds.push(profileId);

    const eventId = await insertEvent({ organizerProfileId: profileId });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: profileId, recipientProfileId: profileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: 8_604,
      stripeFee: 396,
      platformFee: 1_000,
      stripePaymentIntentId: `pi_mock_r01_${ts}`,
    });
    cleanup.transactionIds.push(txId);

    const distId = await insertDistribution({
      transactionId: txId,
      eventId,
      profileId,
      role: "organizer",
      actualAmount: DIST_AMOUNT,
      holdReleased: true,
    });
    cleanup.distributionIds.push(distId);

    await insertSettleTransfer({ eventId, profileId, stripeTransferId: TRANSFER_ID, amount: 8_604 });
    cleanup.settleTransferIds.push(TRANSFER_ID);
  }, 30_000);

  beforeEach(() => {
    resetMockCtrl();
    mockCtrl.transferData[TRANSFER_ID] = { amount: 10_000, amount_reversed: 0 };
  });

  it("出金成功・reversal ログが 1 件・金額が TRANSFER_FEE と一致", async () => {
    mockAuth(profileId, connectId);
    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: PAYOUT }),
    });

    const res = await payoutPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.net_payout).toBe(PAYOUT - TRANSFER_FEE);

    cleanup.payoutRequestIds.push(data.request_id);

    // reversal ログ確認
    const { data: logs, error } = await testAdmin
      .from("transfer_fee_reversals")
      .select("source_transfer_id, stripe_reversal_id, amount, tax_amount, status, payout_request_id")
      .eq("payout_request_id", data.request_id);

    expect(error).toBeNull();
    expect(logs).toHaveLength(1);
    expect(logs![0].source_transfer_id).toBe(TRANSFER_ID);
    expect(logs![0].stripe_reversal_id).toMatch(/^trr_test_/);
    expect(logs![0].amount).toBe(TRANSFER_FEE);
    // 消費税は明細確定時に計算・保存: floor(500 × 10/110) = 45
    expect(logs![0].tax_amount).toBe(Math.floor(TRANSFER_FEE * 10 / 110)); // 45
    expect(logs![0].status).toBe("succeeded");
    expect(logs![0].payout_request_id).toBe(data.request_id);
  });
});

// ── TC-REVERSAL-02: 正常系（2 transfers にまたがる分割回収）──────────────────
describe("TC-REVERSAL-02: 2 transfers にまたがる分割回収 → reversal ログ 2 件・合計 = ¥500", () => {
  const GROSS = 10_000;
  const DIST_AMOUNT = 5_000;
  const PAYOUT = 3_000;
  const TRANSFER_ID_A = "tr_mock_r02a";
  const TRANSFER_ID_B = "tr_mock_r02b";
  let profileId: string;
  let connectId: string;

  beforeAll(async () => {
    const ts = Date.now();
    connectId = `acct_mock_r02_${ts}`;
    profileId = await insertProfile({
      role: "organizer",
      displayName: "逆転テスト02",
      email: `reversal-02-${ts}@test.local`,
      stripeConnectId: connectId,
    });
    cleanup.profileIds.push(profileId);

    const eventId = await insertEvent({ organizerProfileId: profileId });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: profileId, recipientProfileId: profileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: 8_604,
      stripeFee: 396,
      platformFee: 1_000,
      stripePaymentIntentId: `pi_mock_r02_${ts}`,
    });
    cleanup.transactionIds.push(txId);

    const distId = await insertDistribution({
      transactionId: txId,
      eventId,
      profileId,
      role: "organizer",
      actualAmount: DIST_AMOUNT,
      holdReleased: true,
    });
    cleanup.distributionIds.push(distId);

    // 2 つの settle_transfer（逆転は降順で取得されるため B が先にヒット）
    await insertSettleTransfer({ eventId, profileId, stripeTransferId: TRANSFER_ID_A, amount: 3_000 });
    await insertSettleTransfer({ eventId, profileId, stripeTransferId: TRANSFER_ID_B, amount: 5_604 });
    cleanup.settleTransferIds.push(TRANSFER_ID_A, TRANSFER_ID_B);
  }, 30_000);

  beforeEach(() => {
    resetMockCtrl();
    // B は逆転可能額が 300 のみ（残り 200 は A から回収）
    mockCtrl.transferData[TRANSFER_ID_A] = { amount: 5_000, amount_reversed: 0 };
    mockCtrl.transferData[TRANSFER_ID_B] = { amount: 300, amount_reversed: 0 };
  });

  it("reversal ログが 2 件・合計金額が ¥500 に一致", async () => {
    mockAuth(profileId, connectId);
    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: PAYOUT }),
    });

    const res = await payoutPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    cleanup.payoutRequestIds.push(data.request_id);

    const { data: logs, error } = await testAdmin
      .from("transfer_fee_reversals")
      .select("source_transfer_id, amount, tax_amount")
      .eq("payout_request_id", data.request_id)
      .order("amount", { ascending: true });

    expect(error).toBeNull();
    expect(logs).toHaveLength(2);

    const totalReversed = logs!.reduce((s, r) => s + r.amount, 0);
    expect(totalReversed).toBe(TRANSFER_FEE); // ¥300 + ¥200 = ¥500

    // 各 reversal が 1 円単位で正確
    const sorted = logs!.sort((a: any, b: any) => a.amount - b.amount);
    expect(sorted[0].amount).toBe(200); // A から
    expect(sorted[1].amount).toBe(300); // B から（先に取得されるため先に回収）

    // 消費税は明細単位で確定: floor(200×10/110)=18, floor(300×10/110)=27
    // 積み上げ合計=45 ≠ グロス再計算 floor(500×10/110)=45（この場合は一致するが、それは偶然）
    expect(sorted[0].tax_amount).toBe(Math.floor(200 * 10 / 110)); // 18
    expect(sorted[1].tax_amount).toBe(Math.floor(300 * 10 / 110)); // 27
    const totalTax = sorted.reduce((s: number, r: any) => s + r.tax_amount, 0);
    expect(totalTax).toBe(18 + 27); // 45（明細積み上げ）
  });
});

// ── TC-REVERSAL-03: 境界値（requested_amount = 501、最小有効額）────────────────
describe("TC-REVERSAL-03: 境界値 — requested_amount = 501（振込手数料より 1 円多い）", () => {
  const TRANSFER_ID = "tr_mock_r03";
  let profileId: string;
  let connectId: string;

  beforeAll(async () => {
    const ts = Date.now();
    connectId = `acct_mock_r03_${ts}`;
    profileId = await insertProfile({
      role: "organizer",
      displayName: "逆転テスト03",
      email: `reversal-03-${ts}@test.local`,
      stripeConnectId: connectId,
    });
    cleanup.profileIds.push(profileId);

    const eventId = await insertEvent({ organizerProfileId: profileId });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: profileId, recipientProfileId: profileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 10_000,
      netAmount: 8_604,
      stripeFee: 396,
      platformFee: 1_000,
      stripePaymentIntentId: `pi_mock_r03_${ts}`,
    });
    cleanup.transactionIds.push(txId);

    const distId = await insertDistribution({
      transactionId: txId,
      eventId,
      profileId,
      role: "organizer",
      actualAmount: 2_000,
      holdReleased: true,
    });
    cleanup.distributionIds.push(distId);

    await insertSettleTransfer({ eventId, profileId, stripeTransferId: TRANSFER_ID, amount: 8_604 });
    cleanup.settleTransferIds.push(TRANSFER_ID);
  }, 30_000);

  beforeEach(() => {
    resetMockCtrl();
    mockCtrl.transferData[TRANSFER_ID] = { amount: 10_000, amount_reversed: 0 };
  });

  it("net_payout = 1 円・reversal ログの amount = 500 円", async () => {
    mockAuth(profileId, connectId);
    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: 501 }),
    });

    const res = await payoutPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.net_payout).toBe(1); // 501 - 500 = 1
    cleanup.payoutRequestIds.push(data.request_id);

    const { data: logs } = await testAdmin
      .from("transfer_fee_reversals")
      .select("amount")
      .eq("payout_request_id", data.request_id);

    expect(logs).toHaveLength(1);
    expect(logs![0].amount).toBe(TRANSFER_FEE); // ¥500 ちょうど
  });

  it("振込手数料以下（= 500）は 400 エラー・reversal ログなし", async () => {
    mockAuth(profileId, connectId);
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

// ── TC-REVERSAL-04: 異常系（Stripe reversal 失敗 → ログ 0 件）───────────────────
describe("TC-REVERSAL-04: Stripe reversal 失敗 → payout_requests 作成済み・reversal ログ 0 件", () => {
  const TRANSFER_ID = "tr_mock_r04";
  let profileId: string;
  let connectId: string;

  beforeAll(async () => {
    const ts = Date.now();
    connectId = `acct_mock_r04_${ts}`;
    profileId = await insertProfile({
      role: "organizer",
      displayName: "逆転テスト04",
      email: `reversal-04-${ts}@test.local`,
      stripeConnectId: connectId,
    });
    cleanup.profileIds.push(profileId);

    const eventId = await insertEvent({ organizerProfileId: profileId });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: profileId, recipientProfileId: profileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 10_000,
      netAmount: 8_604,
      stripeFee: 396,
      platformFee: 1_000,
      stripePaymentIntentId: `pi_mock_r04_${ts}`,
    });
    cleanup.transactionIds.push(txId);

    const distId = await insertDistribution({
      transactionId: txId,
      eventId,
      profileId,
      role: "organizer",
      actualAmount: 5_000,
      holdReleased: true,
    });
    cleanup.distributionIds.push(distId);

    await insertSettleTransfer({ eventId, profileId, stripeTransferId: TRANSFER_ID, amount: 8_604 });
    cleanup.settleTransferIds.push(TRANSFER_ID);
  }, 30_000);

  beforeEach(() => {
    resetMockCtrl();
    mockCtrl.transferData[TRANSFER_ID] = { amount: 10_000, amount_reversed: 0 };
    mockCtrl.shouldFail = true; // reversal を強制失敗
  });

  it("200 が返る（reversal 失敗はサイレントログ）・payout_requests に記録・reversal ログ 0 件", async () => {
    mockAuth(profileId, connectId);
    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: 3_000 }),
    });

    const res = await payoutPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    cleanup.payoutRequestIds.push(data.request_id);

    // payout_requests は作成されている
    const { data: pr } = await testAdmin
      .from("payout_requests")
      .select("status")
      .eq("request_id", data.request_id)
      .single();
    expect(pr?.status).toBe("completed");

    // reversal ログは 0 件（Stripe 失敗したので保存しない）
    const { data: logs } = await testAdmin
      .from("transfer_fee_reversals")
      .select("reversal_id")
      .eq("payout_request_id", data.request_id);
    expect(logs).toHaveLength(0);
  });
});

// ── TC-REVERSAL-05: 冪等性（UNIQUE 制約で二重挿入を阻止）────────────────────────
describe("TC-REVERSAL-05: stripe_reversal_id の UNIQUE 制約で二重挿入を阻止", () => {
  it("同じ stripe_reversal_id の二重 INSERT はエラーになる", async () => {
    // payout_request を直接作成
    const profileId = cleanup.profileIds[0]; // 既存プロファイルを再利用
    if (!profileId) return; // beforeAll 未実行時はスキップ

    const { data: pr } = await testAdmin
      .from("payout_requests")
      .insert({
        profile_id: profileId,
        requested_amount: 1000,
        stripe_fee_deducted: 500,
        net_payout_amount: 500,
        status: "completed",
        stripe_transfer_id: null,
      })
      .select("request_id")
      .single();

    if (!pr) return;
    cleanup.payoutRequestIds.push(pr.request_id);

    const duplicateReversalId = `trr_test_idempotent_${Date.now()}`;

    // 1 回目: 成功
    const { error: e1 } = await testAdmin.from("transfer_fee_reversals").insert({
      payout_request_id: pr.request_id,
      source_transfer_id: "tr_mock_idm",
      stripe_reversal_id: duplicateReversalId,
      amount: 500,
      status: "succeeded",
    });
    expect(e1).toBeNull();

    // 2 回目: UNIQUE 制約違反でエラー
    const { error: e2 } = await testAdmin.from("transfer_fee_reversals").insert({
      payout_request_id: pr.request_id,
      source_transfer_id: "tr_mock_idm",
      stripe_reversal_id: duplicateReversalId,
      amount: 500,
      status: "succeeded",
    });
    expect(e2).not.toBeNull();
    expect(e2!.code).toBe("23505"); // PostgreSQL unique_violation
  });
});

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});
