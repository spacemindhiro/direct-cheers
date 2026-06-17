/**
 * TC-REFUND-MATRIX: 返金バリデーション・ロール・PI状態・デット金額の全掛け算テスト
 *
 * Stripe APIは全てモックし、DBはローカルSupabaseに対して実際に書き込む。
 * test.each で以下を網羅:
 *   A. 入力バリデーションマトリクス = 10ケース
 *   B. 非adminロール拒否（403）= 4ケース
 *   C. refundType バリデーション（succeeded PI）= 8ケース
 *   D. PI状態マトリクス = 5ケース
 *   E. settle前 × refundType × 金額 の debt_claims 金額検証 = 8ケース
 *   F. settle後 × refundType × 転送逆転検証 = 6ケース
 *   G. reason バリエーション = 5ケース
 * 計: 約46ケース
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertQrConfigTargets,
  insertTransaction,
  insertSettleTransfer,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

// Stripe をモック: paymentIntents.retrieve・refunds.create・transfers.createReversal を制御
const mockPiState: { status: string; amount: number } = { status: "succeeded", amount: 10_000 };

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);

      (this.paymentIntents as any).retrieve = async (id: string) => ({
        id,
        status: mockPiState.status,
        amount: mockPiState.amount,
        currency: "jpy",
        on_behalf_of: null,
      });

      (this.paymentIntents as any).cancel = async (id: string) => ({
        id,
        status: "canceled",
        currency: "jpy",
        object: "payment_intent",
      });

      (this.refunds as any).create = async (params: any) => ({
        id: `re_mock_${Date.now()}`,
        amount: params.amount ?? mockPiState.amount,
        currency: "jpy",
        status: "succeeded",
        payment_intent: params.payment_intent,
        object: "refund",
      });

      (this.transfers as any).createReversal = async (transferId: string, params: any) => ({
        id: `trr_mock_${Date.now()}`,
        amount: params.amount,
        transfer: transferId,
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
import { POST } from "@/app/api/admin/refund/route";

let adminProfileId: string;
let organizerProfileId: string;
let artistProfileId: string;
let agentProfileId: string;

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

function mockRoleAuth(profileId: string, role: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: profileId } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role } }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

function mockNoAuth() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    from: vi.fn((table: string) => testAdmin.from(table)),
  });
}

function makeRefundReq(body: object): Request {
  return new Request("http://localhost/api/admin/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  adminProfileId = await insertProfile({ role: "admin", displayName: "REFUND-MATRIX admin", email: `admin-refundmatrix-${ts}@test.local` });
  organizerProfileId = await insertProfile({ role: "organizer", displayName: "REFUND-MATRIX org", email: `org-refundmatrix-${ts}@test.local` });
  artistProfileId = await insertProfile({ role: "artist", displayName: "REFUND-MATRIX artist", email: `artist-refundmatrix-${ts}@test.local` });
  agentProfileId = await insertProfile({ role: "agent", displayName: "REFUND-MATRIX agent", email: `agent-refundmatrix-${ts}@test.local` });
  cleanup.profileIds.push(adminProfileId, organizerProfileId, artistProfileId, agentProfileId);

  mockAdminAuth();
}, 30_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-REFUND-A: 入力バリデーション（10ケース） ───────────────────────────

const VALIDATION_CASES: Array<[string, object, number]> = [
  ["paymentIntentId 欠損", { reason: "テスト理由" }, 400],
  ["reason 欠損", { paymentIntentId: "pi_dummy_test" }, 400],
  ["両フィールド欠損", {}, 400],
  ["reason が空文字", { paymentIntentId: "pi_dummy", reason: "" }, 400],
  ["reason が空白のみ", { paymentIntentId: "pi_dummy", reason: "   " }, 400],
  ["reason が null", { paymentIntentId: "pi_dummy", reason: null }, 400],
  ["paymentIntentId が null", { paymentIntentId: null, reason: "テスト" }, 400],
  ["paymentIntentId が空文字", { paymentIntentId: "", reason: "テスト" }, 400],
  ["paymentIntentId が空白", { paymentIntentId: "  ", reason: "テスト" }, 400],
  ["paymentIntentId と reason 両方 null", { paymentIntentId: null, reason: null }, 400],
];

describe("TC-REFUND-A: 入力バリデーションマトリクス（10ケース）", () => {
  it.each(VALIDATION_CASES)(
    "%s → HTTP %i",
    async (_label, body, expectedStatus) => {
      mockAdminAuth();
      const res = await POST(makeRefundReq(body));
      expect(res.status).toBe(expectedStatus);
    },
  );
});

// ── TC-REFUND-B: 非adminロール拒否（4ケース） ─────────────────────────────

describe("TC-REFUND-B: 非adminロール → 403 Forbidden（4ケース）", () => {
  it.each([
    ["organizer", organizerProfileId],
    ["artist", artistProfileId],
    ["agent", agentProfileId],
  ] as Array<[string, string]>)(
    "[%s ロール] → 403",
    async (role, profileId) => {
      // profileId は beforeAll 後に設定される → closureで参照
      const pid =
        role === "organizer" ? organizerProfileId
        : role === "artist" ? artistProfileId
        : agentProfileId;
      mockRoleAuth(pid, role);

      const res = await POST(makeRefundReq({ paymentIntentId: "pi_role_test", reason: "ロールテスト" }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Forbidden/i);
    },
  );

  it("[未認証（null user）] → 401", async () => {
    mockNoAuth();
    const res = await POST(makeRefundReq({ paymentIntentId: "pi_anon_test", reason: "匿名テスト" }));
    expect(res.status).toBe(401);
    mockAdminAuth(); // 後続テストのために戻す
  });
});

// ── TC-REFUND-C: refundType バリデーション（succeeded PI）= 8ケース ───────
// PI status = "succeeded" かつ settle_transfers なし → refundType が必須

describe("TC-REFUND-C: refundType バリデーション（succeeded PI × 8ケース）", () => {
  let capturedEventId: string;
  let capturedQrConfigId: string;
  let capturedTxId: string;
  const FAKE_PI_ID = `pi_refundtype_test_${Date.now()}`;

  beforeAll(async () => {
    mockPiState.status = "succeeded";
    mockPiState.amount = 5_000;

    capturedEventId = await insertEvent({ organizerProfileId, title: "REFUND-C イベント" });
    capturedQrConfigId = await insertQrConfig({ eventId: capturedEventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.eventIds.push(capturedEventId);
    cleanup.qrConfigIds.push(capturedQrConfigId);

    capturedTxId = await insertTransaction({
      qrConfigId: capturedQrConfigId,
      grossAmount: 5_000,
      netAmount: 5_000 - Math.floor(5_000 * 0.0396) - Math.floor(5_000 * 0.10),
      stripeFee: Math.floor(5_000 * 0.0396),
      platformFee: Math.floor(5_000 * 0.10),
      stripePaymentIntentId: FAKE_PI_ID,
      status: "completed",
    });
    cleanup.transactionIds.push(capturedTxId);
    mockAdminAuth();
  });

  const REFUND_TYPE_CASES: Array<[string, string | null | undefined, number]> = [
    ["FULL_PENALTY（正常）", "FULL_PENALTY", 200],
    ["COMPASSIONATE（正常）", "COMPASSIONATE", 200],
    ["refundType 欠損（succeeded PI）", undefined, 400],
    ["refundType が null", null, 400],
    ["refundType が空文字", "", 400],
    ["refundType が PARTIAL（無効）", "PARTIAL", 400],
    ["refundType が full_penalty（小文字・無効）", "full_penalty", 400],
    ["refundType が compassionate（小文字・無効）", "compassionate", 400],
  ];

  it.each(REFUND_TYPE_CASES)(
    "[%s] → HTTP %i",
    async (_label, refundType, expectedStatus) => {
      mockAdminAuth();
      const res = await POST(makeRefundReq({
        paymentIntentId: FAKE_PI_ID,
        reason: "refundType テスト",
        ...(refundType !== undefined ? { refundType } : {}),
      }));
      expect(res.status).toBe(expectedStatus);
    },
  );
});

// ── TC-REFUND-D: PI状態マトリクス（5ケース） ─────────────────────────────

describe("TC-REFUND-D: PI状態マトリクス（5ケース）", () => {
  const PI_STATUS_CASES: Array<[string, string, number, string | null]> = [
    ["requires_capture", "requires_capture", 200, "cancel"],
    ["succeeded", "succeeded", 200, null],    // refundType が FULL_PENALTY で通る
    ["canceled（不可）", "canceled", 400, null],
    ["refunded（不可）", "refunded", 400, null],
    ["requires_payment_method（不可）", "requires_payment_method", 400, null],
  ];

  let statusTestEventId: string;
  let statusTestQrConfigId: string;

  beforeAll(async () => {
    statusTestEventId = await insertEvent({ organizerProfileId, title: "REFUND-D PI状態テスト" });
    statusTestQrConfigId = await insertQrConfig({ eventId: statusTestEventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.eventIds.push(statusTestEventId);
    cleanup.qrConfigIds.push(statusTestQrConfigId);
  });

  it.each(PI_STATUS_CASES)(
    "PI status [%s] → HTTP %i",
    async (_label, piStatus, expectedStatus, expectedMode) => {
      mockPiState.status = piStatus;
      mockPiState.amount = 8_000;

      const fakePiId = `pi_status_${piStatus}_${Date.now()}`;
      const txId = await insertTransaction({
        qrConfigId: statusTestQrConfigId,
        grossAmount: 8_000,
        netAmount: 8_000 - Math.floor(8_000 * 0.0396) - Math.floor(8_000 * 0.10),
        stripeFee: Math.floor(8_000 * 0.0396),
        platformFee: Math.floor(8_000 * 0.10),
        stripePaymentIntentId: fakePiId,
        status: "completed",
      });
      cleanup.transactionIds.push(txId);

      mockAdminAuth();
      const res = await POST(makeRefundReq({
        paymentIntentId: fakePiId,
        reason: "PI状態テスト",
        refundType: "FULL_PENALTY",
      }));

      expect(res.status).toBe(expectedStatus);
      if (expectedStatus === 200 && expectedMode) {
        const data = await res.json();
        expect(data.mode).toBe(expectedMode);
      }
    },
  );
});

// ── TC-REFUND-E: settle前 × refundType × 金額 の debt_claims 金額検証（8ケース） ─

const DEBT_GROSS_AMOUNTS = [3_000, 8_000, 12_000, 30_000];

describe("TC-REFUND-E: settle前 × refundType × 金額 → debt_claims 金額が正確（8ケース）", () => {
  const debtCases = DEBT_GROSS_AMOUNTS.flatMap((gross) => [
    [gross, "FULL_PENALTY", Math.floor(gross * 0.10)] as [number, string, number],
    [gross, "COMPASSIONATE", Math.ceil(gross * 0.0396)] as [number, string, number],
  ]);

  it.each(debtCases)(
    "¥%i × %s → debtAmount = ¥%i",
    async (gross, refundType, expectedDebt) => {
      mockPiState.status = "succeeded";
      mockPiState.amount = gross;

      const eventId = await insertEvent({ organizerProfileId, title: `REFUND-E ¥${gross} ${refundType}` });
      const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
      cleanup.eventIds.push(eventId);
      cleanup.qrConfigIds.push(qrConfigId);

      const fakePiId = `pi_debt_${gross}_${refundType}_${Date.now()}`;
      const txId = await insertTransaction({
        qrConfigId,
        grossAmount: gross,
        netAmount: gross - Math.ceil(gross * 0.0396) - Math.floor(gross * 0.10),
        stripeFee: Math.ceil(gross * 0.0396),
        platformFee: Math.floor(gross * 0.10),
        stripePaymentIntentId: fakePiId,
        status: "completed",
      });
      cleanup.transactionIds.push(txId);

      mockAdminAuth();
      const res = await POST(makeRefundReq({
        paymentIntentId: fakePiId,
        reason: `settle前デットテスト ¥${gross}`,
        refundType,
      }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.debtAmount).toBe(expectedDebt);
      expect(data.totalReversed).toBe(0); // settle前 → transfer逆転なし

      // DB で debt_claims が正しい金額で作成されている
      const { data: claim } = await testAdmin
        .from("debt_claims")
        .select("claim_id, claim_amount, status")
        .eq("original_transaction_id", txId)
        .maybeSingle();
      expect(claim).not.toBeNull();
      expect(claim!.claim_amount).toBe(expectedDebt);
      expect(claim!.status).toBe("active");
      if (claim) cleanup.debtClaimIds.push(claim.claim_id);
    },
  );
});

// ── TC-REFUND-F: settle後 × refundType → transfer逆転検証（6ケース） ──────

const SETTLE_AFTER_CASES = [
  [8_000, "FULL_PENALTY"] as [number, string],
  [8_000, "COMPASSIONATE"] as [number, string],
  [15_000, "FULL_PENALTY"] as [number, string],
  [15_000, "COMPASSIONATE"] as [number, string],
  [30_000, "FULL_PENALTY"] as [number, string],
  [30_000, "COMPASSIONATE"] as [number, string],
];

describe("TC-REFUND-F: settle後 × refundType → transfer逆転 + debt_claims（6ケース）", () => {
  it.each(SETTLE_AFTER_CASES)(
    "¥%i × %s → totalReversed > 0 かつ debt_claims 作成",
    async (gross, refundType) => {
      mockPiState.status = "succeeded";
      mockPiState.amount = gross;

      const net = gross - Math.ceil(gross * 0.0396) - Math.floor(gross * 0.10);
      const eventId = await insertEvent({ organizerProfileId, title: `REFUND-F settle後 ¥${gross} ${refundType}` });
      const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
      cleanup.eventIds.push(eventId);
      cleanup.qrConfigIds.push(qrConfigId);
      await insertQrConfigTargets(qrConfigId, [{ profileId: organizerProfileId, ratio: 1.0 }]);

      const fakePiId = `pi_settle_after_${gross}_${refundType}_${Date.now()}`;
      const txId = await insertTransaction({
        qrConfigId,
        grossAmount: gross,
        netAmount: net,
        stripeFee: Math.ceil(gross * 0.0396),
        platformFee: Math.floor(gross * 0.10),
        stripePaymentIntentId: fakePiId,
        status: "completed",
      });
      cleanup.transactionIds.push(txId);

      // settle_transfers を挿入（settle済みを模擬）
      const fakeTransferId = `tr_settle_after_${gross}_${Date.now()}`;
      await insertSettleTransfer({ eventId, profileId: organizerProfileId, stripeTransferId: fakeTransferId, amount: net });
      cleanup.settleTransferIds.push(fakeTransferId);

      mockAdminAuth();
      const res = await POST(makeRefundReq({
        paymentIntentId: fakePiId,
        reason: `settle後テスト ¥${gross}`,
        refundType,
      }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // settle後 → transfer逆転が実行される
      expect(data.totalReversed).toBeGreaterThan(0);
      expect(data.reversalErrors).toBe(0);

      // debt_claims が作成される
      const { data: claim } = await testAdmin
        .from("debt_claims")
        .select("claim_id, claim_amount, status")
        .eq("original_transaction_id", txId)
        .maybeSingle();
      expect(claim).not.toBeNull();
      expect(claim!.status).toBe("active");
      if (claim) cleanup.debtClaimIds.push(claim.claim_id);
    },
  );
});

// ── TC-REFUND-G: reason バリエーション（5ケース） ─────────────────────────

describe("TC-REFUND-G: reason 内容バリエーション（有効な reason は全て通過）", () => {
  const VALID_REASONS = [
    "返金理由",
    "長い理由：" + "あ".repeat(100),
    "英語: refund for testing",
    "記号含む: test/refund_2024",
    "数字のみ: 12345",
  ];

  let reasonTestEventId: string;
  let reasonTestQrConfigId: string;

  beforeAll(async () => {
    reasonTestEventId = await insertEvent({ organizerProfileId, title: "REFUND-G reason テスト" });
    reasonTestQrConfigId = await insertQrConfig({ eventId: reasonTestEventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.eventIds.push(reasonTestEventId);
    cleanup.qrConfigIds.push(reasonTestQrConfigId);
  });

  it.each(VALID_REASONS.map((r, i) => [r, i]))(
    "reason='%s' → 200（有効）",
    async (reason, idx) => {
      mockPiState.status = "succeeded";
      mockPiState.amount = 3_000;

      const fakePiId = `pi_reason_${idx}_${Date.now()}`;
      const txId = await insertTransaction({
        qrConfigId: reasonTestQrConfigId,
        grossAmount: 3_000,
        netAmount: 3_000 - Math.floor(3_000 * 0.0396) - Math.floor(3_000 * 0.10),
        stripeFee: Math.floor(3_000 * 0.0396),
        platformFee: Math.floor(3_000 * 0.10),
        stripePaymentIntentId: fakePiId,
        status: "completed",
      });
      cleanup.transactionIds.push(txId);

      mockAdminAuth();
      const res = await POST(makeRefundReq({
        paymentIntentId: fakePiId,
        reason,
        refundType: "COMPASSIONATE",
      }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const { data: claim } = await testAdmin
        .from("debt_claims")
        .select("claim_id")
        .eq("original_transaction_id", txId)
        .maybeSingle();
      if (claim) cleanup.debtClaimIds.push(claim.claim_id);
    },
  );
});
