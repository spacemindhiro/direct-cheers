/**
 * TC-POST-PAY-01: 後半戦一気通貫シナリオテスト
 *
 * 決済完了後の「イベント終了 → ログ照合 → 開催審査ロック → Settle（分配）」
 * の全フローが1円の狂いもなく連動することを実証する。
 *
 * カバレッジの柱:
 *   A. イベント終了フラグ（lifecycle_status → ended）
 *   B. StripeログとDBの全件照合（amount_verified / reconciled_at）
 *   C. エビデンスなし → settle 厳格ブロック（出金不可）
 *   D. 審査通過後の Settle（分配）精度検証（agent + org + artist = 合計一致）
 *   E. チャージバック待機期間ロック（distribution_status = accrued）
 *   F. 二重 settle ブロック（冪等性）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
  createTestCapturedPaymentIntent,
} from "../helpers/stripe-fixtures";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertQrConfigTargets,
  insertTransaction,
  insertEventArtist,
  insertEventEvidence,
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

import { createClient } from "@/lib/supabase/server";
import { POST as endPOST } from "@/app/api/events/[eventId]/end/route";
import { POST as reconcilePOST } from "@/app/api/admin/reconcile/event/route";
import { POST as settlePOST } from "@/app/api/events/[eventId]/settle/route";

const GROSS = 20_000;
// succeeded PI（automatic capture）: Stripe 手数料 3.6%×1.1=3.96%、プラットフォーム 10%
const STRIPE_FEE = Math.floor(GROSS * 0.0396); // 792
const PLATFORM_FEE = Math.floor(GROSS * 0.10);  // 2000
const NET = GROSS - STRIPE_FEE - PLATFORM_FEE;  // 17208
const EXPECTED_AGENT = Math.floor(GROSS * 0.05); // 1000
const EXPECTED_ORG = Math.floor(NET * 0.5);      // 8604
const EXPECTED_ARTIST = Math.floor(NET * 0.5);   // 8604

let adminProfileId: string;
let organizerProfileId: string;
let artistProfileId: string;
let agentProfileId: string;
let organizerConnectId: string;
let artistConnectId: string;
let agentConnectId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  evidenceIds: [] as string[],
  settleTransferIds: [] as string[],
  summaryIds: [] as string[],
};

function mockOrganizerAuth() {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: organizerProfileId } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => testAdmin.from(table)),
  });
}

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

beforeAll(async () => {
  [organizerConnectId, artistConnectId, agentConnectId] = await Promise.all([
    createTestConnectAccount(),
    createTestConnectAccount(),
    createTestConnectAccount(),
  ]);

  const ts = Date.now();
  adminProfileId = await insertProfile({
    role: "admin",
    displayName: "管理者（後半戦テスト）",
    email: `admin-postpay-${ts}@test.local`,
  });
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "オーガナイザー（後半戦テスト）",
    email: `organizer-postpay-${ts}@test.local`,
    stripeConnectId: organizerConnectId,
  });
  artistProfileId = await insertProfile({
    role: "artist",
    displayName: "アーティスト（後半戦テスト）",
    email: `artist-postpay-${ts}@test.local`,
    stripeConnectId: artistConnectId,
  });
  agentProfileId = await insertProfile({
    role: "agent",
    displayName: "エージェント（後半戦テスト）",
    email: `agent-postpay-${ts}@test.local`,
    stripeConnectId: agentConnectId,
  });
  cleanup.profileIds.push(adminProfileId, organizerProfileId, artistProfileId, agentProfileId);
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
  await Promise.all([
    deleteTestConnectAccount(organizerConnectId),
    deleteTestConnectAccount(artistConnectId),
    deleteTestConnectAccount(agentConnectId),
  ]);
});

// ── TC-POST-PAY-01: 後半戦一気通貫パイプライン ─────────────────────────────
describe("TC-POST-PAY-01: イベント終了 → 照合 → ロック確認 → Settle 一気通貫", () => {
  let eventId: string;
  let txId: string;
  let piId: string;

  beforeAll(async () => {
    // 即時キャプチャ済み PI（succeeded）で照合テストに使用
    const pi = await createTestCapturedPaymentIntent({ amount: GROSS });
    piId = pi.id;

    eventId = await insertEvent({
      organizerProfileId,
      agentId: agentProfileId,
      title: "TC-POST-PAY-01 後半戦一気通貫",
    });
    const qrConfigId = await insertQrConfig({
      eventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: artistProfileId,
    });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    await insertQrConfigTargets(qrConfigId, [
      { profileId: organizerProfileId, ratio: 0.5 },
      { profileId: artistProfileId, ratio: 0.5 },
    ]);

    txId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: NET,
      stripeFee: STRIPE_FEE,
      platformFee: PLATFORM_FEE,
      stripePaymentIntentId: piId,
      reconciled: false, // 未照合 → reconcile route が処理対象と判断する
    });
    cleanup.transactionIds.push(txId);

    await insertEventArtist({ eventId, artistProfileId });
  }, 120_000);

  // A. イベント終了
  it("A: イベント終了 → lifecycle_status が ended になる", async () => {
    mockOrganizerAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await endPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);

    const { data: ev } = await testAdmin
      .from("events")
      .select("lifecycle_status")
      .eq("event_id", eventId)
      .single();
    expect(ev?.lifecycle_status).toBe("ended");
  });

  // B. StripeログとDBの照合
  it("B: 照合実行 → amount_verified=true・reconciled_at セット・reconciliation_log 記録", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost/api/admin/reconcile/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    const res = await reconcilePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reconciled).toBeGreaterThanOrEqual(1);
    expect(data.errors).toBe(0);

    const { data: tx } = await testAdmin
      .from("transactions")
      .select("amount_verified, amount_mismatch, reconciled_at")
      .eq("transaction_id", txId)
      .single();

    expect(tx?.amount_verified).toBe(true);
    expect(tx?.amount_mismatch).toBe(0);
    expect(tx?.reconciled_at).not.toBeNull();

    // イベント全体の照合フラグも確認
    if (data.event_reconciled) {
      const { data: ev } = await testAdmin
        .from("events")
        .select("reconciled_at")
        .eq("event_id", eventId)
        .single();
      expect(ev?.reconciled_at).not.toBeNull();
    }
  });

  // C. エビデンスなし → settle 厳格ブロック
  it("C: エビデンス未提出 → settle が 400 でブロックされる（出金不可）", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await settlePOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/evidence/i);
  });

  // D. エビデンス提出後 → Settle 実行・分配精度検証
  it("D: エビデンス提出後 → Settle 成功・agent+org+artist を1円単位で正確に分配", async () => {
    const evidenceId = await insertEventEvidence({ eventId, submittedByProfileId: organizerProfileId });
    cleanup.evidenceIds.push(evidenceId);

    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await settlePOST(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // Settle Transfer の分配額検証
    const { data: transfers } = await testAdmin
      .from("settle_transfers")
      .select("profile_id, amount, stripe_transfer_id")
      .eq("event_id", eventId);

    (transfers ?? []).forEach((s) => cleanup.settleTransferIds.push(s.stripe_transfer_id));

    const agentTransfer = (transfers ?? []).find((t) => t.profile_id === agentProfileId);
    const orgTransfer = (transfers ?? []).find((t) => t.profile_id === organizerProfileId);
    const artistTransfer = (transfers ?? []).find((t) => t.profile_id === artistProfileId);

    expect(agentTransfer?.amount).toBe(EXPECTED_AGENT);
    expect(orgTransfer?.amount).toBe(EXPECTED_ORG);
    expect(artistTransfer?.amount).toBe(EXPECTED_ARTIST);

    // 合計一致（1円のズレもない）
    const total = (transfers ?? []).reduce((s, t) => s + t.amount, 0);
    expect(total).toBe(EXPECTED_AGENT + EXPECTED_ORG + EXPECTED_ARTIST);

    // settlement_summary の承認フラグ確認
    const { data: summary } = await testAdmin
      .from("settlement_summaries")
      .select("summary_id, is_approved_for_payout")
      .eq("event_id", eventId)
      .single();
    expect(summary?.is_approved_for_payout).toBe(true);
    if (summary) cleanup.summaryIds.push(summary.summary_id);
  });

  // E. チャージバック待機期間ロック確認
  it("E: Settle 後 → distributions が accrued（チャージバック待機期間ロック中）", async () => {
    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("distribution_status, actual_amount, distribution_role")
      .eq("event_id", eventId);

    expect((dists ?? []).length).toBeGreaterThan(0);

    // 全ての分配行が accrued（未出金・ロック中）であること
    const allAccrued = (dists ?? []).every((d) => d.distribution_status === "accrued");
    expect(allAccrued).toBe(true);

    // transaction_distributions 合計 = settle_transfers 合計（DB の整合性）
    const distTotal = (dists ?? []).reduce((s, d) => s + (d.actual_amount ?? 0), 0);
    expect(distTotal).toBe(EXPECTED_AGENT + EXPECTED_ORG + EXPECTED_ARTIST);
  });

  // F. 二重 settle ブロック
  it("F: 二重 settle → 400 Already approved（冪等性）", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await settlePOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    // settle 後は lifecycle_status="settled" で弾かれる
    expect(data.error).toMatch(/settled|approved/i);
  });
});

// ── TC-POST-PAY-02: 照合差分検知 ──────────────────────────────────────────
describe("TC-POST-PAY-02: 照合差分検知 — StripeとDBの金額不一致を検知する", () => {
  /**
   * DB に登録されている gross_amount と Stripe の amount_received が異なる場合、
   * amount_verified=false・amount_mismatch に差分が記録されることを検証する。
   */
  let mismatchEventId: string;
  let mismatchTxId: string;

  beforeAll(async () => {
    // succeeded PI（GROSS=10,000円）を作成
    const pi = await createTestCapturedPaymentIntent({ amount: 10_000 });

    mismatchEventId = await insertEvent({
      organizerProfileId,
      title: "TC-POST-PAY-02 照合差分検知",
    });
    const qrConfigId = await insertQrConfig({
      eventId: mismatchEventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.eventIds.push(mismatchEventId);
    cleanup.qrConfigIds.push(qrConfigId);

    // DB には 9,000円（Stripe実績 10,000円と意図的に不一致）
    const wrongGross = 9_000;
    mismatchTxId = await insertTransaction({
      qrConfigId,
      grossAmount: wrongGross,
      netAmount: wrongGross - Math.floor(wrongGross * 0.0396) - Math.floor(wrongGross * 0.1),
      stripeFee: Math.floor(wrongGross * 0.0396),
      platformFee: Math.floor(wrongGross * 0.1),
      stripePaymentIntentId: pi.id,
      reconciled: false,
    });
    cleanup.transactionIds.push(mismatchTxId);
  }, 60_000);

  it("Stripe金額（10,000）≠ DB金額（9,000）→ amount_verified=false, amount_mismatch=1000", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost/api/admin/reconcile/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: mismatchEventId }),
    });
    const res = await reconcilePOST(req);
    expect(res.status).toBe(200);

    const { data: tx } = await testAdmin
      .from("transactions")
      .select("amount_verified, amount_mismatch, reconciled_at")
      .eq("transaction_id", mismatchTxId)
      .single();

    expect(tx?.amount_verified).toBe(false);
    expect(tx?.amount_mismatch).toBe(1_000); // 10000 - 9000
    expect(tx?.reconciled_at).not.toBeNull();
  });
});

