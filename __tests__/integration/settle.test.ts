/**
 * TC-SETTLE: /api/events/[eventId]/settle の統合テスト
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
import { POST } from "@/app/api/events/[eventId]/settle/route";

// admin の profile_id は auth user 作成後に決まる（動的）
let adminProfileId: string;

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
  [organizerConnectId, artistConnectId, agentConnectId] = await Promise.all([
    createTestConnectAccount(),
    createTestConnectAccount(),
    createTestConnectAccount(),
  ]);

  const ts = Date.now();
  adminProfileId = await insertProfile({
    role: "admin",
    displayName: "テスト管理者",
    email: `admin-settle-${ts}@test.local`,
  });
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "テストオーガナイザー（精算）",
    email: `organizer-settle-${ts}@test.local`,
    stripeConnectId: organizerConnectId,
  });
  artistProfileId = await insertProfile({
    role: "artist",
    displayName: "テストアーティスト",
    email: `artist-settle-${ts}@test.local`,
    stripeConnectId: artistConnectId,
  });
  agentProfileId = await insertProfile({
    role: "agent",
    displayName: "テストエージェント",
    email: `agent-settle-${ts}@test.local`,
    stripeConnectId: agentConnectId,
  });
  cleanup.profileIds.push(adminProfileId, organizerProfileId, artistProfileId, agentProfileId);

  mockAdminAuth();
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

// ── TC-SETTLE-01: 新フロー（destination charge）─────────────────────
describe("TC-SETTLE-01: destination charge フロー", () => {
  let eventId: string;
  let txId: string;

  beforeAll(async () => {
    eventId = await insertEvent({ organizerProfileId, title: "TC-SETTLE-01 イベント" });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    await insertQrConfigTargets(qrConfigId, [
      { profileId: organizerProfileId, ratio: 0.5 },
      { profileId: artistProfileId, ratio: 0.5 },
    ]);

    const gross = 10_000;
    const pi = await createTestPaymentIntent({ amount: gross, organizerConnectId });

    txId = await insertTransaction({
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

  it("settle 後: organizer・artist それぞれに source_transaction Transfer が作成される", async () => {
    const req = new Request("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.destination_charge_flow).toBe(true);

    // source_transaction フローでは destination_transfer_id は null（destination charge を使わない）
    const { data: tx } = await testAdmin
      .from("transactions")
      .select("destination_transfer_id")
      .eq("transaction_id", txId)
      .single();
    expect(tx?.destination_transfer_id).toBeNull();

    const { data: strs } = await testAdmin
      .from("settle_transfers")
      .select("profile_id, amount, stripe_transfer_id")
      .eq("event_id", eventId);

    // artist に settle_transfer が作成される
    const artistTransfer = (strs ?? []).find((s) => s.profile_id === artistProfileId);
    expect(artistTransfer).toBeDefined();
    expect(artistTransfer!.amount).toBeGreaterThan(0);

    // organizer にも settle_transfer が作成される（source_transaction Transfer）
    const orgTransfer = (strs ?? []).find((s) => s.profile_id === organizerProfileId);
    expect(orgTransfer).toBeDefined();
    expect(orgTransfer!.amount).toBeGreaterThan(0);

    (strs ?? []).forEach((s) => cleanup.settleTransferIds.push(s.stripe_transfer_id));

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
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/settled/i);
  });
});

// ── TC-SETTLE-03: エージェント手数料 ────────────────────────────────────
describe("TC-SETTLE-03: エージェント手数料の分配", () => {
  let eventId: string;

  beforeAll(async () => {
    eventId = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "TC-SETTLE-03 エージェントあり" });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    await insertQrConfigTargets(qrConfigId, [
      { profileId: organizerProfileId, ratio: 0.5 },
      { profileId: artistProfileId, ratio: 0.5 },
    ]);

    const gross = 20_000;
    const pi = await createTestPaymentIntent({ amount: gross, organizerConnectId });
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

  it("エージェント手数料が gross × 0.05 で計上され settle_transfer が作成される", async () => {
    const req = new Request("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);

    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("distribution_role, actual_amount, profile_id")
      .eq("event_id", eventId);

    const agentDist = (dists ?? []).find((d) => d.distribution_role === "agent");
    expect(agentDist).toBeDefined();
    expect(agentDist!.actual_amount).toBe(1_000); // 20000 × 0.05
    expect(agentDist!.profile_id).toBe(agentProfileId);

    const { data: strs } = await testAdmin
      .from("settle_transfers")
      .select("profile_id, amount, stripe_transfer_id")
      .eq("event_id", eventId);
    const agentTransfer = (strs ?? []).find((s) => s.profile_id === agentProfileId);
    expect(agentTransfer).toBeDefined();
    expect(agentTransfer!.amount).toBe(1_000);
    (strs ?? []).forEach((s) => cleanup.settleTransferIds.push(s.stripe_transfer_id));

    const { data: summary } = await testAdmin
      .from("settlement_summaries")
      .select("summary_id")
      .eq("event_id", eventId)
      .single();
    if (summary) cleanup.summaryIds.push(summary.summary_id);
  });
});

// ── TC-SETTLE-04: 未確定アーティスト → オーガナイザー帰属 ─────────────
describe("TC-SETTLE-04: 未確定アーティストの分配がオーガナイザーに帰属", () => {
  let eventId: string;
  let unconfirmedArtistId: string;

  beforeAll(async () => {
    unconfirmedArtistId = await insertProfile({
      role: "artist",
      displayName: "未確定アーティスト",
      email: `unconfirmed-artist-${Date.now()}@test.local`,
      stripeConnectId: null,
    });
    cleanup.profileIds.push(unconfirmedArtistId);

    eventId = await insertEvent({ organizerProfileId, title: "TC-SETTLE-04" });
    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: unconfirmedArtistId });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    await insertQrConfigTargets(qrConfigId, [{ profileId: unconfirmedArtistId, ratio: 1.0 }]);

    const gross = 5_000;
    const pi = await createTestPaymentIntent({ amount: gross, organizerConnectId });
    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: gross,
      netAmount: gross - Math.floor(gross * 0.0396) - Math.floor(gross * 0.10),
      stripeFee: Math.floor(gross * 0.0396),
      platformFee: Math.floor(gross * 0.10),
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    await insertEventArtist({ eventId, artistProfileId: unconfirmedArtistId, status: "pending" });
    const evidenceId = await insertEventEvidence({ eventId, submittedByProfileId: organizerProfileId });
    cleanup.evidenceIds.push(evidenceId);
  }, 60_000);

  it("未確定アーティストへの配分がオーガナイザーに振り替えられる", async () => {
    const req = new Request("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);

    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("profile_id, distribution_role, actual_amount")
      .eq("event_id", eventId);

    const unconfirmedDist = (dists ?? []).find((d) => d.profile_id === unconfirmedArtistId);
    expect(unconfirmedDist).toBeUndefined();

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

// ── TC-PAY-05: SavedCard off_session オーソリ → settle 完走 ─────────────
describe("TC-PAY-05: SavedCard off_session オーソリ → settle で1円単位3者分配", () => {
  /**
   * エントランスAプランの多段決済シナリオ:
   * 1. stripe.setupIntents.create で顧客の決済手段を登録（off_session で安全に保存）
   * 2. バックエンドから off_session: true, capture_method: "manual" で PI を建てる
   * 3. 既存の settle ロジックが PI をキャプチャし3者一斉分配することを確認
   */
  const GROSS = 10_000;
  const STRIPE_FEE = Math.floor(GROSS * 0.0396); // 396
  const PLATFORM_FEE = Math.floor(GROSS * 0.10); // 1000
  const NET = GROSS - STRIPE_FEE - PLATFORM_FEE; // 8604
  const EXPECTED_AGENT = Math.floor(GROSS * 0.05); // 500
  const EXPECTED_ORG = Math.floor(NET * 0.5);      // 4302
  const EXPECTED_ARTIST = Math.floor(NET * 0.5);   // 4302

  let customerId: string;
  let offSessionPiId: string;
  let pay05EventId: string;

  beforeAll(async () => {
    // 1. Stripe Customer 作成 + SetupIntent でカード情報を安全に登録
    const customer = await stripe.customers.create({
      email: `tc-pay05-${Date.now()}@test.local`,
      description: "TC-PAY-05 off_session テスト顧客",
    });
    customerId = customer.id;

    const si = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ["card"],
      payment_method: "pm_card_visa",
      confirm: true,
      usage: "off_session",
    });
    const savedPmId = (si.payment_method as string) ?? "pm_card_visa";

    // 2. バックエンドから off_session PI（顧客不在）を建てる（オーソリ状態で保留）
    const pi = await stripe.paymentIntents.create({
      amount: GROSS,
      currency: "jpy",
      customer: customer.id,
      payment_method: savedPmId,
      capture_method: "manual",
      confirm: true,
      off_session: true,
      on_behalf_of: organizerConnectId,
    });
    offSessionPiId = pi.id;

    // 3. DB にイベント・QR・トランザクションを登録
    pay05EventId = await insertEvent({
      organizerProfileId,
      agentId: agentProfileId,
      title: "TC-PAY-05 off_session エントランスA",
    });
    const qrConfigId = await insertQrConfig({
      eventId: pay05EventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: artistProfileId,
    });
    cleanup.eventIds.push(pay05EventId);
    cleanup.qrConfigIds.push(qrConfigId);

    await insertQrConfigTargets(qrConfigId, [
      { profileId: organizerProfileId, ratio: 0.5 },
      { profileId: artistProfileId, ratio: 0.5 },
    ]);

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: GROSS,
      netAmount: NET,
      stripeFee: STRIPE_FEE,
      platformFee: PLATFORM_FEE,
      stripePaymentIntentId: offSessionPiId,
    });
    cleanup.transactionIds.push(txId);

    await insertEventArtist({ eventId: pay05EventId, artistProfileId });
    const evidenceId = await insertEventEvidence({
      eventId: pay05EventId,
      submittedByProfileId: organizerProfileId,
    });
    cleanup.evidenceIds.push(evidenceId);
  }, 120_000);

  afterAll(async () => {
    // Stripe Customer を削除（テストモードの残留回避）
    if (customerId) await stripe.customers.del(customerId).catch(() => {});
  });

  it("off_session PI が requires_capture 状態で建てられる", async () => {
    const pi = await stripe.paymentIntents.retrieve(offSessionPiId);
    expect(pi.status).toBe("requires_capture");
    expect(pi.capture_method).toBe("manual");
  });

  it("settle ロジックが off_session PI をキャプチャし1円単位で3者分配する", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ eventId: pay05EventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.destination_charge_flow).toBe(true);

    // transaction_distributions の確認
    const { data: dists } = await testAdmin
      .from("transaction_distributions")
      .select("profile_id, distribution_role, actual_amount")
      .eq("event_id", pay05EventId);

    const agentDist = (dists ?? []).find((d) => d.distribution_role === "agent");
    const orgDist = (dists ?? []).find((d) => d.distribution_role === "organizer");
    const artistDist = (dists ?? []).find((d) => d.distribution_role === "artist");

    expect(agentDist?.actual_amount).toBe(EXPECTED_AGENT);
    expect(orgDist?.actual_amount).toBe(EXPECTED_ORG);
    expect(artistDist?.actual_amount).toBe(EXPECTED_ARTIST);

    // settle_transfers の確認
    const { data: transfers } = await testAdmin
      .from("settle_transfers")
      .select("profile_id, amount, stripe_transfer_id")
      .eq("event_id", pay05EventId);

    (transfers ?? []).forEach((s) => cleanup.settleTransferIds.push(s.stripe_transfer_id));

    const agentTransfer = (transfers ?? []).find((t) => t.profile_id === agentProfileId);
    const orgTransfer = (transfers ?? []).find((t) => t.profile_id === organizerProfileId);
    const artistTransfer = (transfers ?? []).find((t) => t.profile_id === artistProfileId);

    expect(agentTransfer?.amount).toBe(EXPECTED_AGENT);
    expect(orgTransfer?.amount).toBe(EXPECTED_ORG);
    expect(artistTransfer?.amount).toBe(EXPECTED_ARTIST);

    // 分配合計 = gross - platform_fee - stripe_fee（1円のズレなし）
    const totalDistributed = (transfers ?? []).reduce((s, t) => s + t.amount, 0);
    expect(totalDistributed).toBe(EXPECTED_AGENT + EXPECTED_ORG + EXPECTED_ARTIST);

    const { data: summary } = await testAdmin
      .from("settlement_summaries")
      .select("summary_id, is_approved_for_payout")
      .eq("event_id", pay05EventId)
      .single();
    expect(summary?.is_approved_for_payout).toBe(true);
    if (summary) cleanup.summaryIds.push(summary.summary_id);
  });
});

