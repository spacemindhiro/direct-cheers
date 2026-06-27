/**
 * TC-POST-PAY-MATRIX: 後半戦（照合・出金ガード）の データ汚染テスト
 *
 * Stripe API はモックし、DB はローカル Supabase に対して実際に書き込む。
 * test.each で以下を網羅:
 *   A. 照合差分シナリオマトリクス（Stripe vs DB 不一致の全パターン）= 10ケース
 *   B. Payout ガード条件の「1項目ずつ汚染」ネガティブテスト = 8ケース
 *   C. Payout リクエスト金額バリデーション = 6ケース
 *   D. プロファイルレベルガード（凍結・Connect未設定）= 3ケース
 *   E. 複数トランザクション混在時の照合整合性 = 5ケース
 * 計: 約32ケース
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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

// ── Stripe モック ────────────────────────────────────────────────────────────
// paymentIntents.retrieve は PI ID ごとに返す amount を制御できる
const stripeMockAmounts = new Map<string, number>(); // piId → stripeGross

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);

      (this.paymentIntents as any).retrieve = async (id: string, opts?: any) => {
        const amount = stripeMockAmounts.get(id) ?? 10_000;
        const expand = (opts?.expand ?? []) as string[];
        return {
          id,
          status: "succeeded",
          amount,
          amount_received: amount,
          currency: "jpy",
          latest_charge: expand.includes("latest_charge.balance_transaction")
            ? {
                id: `ch_mock_${id}`,
                balance_transaction: {
                  fee: Math.ceil(amount * 0.0396),
                  net: amount - Math.ceil(amount * 0.0396),
                },
              }
            : null,
        };
      };

      (this.payouts as any).create = async (params: any) => ({
        id: `po_mock_${Date.now()}`,
        amount: params.amount,
        currency: params.currency || "jpy",
        status: "paid",
        object: "payout",
      });

      (this.transfers as any).retrieve = async (id: string) => ({
        id,
        amount: 10_000,
        amount_reversed: 0,
        object: "transfer",
      });

      (this.transfers as any).createReversal = async (id: string, params: any) => ({
        id: `trr_mock_${Date.now()}`,
        amount: params.amount,
        transfer: id,
        object: "transfer_reversal",
      });
    }
  }
  return { ...StripeModule, default: MockStripe };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as reconcilePOST } from "@/app/api/admin/reconcile/event/route";
import { POST as payoutPOST } from "@/app/api/payout/request/route";

// ── 共有テストデータ ────────────────────────────────────────────────────────

let adminProfileId: string;
let organizerProfileId: string;
let payoutConnectId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  distributionIds: [] as string[],
  payoutRequestIds: [] as string[],
  settleTransferIds: [] as string[],
};

function mockAdminAuth() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminProfileId } }, error: null }) },
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

function mockPayoutAuth(profileId: string, role: string, connectId: string | null, balanceFrozen = false) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: profileId } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { role, balance_frozen: balanceFrozen, stripe_connect_id: connectId },
          }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  adminProfileId = await insertProfile({ role: "admin", displayName: "POST-PAY-MATRIX admin", email: `admin-postpaymatrix-${ts}@test.local` });
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "POST-PAY-MATRIX org",
    email: `org-postpaymatrix-${ts}@test.local`,
    stripeConnectId: `acct_postpaymatrix_${ts}`,
  });
  payoutConnectId = `acct_payout_${ts}`;
  cleanup.profileIds.push(adminProfileId, organizerProfileId);
  mockAdminAuth();
}, 30_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-POST-PAY-RECONCILE: 照合差分シナリオマトリクス（10ケース） ──────────
// Stripe が返す amount と DB に記録された gross を意図的に不一致にし、
// reconcile が確実に amount_verified=false・差分記録をすることを確認する。

const RECONCILE_CASES: Array<{
  label: string;
  stripeAmount: number;
  dbAmount: number;
  expectedVerified: boolean;
  expectedMismatch: number;
}> = [
  { label: "完全一致", stripeAmount: 10_000, dbAmount: 10_000, expectedVerified: true, expectedMismatch: 0 },
  { label: "DB が 1000円 少ない", stripeAmount: 10_000, dbAmount: 9_000, expectedVerified: false, expectedMismatch: 1_000 },
  { label: "DB が 1000円 多い", stripeAmount: 10_000, dbAmount: 11_000, expectedVerified: false, expectedMismatch: -1_000 },
  { label: "1円差（DB が少ない）", stripeAmount: 10_000, dbAmount: 9_999, expectedVerified: false, expectedMismatch: 1 },
  { label: "1円差（DB が多い）", stripeAmount: 10_000, dbAmount: 10_001, expectedVerified: false, expectedMismatch: -1 },
  { label: "DB が半額", stripeAmount: 10_000, dbAmount: 5_000, expectedVerified: false, expectedMismatch: 5_000 },
  { label: "小金額・完全一致", stripeAmount: 500, dbAmount: 500, expectedVerified: true, expectedMismatch: 0 },
  { label: "小金額・1円差", stripeAmount: 500, dbAmount: 499, expectedVerified: false, expectedMismatch: 1 },
  { label: "大金額・完全一致", stripeAmount: 300_000, dbAmount: 300_000, expectedVerified: true, expectedMismatch: 0 },
  { label: "大金額・不一致", stripeAmount: 300_000, dbAmount: 250_000, expectedVerified: false, expectedMismatch: 50_000 },
];

describe("TC-POST-PAY-RECONCILE: 照合差分マトリクス（Stripe vs DB 全パターン）", () => {
  it.each(RECONCILE_CASES.map((c) => [c.label, c.stripeAmount, c.dbAmount, c.expectedVerified, c.expectedMismatch]))(
    "[%s] Stripe=¥%i, DB=¥%i → verified=%s, mismatch=¥%i",
    async (label, stripeAmount, dbAmount, expectedVerified, expectedMismatch) => {
      const fakePiId = `pi_reconcile_${label}_${Date.now()}`.replace(/\s/g, "_");
      stripeMockAmounts.set(fakePiId, stripeAmount);

      const eventId = await insertEvent({ organizerProfileId, title: `RECONCILE ${label}` });
      const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
      cleanup.eventIds.push(eventId);
      cleanup.qrConfigIds.push(qrConfigId);

      const txId = await insertTransaction({
        qrConfigId,
        grossAmount: dbAmount,
        netAmount: dbAmount - Math.ceil(dbAmount * 0.0396) - Math.floor(dbAmount * 0.10),
        stripeFee: Math.ceil(dbAmount * 0.0396),
        platformFee: Math.floor(dbAmount * 0.10),
        stripePaymentIntentId: fakePiId,
        status: "completed",
        reconciled: false,
      });
      cleanup.transactionIds.push(txId);

      mockAdminAuth();
      const req = new Request("http://localhost/api/admin/reconcile/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const res = await reconcilePOST(req);
      expect(res.status).toBe(200);

      const { data: tx } = await testAdmin
        .from("transactions")
        .select("amount_verified, amount_mismatch, reconciled_at")
        .eq("transaction_id", txId)
        .single();

      expect(tx?.amount_verified).toBe(expectedVerified);
      expect(tx?.amount_mismatch).toBe(expectedMismatch);
      expect(tx?.reconciled_at).not.toBeNull();
    },
  );
});

// ── TC-POST-PAY-PAYOUT-GUARD: Payout ガード条件「1項目ずつ汚染」（8ケース） ─
// 出金可能条件を1つずつ false/NULL に汚染し、確実に出金がブロックされることを確認。

describe("TC-POST-PAY-PAYOUT-GUARD: Payout ガード汚染テスト（8ケース）", () => {
  const GUARD_CASES: Array<{
    label: string;
    distOverride: { holdReleased?: boolean; isFrozen?: boolean; status?: "accrued" | "paid" };
    txOverride: { reconciled?: boolean; amountVerified?: boolean; amountMismatch?: number };
    expectedStatus: number;
    expectedErrorMatch: RegExp;
  }> = [
    {
      label: "is_frozen=true（チャージバック凍結）",
      distOverride: { isFrozen: true },
      txOverride: {},
      expectedStatus: 400,
      expectedErrorMatch: /出金可能額|超えています/,
    },
    {
      label: "distribution_status='paid'（支払済み）",
      distOverride: { status: "paid" },
      txOverride: {},
      expectedStatus: 400,
      expectedErrorMatch: /出金可能額|超えています/,
    },
    {
      label: "hold_released=false（ホールド未解除）",
      distOverride: { holdReleased: false },
      txOverride: {},
      expectedStatus: 400,
      expectedErrorMatch: /出金可能額|超えています/,
    },
    {
      label: "reconciled_at=null（照合未完了）",
      distOverride: { holdReleased: true },
      txOverride: { reconciled: false },
      expectedStatus: 400,
      expectedErrorMatch: /出金可能額|超えています/,
    },
    {
      label: "amount_verified=false（照合不一致）",
      distOverride: { holdReleased: true },
      txOverride: { reconciled: true, amountVerified: false },
      expectedStatus: 400,
      expectedErrorMatch: /出金可能額|超えています/,
    },
    {
      label: "amount_mismatch=1000（1000円差分）",
      distOverride: { holdReleased: true },
      txOverride: { reconciled: true, amountMismatch: 1000 },
      expectedStatus: 400,
      expectedErrorMatch: /出金可能額|超えています/,
    },
    {
      label: "全条件正常（正常系・出金可）",
      distOverride: { holdReleased: true, isFrozen: false, status: "accrued" },
      txOverride: { reconciled: true, amountVerified: true, amountMismatch: 0 },
      expectedStatus: 200,
      expectedErrorMatch: /./,
    },
    {
      label: "hold_released=true + is_frozen=true（凍結優先）",
      distOverride: { holdReleased: true, isFrozen: true },
      txOverride: { reconciled: true },
      expectedStatus: 400,
      expectedErrorMatch: /出金可能額|超えています/,
    },
  ];

  it.each(GUARD_CASES.map((c, i) => [c.label, i, c.expectedStatus]))(
    "[%s] → HTTP %i",
    async (label, caseIdx, expectedStatus) => {
      const guardCase = GUARD_CASES[caseIdx as number];
      const ts = Date.now() + (caseIdx as number) * 1000;
      // 各テストで一意の Connect ID を使用（stripe_connect_id ユニーク制約回避）
      const uniqueConnectId = `acct_guard_${caseIdx}_${ts}`;

      const profileId = await insertProfile({
        role: "organizer",
        displayName: `GUARD-TEST-${caseIdx}`,
        email: `guard-${caseIdx}-${ts}@test.local`,
        stripeConnectId: uniqueConnectId,
      });
      cleanup.profileIds.push(profileId);

      const eventId = await insertEvent({ organizerProfileId: profileId, title: `GUARD-TEST-${label}` });
      const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: profileId, recipientProfileId: profileId });
      cleanup.eventIds.push(eventId);
      cleanup.qrConfigIds.push(qrConfigId);

      const fakePiId = `pi_guard_${caseIdx}_${ts}`;
      const gross = 20_000;
      const net = gross - Math.ceil(gross * 0.0396) - Math.floor(gross * 0.10);

      // amountMismatch を DB に反映するためトランザクションを挿入後に直接更新
      const txId = await insertTransaction({
        qrConfigId,
        grossAmount: gross,
        netAmount: net,
        stripeFee: Math.ceil(gross * 0.0396),
        platformFee: Math.floor(gross * 0.10),
        stripePaymentIntentId: fakePiId,
        status: "completed",
        reconciled: guardCase.txOverride.reconciled !== false,
      });
      cleanup.transactionIds.push(txId);

      // amountVerified / amountMismatch を直接更新
      if (guardCase.txOverride.amountVerified !== undefined || guardCase.txOverride.amountMismatch !== undefined) {
        await testAdmin.from("transactions").update({
          ...(guardCase.txOverride.amountVerified !== undefined ? { amount_verified: guardCase.txOverride.amountVerified } : {}),
          ...(guardCase.txOverride.amountMismatch !== undefined ? { amount_mismatch: guardCase.txOverride.amountMismatch } : {}),
        }).eq("transaction_id", txId);
      }

      const distId = await insertDistribution({
        transactionId: txId,
        eventId,
        profileId,
        role: "organizer",
        actualAmount: net,
        status: guardCase.distOverride.status ?? "accrued",
        holdReleased: guardCase.distOverride.holdReleased ?? true,
        isFrozen: guardCase.distOverride.isFrozen ?? false,
      });
      cleanup.distributionIds.push(distId);

      // settle_transfers を挿入（振込手数料回収 Reversal のため）
      const fakeTransferId = `tr_guard_${caseIdx}_${ts}`;
      await insertSettleTransfer({ eventId, profileId, stripeTransferId: fakeTransferId, amount: net });
      cleanup.settleTransferIds.push(fakeTransferId);

      mockPayoutAuth(profileId, "organizer", uniqueConnectId, false);

      const req = new Request("http://localhost/api/payout/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requested_amount: 10_000 }),
      });
      const res = await payoutPOST(req);

      expect(res.status).toBe(expectedStatus);
      if (expectedStatus !== 200) {
        const data = await res.json();
        expect(data.error).toMatch(guardCase.expectedErrorMatch);
      } else {
        const data = await res.json();
        expect(data.success).toBe(true);
        if (data.request_id) cleanup.payoutRequestIds.push(data.request_id);
      }
    },
  );
});

// ── TC-POST-PAY-PAYOUT-AMOUNT: 出金金額バリデーション（6ケース） ────────────

describe("TC-POST-PAY-PAYOUT-AMOUNT: 出金金額バリデーション（振込手数料境界値）", () => {
  const AMOUNT_CASES: Array<[string, number, number]> = [
    ["振込手数料ちょうど（501円）", 501, 200],
    ["振込手数料=500円（不可）", 500, 400],
    ["振込手数料-1=499円（不可）", 499, 400],
    ["1円（不可）", 1, 400],
    ["0円（不可）", 0, 400],
    ["マイナス（不可）", -1, 400],
  ];

  let amountTestProfileId: string;

  beforeAll(async () => {
    const ts = Date.now();
    amountTestProfileId = await insertProfile({
      role: "organizer",
      displayName: "AMOUNT-TEST-profile",
      email: `amount-test-${ts}@test.local`,
      stripeConnectId: payoutConnectId,
    });
    cleanup.profileIds.push(amountTestProfileId);

    // 十分な残高を持つ distribution を作成
    const eventId = await insertEvent({ organizerProfileId: amountTestProfileId, title: "AMOUNT-TEST イベント" });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: amountTestProfileId, recipientProfileId: amountTestProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const fakePiId = `pi_amount_test_${ts}`;
    const gross = 100_000;
    const net = gross - Math.ceil(gross * 0.0396) - Math.floor(gross * 0.10);

    const txId = await insertTransaction({
      qrConfigId, grossAmount: gross, netAmount: net,
      stripeFee: Math.ceil(gross * 0.0396), platformFee: Math.floor(gross * 0.10),
      stripePaymentIntentId: fakePiId, status: "completed", reconciled: true,
    });
    cleanup.transactionIds.push(txId);

    const distId = await insertDistribution({
      transactionId: txId, eventId, profileId: amountTestProfileId,
      role: "organizer", actualAmount: net, holdReleased: true, isFrozen: false,
    });
    cleanup.distributionIds.push(distId);

    const fakeTransferId = `tr_amount_test_${ts}`;
    await insertSettleTransfer({ eventId, profileId: amountTestProfileId, stripeTransferId: fakeTransferId, amount: net });
    cleanup.settleTransferIds.push(fakeTransferId);
  }, 30_000);

  it.each(AMOUNT_CASES)(
    "[%s] requested=%i → HTTP %i",
    async (_label, requestedAmount, expectedStatus) => {
      mockPayoutAuth(amountTestProfileId, "organizer", payoutConnectId, false);

      const req = new Request("http://localhost/api/payout/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requested_amount: requestedAmount }),
      });
      const res = await payoutPOST(req);
      expect(res.status).toBe(expectedStatus);
      if (expectedStatus === 200) {
        const data = await res.json();
        if (data.request_id) cleanup.payoutRequestIds.push(data.request_id);
      }
    },
  );
});

// ── TC-POST-PAY-PROFILE-GUARD: プロファイルレベルガード（3ケース） ─────────

describe("TC-POST-PAY-PROFILE-GUARD: プロファイルレベルガード（3ケース）", () => {
  let frozenProfileId: string;
  let noConnectProfileId: string;

  beforeAll(async () => {
    const ts = Date.now();
    frozenProfileId = await insertProfile({
      role: "organizer",
      displayName: "FROZEN",
      email: `frozen-${ts}@test.local`,
      stripeConnectId: `acct_frozen_${ts}`, // payoutConnectId と重複しないよう個別ID
    });
    noConnectProfileId = await insertProfile({ role: "organizer", displayName: "NO-CONNECT", email: `noconnect-${ts}@test.local`, stripeConnectId: null });
    cleanup.profileIds.push(frozenProfileId, noConnectProfileId);
  }, 15_000);

  it("balance_frozen=true → 403", async () => {
    mockPayoutAuth(frozenProfileId, "organizer", `acct_frozen_for_test`, true);
    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: 5_000 }),
    });
    const res = await payoutPOST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/凍結/);
  });

  it("stripe_connect_id=null → 400", async () => {
    mockPayoutAuth(noConnectProfileId, "organizer", null, false);
    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: 5_000 }),
    });
    const res = await payoutPOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Stripe Connect/i);
  });

  it("未認証 → 401", async () => {
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      from: vi.fn((table: string) => testAdmin.from(table)),
    });
    const req = new Request("http://localhost/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: 5_000 }),
    });
    const res = await payoutPOST(req);
    expect(res.status).toBe(401);
    mockAdminAuth();
  });
});

// ── TC-POST-PAY-MULTI-TX: 複数トランザクション混在時の照合整合性（5ケース）──

describe("TC-POST-PAY-MULTI-TX: 複数TX混在時の照合 — verified/unverified 混在シナリオ", () => {
  it("2件中1件が不一致 → errors=0（個別記録）、不一致TXはamount_verified=false", async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "MULTI-TX 2件混在" });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    // TX1: 一致
    const pi1 = `pi_multi_ok_${Date.now()}`;
    stripeMockAmounts.set(pi1, 10_000);
    const tx1 = await insertTransaction({ qrConfigId, grossAmount: 10_000, netAmount: 8_604, stripeFee: 396, platformFee: 1_000, stripePaymentIntentId: pi1, status: "completed", reconciled: false });
    cleanup.transactionIds.push(tx1);

    // TX2: 不一致（DBは9000、Stripeは10000）
    const pi2 = `pi_multi_mismatch_${Date.now()}`;
    stripeMockAmounts.set(pi2, 10_000);
    const tx2 = await insertTransaction({ qrConfigId, grossAmount: 9_000, netAmount: 7_743, stripeFee: 357, platformFee: 900, stripePaymentIntentId: pi2, status: "completed", reconciled: false });
    cleanup.transactionIds.push(tx2);

    mockAdminAuth();
    const req = new Request("http://localhost/api/admin/reconcile/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    const res = await reconcilePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reconciled).toBe(2);
    expect(data.errors).toBe(0);

    const { data: t1 } = await testAdmin.from("transactions").select("amount_verified, amount_mismatch").eq("transaction_id", tx1).single();
    expect(t1?.amount_verified).toBe(true);
    expect(t1?.amount_mismatch).toBe(0);

    const { data: t2 } = await testAdmin.from("transactions").select("amount_verified, amount_mismatch").eq("transaction_id", tx2).single();
    expect(t2?.amount_verified).toBe(false);
    expect(t2?.amount_mismatch).toBe(1_000);
  });

  it("照合済みトランザクションは再照合で再試行されない（冪等）", async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "MULTI-TX 冪等" });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const piId = `pi_idem_reconcile_${Date.now()}`;
    stripeMockAmounts.set(piId, 5_000);
    const txId = await insertTransaction({
      qrConfigId, grossAmount: 5_000, netAmount: 4_302,
      stripeFee: 198, platformFee: 500, stripePaymentIntentId: piId,
      status: "completed",
      reconciled: true, // 既に照合済み → 対象外
    });
    cleanup.transactionIds.push(txId);

    mockAdminAuth();
    const req = new Request("http://localhost/api/admin/reconcile/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    const res = await reconcilePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    // 照合済みのため対象TXは0件
    expect(data.reconciled).toBe(0);
    expect(data.checked).toBe(0);
  });

  it("eventId 欠損 → 400", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost/api/admin/reconcile/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await reconcilePOST(req);
    expect(res.status).toBe(400);
  });

  it("照合対象0件のイベント → checked=0, reconciled=0, errors=0", async () => {
    const emptyEventId = await insertEvent({ organizerProfileId, title: "MULTI-TX 空イベント" });
    const emptyQrConfigId = await insertQrConfig({ eventId: emptyEventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.eventIds.push(emptyEventId);
    cleanup.qrConfigIds.push(emptyQrConfigId);

    mockAdminAuth();
    const req = new Request("http://localhost/api/admin/reconcile/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: emptyEventId }),
    });
    const res = await reconcilePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.checked).toBe(0);
    expect(data.reconciled).toBe(0);
    expect(data.errors).toBe(0);
  });

  it("amount_verified=false のトランザクションは再照合で再試行される", async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "MULTI-TX 再試行" });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const piId = `pi_retry_${Date.now()}`;
    stripeMockAmounts.set(piId, 8_000);
    const txId = await insertTransaction({
      qrConfigId, grossAmount: 7_000, netAmount: 6_022,
      stripeFee: 278, platformFee: 700, stripePaymentIntentId: piId,
      status: "completed", reconciled: true,
    });
    cleanup.transactionIds.push(txId);
    // amount_verified=false に更新（再試行対象にする）
    await testAdmin.from("transactions").update({ amount_verified: false, amount_mismatch: 1_000 }).eq("transaction_id", txId);

    mockAdminAuth();
    const req = new Request("http://localhost/api/admin/reconcile/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    const res = await reconcilePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    // amount_verified=false は再照合対象 → checked=1
    expect(data.checked).toBe(1);
  });
});
