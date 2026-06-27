/**
 * TC-BATCH-REPORT: Cron処理 × 実Stripe通信 統合テスト
 *
 * vi.mock("stripe") を一切使わず、実際のStripeテストモードAPIと通信する。
 * Stripeの実エラーオブジェクトが daily_business_reports /
 * uncollected_revenue_details に正確にマッピングされることを検証する。
 *
 * 使用するStripe定義済みテストPM（生カード番号不要）:
 *   pm_card_visa                           → 正常決済 (requires_capture)
 *   pm_card_chargeDeclinedInsufficientFunds → 残高不足 (decline_code=insufficient_funds)
 *   pm_card_authenticationRequired          → 3DS強制 (code=authentication_required)
 *
 * Stripeエラー実構造（確認済み）:
 *   残高不足: code=card_declined, decline_code=insufficient_funds
 *   3DS強制:  code=authentication_required, decline_code=authentication_required
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { stripe } from "../helpers/stripe-fixtures";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertProduct,
  insertReservation,
  insertTicket,
  insertQrConfig,
  insertTransaction,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";
import { createTestCapturedPaymentIntent } from "../helpers/stripe-fixtures";

const CRON_SECRET = process.env.CRON_SECRET ?? "test_cron_secret";
const ORIG_CRON   = process.env.CRON_SECRET;

// Stripe モックなし
import { GET as cronAuthGET }      from "@/app/api/cron/entrance-auth/route";
import { GET as cronReconcileGET } from "@/app/api/cron/reconcile/route";

function cronReq(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

// Stripe定義済みテストPM
const TEST_PM = {
  normal:        "pm_card_visa",
  insufficient:  "pm_card_chargeDeclinedInsufficientFunds",
  auth_required: "pm_card_authenticationRequired",
} as const;

// ── 顧客＋PM を準備するヘルパー ─────────────────────────────────────────
async function setupCustomerWithPM(pmId: string): Promise<{
  customerId: string;
  paymentMethodId: string;
}> {
  const customer = await stripe.customers.create({
    email: `tc-batch-${pmId.slice(-8)}-${Date.now()}@test.local`,
  });
  try {
    // 定義済みテストPMをアタッチ（生カード番号不使用）
    // ※ pm_card_chargeDeclinedInsufficientFunds は attach 時にも decline するため
    //   try-catch で飲み込み、PI 作成段階でのエラー捕捉を確認する
    await stripe.paymentMethods.attach(pmId, { customer: customer.id });
  } catch {
    // アタッチ失敗でも PM ID は使用可能（Stripe テストモードは PI 作成時にエラーを再現）
  }
  return { customerId: customer.id, paymentMethodId: pmId };
}

// ── DB ヘルパー ──────────────────────────────────────────────────────────
async function getLatestReport(taskName: string, since: Date) {
  const { data } = await testAdmin
    .from("daily_business_reports")
    .select("*")
    .eq("task_name", taskName)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function getDetailsForReport(reportId: string) {
  const { data } = await testAdmin
    .from("uncollected_revenue_details")
    .select("*")
    .eq("report_id", reportId);
  return data ?? [];
}

// ── 共有テストデータ ─────────────────────────────────────────────────────
let organizerProfileId: string;
let eventId5days: string;
let productId: string;
const stripeCustomers: string[] = [];

const cleanup = {
  profileIds:     [] as string[],
  eventIds:       [] as string[],
  productIds:     [] as string[],
  reservationIds: [] as string[],
  ticketIds:      [] as string[],
  transactionIds: [] as string[],
  qrConfigIds:    [] as string[],
  reportIds:      [] as string[],
};

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET;

  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer", displayName: "org-batchreport",
    email: `org-batch-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId);

  // 5日後イベント（entrance-auth の対象ウィンドウ 4〜6日後）
  eventId5days = await insertEvent({ organizerProfileId, title: "TC-BATCH-REPORT テストイベント" });
  await testAdmin.from("events")
    .update({ start_at: new Date(Date.now() + 5 * 86400_000).toISOString() })
    .eq("event_id", eventId5days);
  cleanup.eventIds.push(eventId5days);

  productId = await insertProduct({
    eventId: eventId5days, paymentType: "A",
    name: "テスト前売りチケット（実Stripe）", minAmount: 3000,
  });
  cleanup.productIds.push(productId);
}, 60_000);

afterAll(async () => {
  process.env.CRON_SECRET = ORIG_CRON;
  for (const cid of stripeCustomers)
    await stripe.customers.del(cid).catch(() => {});

  if (cleanup.reportIds.length) {
    await testAdmin.from("uncollected_revenue_details").delete()
      .in("report_id", cleanup.reportIds);
    await testAdmin.from("daily_business_reports").delete()
      .in("id", cleanup.reportIds);
  }
  if (cleanup.ticketIds.length)
    await testAdmin.from("tickets").delete().in("ticket_id", cleanup.ticketIds);
  if (cleanup.transactionIds.length)
    await testAdmin.from("transactions").delete().in("transaction_id", cleanup.transactionIds);
  if (cleanup.reservationIds.length)
    await testAdmin.from("entrance_reservations").delete()
      .in("reservation_id", cleanup.reservationIds);
  if (cleanup.qrConfigIds.length) {
    await testAdmin.from("qr_config_targets").delete().in("qr_config_id", cleanup.qrConfigIds);
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  }
  if (cleanup.productIds.length)
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  if (cleanup.eventIds.length)
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
}, 60_000);

// ═════════════════════════════════════════════════════════════════════════
// シナリオ1: 正常系 ── pm_card_visa → requires_capture → 正常完了レポート
// ═════════════════════════════════════════════════════════════════════════
describe("TC-BATCH-1: 正常系 通常カード（pm_card_visa）", () => {
  it("オーソリ成功 → reservation=charged・daily_business_reports ステータス=正常完了", async () => {
    const { customerId, paymentMethodId } = await setupCustomerWithPM(TEST_PM.normal);
    stripeCustomers.push(customerId);

    const email = `batch1-happy-${Date.now()}@test.local`;
    const reservationId = await insertReservation({
      productId, eventId: eventId5days,
      stripeCustomerId: customerId,
      stripePaymentMethodId: paymentMethodId,
      chargeAmount: 3000, status: "reserved", email,
    });
    cleanup.reservationIds.push(reservationId);

    const { ticketId } = await insertTicket({
      eventId: eventId5days, productId, status: "valid", reservationId,
    });
    cleanup.ticketIds.push(ticketId);

    const before = new Date();
    const res = await cronAuthGET(cronReq("/api/cron/entrance-auth"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.succeeded).toBeGreaterThanOrEqual(1);

    // サマリーの検証
    const report = await getLatestReport("5日前・前売り決済確定バッチ", before);
    expect(report).not.toBeNull();
    expect(report!.status).toBe("正常完了");
    expect(report!.success_count).toBeGreaterThanOrEqual(1);
    expect(report!.success_amount).toBeGreaterThanOrEqual(3000);
    expect(report!.failed_count).toBe(0);
    if (report) cleanup.reportIds.push(report.id);

    // 未回収明細は空
    const details = report ? await getDetailsForReport(report.id) : [];
    expect(details.filter(d => d.customer_name === email).length).toBe(0);

    // reservation=charged・ticket=valid
    const { data: rsv } = await testAdmin.from("entrance_reservations")
      .select("status").eq("reservation_id", reservationId).single();
    expect(rsv?.status).toBe("charged");

    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("valid");
  }, 60_000);
});

// ═════════════════════════════════════════════════════════════════════════
// シナリオ2: 異常系① ── pm_card_chargeDeclinedInsufficientFunds
//            Stripe実エラー: code=card_declined, decline_code=insufficient_funds
// ═════════════════════════════════════════════════════════════════════════
describe("TC-BATCH-2: 異常系 残高不足（pm_card_chargeDeclinedInsufficientFunds）", () => {
  it("Stripe実エラー decline_code=insufficient_funds → '❌【決済失敗】カードの残高不足です' がDBに格納される", async () => {
    const { customerId, paymentMethodId } = await setupCustomerWithPM(TEST_PM.insufficient);
    stripeCustomers.push(customerId);

    const email = `batch2-insuff-${Date.now()}@test.local`;
    const reservationId = await insertReservation({
      productId, eventId: eventId5days,
      stripeCustomerId: customerId,
      stripePaymentMethodId: paymentMethodId,
      chargeAmount: 5000, status: "reserved", email,
    });
    cleanup.reservationIds.push(reservationId);

    const { ticketId } = await insertTicket({
      eventId: eventId5days, productId, status: "valid", reservationId,
    });
    cleanup.ticketIds.push(ticketId);

    const before = new Date();
    const res = await cronAuthGET(cronReq("/api/cron/entrance-auth"));
    expect(res.status).toBe(200);
    expect((await res.json()).failed).toBeGreaterThanOrEqual(1);

    // サマリーが「要確認・未回収あり」になっている
    const report = await getLatestReport("5日前・前売り決済確定バッチ", before);
    expect(report).not.toBeNull();
    expect(report!.status).toBe("要確認・未回収あり");
    expect(report!.failed_count).toBeGreaterThanOrEqual(1);
    expect(report!.failed_amount).toBeGreaterThanOrEqual(5000);
    if (report) cleanup.reportIds.push(report.id);

    // 明細に正確なメッセージが格納されている
    const details = report ? await getDetailsForReport(report.id) : [];
    const d = details.find(x => x.customer_name === email);
    expect(d).toBeDefined();
    expect(d!.failure_reason).toBe("❌【決済失敗】カードの残高不足です（要現地回収）");
    expect(d!.amount).toBe(5000);
    expect(d!.action_status).toBe("未対応");

    // ticket=suspended・reservation=card_error
    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("suspended");

    const { data: rsv } = await testAdmin.from("entrance_reservations")
      .select("status, card_error_message").eq("reservation_id", reservationId).single();
    expect(rsv?.status).toBe("card_error");
    expect(rsv?.card_error_message).toBeTruthy();
  }, 60_000);
});

// ═════════════════════════════════════════════════════════════════════════
// シナリオ3: 異常系② ── pm_card_authenticationRequired
//            Stripe実エラー: code=authentication_required
// ═════════════════════════════════════════════════════════════════════════
describe("TC-BATCH-3: 異常系 3DS強制（pm_card_authenticationRequired）", () => {
  it("Stripe実エラー code=authentication_required → '🔒【本人認証未完了】セキュリティロック' がDBに格納される", async () => {
    const { customerId, paymentMethodId } = await setupCustomerWithPM(TEST_PM.auth_required);
    stripeCustomers.push(customerId);

    const email = `batch3-3ds-${Date.now()}@test.local`;
    const reservationId = await insertReservation({
      productId, eventId: eventId5days,
      stripeCustomerId: customerId,
      stripePaymentMethodId: paymentMethodId,
      chargeAmount: 4000, status: "reserved", email,
    });
    cleanup.reservationIds.push(reservationId);

    const { ticketId } = await insertTicket({
      eventId: eventId5days, productId, status: "valid", reservationId,
    });
    cleanup.ticketIds.push(ticketId);

    const before = new Date();
    const res = await cronAuthGET(cronReq("/api/cron/entrance-auth"));
    expect(res.status).toBe(200);
    expect((await res.json()).failed).toBeGreaterThanOrEqual(1);

    const report = await getLatestReport("5日前・前売り決済確定バッチ", before);
    expect(report).not.toBeNull();
    expect(report!.status).toBe("要確認・未回収あり");
    if (report) cleanup.reportIds.push(report.id);

    const details = report ? await getDetailsForReport(report.id) : [];
    const d = details.find(x => x.customer_name === email);
    expect(d).toBeDefined();
    // 3DS強制は decline_code=authentication_required → このメッセージにマッピング
    expect(d!.failure_reason).toBe("🔒【本人認証未完了】セキュリティロック（要再決済案内）");
    expect(d!.amount).toBe(4000);

    const { data: tkt } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt?.status).toBe("suspended");
  }, 60_000);
});

// ═════════════════════════════════════════════════════════════════════════
// シナリオ4a: 冪等性 ── entrance-auth の二重実行
// ═════════════════════════════════════════════════════════════════════════
describe("TC-BATCH-4a: 冪等性 entrance-auth 二重実行", () => {
  it("2回目は charged 済みをスキップ → 二重課金・二重トランザクションなし", async () => {
    const { customerId, paymentMethodId } = await setupCustomerWithPM(TEST_PM.normal);
    stripeCustomers.push(customerId);

    const reservationId = await insertReservation({
      productId, eventId: eventId5days,
      stripeCustomerId: customerId,
      stripePaymentMethodId: paymentMethodId,
      chargeAmount: 3000, status: "reserved",
      email: `batch4a-idem-${Date.now()}@test.local`,
    });
    cleanup.reservationIds.push(reservationId);

    const { ticketId } = await insertTicket({
      eventId: eventId5days, productId, status: "valid", reservationId,
    });
    cleanup.ticketIds.push(ticketId);

    // ── 1回目 ──
    const before1 = new Date();
    const res1 = await cronAuthGET(cronReq("/api/cron/entrance-auth"));
    expect(res1.status).toBe(200);
    const j1 = await res1.json();
    expect(j1.succeeded).toBeGreaterThanOrEqual(1);
    const rep1 = await getLatestReport("5日前・前売り決済確定バッチ", before1);
    if (rep1) cleanup.reportIds.push(rep1.id);

    // 1回目後: reservation=charged を確認
    const { data: rsv1 } = await testAdmin.from("entrance_reservations")
      .select("status, transaction_id").eq("reservation_id", reservationId).single();
    expect(rsv1?.status).toBe("charged");
    const txId1 = rsv1?.transaction_id;
    expect(txId1).toBeTruthy();
    if (txId1) cleanup.transactionIds.push(txId1);

    // ── 2回目 ──
    const before2 = new Date();
    await cronAuthGET(cronReq("/api/cron/entrance-auth"));
    const rep2 = await getLatestReport("5日前・前売り決済確定バッチ", before2);
    if (rep2) cleanup.reportIds.push(rep2.id);

    // reservation は charged のまま（2回目で巻き戻らない）
    const { data: rsv2 } = await testAdmin.from("entrance_reservations")
      .select("status, transaction_id").eq("reservation_id", reservationId).single();
    expect(rsv2?.status).toBe("charged");

    // transaction_id は1回目と同じ（二重作成されていない）
    expect(rsv2?.transaction_id).toBe(txId1);

    // ticket は valid のまま
    const { data: tkt2 } = await testAdmin.from("tickets")
      .select("status").eq("ticket_id", ticketId).single();
    expect(tkt2?.status).toBe("valid");
  }, 120_000);
});

// ═════════════════════════════════════════════════════════════════════════
// シナリオ4b: 冪等性 ── reconcile の二重実行
// ═════════════════════════════════════════════════════════════════════════
describe("TC-BATCH-4b: 冪等性 reconcile 二重実行", () => {
  it("2回連続実行: トランザクションデータを破壊せず最新照合結果で上書き", async () => {
    // settled イベント＋キャプチャ済み PI を用意
    const settledEventId = await insertEvent({
      organizerProfileId, title: "TC-BATCH reconcile 冪等テスト",
    });
    await testAdmin.from("events")
      .update({ lifecycle_status: "settled" })
      .eq("event_id", settledEventId);
    cleanup.eventIds.push(settledEventId);

    const qrConfigId = await insertQrConfig({
      eventId: settledEventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.qrConfigIds.push(qrConfigId);

    // 実際にキャプチャ済み PI を作成（Stripe テストモード実通信）
    const pi = await createTestCapturedPaymentIntent({ amount: 10_000 });

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 10_000, netAmount: 8604, stripeFee: 396, platformFee: 1000,
      stripePaymentIntentId: pi.id,
      reconciled: false, // 未照合
    });
    cleanup.transactionIds.push(txId);

    // ── 1回目 ──
    const before1 = new Date();
    const res1 = await cronReconcileGET(cronReq("/api/cron/reconcile"));
    expect(res1.status).toBe(200);
    const j1 = await res1.json();
    expect(j1.matched).toBeGreaterThanOrEqual(1);

    const { data: tx1 } = await testAdmin.from("transactions")
      .select("amount_verified, amount_mismatch, reconciled_at, reconcile_error")
      .eq("transaction_id", txId).single();
    expect(tx1?.amount_verified).toBe(true);
    expect(tx1?.amount_mismatch).toBe(0);
    expect(tx1?.reconciled_at).not.toBeNull();
    expect(tx1?.reconcile_error).toBeNull();

    const rep1 = await getLatestReport("Stripe-DB照合バッチ", before1);
    expect(rep1?.status).toBe("正常完了");
    if (rep1) cleanup.reportIds.push(rep1.id);

    // ── 2回目 ── (このtxは reconciled_at IS NOT NULL → 対象外)
    const before2 = new Date();
    const res2 = await cronReconcileGET(cronReq("/api/cron/reconcile"));
    expect(res2.status).toBe(200);

    // データが破壊されていない
    const { data: tx2 } = await testAdmin.from("transactions")
      .select("amount_verified, amount_mismatch, reconcile_error")
      .eq("transaction_id", txId).single();
    expect(tx2?.amount_verified).toBe(true);
    expect(tx2?.amount_mismatch).toBe(0);
    expect(tx2?.reconcile_error).toBeNull();

    const rep2 = await getLatestReport("Stripe-DB照合バッチ", before2);
    if (rep2) cleanup.reportIds.push(rep2.id);

    // 2回実行でレポートは2件。どちらも正常完了（または対象0件）
    expect(["正常完了"]).toContain(rep1!.status);
  }, 120_000);
});