// ── TC-SETTLE-06: 照合差異・再精算ケース ────────────────────────────────
describe("TC-SETTLE-06: 照合差異・再精算（分割精算の総額一致検証）", () => {
  /**
   * シナリオ:
   * - 決済 20,000円 に対し、不具合で 15,000円 分のみが精算された状態をシミュレート
   * - 照合により 5,000円 の未精算差分を検知
   * - 差分のみを原資として再精算を実行
   * - 1回目(15,000) + 2回目(5,000) の合計が一括精算(20,000) と1円単位で完全一致することを検証
   */
  const FULL_GROSS = 20_000;
  const ROUND1_GROSS = 15_000;
  const ROUND2_GROSS = 5_000;

  const controlAmounts = new Map<string, number>();
  let round1Amounts = new Map<string, number>();
  let round2Amounts = new Map<string, number>();

  async function createAndSettle(gross: number, label: string): Promise<Map<string, number>> {
    const eventId = await insertEvent({
      organizerProfileId,
      agentId: agentProfileId,
      title: `TC-SETTLE-06 ${label} ¥${gross}`,
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

    const pi = await createTestPaymentIntent({ amount: gross, organizerConnectId });
    const stripeFee = Math.floor(gross * 0.0396);
    const platformFee = Math.floor(gross * 0.1);
    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: gross,
      netAmount: gross - stripeFee - platformFee,
      stripeFee,
      platformFee,
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    await insertEventArtist({ eventId, artistProfileId });
    const evidenceId = await insertEventEvidence({ eventId, submittedByProfileId: organizerProfileId });
    cleanup.evidenceIds.push(evidenceId);

    const req = new Request("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ eventId }) });
    if (res.status !== 200) {
      const body = await res.json();
      throw new Error(`settle 失敗 [${label}]: ${JSON.stringify(body)}`);
    }

    const { data: transfers } = await testAdmin
      .from("settle_transfers")
      .select("stripe_transfer_id, profile_id, amount")
      .eq("event_id", eventId);

    (transfers ?? []).forEach((s) => cleanup.settleTransferIds.push(s.stripe_transfer_id));

    const { data: summary } = await testAdmin
      .from("settlement_summaries")
      .select("summary_id")
      .eq("event_id", eventId)
      .single();
    if (summary) cleanup.summaryIds.push(summary.summary_id);

    const amountMap = new Map<string, number>();
    for (const t of transfers ?? []) {
      amountMap.set(t.profile_id, (amountMap.get(t.profile_id) ?? 0) + t.amount);
    }
    return amountMap;
  }

  beforeAll(async () => {
    // 3イベントを順次精算（Stripe キャプチャを含むため直列実行）
    const ctrl = await createAndSettle(FULL_GROSS, "control");
    ctrl.forEach((v, k) => controlAmounts.set(k, v));

    round1Amounts = await createAndSettle(ROUND1_GROSS, "round1");
    round2Amounts = await createAndSettle(ROUND2_GROSS, "round2-delta");
  }, 300_000);

  it("差分精算（5,000円）はプラットフォーム10%・エージェント5%・残50%ずつで正確に分配される", () => {
    // 5,000円: stripeFee=198, platformFee=500, net=4302, agent=250, org=2151, artist=2151
    const expectedNet = ROUND2_GROSS - Math.floor(ROUND2_GROSS * 0.0396) - Math.floor(ROUND2_GROSS * 0.1);
    const expectedAgent = Math.floor(ROUND2_GROSS * 0.05);
    const expectedOrg = Math.floor(expectedNet * 0.5);
    const expectedArtist = Math.floor(expectedNet * 0.5);

    expect(round2Amounts.get(agentProfileId)).toBe(expectedAgent);
    expect(round2Amounts.get(organizerProfileId)).toBe(expectedOrg);
    expect(round2Amounts.get(artistProfileId)).toBe(expectedArtist);
  });

  it("2段階精算(15,000 + 5,000)の合計が1段階精算(20,000)と1円の狂いもなく一致する", () => {
    for (const pid of [organizerProfileId, artistProfileId, agentProfileId]) {
      const split = (round1Amounts.get(pid) ?? 0) + (round2Amounts.get(pid) ?? 0);
      const full = controlAmounts.get(pid) ?? -1;
      expect(split, `profile ${pid}`).toBe(full);
    }
  });
});
