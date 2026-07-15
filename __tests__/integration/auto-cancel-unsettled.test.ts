/**
 * TC-AUTOCANCEL: /api/cron/auto-cancel-unsettled の統合テスト
 *
 * イベント開催から7日以内に精算(settled)されなかった場合、day-of authorizeされた
 * 売上(capture_method:manual・requires_capture)を自動でcancelし、イベントを
 * lifecycle_status='cancelled'にする自動キャンセルバッチのテスト。
 * 従来はcheck-auth-expiryが警告通知を出すだけで、実際のキャンセル操作は
 * 管理者の手動操作(capture-all/refund-all)任せだったため、警告を放置すると
 * 未settledイベントが無期限に残り続ける欠落があった。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Stripe from "stripe";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
  createTestPaymentIntent,
} from "../helpers/stripe-fixtures";
import { insertProfile, deleteAuthUsers, insertEvent, insertQrConfig, insertTransaction } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

import { GET as autoCancelGET } from "@/app/api/cron/auto-cancel-unsettled/route";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function withCronSecret() {
  const secret = process.env.CRON_SECRET ?? "test_cron_secret";
  const orig = process.env.CRON_SECRET;
  process.env.CRON_SECRET = secret;
  return {
    secret,
    restore: () => { process.env.CRON_SECRET = orig; },
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
};

let organizerConnectId: string;

beforeAll(async () => {
  organizerConnectId = await createTestConnectAccount();
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
  await deleteTestConnectAccount(organizerConnectId);
});

describe("TC-AUTOCANCEL-A: 認証", () => {
  it("TC-AUTOCANCEL-A-01: 誤ったCRON_SECRET → 401", async () => {
    const req = new Request("http://localhost/api/cron/auto-cancel-unsettled", {
      method: "GET",
      headers: { authorization: "Bearer wrong_secret" },
    });
    const res = await autoCancelGET(req);
    expect(res.status).toBe(401);
  });
});

describe("TC-AUTOCANCEL-B: 7日超過・未settled → 自動キャンセル実行", () => {
  let organizerProfileId: string;
  let eventId: string;
  let transactionId: string;
  let piId: string;

  beforeAll(async () => {
    const ts = Date.now();
    organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "自動キャンセル対象オーガナイザー",
      email: `autocancel-target-${ts}@test.local`,
      stripeConnectId: organizerConnectId,
    });
    cleanup.profileIds.push(organizerProfileId);

    eventId = await insertEvent({
      organizerProfileId,
      title: "TC-AUTOCANCEL 未settledイベント",
      startAt: daysAgo(8),
      endAt: daysAgo(7),
    });
    cleanup.eventIds.push(eventId);
    await testAdmin.from("events").update({ lifecycle_status: "published" }).eq("event_id", eventId);

    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: 5_000, organizerConnectId });
    piId = pi.id;
    expect(pi.status).toBe("requires_capture");

    transactionId = await insertTransaction({
      qrConfigId,
      grossAmount: 5_000,
      netAmount: 5_000,
      stripeFee: 0,
      platformFee: 0,
      stripePaymentIntentId: piId,
    });
    cleanup.transactionIds.push(transactionId);
  }, 60_000);

  it("TC-AUTOCANCEL-B-01: 実行 → cancelledEvents=1・cancelledTx=1・errors=0", async () => {
    const { secret, restore } = withCronSecret();
    const req = new Request("http://localhost/api/cron/auto-cancel-unsettled", {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
    });
    const res = await autoCancelGET(req);
    const data = await res.json();
    restore();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.cancelledEvents).toBe(1);
    expect(data.cancelledTx).toBe(1);
    expect(data.errors).toBe(0);
  }, 30_000);

  it("TC-AUTOCANCEL-B-02: StripeのPIがcanceledになる(資金移動ゼロで解放)", async () => {
    const pi = await stripe.paymentIntents.retrieve(piId);
    expect(pi.status).toBe("canceled");
  });

  it("TC-AUTOCANCEL-B-03: transactions.status='cancelled' に更新される", async () => {
    const { data: tx } = await testAdmin.from("transactions").select("status").eq("transaction_id", transactionId).single();
    expect(tx?.status).toBe("cancelled");
  });

  it("TC-AUTOCANCEL-B-04: events.lifecycle_status='cancelled' に更新される", async () => {
    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", eventId).single();
    expect(ev?.lifecycle_status).toBe("cancelled");
  });

  it("TC-AUTOCANCEL-B-05: オーガナイザーへevent_auto_cancelled通知が作成される", async () => {
    const { data: notif } = await testAdmin
      .from("notifications")
      .select("type, title, metadata")
      .eq("profile_id", organizerProfileId)
      .eq("type", "event_auto_cancelled")
      .maybeSingle();
    expect(notif).toBeTruthy();
    expect((notif?.metadata as any)?.event_id).toBe(eventId);
  });

  it("TC-AUTOCANCEL-B-06: 2回目実行 → 既にcancelled済みのため対象外(cancelledEvents=0)", async () => {
    const { secret, restore } = withCronSecret();
    const req = new Request("http://localhost/api/cron/auto-cancel-unsettled", {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
    });
    const res = await autoCancelGET(req);
    const data = await res.json();
    restore();

    expect(res.status).toBe(200);
    expect(data.cancelledEvents).toBe(0);
  }, 30_000);
});

describe("TC-AUTOCANCEL-C: 7日以内(締切前) → 対象外", () => {
  let organizerProfileId: string;
  let eventId: string;
  let transactionId: string;
  let piId: string;

  beforeAll(async () => {
    const ts = Date.now();
    // profiles.stripe_connect_id は一意制約があるため、Stripe呼び出しに使う
    // 実在Connectアカウント(organizerConnectId)とは別にダミー値を使う
    organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "締切前オーガナイザー",
      email: `autocancel-early-${ts}@test.local`,
      stripeConnectId: `acct_fake_early_${ts}`,
    });
    cleanup.profileIds.push(organizerProfileId);

    eventId = await insertEvent({
      organizerProfileId,
      title: "TC-AUTOCANCEL 締切前イベント",
      startAt: daysAgo(3),
      endAt: daysAgo(2),
    });
    cleanup.eventIds.push(eventId);
    await testAdmin.from("events").update({ lifecycle_status: "published" }).eq("event_id", eventId);

    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: 4_000, organizerConnectId });
    piId = pi.id;

    transactionId = await insertTransaction({
      qrConfigId,
      grossAmount: 4_000,
      netAmount: 4_000,
      stripeFee: 0,
      platformFee: 0,
      stripePaymentIntentId: piId,
    });
    cleanup.transactionIds.push(transactionId);
  }, 60_000);

  it("TC-AUTOCANCEL-C-01: 実行してもこのイベントは対象外のまま(published・completed維持)", async () => {
    const { secret, restore } = withCronSecret();
    const req = new Request("http://localhost/api/cron/auto-cancel-unsettled", {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
    });
    await autoCancelGET(req);
    restore();

    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", eventId).single();
    expect(ev?.lifecycle_status).toBe("published");

    const { data: tx } = await testAdmin.from("transactions").select("status").eq("transaction_id", transactionId).single();
    expect(tx?.status).toBe("completed");

    const pi = await stripe.paymentIntents.retrieve(piId);
    expect(pi.status).toBe("requires_capture");
  }, 30_000);
});

describe("TC-AUTOCANCEL-D: settled済みイベント → 対象外", () => {
  let organizerProfileId: string;
  let eventId: string;
  let transactionId: string;
  let piId: string;

  beforeAll(async () => {
    const ts = Date.now();
    organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "settled済みオーガナイザー",
      email: `autocancel-settled-${ts}@test.local`,
      stripeConnectId: `acct_fake_settled_${ts}`,
    });
    cleanup.profileIds.push(organizerProfileId);

    eventId = await insertEvent({
      organizerProfileId,
      title: "TC-AUTOCANCEL settled済みイベント",
      startAt: daysAgo(10),
      endAt: daysAgo(9),
    });
    cleanup.eventIds.push(eventId);
    await testAdmin.from("events").update({ lifecycle_status: "settled" }).eq("event_id", eventId);

    const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.qrConfigIds.push(qrConfigId);

    const pi = await createTestPaymentIntent({ amount: 2_000, organizerConnectId });
    piId = pi.id;

    transactionId = await insertTransaction({
      qrConfigId,
      grossAmount: 2_000,
      netAmount: 2_000,
      stripeFee: 0,
      platformFee: 0,
      stripePaymentIntentId: piId,
    });
    cleanup.transactionIds.push(transactionId);
  }, 60_000);

  it("TC-AUTOCANCEL-D-01: settled済みイベントのPIには一切触れない", async () => {
    const { secret, restore } = withCronSecret();
    const req = new Request("http://localhost/api/cron/auto-cancel-unsettled", {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
    });
    await autoCancelGET(req);
    restore();

    const { data: tx } = await testAdmin.from("transactions").select("status").eq("transaction_id", transactionId).single();
    expect(tx?.status).toBe("completed");

    const pi = await stripe.paymentIntents.retrieve(piId);
    expect(pi.status).toBe("requires_capture");
  }, 30_000);
});
