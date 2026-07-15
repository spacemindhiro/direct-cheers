/**
 * TC-ONSITE-CANCEL: POST /api/events/[eventId]/transactions/[transactionId]/cancel
 *
 * 現場での決済取り消し（誤操作対応）の統合テスト。
 *
 * カバレッジ:
 *   A. カード（requires_capture）: PI cancel + TX cancelled（損害ゼロ）
 *   B. PayPay相当（succeeded）: refund + debt_claims(stripe_fee) + TX refunded
 *   C. 権限: 主催organizer/担当agent/adminのみ。他人・artist・非担当agentは403
 *   D. ガード: settle_transfers存在・completed以外・イベント不一致は拒否
 *
 * Stripe API は実際に呼び出す（テストモード）。DB は本物のローカル Supabase。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
  createTestPaymentIntent,
  createTestCapturedPaymentIntent,
  stripe,
} from "../helpers/stripe-fixtures";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertTransaction,
  insertProduct,
  insertSettleTransfer,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as cancelPOST } from "@/app/api/events/[eventId]/transactions/[transactionId]/cancel/route";

let organizerId: string;
let agentId: string;
let otherOrganizerId: string;
let artistId: string;
let organizerConnectId: string;
let eventId: string;
let otherEventId: string;
let qrConfigId: string;
let otherQrConfigId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
};

function mockAs(id: string, role: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } }, error: null }) },
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

function callCancel(evId: string, txId: string) {
  const req = new Request("http://localhost", { method: "POST" });
  return cancelPOST(req, { params: Promise.resolve({ eventId: evId, transactionId: txId }) });
}

// 各ケース用のトランザクションを作る（requires_capture のカード決済）
async function seedCardTx(amount: number): Promise<{ txId: string; piId: string }> {
  const pi = await createTestPaymentIntent({ amount, organizerConnectId });
  const stripeFee = Math.floor(amount * 0.0396);
  const platformFee = Math.floor(amount * 0.1);
  const txId = await insertTransaction({
    qrConfigId,
    grossAmount: amount,
    netAmount: amount - stripeFee - platformFee,
    stripeFee,
    platformFee,
    stripePaymentIntentId: pi.id,
  });
  cleanup.transactionIds.push(txId);
  return { txId, piId: pi.id };
}

beforeAll(async () => {
  const ts = Date.now();
  organizerId = await insertProfile({ role: "organizer", displayName: "現場主催者", email: `org-osc-${ts}@test.local` });
  agentId = await insertProfile({ role: "agent", displayName: "担当エージェント", email: `agent-osc-${ts}@test.local` });
  otherOrganizerId = await insertProfile({ role: "organizer", displayName: "無関係主催者", email: `other-osc-${ts}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: "出演者", email: `artist-osc-${ts}@test.local` });
  cleanup.profileIds.push(organizerId, agentId, otherOrganizerId, artistId);

  organizerConnectId = await createTestConnectAccount();

  eventId = await insertEvent({ organizerProfileId: organizerId, agentId, title: "TC-ONSITE-CANCEL イベント" });
  otherEventId = await insertEvent({ organizerProfileId: otherOrganizerId, title: "TC-ONSITE-CANCEL 別イベント" });
  cleanup.eventIds.push(eventId, otherEventId);

  const productId = await insertProduct({ eventId, name: "会場ドリンク", type: "custom", paymentType: "B" });
  qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerId, recipientProfileId: organizerId, productId });
  otherQrConfigId = await insertQrConfig({ eventId: otherEventId, creatorProfileId: otherOrganizerId, recipientProfileId: otherOrganizerId });
  cleanup.qrConfigIds.push(qrConfigId, otherQrConfigId);
}, 60_000);

afterAll(async () => {
  if (cleanup.transactionIds.length) {
    await testAdmin.from("debt_claims").delete().in("original_transaction_id", cleanup.transactionIds);
    await testAdmin.from("transactions").delete().in("transaction_id", cleanup.transactionIds);
  }
  if (cleanup.qrConfigIds.length)
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  if (cleanup.eventIds.length) {
    await testAdmin.from("settle_transfers").delete().in("event_id", cleanup.eventIds);
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  }
  await deleteAuthUsers(cleanup.profileIds);
  if (organizerConnectId) await deleteTestConnectAccount(organizerConnectId);
}, 60_000);

// ── A. カード（オーソリ中） ─────────────────────────────────────────────
describe("TC-ONSITE-CANCEL-A: カード決済のオーソリ取消", () => {
  it("TC-ONSITE-CANCEL-A-01: 主催organizerが取り消すとPI cancel + TX cancelled", async () => {
    const { txId, piId } = await seedCardTx(1000);
    mockAs(organizerId, "organizer");

    const res = await callCancel(eventId, txId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.mode).toBe("cancel");

    const pi = await stripe.paymentIntents.retrieve(piId);
    expect(pi.status).toBe("canceled");

    const { data: tx } = await testAdmin
      .from("transactions").select("status").eq("transaction_id", txId).single();
    expect(tx!.status).toBe("cancelled");

    // カード（オーソリ取消）は損害ゼロなので debt_claims は作られない
    const { count } = await testAdmin
      .from("debt_claims").select("*", { count: "exact", head: true })
      .eq("original_transaction_id", txId);
    expect(count).toBe(0);
  });

  it("TC-ONSITE-CANCEL-A-02: 担当agentも取り消せる", async () => {
    const { txId, piId } = await seedCardTx(1500);
    mockAs(agentId, "agent");

    const res = await callCancel(eventId, txId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("cancel");

    const pi = await stripe.paymentIntents.retrieve(piId);
    expect(pi.status).toBe("canceled");
  });
});

// ── B. キャプチャ済み（PayPay相当） ─────────────────────────────────────
describe("TC-ONSITE-CANCEL-B: キャプチャ済み決済の返金", () => {
  it("TC-ONSITE-CANCEL-B-01: refund + debt_claims(stripe_fee) + TX refunded", async () => {
    const amount = 2000;
    const pi = await createTestCapturedPaymentIntent({ amount });
    const stripeFee = Math.floor(amount * 0.0396);
    const platformFee = Math.floor(amount * 0.1);
    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: amount,
      netAmount: amount - stripeFee - platformFee,
      stripeFee,
      platformFee,
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    mockAs(organizerId, "organizer");
    const res = await callCancel(eventId, txId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.mode).toBe("refund");
    expect(body.debtAmount).toBe(stripeFee);

    const { data: tx } = await testAdmin
      .from("transactions").select("status").eq("transaction_id", txId).single();
    expect(tx!.status).toBe("refunded");

    const { data: claims } = await testAdmin
      .from("debt_claims")
      .select("profile_id, claim_amount")
      .eq("original_transaction_id", txId);
    expect(claims!.length).toBe(1);
    expect(claims![0].profile_id).toBe(organizerId);
    expect(claims![0].claim_amount).toBe(stripeFee);
  });
});

// ── C. 権限 ────────────────────────────────────────────────────────────
describe("TC-ONSITE-CANCEL-C: 権限チェック", () => {
  it("TC-ONSITE-CANCEL-C-01: 無関係のorganizerは403", async () => {
    const { txId } = await seedCardTx(1000);
    mockAs(otherOrganizerId, "organizer");
    const res = await callCancel(eventId, txId);
    expect(res.status).toBe(403);
  });

  it("TC-ONSITE-CANCEL-C-02: artistは403", async () => {
    const { txId } = await seedCardTx(1000);
    mockAs(artistId, "artist");
    const res = await callCancel(eventId, txId);
    expect(res.status).toBe(403);
  });

  it("TC-ONSITE-CANCEL-C-03: 非担当agent（別イベント）は403", async () => {
    // otherEventId の agent_id は otherOrganizerId（自己参照）なので agentId は非担当
    const pi = await createTestPaymentIntent({ amount: 800, organizerConnectId });
    const txId = await insertTransaction({
      qrConfigId: otherQrConfigId,
      grossAmount: 800, netAmount: 700, stripeFee: 30, platformFee: 70,
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    mockAs(agentId, "agent");
    const res = await callCancel(otherEventId, txId);
    expect(res.status).toBe(403);
  });
});

// ── D. ガード ──────────────────────────────────────────────────────────
describe("TC-ONSITE-CANCEL-D: 不正状態のガード", () => {
  it("TC-ONSITE-CANCEL-D-01: 別イベントのtransactionIdを指定すると404", async () => {
    const pi = await createTestPaymentIntent({ amount: 900, organizerConnectId });
    const txId = await insertTransaction({
      qrConfigId: otherQrConfigId,
      grossAmount: 900, netAmount: 800, stripeFee: 35, platformFee: 65,
      stripePaymentIntentId: pi.id,
    });
    cleanup.transactionIds.push(txId);

    mockAs(organizerId, "organizer");
    const res = await callCancel(eventId, txId);
    expect(res.status).toBe(404);
  });

  it("TC-ONSITE-CANCEL-D-02: completed以外のステータスは400", async () => {
    const { txId } = await seedCardTx(1000);
    await testAdmin.from("transactions").update({ status: "refunded" }).eq("transaction_id", txId);

    mockAs(organizerId, "organizer");
    const res = await callCancel(eventId, txId);
    expect(res.status).toBe(400);
  });

  it("TC-ONSITE-CANCEL-D-03: settle_transfersが存在すると400（admin返金画面へ誘導）", async () => {
    const { txId } = await seedCardTx(1200);
    await insertSettleTransfer({ eventId, profileId: organizerId, stripeTransferId: `tr_dummy_${Date.now()}`, amount: 500 });

    mockAs(organizerId, "organizer");
    const res = await callCancel(eventId, txId);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("精算送金");

    // 後続テストに影響しないよう削除
    await testAdmin.from("settle_transfers").delete().eq("event_id", eventId);
  });
});
