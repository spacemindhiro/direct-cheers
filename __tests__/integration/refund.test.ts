/**
 * TC-REFUND: /api/admin/refund の統合テスト
 *
 * 5パターンを検証:
 *   TC-REFUND-01: 非admin → 403 Forbidden
 *   TC-REFUND-02: requires_capture → PI cancel + TX cancelled
 *   TC-REFUND-03: succeeded + settle前 + COMPASSIONATE → refund + debt_claims(stripe_fee)
 *   TC-REFUND-04: succeeded + settle後 + FULL_PENALTY  → 全transfer逆転 + debt_claims(platform_fee)
 *   TC-REFUND-05: succeeded + settle後 + COMPASSIONATE → 全transfer逆転 + debt_claims(stripe_fee)
 *
 * Stripe API は実際に呼び出す（テストモード）。DB は本物のローカル Supabase。
 * createClient のみ vi.mock でダミー返却し、admin auth を制御する。
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
  insertEventArtist,
  insertSettleTransfer,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";
import Stripe from "stripe";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/admin/refund/route";

let adminProfileId: string;
let organizerProfileId: string;
let organizerConnectId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  settleTransferIds: [] as string[],
  debtClaimIds: [] as string[],
};

function mockAdminAuth() {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: adminProfileId } },
        error: null,
      }),
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

function mockOrganizerAuth() {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: organizerProfileId } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "organizer" } }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

function makePostReq(body: object): Request {
  return new Request("http://localhost/api/admin/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  organizerConnectId = await createTestConnectAccount();

  const ts = Date.now();
  adminProfileId = await insertProfile({
    role: "admin",
    displayName: "テスト管理者（返金）",
    email: `admin-refund-${ts}@test.local`,
  });
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "テストオーガナイザー（返金）",
    email: `organizer-refund-${ts}@test.local`,
    stripeConnectId: organizerConnectId,
  });
  cleanup.profileIds.push(adminProfileId, organizerProfileId);

  mockAdminAuth();
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
  await deleteTestConnectAccount(organizerConnectId);
});

// ── TC-REFUND-01: 非admin → 403 ────────────────────────────────────────
describe("TC-REFUND-01: 非admin ユーザーは 403 Forbidden", () => {
  it("organizer ロールで POST → 403", async () => {
    mockOrganizerAuth();
    const res = await POST(
      makePostReq({ paymentIntentId: "pi_dummy_test", reason: "テスト" })
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/Forbidden/i);
    mockAdminAuth();
  });
});

// ── TC-REFUND-02: オーソリ中 → PI cancel ──────────────────────────────
describe("TC-REFUND-02: オーソリ中（requires_capture）→ キャンセル", () => {
  let piId: string;
  let txId: string;

  beforeAll(async () => {
    const gross = 6_000;
    const eventId = await insertEvent({
      organizerProfileId,
      title: "TC-REFUND-02 オーソリキャンセル",
    });
    const qrConfigId = await insertQrConfig({
      eventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: gross, organizerConnectId });
    piId = pi.id;

    const stripeFee = Math.floor(gross * 0.0396);
    const platformFee = Math.floor(gross * 0.10);
    txId = await insertTransaction({
      qrConfigId,
      grossAmount: gross,
      netAmount: gross - stripeFee - platformFee,
      stripeFee,
      platformFee,
      stripePaymentIntentId: piId,
    });
    cleanup.transactionIds.push(txId);
  }, 60_000);

  it("PI が canceled に、TX が cancelled に更新される", async () => {
    const res = await POST(
      makePostReq({ paymentIntentId: piId, reason: "オーソリキャンセルテスト" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.mode).toBe("cancel");

    // Stripe PI ステータス確認
    const piAfter = await stripe.paymentIntents.retrieve(piId);
    expect(piAfter.status).toBe("canceled");

    // DB TX ステータス確認
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("status")
      .eq("transaction_id", txId)
      .single();
    expect(tx?.status).toBe("cancelled");
  });
});

// ── TC-REFUND-03: キャプチャ後・settle前 + COMPASSIONATE ───────────────
describe("TC-REFUND-03: キャプチャ済み・settle前 + COMPASSIONATE → refund + debt_claims(stripe_fee)", () => {
  let piId: string;
  let txId: string;
  const GROSS = 8_000;
  const STRIPE_FEE = Math.floor(GROSS * 0.0396); // 316

  beforeAll(async () => {
    const eventId = await insertEvent({
      organizerProfileId,
      title: "TC-REFUND-03 settle前COMPASSIONATE",
    });
    const qrConfigId = await insertQrConfig({
      eventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: GROSS, organizerConnectId });
    piId = pi.id;
    // キャプチャして succeeded 状態にする
    await stripe.paymentIntents.capture(piId);

    const platformFee = Math.floor(GROSS * 0.10);
    txId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: GROSS - STRIPE_FEE - platformFee,
      stripeFee: STRIPE_FEE,
      platformFee,
      stripePaymentIntentId: piId,
      status: "completed",
    });
    cleanup.transactionIds.push(txId);
  }, 60_000);

  it("refund 実行 → totalReversed=0、debt_claims に stripe_fee が記録される", async () => {
    const res = await POST(
      makePostReq({
        paymentIntentId: piId,
        reason: "人情モード settle前テスト",
        refundType: "COMPASSIONATE",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.mode).toBe("presettle_compassionate");
    expect(data.refundId).toMatch(/^re_/);
    expect(data.totalReversed).toBe(0);
    expect(data.debtAmount).toBe(STRIPE_FEE);

    // TX が refunded に更新
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("status")
      .eq("transaction_id", txId)
      .single();
    expect(tx?.status).toBe("refunded");

    // debt_claims が stripe_fee で作成される
    const { data: claim } = await testAdmin
      .from("debt_claims")
      .select("claim_id, claim_amount, status")
      .eq("original_transaction_id", txId)
      .maybeSingle();
    expect(claim).not.toBeNull();
    expect(claim!.claim_amount).toBe(STRIPE_FEE);
    expect(claim!.status).toBe("active");
    if (claim) cleanup.debtClaimIds.push(claim.claim_id);
  });
});

// ── TC-REFUND-04: キャプチャ後・settle後 + FULL_PENALTY ────────────────
describe("TC-REFUND-04: キャプチャ済み・settle後 + FULL_PENALTY → 全transfer逆転 + debt_claims(platform_fee)", () => {
  let piId: string;
  let txId: string;
  let transferId: string;
  const GROSS = 10_000;
  const STRIPE_FEE = Math.floor(GROSS * 0.0396);   // 396
  const PLATFORM_FEE = Math.floor(GROSS * 0.10);   // 1000
  const NET = GROSS - STRIPE_FEE - PLATFORM_FEE;   // 8604
  // 単一organizer settle_transfer = NET（100%）
  const SETTLE_AMOUNT = NET;

  beforeAll(async () => {
    const eventId = await insertEvent({
      organizerProfileId,
      title: "TC-REFUND-04 settle後FULL_PENALTY",
    });
    const qrConfigId = await insertQrConfig({
      eventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    await insertQrConfigTargets(qrConfigId, [
      { profileId: organizerProfileId, ratio: 1.0 },
    ]);
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: GROSS, organizerConnectId });
    piId = pi.id;
    await stripe.paymentIntents.capture(piId);
    const piExpanded = await stripe.paymentIntents.retrieve(piId, {
      expand: ["latest_charge"],
    });
    const chargeId = (piExpanded.latest_charge as Stripe.Charge)?.id ?? "";

    // Stripe Transfer（source_transaction）を作成してから DB に記録
    const transfer = await stripe.transfers.create({
      amount: SETTLE_AMOUNT,
      currency: "jpy",
      destination: organizerConnectId,
      source_transaction: chargeId,
      metadata: { event_id: eventId },
    });
    transferId = transfer.id;

    txId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: NET,
      stripeFee: STRIPE_FEE,
      platformFee: PLATFORM_FEE,
      stripePaymentIntentId: piId,
      status: "completed",
    });
    cleanup.transactionIds.push(txId);

    await insertSettleTransfer({
      eventId,
      profileId: organizerProfileId,
      stripeTransferId: transferId,
      amount: SETTLE_AMOUNT,
    });
    cleanup.settleTransferIds.push(transferId);
  }, 120_000);

  it("全settle_transfer 逆転 + debt_claims(platform_fee) が作成される", async () => {
    const res = await POST(
      makePostReq({
        paymentIntentId: piId,
        reason: "規約違反による全額強制返金",
        refundType: "FULL_PENALTY",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.mode).toBe("FULL_PENALTY");
    expect(data.refundId).toMatch(/^re_/);
    // fraction = min(10000/8604, 1) = 1 → 全額逆転
    expect(data.totalReversed).toBe(SETTLE_AMOUNT);
    expect(data.reversalErrors).toBe(0);
    expect(data.debtAmount).toBe(PLATFORM_FEE); // 1000

    // TX が refunded に更新
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("status")
      .eq("transaction_id", txId)
      .single();
    expect(tx?.status).toBe("refunded");

    // debt_claims が platform_fee で作成される
    const { data: claim } = await testAdmin
      .from("debt_claims")
      .select("claim_id, claim_amount, status")
      .eq("original_transaction_id", txId)
      .maybeSingle();
    expect(claim).not.toBeNull();
    expect(claim!.claim_amount).toBe(PLATFORM_FEE);
    expect(claim!.status).toBe("active");
    if (claim) cleanup.debtClaimIds.push(claim.claim_id);

    // Stripe Transfer が逆転済みであることを確認
    const transferAfter = await stripe.transfers.retrieve(transferId, {
      expand: ["reversals"],
    });
    const totalReversed = (transferAfter.reversals as any).data.reduce(
      (s: number, r: any) => s + r.amount,
      0
    );
    expect(totalReversed).toBe(SETTLE_AMOUNT);
  });
});

// ── TC-REFUND-05: キャプチャ後・settle後 + COMPASSIONATE ───────────────
describe("TC-REFUND-05: キャプチャ済み・settle後 + COMPASSIONATE → 全transfer逆転 + debt_claims(stripe_fee)", () => {
  let piId: string;
  let txId: string;
  let transferId: string;
  const GROSS = 12_000;
  const STRIPE_FEE = Math.floor(GROSS * 0.0396);  // 475
  const PLATFORM_FEE = Math.floor(GROSS * 0.10);  // 1200
  const NET = GROSS - STRIPE_FEE - PLATFORM_FEE;  // 10325
  const SETTLE_AMOUNT = NET;

  beforeAll(async () => {
    const eventId = await insertEvent({
      organizerProfileId,
      title: "TC-REFUND-05 settle後COMPASSIONATE",
    });
    const qrConfigId = await insertQrConfig({
      eventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    await insertQrConfigTargets(qrConfigId, [
      { profileId: organizerProfileId, ratio: 1.0 },
    ]);
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: GROSS, organizerConnectId });
    piId = pi.id;
    await stripe.paymentIntents.capture(piId);
    const piExpanded = await stripe.paymentIntents.retrieve(piId, {
      expand: ["latest_charge"],
    });
    const chargeId = (piExpanded.latest_charge as Stripe.Charge)?.id ?? "";

    const transfer = await stripe.transfers.create({
      amount: SETTLE_AMOUNT,
      currency: "jpy",
      destination: organizerConnectId,
      source_transaction: chargeId,
      metadata: { event_id: eventId },
    });
    transferId = transfer.id;

    txId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: NET,
      stripeFee: STRIPE_FEE,
      platformFee: PLATFORM_FEE,
      stripePaymentIntentId: piId,
      status: "completed",
    });
    cleanup.transactionIds.push(txId);

    await insertSettleTransfer({
      eventId,
      profileId: organizerProfileId,
      stripeTransferId: transferId,
      amount: SETTLE_AMOUNT,
    });
    cleanup.settleTransferIds.push(transferId);
  }, 120_000);

  it("全settle_transfer 逆転 + debt_claims(stripe_fee) が作成される", async () => {
    const res = await POST(
      makePostReq({
        paymentIntentId: piId,
        reason: "人情モード settle後テスト",
        refundType: "COMPASSIONATE",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.mode).toBe("COMPASSIONATE");
    expect(data.refundId).toMatch(/^re_/);
    // COMPASSIONATE も全額逆転（debt の差異はデット金額のみ）
    expect(data.totalReversed).toBe(SETTLE_AMOUNT);
    expect(data.reversalErrors).toBe(0);
    expect(data.debtAmount).toBe(STRIPE_FEE); // 475

    // TX が refunded に更新
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("status")
      .eq("transaction_id", txId)
      .single();
    expect(tx?.status).toBe("refunded");

    // debt_claims が stripe_fee で作成される
    const { data: claim } = await testAdmin
      .from("debt_claims")
      .select("claim_id, claim_amount, status")
      .eq("original_transaction_id", txId)
      .maybeSingle();
    expect(claim).not.toBeNull();
    expect(claim!.claim_amount).toBe(STRIPE_FEE);
    expect(claim!.status).toBe("active");
    if (claim) cleanup.debtClaimIds.push(claim.claim_id);

    // Stripe Transfer が逆転済みであることを確認
    const transferAfter = await stripe.transfers.retrieve(transferId, {
      expand: ["reversals"],
    });
    const totalReversed = (transferAfter.reversals as any).data.reduce(
      (s: number, r: any) => s + r.amount,
      0
    );
    expect(totalReversed).toBe(SETTLE_AMOUNT);
  });
});