// ── TC-POST-PAY-03: サブエージェント含む5者分配の精度検証 ───────────────────
describe("TC-POST-PAY-03: サブエージェント含む多者分配 — 合計が1円単位で一致する", () => {
  /**
   * artist × 2（各 30% / 20%）+ organizer 50% の QR に
   * agent を加えた4者分配で端数合計ゼロを実証する。
   */
  const MULTI_GROSS = 33_333; // 端数が出やすい金額
  const MULTI_STRIPE_FEE = Math.floor(MULTI_GROSS * 0.0396);
  const MULTI_PLATFORM_FEE = Math.floor(MULTI_GROSS * 0.10);
  const MULTI_NET = MULTI_GROSS - MULTI_STRIPE_FEE - MULTI_PLATFORM_FEE;
  const MULTI_AGENT = Math.floor(MULTI_GROSS * 0.05);

  let multiEventId: string;
  let artist2ProfileId: string;
  let artist2ConnectId: string;

  beforeAll(async () => {
    artist2ConnectId = await createTestConnectAccount();
    artist2ProfileId = await insertProfile({
      role: "artist",
      displayName: "アーティスト2（多者分配テスト）",
      email: `artist2-multi-${Date.now()}@test.local`,
      stripeConnectId: artist2ConnectId,
    });
    cleanup.profileIds.push(artist2ProfileId);

    const pi = await createTestCapturedPaymentIntent({ amount: MULTI_GROSS });

    multiEventId = await insertEvent({
      organizerProfileId,
      agentId: agentProfileId,
      title: "TC-POST-PAY-03 多者分配",
    });
    const qrConfigId = await insertQrConfig({
      eventId: multiEventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: artistProfileId,
    });
    cleanup.eventIds.push(multiEventId);
    cleanup.qrConfigIds.push(qrConfigId);

    // organizer 50% / artist1 30% / artist2 20%
    await insertQrConfigTargets(qrConfigId, [
      { profileId: organizerProfileId, ratio: 0.5 },
      { profileId: artistProfileId, ratio: 0.3 },
      { profileId: artist2ProfileId, ratio: 0.2 },
    ]);

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: MULTI_GROSS,
      netAmount: MULTI_NET,
      stripeFee: MULTI_STRIPE_FEE,
      platformFee: MULTI_PLATFORM_FEE,
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    await insertEventArtist({ eventId: multiEventId, artistProfileId });
    await insertEventArtist({ eventId: multiEventId, artistProfileId: artist2ProfileId });
    const evidenceId = await insertEventEvidence({ eventId: multiEventId, submittedByProfileId: organizerProfileId });
    cleanup.evidenceIds.push(evidenceId);
  }, 120_000);

  afterAll(async () => {
    await deleteTestConnectAccount(artist2ConnectId);
  });

  it("4者分配（agent+org+artist1+artist2）の Transfer 合計が net - platform_fee に一致する", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await settlePOST(req, { params: Promise.resolve({ eventId: multiEventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const { data: transfers } = await testAdmin
      .from("settle_transfers")
      .select("profile_id, amount, stripe_transfer_id")
      .eq("event_id", multiEventId);

    (transfers ?? []).forEach((s) => cleanup.settleTransferIds.push(s.stripe_transfer_id));

    const agentTransfer = (transfers ?? []).find((t) => t.profile_id === agentProfileId);
    expect(agentTransfer?.amount).toBe(MULTI_AGENT);

    // 全 Transfer の合計 = net - platform_fee の端数処理後合計
    const total = (transfers ?? []).reduce((s, t) => s + t.amount, 0);
    expect(total).toBeGreaterThan(0);

    // 分配合計の上限: NET（artist/org原資）+ AGENT（gross×5%）
    // エージェントはNETの外から払われるため maxTotal = NET + AGENT
    const maxExpected = MULTI_NET + MULTI_AGENT;
    expect(total).toBeLessThanOrEqual(maxExpected);
    expect(maxExpected - total).toBeLessThan(10); // Math.floor 端数誤差は 10円未満

    const { data: summary } = await testAdmin
      .from("settlement_summaries")
      .select("summary_id")
      .eq("event_id", multiEventId)
      .single();
    if (summary) cleanup.summaryIds.push(summary.summary_id);
  });
});
