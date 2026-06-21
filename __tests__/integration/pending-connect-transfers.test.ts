/**
 * TC-PENDING: Stripeオンボーディング未完了による settle Transfer 失敗の
 * プール化（pending_connect_transfers）と自動リトライの統合テスト。
 *
 * 背景: settle時に配分先（organizer/artist/agent）のStripe Connectアカウントが
 * 未オンボーディング（connect_id無し、または capability不足）だと、これまでは
 * Transferがサイレントスキップ／console.errorのみで握り潰され、
 * transaction_distributions は 'accrued' のまま永久に滞留していた。
 * pending_connect_transfers にキューイングし、account.updated webhook /
 * セーフティネットcronで自動リトライする仕組みを検証する。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
  createTestCapturedPaymentIntent,
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

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

// webhook の署名検証のみバイパス（chargeback.test.ts と同パターン）。Transfer等は実APIを叩く。
vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    webhooks = {
      ...super.webhooks,
      constructEvent: (body: string, _sig: string, _secret: string) => JSON.parse(body),
    };
  }
  return { ...StripeModule, default: MockStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as settlePOST } from "@/app/api/events/[eventId]/settle/route";
import { POST as webhookPOST } from "@/app/api/stripe/webhook/route";
import { retryPendingTransfersForProfile } from "@/lib/pending-transfers";

let adminProfileId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  evidenceIds: [] as string[],
  settleTransferIds: [] as string[],
  summaryIds: [] as string[],
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

function buildWebhookRequest(event: object): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=mock_signature" },
    body: JSON.stringify(event),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  adminProfileId = await insertProfile({
    role: "admin",
    displayName: "管理者（pending-transferテスト）",
    email: `admin-pending-${ts}@test.local`,
  });
  cleanup.profileIds.push(adminProfileId);
}, 60_000);

afterAll(async () => {
  // settle route が内部生成する transaction_distributions / pending_connect_transfers /
  // settle_transfers / settlement_summaries は ID を把握できないため、event_id 単位で
  // 確実に削除する（cleanupTestData の ID 配列ベースの削除だけでは FK 制約で
  // 取りこぼす可能性があるため、event_id 起点で網羅的に削除してから ID ベース削除に渡す）
  if (cleanup.eventIds.length > 0) {
    await testAdmin.from("transaction_distributions").delete().in("event_id", cleanup.eventIds);
    await testAdmin.from("pending_connect_transfers").delete().in("event_id", cleanup.eventIds);
    await testAdmin.from("settle_transfers").delete().in("event_id", cleanup.eventIds);
    await testAdmin.from("settlement_summaries").delete().in("event_id", cleanup.eventIds);
    const { data: qrConfigs } = await testAdmin.from("qr_configs").select("qr_config_id").in("event_id", cleanup.eventIds);
    const qrConfigIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
    if (qrConfigIds.length > 0) {
      await testAdmin.from("transactions").delete().in("qr_config_id", qrConfigIds);
      await testAdmin.from("qr_config_targets").delete().in("qr_config_id", qrConfigIds);
      await testAdmin.from("qr_configs").delete().in("qr_config_id", qrConfigIds);
    }
    await testAdmin.from("event_artists").delete().in("event_id", cleanup.eventIds);
    const { error: eventsDeleteErr } = await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
    if (eventsDeleteErr) console.error("[pending-connect-transfers.test] events delete失敗:", eventsDeleteErr.message);
  }
  await cleanupTestData(cleanup);
  if (cleanup.profileIds.length > 0) {
    const { error: profilesDeleteErr } = await testAdmin.from("profiles").delete().in("profile_id", cleanup.profileIds);
    if (profilesDeleteErr) console.error("[pending-connect-transfers.test] profiles delete失敗:", profilesDeleteErr.message);
  }
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-PENDING-01: connectId なし → キューイング ──────────────────────────
describe("TC-PENDING-01: settle時にconnectIdなし → pending_connect_transfersにキューイング", () => {
  const GROSS = 20_000;
  const STRIPE_FEE = Math.ceil(GROSS * 0.0396);
  const PLATFORM_FEE = Math.floor(GROSS * 0.10);
  const NET = GROSS - STRIPE_FEE - PLATFORM_FEE;

  let organizerProfileId: string;
  let artistProfileId: string;
  let eventId: string;
  let organizerConnectId: string;

  beforeAll(async () => {
    organizerConnectId = await createTestConnectAccount();
    const ts = Date.now();
    organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "オーガナイザー（pending01）",
      email: `organizer-pending01-${ts}@test.local`,
      stripeConnectId: organizerConnectId,
    });
    // アーティストは stripe_connect_id 未設定（オンボーディング未開始）
    artistProfileId = await insertProfile({
      role: "artist",
      displayName: "アーティスト（オンボーディング未完了）",
      email: `artist-pending01-${ts}@test.local`,
    });
    cleanup.profileIds.push(organizerProfileId, artistProfileId);

    const pi = await createTestCapturedPaymentIntent({ amount: GROSS });

    eventId = await insertEvent({ organizerProfileId, title: "TC-PENDING-01" });
    const qrConfigId = await insertQrConfig({
      eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId,
    });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    await insertQrConfigTargets(qrConfigId, [
      { profileId: organizerProfileId, ratio: 0.5 },
      { profileId: artistProfileId, ratio: 0.5 },
    ]);

    const txId = await insertTransaction({
      qrConfigId, grossAmount: GROSS, netAmount: NET,
      stripeFee: STRIPE_FEE, platformFee: PLATFORM_FEE, stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    await insertEventArtist({ eventId, artistProfileId });
    const evidenceId = await insertEventEvidence({ eventId, submittedByProfileId: organizerProfileId });
    cleanup.evidenceIds.push(evidenceId);
  }, 120_000);

  it("settle成功・artistはpending_connect_transfersに記録され、transferResultsにpending_onboardingエラー", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await settlePOST(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const artistResult = (data.transfers as any[]).find((t) => t.amount === Math.floor(NET * 0.5) && t.error === "pending_onboarding");
    expect(artistResult).toBeDefined();

    const { data: pending } = await testAdmin
      .from("pending_connect_transfers")
      .select("profile_id, role, amount, status, charge_id")
      .eq("event_id", eventId)
      .eq("profile_id", artistProfileId);

    expect(pending).toHaveLength(1);
    expect(pending![0].role).toBe("artist");
    expect(pending![0].amount).toBe(Math.floor(NET * 0.5));
    expect(pending![0].status).toBe("pending");

    // organizer はconnectId有効なので通常通りTransfer成功（プールされない）
    const { data: orgPending } = await testAdmin
      .from("pending_connect_transfers")
      .select("pending_transfer_id")
      .eq("event_id", eventId)
      .eq("profile_id", organizerProfileId);
    expect(orgPending).toHaveLength(0);

    // organizer は agent_id 未指定時のデフォルト（insertEvent が organizer を自己代入）
    // のため、organizer-share と agent-share の2件のTransferが両方 organizerProfileId 宛になる
    const { data: orgTransfers } = await testAdmin
      .from("settle_transfers")
      .select("stripe_transfer_id, amount")
      .eq("event_id", eventId)
      .eq("profile_id", organizerProfileId);
    expect(orgTransfers).not.toBeNull();
    expect(orgTransfers!.length).toBeGreaterThanOrEqual(1);
    const orgShareTransfer = orgTransfers!.find((t) => t.amount === Math.floor(NET * 0.5));
    expect(orgShareTransfer).toBeDefined();
    orgTransfers!.forEach((t) => cleanup.settleTransferIds.push(t.stripe_transfer_id));

    const { data: summary } = await testAdmin
      .from("settlement_summaries")
      .select("summary_id")
      .eq("event_id", eventId)
      .single();
    if (summary) cleanup.summaryIds.push(summary.summary_id);
  });

  afterAll(async () => {
    await deleteTestConnectAccount(organizerConnectId);
  });
});

// ── TC-PENDING-02: Stripe API がTransferをreject → キューイング ──────────
describe("TC-PENDING-02: 無効なconnectIdでStripe Transferが失敗 → pending_connect_transfersにキューイング", () => {
  const GROSS = 20_000;
  const STRIPE_FEE = Math.ceil(GROSS * 0.0396);
  const PLATFORM_FEE = Math.floor(GROSS * 0.10);
  const NET = GROSS - STRIPE_FEE - PLATFORM_FEE;
  const FAKE_CONNECT_ID = "acct_1NoSuchAccountTest00";

  let organizerProfileId: string;
  let artistProfileId: string;
  let eventId: string;
  let organizerConnectId: string;

  beforeAll(async () => {
    organizerConnectId = await createTestConnectAccount();
    const ts = Date.now();
    organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "オーガナイザー（pending02）",
      email: `organizer-pending02-${ts}@test.local`,
      stripeConnectId: organizerConnectId,
    });
    // connectId は存在するが Stripe 上に実体がない（capability不足のシミュレーション）
    artistProfileId = await insertProfile({
      role: "artist",
      displayName: "アーティスト（無効なConnectID）",
      email: `artist-pending02-${ts}@test.local`,
      stripeConnectId: FAKE_CONNECT_ID,
    });
    cleanup.profileIds.push(organizerProfileId, artistProfileId);

    const pi = await createTestCapturedPaymentIntent({ amount: GROSS });

    eventId = await insertEvent({ organizerProfileId, title: "TC-PENDING-02" });
    const qrConfigId = await insertQrConfig({
      eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId,
    });
    cleanup.eventIds.push(eventId);
    cleanup.qrConfigIds.push(qrConfigId);

    await insertQrConfigTargets(qrConfigId, [
      { profileId: organizerProfileId, ratio: 0.5 },
      { profileId: artistProfileId, ratio: 0.5 },
    ]);

    const txId = await insertTransaction({
      qrConfigId, grossAmount: GROSS, netAmount: NET,
      stripeFee: STRIPE_FEE, platformFee: PLATFORM_FEE, stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    await insertEventArtist({ eventId, artistProfileId });
    const evidenceId = await insertEventEvidence({ eventId, submittedByProfileId: organizerProfileId });
    cleanup.evidenceIds.push(evidenceId);
  }, 120_000);

  it("Stripe Transfer APIエラー → pending_connect_transfersにlast_error付きで記録される", async () => {
    mockAdminAuth();
    const req = new Request("http://localhost", { method: "POST" });
    const res = await settlePOST(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const { data: pending } = await testAdmin
      .from("pending_connect_transfers")
      .select("amount, status, last_error, charge_id")
      .eq("event_id", eventId)
      .eq("profile_id", artistProfileId);

    expect(pending).toHaveLength(1);
    expect(pending![0].status).toBe("pending");
    expect(pending![0].amount).toBe(Math.floor(NET * 0.5));
    expect(pending![0].last_error).toBeTruthy();
    // source_transaction フローを通っているはずなので charge_id が記録されている
    expect(pending![0].charge_id).toBeTruthy();

    const { data: summary } = await testAdmin
      .from("settlement_summaries")
      .select("summary_id")
      .eq("event_id", eventId)
      .single();
    if (summary) cleanup.summaryIds.push(summary.summary_id);

    const { data: orgTransfer } = await testAdmin
      .from("settle_transfers")
      .select("stripe_transfer_id")
      .eq("event_id", eventId)
      .eq("profile_id", organizerProfileId)
      .maybeSingle();
    if (orgTransfer) cleanup.settleTransferIds.push(orgTransfer.stripe_transfer_id);
  });

  afterAll(async () => {
    await deleteTestConnectAccount(organizerConnectId);
  });
});

// ── TC-PENDING-03/04: retryPendingTransfersForProfile ────────────────────
describe("TC-PENDING-03: retryPendingTransfersForProfile — 成功時にtransferred・settle_transfers作成", () => {
  let profileId: string;
  let connectId: string;
  let eventId: string;
  let pendingTransferId: string;

  beforeAll(async () => {
    connectId = await createTestConnectAccount();
    const ts = Date.now();
    profileId = await insertProfile({
      role: "artist",
      displayName: "アーティスト（リトライ成功テスト）",
      email: `artist-pending03-${ts}@test.local`,
      stripeConnectId: connectId,
    });
    cleanup.profileIds.push(profileId);

    eventId = await insertEvent({ organizerProfileId: profileId, title: "TC-PENDING-03" });
    cleanup.eventIds.push(eventId);

    const { data, error } = await testAdmin
      .from("pending_connect_transfers")
      .insert({
        event_id: eventId, profile_id: profileId, role: "artist",
        amount: 100, charge_id: null, status: "pending",
      })
      .select("pending_transfer_id")
      .single();
    if (error) throw new Error(`pending_connect_transfers 挿入失敗: ${error.message}`);
    pendingTransferId = data.pending_transfer_id;
  }, 60_000);

  afterAll(async () => {
    await deleteTestConnectAccount(connectId);
  });

  it("リトライ成功 → status=transferred, settle_transfersに1行作成", async () => {
    const result = await retryPendingTransfersForProfile(testAdmin, stripe, profileId);
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);

    const { data: row } = await testAdmin
      .from("pending_connect_transfers")
      .select("status, stripe_transfer_id, resolved_at, attempt_count")
      .eq("pending_transfer_id", pendingTransferId)
      .single();
    expect(row?.status).toBe("transferred");
    expect(row?.stripe_transfer_id).toBeTruthy();
    expect(row?.resolved_at).not.toBeNull();
    expect(row?.attempt_count).toBe(1);

    const { data: settleTransfer } = await testAdmin
      .from("settle_transfers")
      .select("stripe_transfer_id, amount")
      .eq("event_id", eventId)
      .eq("profile_id", profileId)
      .single();
    expect(settleTransfer?.amount).toBe(100);
    if (settleTransfer) cleanup.settleTransferIds.push(settleTransfer.stripe_transfer_id);
  });
});

describe("TC-PENDING-04: retryPendingTransfersForProfile — 失敗時はpending維持・attempt_count増加", () => {
  const FAKE_CONNECT_ID = "acct_1NoSuchAccountTest01";
  let profileId: string;
  let eventId: string;
  let pendingTransferId: string;

  beforeAll(async () => {
    const ts = Date.now();
    profileId = await insertProfile({
      role: "artist",
      displayName: "アーティスト（リトライ失敗テスト）",
      email: `artist-pending04-${ts}@test.local`,
      stripeConnectId: FAKE_CONNECT_ID,
    });
    cleanup.profileIds.push(profileId);

    eventId = await insertEvent({ organizerProfileId: profileId, title: "TC-PENDING-04" });
    cleanup.eventIds.push(eventId);

    const { data, error } = await testAdmin
      .from("pending_connect_transfers")
      .insert({
        event_id: eventId, profile_id: profileId, role: "artist",
        amount: 200, charge_id: null, status: "pending",
      })
      .select("pending_transfer_id")
      .single();
    if (error) throw new Error(`pending_connect_transfers 挿入失敗: ${error.message}`);
    pendingTransferId = data.pending_transfer_id;
  }, 60_000);

  it("リトライ失敗 → statusはpending維持、last_error更新、attempt_count増加", async () => {
    const result = await retryPendingTransfersForProfile(testAdmin, stripe, profileId);
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(0);

    const { data: row } = await testAdmin
      .from("pending_connect_transfers")
      .select("status, last_error, attempt_count")
      .eq("pending_transfer_id", pendingTransferId)
      .single();
    expect(row?.status).toBe("pending");
    expect(row?.last_error).toBeTruthy();
    expect(row?.attempt_count).toBe(1);
  });
});

// ── TC-PENDING-05: account.updated webhook で自動リトライ ─────────────────
describe("TC-PENDING-05: account.updated webhook（オンボーディング完了）で自動リトライされる", () => {
  let profileId: string;
  let connectId: string;
  let eventId: string;
  let pendingTransferId: string;

  beforeAll(async () => {
    connectId = await createTestConnectAccount();
    const ts = Date.now();
    profileId = await insertProfile({
      role: "artist",
      displayName: "アーティスト（webhook自動リトライテスト）",
      email: `artist-pending05-${ts}@test.local`,
      stripeConnectId: connectId,
    });
    cleanup.profileIds.push(profileId);

    eventId = await insertEvent({ organizerProfileId: profileId, title: "TC-PENDING-05" });
    cleanup.eventIds.push(eventId);

    const { data, error } = await testAdmin
      .from("pending_connect_transfers")
      .insert({
        event_id: eventId, profile_id: profileId, role: "artist",
        amount: 300, charge_id: null, status: "pending",
      })
      .select("pending_transfer_id")
      .single();
    if (error) throw new Error(`pending_connect_transfers 挿入失敗: ${error.message}`);
    pendingTransferId = data.pending_transfer_id;
  }, 60_000);

  afterAll(async () => {
    await deleteTestConnectAccount(connectId);
  });

  it("charges_enabled & payouts_enabled = true の account.updated → 自動的にTransferされる", async () => {
    const stripeEventId = `evt_test_pending05_${Date.now()}`;
    await testAdmin.from("webhook_processed_events").delete().eq("stripe_event_id", stripeEventId);

    const event = {
      id: stripeEventId,
      type: "account.updated",
      data: {
        object: {
          id: connectId,
          object: "account",
          charges_enabled: true,
          payouts_enabled: true,
          requirements: { currently_due: [] },
        },
      },
    };

    const res = await webhookPOST(buildWebhookRequest(event));
    expect(res.status).toBe(200);

    const { data: row } = await testAdmin
      .from("pending_connect_transfers")
      .select("status, stripe_transfer_id")
      .eq("pending_transfer_id", pendingTransferId)
      .single();
    expect(row?.status).toBe("transferred");
    expect(row?.stripe_transfer_id).toBeTruthy();

    const { data: settleTransfer } = await testAdmin
      .from("settle_transfers")
      .select("stripe_transfer_id, amount")
      .eq("event_id", eventId)
      .eq("profile_id", profileId)
      .single();
    expect(settleTransfer?.amount).toBe(300);
    if (settleTransfer) cleanup.settleTransferIds.push(settleTransfer.stripe_transfer_id);

    await testAdmin.from("webhook_processed_events").delete().eq("stripe_event_id", stripeEventId);
  });
});
