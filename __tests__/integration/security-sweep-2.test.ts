/**
 * TC-SEC2: 2026-10-11 水平展開（画面だけ・IDだけで通していたAPI）の回帰テスト
 *
 *   A. pay/message     — 決済セッションIDで本人確認・メッセージプランのみ
 *   B. pay/card-viewed — 決済セッションIDで本人確認（取引IDだけでは閲覧ログを足せない）
 *   C. 対面タッチ決済   — そのイベントの主催者・エージェント・管理者だけ
 *   D. pay/cheers      — 保存カード（Stripe顧客）はログイン本人のメールのときだけ
 *   E. stripe/link-setup — 顧客に紐づけるのはログイン本人のメールだけ
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile, deleteAuthUsers, insertEvent, insertProduct, insertQrConfig, insertTransaction, ongoingEventWindow,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

// ── Stripe モック ────────────────────────────────────────────────────────────
const mock = {
  // checkout.sessions.retrieve: session_id → payment_intent
  sessions: {} as Record<string, string>,
  sessionCreateParams: undefined as any,
  piMetadata: {} as Record<string, string>,
  setupIntentParams: undefined as any,
};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.checkout.sessions as any).retrieve = async (id: string) => {
        const pi = mock.sessions[id];
        if (!pi) throw Object.assign(new Error("No such checkout.session"), { type: "StripeInvalidRequestError" });
        return { id, payment_intent: pi };
      };
      (this.checkout.sessions as any).create = async (params: any) => {
        mock.sessionCreateParams = params;
        return { id: "cs_sec2_stub", url: "https://checkout.stripe.com/c/pay/cs_sec2_stub" };
      };
      (this.accounts as any).retrieve = async (id: string) => ({
        id, object: "account", capabilities: { card_payments: "active", transfers: "active" },
      });
      (this.paymentIntents as any).retrieve = async (id: string) => ({
        id, status: "requires_capture", amount: 3000, metadata: mock.piMetadata, latest_charge: null,
      });
      (this.customers as any).list = async () => ({ data: [] });
      (this.customers as any).create = async (params: any) => ({ id: `cus_sec2_${params.email}` });
      (this.setupIntents as any).create = async (params: any) => {
        mock.setupIntentParams = params;
        return { id: "seti_sec2", client_secret: "seti_sec2_secret" };
      };
    }
  }
  return { ...StripeModule, default: MockStripe };
});

const auth = { userId: null as string | null, email: null as string | null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: auth.userId ? { id: auth.userId, email: auth.email } : null }, error: null }) },
    from: (t: string) => testAdmin.from(t),
  })),
  getUser: vi.fn(async () => (auth.userId ? { id: auth.userId, email: auth.email } : null)),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastCheerNew: vi.fn(async () => {}),
  broadcastTouchpaySignup: vi.fn(async () => {}),
  broadcastTouchpayClear: vi.fn(async () => {}),
}));
vi.mock("@/lib/apple-wallet-push", () => ({ pushWalletUpdateBySerial: vi.fn(async () => {}) }));

import { POST as messagePOST } from "@/app/api/pay/message/route";
import { POST as cardViewedPOST } from "@/app/api/pay/card-viewed/route";
import { POST as terminalPiPOST } from "@/app/api/entrance/terminal/payment-intent/route";
import { POST as terminalCompletePOST } from "@/app/api/entrance/terminal/complete/route";
import { POST as clearSignupPOST } from "@/app/api/entrance/terminal/clear-signup/route";
import { POST as payCheersPOST } from "@/app/api/pay/cheers/route";
import { POST as linkSetupPOST } from "@/app/api/stripe/link-setup/route";

const ts = Date.now();
let ownerId: string;      // イベントの主催者
let otherOrgId: string;   // 別の主催者
let adminId: string;
let eventId: string;
let messageProductId: string;
let standardProductId: string;
let touchProductId: string;
let qrMessage: string;
let qrStandard: string;
let qrTouch: string;
const txIds: string[] = [];
const emails: string[] = [];

function json(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function loginAs(id: string | null, email: string | null = null) {
  auth.userId = id;
  auth.email = email;
}

/** session_id → PI → 取引（アンカー行）を作って返す */
async function makePaidTx(qrConfigId: string, productId: string, label: string) {
  const pi = `pi_sec2_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = `cs_sec2_${label}_${Math.random().toString(36).slice(2, 10)}`;
  mock.sessions[sessionId] = pi;
  const txId = await insertTransaction({
    qrConfigId, grossAmount: 3000, netAmount: 2592, stripeFee: 108, platformFee: 300, stripePaymentIntentId: pi,
  });
  await testAdmin.from("transactions").update({ product_id: productId }).eq("transaction_id", txId);
  txIds.push(txId);
  return { sessionId, txId };
}

async function readTx(txId: string) {
  const { data } = await testAdmin.from("transactions").select("sender_name, sender_comment").eq("transaction_id", txId).single();
  return data as { sender_name: string | null; sender_comment: string | null };
}

async function accessLogCount(txId: string) {
  const { count } = await testAdmin.from("asset_access_logs").select("*", { count: "exact", head: true }).eq("transaction_id", txId);
  return count ?? 0;
}

beforeAll(async () => {
  ownerId = await insertProfile({ role: "organizer", displayName: "sec2-owner", email: `sec2-owner-${ts}@test.local`, stripeConnectId: `acct_sec2_owner_${ts}` });
  otherOrgId = await insertProfile({ role: "organizer", displayName: "sec2-other", email: `sec2-other-${ts}@test.local` });
  adminId = await insertProfile({ role: "admin", displayName: "sec2-admin", email: `sec2-admin-${ts}@test.local` });

  eventId = await insertEvent({ ...ongoingEventWindow(), organizerProfileId: ownerId, title: "SEC2" });
  messageProductId = await insertProduct({ eventId, type: "message", name: "メッセージ", minAmount: 500, maxAmount: 5000 });
  standardProductId = await insertProduct({ eventId, type: "standard", name: "スタンダード", minAmount: 500, maxAmount: 3000 });
  touchProductId = await insertProduct({ eventId, type: "entrance", paymentType: "C", name: "当日券", minAmount: 3000, maxAmount: 3000 });

  qrMessage = await insertQrConfig({ eventId, creatorProfileId: ownerId, recipientProfileId: ownerId, productId: messageProductId });
  qrStandard = await insertQrConfig({ eventId, creatorProfileId: ownerId, recipientProfileId: ownerId, productId: standardProductId });
  qrTouch = await insertQrConfig({ eventId, creatorProfileId: ownerId, recipientProfileId: ownerId, productId: touchProductId });
  await testAdmin.from("qr_configs").update({ touchpay_enabled: true }).eq("qr_config_id", qrTouch);
}, 60_000);

afterAll(async () => {
  if (txIds.length) {
    await testAdmin.from("asset_access_logs").delete().in("transaction_id", txIds);
    await testAdmin.from("transactions").delete().in("transaction_id", txIds);
  }
  if (emails.length) await testAdmin.from("provisional_users").delete().in("email", emails);
  await testAdmin.from("qr_configs").delete().in("qr_config_id", [qrMessage, qrStandard, qrTouch]);
  await testAdmin.from("products").delete().in("product_id", [messageProductId, standardProductId, touchProductId]);
  await testAdmin.from("events").delete().eq("event_id", eventId);
  await deleteAuthUsers([ownerId, otherOrgId, adminId]);
});

// ── A. pay/message ───────────────────────────────────────────────────────────
describe("TC-SEC2-A: pay/message は決済した本人（session_id）のメッセージプランだけ", () => {
  it("A-01: 本人の session_id・メッセージプラン → 200・書き込まれる", async () => {
    const { sessionId, txId } = await makePaidTx(qrMessage, messageProductId, "msg_ok");
    const res = await messagePOST(json({ session_id: sessionId, nickname: "ひろ", comment: "最高" }));
    expect(res.status).toBe(200);
    expect(await readTx(txId)).toEqual({ sender_name: "ひろ", sender_comment: "最高" });
  });

  it("A-02: 旧形式（transaction_id だけ）→ 400・書き込まれない", async () => {
    const { txId } = await makePaidTx(qrMessage, messageProductId, "msg_legacy");
    const res = await messagePOST(json({ transaction_id: txId, comment: "なりすまし" }));
    expect(res.status).toBe(400);
    expect(await readTx(txId)).toEqual({ sender_name: null, sender_comment: null });
  });

  it("A-03: 存在しない session_id → 400", async () => {
    const res = await messagePOST(json({ session_id: "cs_sec2_unknown", comment: "x" }));
    expect(res.status).toBe(400);
  });

  it("A-04: スタンダードプランの取引 → 400・書き込まれない（画面と同じくメッセージプランのみ）", async () => {
    const { sessionId, txId } = await makePaidTx(qrStandard, standardProductId, "msg_std");
    const res = await messagePOST(json({ session_id: sessionId, comment: "x" }));
    expect(res.status).toBe(400);
    expect(await readTx(txId)).toEqual({ sender_name: null, sender_comment: null });
  });

  it("A-05: 2回目の書き込みは上書きしない", async () => {
    const { sessionId, txId } = await makePaidTx(qrMessage, messageProductId, "msg_twice");
    await messagePOST(json({ session_id: sessionId, nickname: "1回目", comment: "1回目" }));
    await messagePOST(json({ session_id: sessionId, nickname: "2回目", comment: "2回目" }));
    expect(await readTx(txId)).toEqual({ sender_name: "1回目", sender_comment: "1回目" });
  });
});

// ── B. pay/card-viewed ───────────────────────────────────────────────────────
describe("TC-SEC2-B: pay/card-viewed は決済した本人（session_id）だけが閲覧ログを残せる", () => {
  it("B-01: 本人の session_id → ok・ログ1件", async () => {
    const { sessionId, txId } = await makePaidTx(qrStandard, standardProductId, "view_ok");
    const res = await cardViewedPOST(json({ session_id: sessionId }));
    expect(await res.json()).toEqual({ ok: true });
    expect(await accessLogCount(txId)).toBe(1);
  });

  it("B-02: 旧形式（transaction_id だけ）→ ok:false・ログ0件", async () => {
    const { txId } = await makePaidTx(qrStandard, standardProductId, "view_legacy");
    const res = await cardViewedPOST(json({ transaction_id: txId }));
    expect(await res.json()).toEqual({ ok: false });
    expect(await accessLogCount(txId)).toBe(0);
  });

  it("B-03: 存在しない session_id → ok:false", async () => {
    const res = await cardViewedPOST(json({ session_id: "cs_sec2_unknown" }));
    expect(await res.json()).toEqual({ ok: false });
  });
});

// ── C. 対面タッチ決済 ─────────────────────────────────────────────────────────
describe("TC-SEC2-C: 対面タッチ決済はそのイベントの主催者・エージェント・管理者だけ", () => {
  // target_device_id 未指定 → 所有者確認を通過した直後の「子機未設定」400 で止まる
  const PAST_OWNER_CHECK = "表示する子機が設定されていません。子機とのペアリングを行ってください";

  it("C-01: 別の主催者 → 403", async () => {
    loginAs(otherOrgId);
    const res = await terminalPiPOST(json({ product_id: touchProductId }));
    expect(res.status).toBe(403);
  });

  it("C-02: イベントの主催者 → 所有者確認を通過（子機未設定の400）", async () => {
    loginAs(ownerId);
    const res = await terminalPiPOST(json({ product_id: touchProductId }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(PAST_OWNER_CHECK);
  });

  it("C-03: 管理者 → 所有者確認を通過（子機未設定の400）", async () => {
    loginAs(adminId);
    const res = await terminalPiPOST(json({ product_id: touchProductId }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(PAST_OWNER_CHECK);
  });

  it("C-04: 決済完了も別の主催者 → 403・取引は作られない", async () => {
    loginAs(otherOrgId);
    const pi = `pi_sec2_touch_${Date.now()}`;
    mock.piMetadata = { product_id: touchProductId, event_id: eventId, qr_config_id: qrTouch, quantity: "1" };
    const res = await terminalCompletePOST(json({ payment_intent_id: pi }));
    expect(res.status).toBe(403);
    const { count } = await testAdmin.from("transactions").select("*", { count: "exact", head: true }).eq("stripe_payment_intent_id", pi);
    expect(count).toBe(0);
  });

  it("C-05: 子機のサインアップQR消去も別の主催者 → 403、主催者 → 200", async () => {
    loginAs(otherOrgId);
    expect((await clearSignupPOST(json({ event_id: eventId }))).status).toBe(403);
    loginAs(ownerId);
    expect((await clearSignupPOST(json({ event_id: eventId }))).status).toBe(200);
  });
});

// ── D. pay/cheers の保存カード ─────────────────────────────────────────────
describe("TC-SEC2-D: 保存カード（Stripe顧客）を出すのはログイン本人のメールのときだけ", () => {
  const victimEmail = `sec2-victim-${ts}@test.local`;
  const victimCustomer = "cus_sec2_victim_saved";

  beforeAll(async () => {
    emails.push(victimEmail);
    await testAdmin.from("provisional_users").upsert({ email: victimEmail, stripe_customer_id: victimCustomer }, { onConflict: "email" });
  });

  function payReq(email: string) {
    return json({ qr_config_id: qrStandard, product_id: standardProductId, amount: 1000, payment_method: "card", customer_email: email });
  }

  it("D-01: 未ログインで他人のメールを入力 → 他人の顧客を渡さない", async () => {
    loginAs(null);
    mock.sessionCreateParams = undefined;
    const res = await payCheersPOST(payReq(victimEmail));
    expect(res.status).toBe(200);
    expect(mock.sessionCreateParams.customer).toBeUndefined();
    expect(mock.sessionCreateParams.customer_email).toBe(victimEmail);
    expect(mock.sessionCreateParams.customer_creation).toBe("always");
  });

  it("D-02: 別人がログイン中に他人のメールを入力 → ログイン本人のメールが優先され、他人の顧客は渡さない", async () => {
    loginAs(otherOrgId, `sec2-other-${ts}@test.local`);
    mock.sessionCreateParams = undefined;
    await payCheersPOST(payReq(victimEmail));
    expect(mock.sessionCreateParams.customer).toBeUndefined();
    expect(mock.sessionCreateParams.customer_email).toBe(`sec2-other-${ts}@test.local`);
  });

  it("D-03: 本人がログイン中 → 本人の保存済み顧客を渡す", async () => {
    loginAs(ownerId, victimEmail);
    mock.sessionCreateParams = undefined;
    await payCheersPOST(payReq(victimEmail));
    expect(mock.sessionCreateParams.customer).toBe(victimCustomer);
    expect(mock.sessionCreateParams.customer_email).toBeUndefined();
  });
});

// ── E. stripe/link-setup ──────────────────────────────────────────────────
describe("TC-SEC2-E: link-setup が顧客に紐づけるのはログイン本人のメールだけ", () => {
  it("E-01: 未ログインでボディに他人のメール → 顧客なしのSetupIntent・仮登録ユーザーは作られない", async () => {
    loginAs(null);
    const targetEmail = `sec2-link-target-${ts}@test.local`;
    emails.push(targetEmail);
    mock.setupIntentParams = undefined;
    const res = await (linkSetupPOST as any)(json({ email: targetEmail }));
    expect(res.status).toBe(200);
    expect(mock.setupIntentParams.customer).toBeUndefined();
    const { data } = await testAdmin.from("provisional_users").select("email").eq("email", targetEmail).maybeSingle();
    expect(data).toBeNull();
  });

  it("E-02: ログイン中 → 本人のメールで顧客を作り紐づける", async () => {
    const myEmail = `sec2-link-me-${ts}@test.local`;
    emails.push(myEmail);
    loginAs(ownerId, myEmail);
    mock.setupIntentParams = undefined;
    await (linkSetupPOST as any)(json({ email: "someone-else@test.local" }));
    expect(mock.setupIntentParams.customer).toBe(`cus_sec2_${myEmail}`);
    const { data } = await testAdmin.from("provisional_users").select("stripe_customer_id").eq("email", myEmail).single();
    expect(data!.stripe_customer_id).toBe(`cus_sec2_${myEmail}`);
  });
});
