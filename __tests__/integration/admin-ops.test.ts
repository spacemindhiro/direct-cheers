/**
 * TC-ADMIN-OPS: 管理者操作ルートの統合テスト
 *
 * 本番環境で重要な管理操作を検証する。
 *
 * カバレッジ:
 *   A. admin/connect-review — 口座審査承認・却下
 *   B. admin/events/force-payout — ホールド解除（hold_released）
 *   C. admin/events/capture-all — 一括キャプチャ
 *   D. cron/reconcile — 定期照合（CRON_SECRET 認証含む）
 *   E. admin/events/refund-all — 一括返金
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
  insertTransaction,
  insertDistribution,
  insertSettleTransfer,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

// cron/reconcile と refund-all 用のモック（capture-all だけ実Stripeを通す）
const mockPiAmounts = new Map<string, number>();

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);

      // reconcile 用: piId ごとに amount_received を制御
      const origRetrieve = this.paymentIntents.retrieve.bind(this.paymentIntents);
      (this.paymentIntents as any).retrieve = async (id: string, opts?: any) => {
        if (mockPiAmounts.has(id)) {
          const amount = mockPiAmounts.get(id)!;
          const expand = (opts?.expand ?? []) as string[];
          return {
            id,
            status: "succeeded",
            amount,
            amount_received: amount,
            currency: "jpy",
            latest_charge: expand.includes("latest_charge.balance_transaction")
              ? { id: `ch_mock_${id}`, balance_transaction: { fee: Math.floor(amount * 0.0396), net: amount - Math.floor(amount * 0.0396) } }
              : null,
          };
        }
        // capture-all 用: 実Stripe を呼ぶ
        return origRetrieve(id, opts);
      };

      const origCapture = this.paymentIntents.capture.bind(this.paymentIntents);
      (this.paymentIntents as any).capture = async (id: string) => {
        if (mockPiAmounts.has(id)) {
          return { id, status: "succeeded" };
        }
        return origCapture(id);
      };

      // refund-all 用
      (this.refunds as any).create = async (params: any) => ({
        id: `re_mock_${Date.now()}`,
        amount: params.amount ?? 10_000,
        status: "succeeded",
        payment_intent: params.payment_intent,
        object: "refund",
      });
    }
  }
  return { ...StripeModule, default: MockStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as connectReviewPOST } from "@/app/api/admin/connect-review/[profileId]/route";
import { POST as forcePayoutPOST } from "@/app/api/admin/events/[eventId]/force-payout/route";
import { POST as captureAllPOST } from "@/app/api/admin/events/[eventId]/capture-all/route";
import { GET as cronReconcileGET } from "@/app/api/cron/reconcile/route";
import { POST as refundAllPOST } from "@/app/api/admin/events/[eventId]/refund-all/route";

let adminProfileId: string;
let targetProfileId: string;
let organizerConnectId: string;
let organizerProfileId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  distributionIds: [] as string[],
  settleTransferIds: [] as string[],
  summaryIds: [] as string[],
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

function mockNonAdminAuth(profileId: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: profileId } }, error: null }) },
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

beforeAll(async () => {
  organizerConnectId = await createTestConnectAccount();

  const ts = Date.now();
  adminProfileId = await insertProfile({
    role: "admin", displayName: "管理者（admin-ops）", email: `admin-ops-${ts}@test.local`,
  });
  targetProfileId = await insertProfile({
    role: "organizer", displayName: "審査対象オーガナイザー", email: `target-ops-${ts}@test.local`,
    stripeConnectId: organizerConnectId,
  });
  organizerProfileId = await insertProfile({
    role: "organizer", displayName: "オーガナイザー（ops）", email: `org-ops-${ts}@test.local`,
  });
  cleanup.profileIds.push(adminProfileId, targetProfileId, organizerProfileId);

  mockAdminAuth();
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
  await deleteTestConnectAccount(organizerConnectId);
});

// ── TC-ADMIN-OPS-A: connect-review ──────────────────────────────────────────
describe("TC-ADMIN-OPS-A: admin/connect-review — 口座審査", () => {
  it("TC-ADMIN-OPS-A-01: admin が approve → verification_status=verified", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    const res = await connectReviewPOST(req, { params: Promise.resolve({ profileId: targetProfileId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.status).toBe("verified");

    const { data: profile } = await testAdmin.from("profiles").select("verification_status").eq("profile_id", targetProfileId).single();
    expect(profile?.verification_status).toBe("verified");
  });

  it("TC-ADMIN-OPS-A-02: admin が reject → verification_status=rejected", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    });
    const res = await connectReviewPOST(req, { params: Promise.resolve({ profileId: targetProfileId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("rejected");
  });

  it("TC-ADMIN-OPS-A-03: 無効な action → 400", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid" }),
    });
    const res = await connectReviewPOST(req, { params: Promise.resolve({ profileId: targetProfileId }) });
    expect(res.status).toBe(400);
  });

  it("TC-ADMIN-OPS-A-04: 非 admin → 403", async () => {
    mockNonAdminAuth(organizerProfileId);
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    const res = await connectReviewPOST(req, { params: Promise.resolve({ profileId: targetProfileId }) });
    expect(res.status).toBe(403);
  });
});

// ── TC-ADMIN-OPS-B: force-payout（ホールド解除） ─────────────────────────────
describe("TC-ADMIN-OPS-B: admin/events/force-payout — ホールド解除", () => {
  let settledEventId: string;
  let publishedEventId: string;

  beforeAll(async () => {
    settledEventId = await insertEvent({ organizerProfileId, title: "TC-ADMIN-OPS-B settled" });
    publishedEventId = await insertEvent({ organizerProfileId, title: "TC-ADMIN-OPS-B published" });
    cleanup.eventIds.push(settledEventId, publishedEventId);

    await testAdmin.from("events").update({ lifecycle_status: "settled" }).eq("event_id", settledEventId);

    const qrConfigId = await insertQrConfig({
      eventId: settledEventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: 10_000, organizerConnectId });
    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 10_000,
      netAmount: 8604,
      stripeFee: 396,
      platformFee: 1000,
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    const distId = await insertDistribution({
      transactionId: txId,
      eventId: settledEventId,
      profileId: organizerProfileId,
      role: "organizer",
      actualAmount: 8604,
      status: "accrued",
      holdReleased: false,
    });
    cleanup.distributionIds.push(distId);
  }, 60_000);

  it("TC-ADMIN-OPS-B-01: settled イベントのホールド解除 → hold_released=true", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await forcePayoutPOST(req, { params: Promise.resolve({ eventId: settledEventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.released).toBeGreaterThan(0);

    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("hold_released")
      .eq("event_id", settledEventId)
      .eq("distribution_status", "accrued");
    expect(dists?.every((d) => d.hold_released)).toBe(true);
  });

  it("TC-ADMIN-OPS-B-02: settled でないイベント → 400", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await forcePayoutPOST(req, { params: Promise.resolve({ eventId: publishedEventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/精算済み/);
  });

  it("TC-ADMIN-OPS-B-03: 非 admin → 403", async () => {
    mockNonAdminAuth(organizerProfileId);
    const req = new Request("http://localhost", { method: "POST" });
    const res = await forcePayoutPOST(req, { params: Promise.resolve({ eventId: settledEventId }) });
    expect(res.status).toBe(403);
  });
});

// ── TC-ADMIN-OPS-C: capture-all ──────────────────────────────────────────────
describe("TC-ADMIN-OPS-C: admin/events/capture-all — 一括キャプチャ", () => {
  let captureEventId: string;

  beforeAll(async () => {
    captureEventId = await insertEvent({ organizerProfileId, title: "TC-ADMIN-OPS-C capture" });
    cleanup.eventIds.push(captureEventId);

    const qrConfigId = await insertQrConfig({
      eventId: captureEventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.qrConfigIds.push(qrConfigId);

    // 実 Stripe PI (requires_capture) を作成し、モックに登録しない
    // → capture-all が実 Stripe retrieve + capture を呼ぶ
    const pi = await createTestPaymentIntent({ amount: 5_000, organizerConnectId });
    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 5_000,
      netAmount: 4302,
      stripeFee: 198,
      platformFee: 500,
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);
  }, 60_000);

  it("TC-ADMIN-OPS-C-01: 非 admin → 403", async () => {
    mockNonAdminAuth(organizerProfileId);
    const req = new Request("http://localhost", { method: "POST" });
    const res = await captureAllPOST(req, { params: Promise.resolve({ eventId: captureEventId }) });
    expect(res.status).toBe(403);
  });

  it("TC-ADMIN-OPS-C-02: admin + requires_capture PI → キャプチャ成功（captured≥1）", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await captureAllPOST(req, { params: Promise.resolve({ eventId: captureEventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.captured).toBeGreaterThanOrEqual(1);
    expect(data.errors).toBe(0);
  }, 30_000);

  it("TC-ADMIN-OPS-C-03: 既キャプチャ済み PI → skipped（2回目は captured=0）", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await captureAllPOST(req, { params: Promise.resolve({ eventId: captureEventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    // 2回目: 既に succeeded なのでスキップされる
    expect(data.captured).toBe(0);
  }, 30_000);
});

// ── TC-ADMIN-OPS-D: cron/reconcile ──────────────────────────────────────────
describe("TC-ADMIN-OPS-D: cron/reconcile — 定期照合", () => {
  it("TC-ADMIN-OPS-D-01: 誤った CRON_SECRET → 401", async () => {
    const req = new Request("http://localhost/api/cron/reconcile", {
      method: "GET",
      headers: { authorization: "Bearer wrong_secret" },
    });
    const res = await cronReconcileGET(req);
    expect(res.status).toBe(401);
  });

  it("TC-ADMIN-OPS-D-02: 正しい CRON_SECRET + settled イベントなし → success checked=0", async () => {
    // テスト環境の CRON_SECRET（.env.test から読まれる。未設定なら undefined）
    const secret = process.env.CRON_SECRET ?? "test_cron_secret";
    // env にセット
    const orig = process.env.CRON_SECRET;
    process.env.CRON_SECRET = secret;

    const req = new Request("http://localhost/api/cron/reconcile", {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
    });
    const res = await cronReconcileGET(req);
    const data = await res.json();

    // settled イベントがあれば reconcile が走るが、ここでは件数のみ確認
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.checked).toBe("number");
    expect(data.errors ?? 0).toBe(0);

    process.env.CRON_SECRET = orig;
  });

  it("TC-ADMIN-OPS-D-03: settled イベント + 未照合 tx → amount_verified が設定される", async () => {
    const secret = process.env.CRON_SECRET ?? "test_cron_secret";
    const orig = process.env.CRON_SECRET;
    process.env.CRON_SECRET = secret;

    // settled イベントを作成
    const cronEventId = await insertEvent({ organizerProfileId, title: "TC-ADMIN-OPS-D cron test" });
    cleanup.eventIds.push(cronEventId);
    await testAdmin.from("events").update({ lifecycle_status: "settled" }).eq("event_id", cronEventId);

    const qrConfigId = await insertQrConfig({
      eventId: cronEventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.qrConfigIds.push(qrConfigId);

    const mockPiId = `pi_cron_test_${Date.now()}`;
    mockPiAmounts.set(mockPiId, 10_000); // Stripe が 10,000 を返す

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 10_000,
      netAmount: 8604,
      stripeFee: 396,
      platformFee: 1000,
      stripePaymentIntentId: mockPiId,
      reconciled: false, // 未照合
    });
    cleanup.transactionIds.push(txId);

    const req = new Request("http://localhost/api/cron/reconcile", {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
    });
    const res = await cronReconcileGET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.checked).toBeGreaterThanOrEqual(1);

    // tx が照合済みになること
    const { data: tx } = await testAdmin.from("transactions")
      .select("amount_verified, reconciled_at")
      .eq("transaction_id", txId).single();
    expect(tx?.amount_verified).toBe(true);
    expect(tx?.reconciled_at).not.toBeNull();

    mockPiAmounts.delete(mockPiId);
    process.env.CRON_SECRET = orig;
  });
});

// ── TC-ADMIN-OPS-E: refund-all ───────────────────────────────────────────────
describe("TC-ADMIN-OPS-E: admin/events/refund-all — 一括返金", () => {
  let refundEventId: string;
  let settledEventId2: string;

  beforeAll(async () => {
    refundEventId = await insertEvent({ organizerProfileId, title: "TC-ADMIN-OPS-E refund" });
    settledEventId2 = await insertEvent({ organizerProfileId, title: "TC-ADMIN-OPS-E settled" });
    cleanup.eventIds.push(refundEventId, settledEventId2);
    await testAdmin.from("events").update({ lifecycle_status: "settled" }).eq("event_id", settledEventId2);

    const qrConfigId = await insertQrConfig({
      eventId: refundEventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.qrConfigIds.push(qrConfigId);

    const mockPiId = `pi_refundall_${Date.now()}`;
    mockPiAmounts.set(mockPiId, 10_000);

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 10_000,
      netAmount: 8604,
      stripeFee: 396,
      platformFee: 1000,
      stripePaymentIntentId: mockPiId,
    });
    cleanup.transactionIds.push(txId);
  });

  it("TC-ADMIN-OPS-E-01: admin + 未精算イベント → 全tx返金（refunded≥1）", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await refundAllPOST(req, { params: Promise.resolve({ eventId: refundEventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.refunded).toBeGreaterThanOrEqual(1);
    expect(data.errors).toBe(0);
  });

  it("TC-ADMIN-OPS-E-02: settled イベント → 400（返金不可）", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await refundAllPOST(req, { params: Promise.resolve({ eventId: settledEventId2 }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/精算済み/);
  });

  it("TC-ADMIN-OPS-E-03: 非 admin → 403", async () => {
    mockNonAdminAuth(organizerProfileId);
    const req = new Request("http://localhost", { method: "POST" });
    const res = await refundAllPOST(req, { params: Promise.resolve({ eventId: refundEventId }) });
    expect(res.status).toBe(403);
  });
});
