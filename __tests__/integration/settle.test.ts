/**
 * TC-SETTLE: /api/events/[eventId]/settle の統合テスト
 *
 * - Stripe テストモードで PaymentIntent をキャプチャし destination_transfer_id を検証
 * - ロール別 Transfer ロジックを確認
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
  insertEvent,
  insertQrConfig,
  insertQrConfigTargets,
  insertTransaction,
  insertEventArtist,
  insertEventEvidence,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

const TEST_ADMIN_ID = "11111111-1111-1111-1111-111111111111";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

// import 後にモック設定
import { createClient } from "@/lib/supabase/server";

function mockAdminAuth() {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: TEST_ADMIN_ID } },
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

import { POST } from "@/app/api/events/[eventId]/settle/route";

// ── テスト用データ ────────────────────────────────────────────────────
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

beforeAll(async () => {
  // Stripe テスト Connect アカウント作成
  [organizerConnectId, artistConnectId, agentConnectId] = await Promise.all([
    createTestConnectAccount(),
    createTestConnectAccount(),
    createTestConnectAccount(),
  ]);

  // プロファイル作成
  adminProfileId = await insertProfile({
    profileId: TEST_ADMIN_ID,
    role: "admin",
    displayName: "テスト管理者",
    email: "admin-settle@test.local",
  });
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "テストオーガナイザー（精算）",
    email: "organizer-settle@test.local",
    stripeConnectId: organizerConnectId,
  });
  artistProfileId = await insertProfile({
    role: "artist",
    displayName: "テストアーティスト",
    email: "artist-settle@test.local",
    stripeConnectId: artistConnectId,
  });
  agentProfileId = await insertProfile({
    role: "agent",
    displayName: "テストエージェント",
    email: "agent-settle@test.local",
    stripeConnectId: agentConnectId,
  });
  cleanup.profileIds.push(adminProfileId, organizerProfileId, artistProfileId, agentProfileId);

  mockAdminAuth();
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await Promise.all([
    deleteTestConnectAccount(organizerConnectId),
    deleteTestConnectAccount(artistConnectId),
    deleteTestConnectAccount(agentConnectId),
  ]);
});

// ── TC-SETTLE-01: 新フロー（destination charge）─────────────────────
describe("TC-SETTLE-01: destination charge フロー", () => {
  let eventId: string;
  let qrConfigId: string;

  beforeAll(async () => {
    // セットアップ: イベント、QR config、Transaction（requires_capture な PI）
    eventId = await insertEvent({
      organizerProfileId,
      title: "TC-SETTLE-01 イベント",
    });
    qrConfigId = await insertQrConfig({ eventId, recipientProfileId: artistProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    // organizer 50% / artist 50%
    await insertQrConfigTargets(qrConfigId, [
      { profileId: organizerProfileId, ratio: 0.5 },
      { profileId: artistProfileId, ratio: 0.5 },
    ]);

    // Stripe: requires_capture な PI（destination charge）
    const gross = 10_000;
    const appFee = Math.floor(gross * 0.10) + Math.floor(gross * 0.0396); // 1396
    const pi = await createTestPaymentIntent({
      amount: gross,
      organizerConnectId,
      applicationFeeAmount: appFee,
    });

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: gross,
      netAmount: gross - Math.floor(gross * 0.0396) - Math.floor(gross * 0.10),
      stripeFee: Math.floor(gross * 0.0396),
      platformFee: Math.floor(gross * 0.10),
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    await insertEventArtist({ eventId, artistProfileId });

    const evidenceId = await insertEventEvidence({ eventId, submittedByProfileId: organizerProfileId });
    cleanup.evidenceIds.push(evidenceId);
  }, 60_000);

  it("settle 後: destination_transfer_id が記録され artist への sub-transfer が作成される", async () => {
    const req = new Request("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.destination_charge_flow).toBe(true);

    // destination_transfer_id が transactions テーブルに記録されているか
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("destination_transfer_id")
      .in("transaction_id", cleanup.transactionIds)
      .single();
    expect(tx?.destination_transfer_id).toBeTruthy();
    expect(tx!.destination_transfer_id).toMatch(/^tr_/);

    // settle_transfers: artist 分の sub-transfer が作成されているか
    const { data: strs } = await testAdmin
      .from("settle_transfers")
      .select("profile_id, amount, stripe_transfer_id")
      .eq("event_id", eventId);
    const artistTransfer = (strs ?? []).find((s) => s.profile_id === artistProfileId);
    expect(artistTransfer).toBeDefined();
    expect(artistTransfer!.amount).toBeGreaterThan(0);

    // organizer の settle_transfer は作成されない（destination charge で自動送金済み）
    const orgTransfer = (strs ?? []).find((s) => s.profile_id === organizerProfileId);
    expect(orgTransfer).toBeUndefined();

    // クリーンアップ用に記録
    (strs ?? []).forEach((s) => cleanup.settleTransferIds.push(s.stripe_transfer_id));

    // settlement_summary が作成されているか
    const { data: summary } = await testAdmin
      .from("settlement_summaries")
      .select("summary_id, is_approved_for_payout")
      .eq("event_id", eventId)
      .single();
    expect(summary?.is_approved_for_payout).toBe(true);
    if (summary) cleanup.summaryIds.push(summary.summary_id);
  });

  it("TC-SETTLE-05: 二重 settle → 400 Already settled", async () => {
    const req = new Request("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/settled/i);
  });
});

// ── TC-SETTLE-02: エージェント手数料 ────────────────────────────────────
describe("TC-SETTLE-03: エージェント手数料の分配", () => {
  let eventId: string;
  let qrConfigId: string;

  beforeAll(async () => {
    eventId = await insertEvent({
      organizerProfileId,
      agentId: agentProfileId,
      title: "TC-SETTLE-03 エージェントあり",
    });
    qrConfigId = await insertQrConfig({ eventId, recipientProfileId: artistProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    await insertQrConfigTargets(qrConfigId, [
      { profileId: organizerProfileId, ratio: 0.5 },
      { profileId: artistProfileId, ratio: 0.5 },
    ]);

    const gross = 20_000;
    const appFee = Math.floor(gross * 0.10) + Math.floor(gross * 0.0396);
    const pi = await createTestPaymentIntent({
      amount: gross,
      organizerConnectId,
      applicationFeeAmount: appFee,
    });
    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: gross,
      netAmount: gross - Math.floor(gross * 0.0396) - Math.floor(gross * 0.10),
      stripeFee: Math.floor(gross * 0.0396),
      platformFee: Math.floor(gross * 0.10),
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    await insertEventArtist({ eventId, artistProfileId });
    const evidenceId = await insertEventEvidence({ eventId, submittedByProfileId: organizerProfileId });
    cleanup.evidenceIds.push(evidenceId);
  }, 60_000);

  it("エージェント手数料が gross × agent_fee_rate で計上される", async () => {
    const req = new Request("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);

    // transaction_distributions にエージェント行が存在するか
    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("distribution_role, actual_amount, profile_id")
      .eq("event_id", eventId);

    const agentDist = (dists ?? []).find((d) => d.distribution_role === "agent");
    expect(agentDist).toBeDefined();
    // agent_fee_rate = platform_rate / 2 = 5% → gross 20000 × 0.05 = 1000
    expect(agentDist!.actual_amount).toBe(1000);
    expect(agentDist!.profile_id).toBe(agentProfileId);

    // settle_transfers にエージェント分が存在するか
    const { data: strs } = await testAdmin
      .from("settle_transfers")
      .select("profile_id, amount, stripe_transfer_id")
      .eq("event_id", eventId);
    const agentTransfer = (strs ?? []).find((s) => s.profile_id === agentProfileId);
    expect(agentTransfer).toBeDefined();
    expect(agentTransfer!.amount).toBe(1000);
    (strs ?? []).forEach((s) => cleanup.settleTransferIds.push(s.stripe_transfer_id));

    const { data: summary } = await testAdmin
      .from("settlement_summaries")
      .select("summary_id")
      .eq("event_id", eventId)
      .single();
    if (summary) cleanup.summaryIds.push(summary.summary_id);
  });
});

// ── TC-SETTLE-04: 未確定アーティスト → オーガナイザーへ振替 ─────────────
describe("TC-SETTLE-04: 未確定アーティストの分配がオーガナイザーに帰属", () => {
  let eventId: string;
  let qrConfigId: string;
  let unconfirmedArtistId: string;

  beforeAll(async () => {
    unconfirmedArtistId = await insertProfile({
      role: "artist",
      displayName: "未確定アーティスト",
      email: "unconfirmed-artist@test.local",
      stripeConnectId: null,
    });
    cleanup.profileIds.push(unconfirmedArtistId);

    eventId = await insertEvent({ organizerProfileId, title: "TC-SETTLE-04" });
    qrConfigId = await insertQrConfig({ eventId, recipientProfileId: unconfirmedArtistId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    // 100% を未確定アーティストへ分配設定
    await insertQrConfigTargets(qrConfigId, [
      { profileId: unconfirmedArtistId, ratio: 1.0 },
    ]);

    const gross = 5_000;
    const appFee = Math.floor(gross * 0.10) + Math.floor(gross * 0.0396);
    const pi = await createTestPaymentIntent({
      amount: gross,
      organizerConnectId,
      applicationFeeAmount: appFee,
    });
    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: gross,
      netAmount: gross - Math.floor(gross * 0.0396) - Math.floor(gross * 0.10),
      stripeFee: Math.floor(gross * 0.0396),
      platformFee: Math.floor(gross * 0.10),
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    // pending で挿入（未確定）
    await insertEventArtist({ eventId, artistProfileId: unconfirmedArtistId, status: "pending" });
    const evidenceId = await insertEventEvidence({ eventId, submittedByProfileId: organizerProfileId });
    cleanup.evidenceIds.push(evidenceId);
  }, 60_000);

  it("未確定アーティストの分配額がオーガナイザーに帰属する", async () => {
    const req = new Request("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ eventId }) });

    expect(res.status).toBe(200);

    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("profile_id, distribution_role, actual_amount")
      .eq("event_id", eventId);

    // 未確定アーティストの分配行がない
    const unconfirmedDist = (dists ?? []).find((d) => d.profile_id === unconfirmedArtistId);
    expect(unconfirmedDist).toBeUndefined();

    // オーガナイザーに帰属している
    const orgDist = (dists ?? []).find(
      (d) => d.profile_id === organizerProfileId && d.distribution_role === "organizer",
    );
    expect(orgDist).toBeDefined();
    expect(orgDist!.actual_amount).toBeGreaterThan(0);

    const { data: summary } = await testAdmin
      .from("settlement_summaries")
      .select("summary_id")
      .eq("event_id", eventId)
      .single();
    if (summary) cleanup.summaryIds.push(summary.summary_id);
  });
});
