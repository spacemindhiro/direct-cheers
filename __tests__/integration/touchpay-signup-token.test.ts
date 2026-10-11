/**
 * TC-TPS: タッチ決済後のサインアップQR（使い切り合言葉）とウォレットのパスの本人確認（2026-10-11）
 *
 *   A. 決済完了 → 合言葉を発行し、公開チャンネルには中身を載せない／子機はログイン済みで取得
 *   B. 最初に開いたブラウザ専用・30日有効・紐付けは1回だけ
 *   C. ログインリンクを別ブラウザで開いた場合（入力したメールで照合）
 *   D. ウォレットのパス（入場チケット・Cheersカード）は持ち主か決済した本人だけ
 *   E. アカウント復旧（金額＋日付）機能は削除済み
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { existsSync } from "fs";
import path from "path";
import {
  insertProfile, deleteAuthUsers, insertEvent, insertProduct, insertQrConfig, ongoingEventWindow,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

// ── 模擬：ブラウザごとの Cookie と、ログイン中のユーザー ─────────────────────
const browser = { jar: {} as Record<string, string> };
const auth = { user: null as { id: string; email: string } | null };

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name in browser.jar ? { name, value: browser.jar[name] } : undefined),
    getAll: () => Object.entries(browser.jar).map(([name, value]) => ({ name, value })),
  })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) },
    from: (t: string) => testAdmin.from(t),
  })),
  getUser: vi.fn(async () => auth.user),
}));

const broadcasts: unknown[][] = [];
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastCheerNew: vi.fn(async () => {}),
  broadcastTouchpaySignup: vi.fn(async (...args: unknown[]) => { broadcasts.push(args); }),
  broadcastTouchpayClear: vi.fn(async () => {}),
}));
vi.mock("@/lib/apple-wallet-push", () => ({ pushWalletUpdateBySerial: vi.fn(async () => {}) }));
vi.mock("@/lib/apple-pass-generator", () => ({
  generatePassBuffer: vi.fn(async () => Buffer.from("pkpass-cheers")),
  generateTicketPassBuffer: vi.fn(async () => Buffer.from("pkpass-ticket")),
}));

const stripeMock = {
  piMetadata: {} as Record<string, string>,
  fingerprint: "",
  sessions: {} as Record<string, string>,
};
vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.paymentIntents as any).retrieve = async (id: string) => ({
        id, status: "requires_capture", amount: 3000, metadata: stripeMock.piMetadata,
        latest_charge: { payment_method_details: { card_present: { fingerprint: stripeMock.fingerprint } } },
      });
      (this.paymentIntents as any).capture = async (id: string) => ({ id, status: "succeeded" });
      (this.checkout.sessions as any).retrieve = async (id: string) => {
        const pi = stripeMock.sessions[id];
        if (!pi) throw Object.assign(new Error("No such checkout.session"), { type: "StripeInvalidRequestError" });
        return { id, payment_intent: pi };
      };
    }
  }
  return { ...StripeModule, default: MockStripe };
});

import { POST as terminalCompletePOST } from "@/app/api/entrance/terminal/complete/route";
import { GET as displayTokenGET } from "@/app/api/events/[eventId]/touchpay-signup/route";
import { POST as openPOST } from "@/app/api/entrance/touchpay-signup/[token]/open/route";
import { POST as bindPOST } from "@/app/api/entrance/touchpay-signup/[token]/bind/route";
import { POST as reconcilePOST } from "@/app/api/entrance/touchpay-signup/[token]/reconcile/route";
import { GET as walletTicketGET } from "@/app/api/wallet/ticket/[ticketId]/route";
import { GET as walletPassGET } from "@/app/api/wallet/pass/[transactionId]/route";
import { SIGNUP_DEVICE_COOKIE } from "@/lib/touchpay-signup-token";

const ts = Date.now();
let organizerId: string;
let otherOrgId: string;
let customerId: string;
let customerEmail: string;
let strangerId: string;
let eventId: string;
let productId: string;
let qrId: string;
const ticketIds: string[] = [];

function json(body: unknown) {
  return new Request("http://localhost", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
const tokenParams = (token: string) => ({ params: Promise.resolve({ token }) });

/** 別々のスマホ（ブラウザ）を切り替える */
const phones: Record<string, Record<string, string>> = {};
function usePhone(name: string) {
  phones[name] ??= {};
  browser.jar = phones[name];
}
function login(user: { id: string; email: string } | null) {
  auth.user = user;
}

/** 親機でタッチ決済を完了し、発行された合言葉を返す */
async function touchPay(): Promise<{ ticketId: string; token: string }> {
  login({ id: organizerId, email: `tps-org-${ts}@test.local` });
  usePhone("staff");
  stripeMock.fingerprint = `fp_tps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  stripeMock.piMetadata = { product_id: productId, event_id: eventId, qr_config_id: qrId, quantity: "1", target_device_id: "display-1" };
  const res = await terminalCompletePOST(json({ payment_intent_id: `pi_tps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }));
  const data = await res.json();
  expect(res.status).toBe(200);
  ticketIds.push(data.ticket_id);

  const tokenRes = await displayTokenGET(new Request(`http://localhost/api/events/${eventId}/touchpay-signup?device_id=display-1`), { params: Promise.resolve({ eventId }) });
  const { token } = await tokenRes.json();
  expect(token).toMatch(/^[0-9a-f-]{36}$/);
  login(null);
  return { ticketId: data.ticket_id, token };
}

async function holderOf(ticketId: string) {
  const { data } = await testAdmin.from("tickets").select("holder_profile_id").eq("ticket_id", ticketId).single();
  return (data as { holder_profile_id: string | null }).holder_profile_id;
}

beforeAll(async () => {
  organizerId = await insertProfile({ role: "organizer", displayName: "tps-org", email: `tps-org-${ts}@test.local` });
  otherOrgId = await insertProfile({ role: "organizer", displayName: "tps-other", email: `tps-other-${ts}@test.local` });
  customerEmail = `tps-customer-${ts}@test.local`;
  customerId = await insertProfile({ role: "user", displayName: "tps-customer", email: customerEmail });
  strangerId = await insertProfile({ role: "user", displayName: "tps-stranger", email: `tps-stranger-${ts}@test.local` });
  eventId = await insertEvent({ ...ongoingEventWindow(), organizerProfileId: organizerId, title: "TPS" });
  productId = await insertProduct({ eventId, type: "entrance", paymentType: "C", name: "当日券", minAmount: 3000, maxAmount: 3000 });
  qrId = await insertQrConfig({ eventId, creatorProfileId: organizerId, recipientProfileId: organizerId, productId });
  await testAdmin.from("qr_configs").update({ touchpay_enabled: true }).eq("qr_config_id", qrId);
}, 60_000);

afterAll(async () => {
  await testAdmin.from("touchpay_signup_tokens").delete().eq("event_id", eventId);
  const { data: txs } = await testAdmin.from("transactions").select("transaction_id").eq("qr_config_id", qrId);
  const txIds = (txs ?? []).map((t) => t.transaction_id);
  await testAdmin.from("tickets").delete().eq("event_id", eventId);
  if (txIds.length) {
    await testAdmin.from("transaction_distributions").delete().in("transaction_id", txIds);
    await testAdmin.from("transactions").delete().in("transaction_id", txIds);
  }
  await testAdmin.from("qr_config_targets").delete().eq("qr_config_id", qrId);
  await testAdmin.from("qr_configs").delete().eq("qr_config_id", qrId);
  await testAdmin.from("products").delete().eq("product_id", productId);
  await testAdmin.from("events").delete().eq("event_id", eventId);
  await deleteAuthUsers([organizerId, otherOrgId, customerId, strangerId]);
});

// ── A ──────────────────────────────────────────────────────────────────
describe("TC-TPS-A: 合言葉は公開チャンネルに載せず、子機がログイン済みで取りに行く", () => {
  it("A-01: 放送は合図と人数だけ（チケットIDも合言葉も含まない）", async () => {
    broadcasts.length = 0;
    const { ticketId, token } = await touchPay();
    expect(broadcasts).toEqual([[eventId, 1, "display-1"]]);
    expect(JSON.stringify(broadcasts)).not.toContain(ticketId);
    expect(JSON.stringify(broadcasts)).not.toContain(token);
  });

  it("A-02: 子機の取得APIは未ログイン401・別の主催者403", async () => {
    login(null);
    const req = () => new Request(`http://localhost/api/events/${eventId}/touchpay-signup?device_id=display-1`);
    expect((await displayTokenGET(req(), { params: Promise.resolve({ eventId }) })).status).toBe(401);
    login({ id: otherOrgId, email: `tps-other-${ts}@test.local` });
    expect((await displayTokenGET(req(), { params: Promise.resolve({ eventId }) })).status).toBe(403);
    login(null);
  });

  it("A-03: お客様が開いた後は、子機の取得APIはその合言葉を返さない", async () => {
    const { token } = await touchPay();
    usePhone(`a03-customer-${ts}`);
    expect((await openPOST(json({}), tokenParams(token))).status).toBe(200);
    login({ id: organizerId, email: `tps-org-${ts}@test.local` });
    const res = await displayTokenGET(new Request(`http://localhost/api/events/${eventId}/touchpay-signup?device_id=display-1`), { params: Promise.resolve({ eventId }) });
    expect((await res.json()).token).toBeNull();
    login(null);
  });
});

// ── B ──────────────────────────────────────────────────────────────────
describe("TC-TPS-B: 最初に開いたスマホ専用・30日有効・1回だけ", () => {
  it("B-01: 最初に開いたスマホはOK（端末キーのCookieが付く）、同じスマホの再表示もOK", async () => {
    const { token } = await touchPay();
    usePhone(`b01-${ts}`);
    const first = await openPOST(json({}), tokenParams(token));
    expect(first.status).toBe(200);
    const key = first.cookies.get(SIGNUP_DEVICE_COOKIE)?.value;
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    browser.jar[SIGNUP_DEVICE_COOKIE] = key!;
    const again = await openPOST(json({}), tokenParams(token));
    expect(again.status).toBe(200);
  });

  it("B-02: 横から読んだ別のスマホ（写真など）は opened_elsewhere・紐付けもできない", async () => {
    const { ticketId, token } = await touchPay();
    usePhone(`b02-customer-${ts}`);
    const opened = await openPOST(json({}), tokenParams(token));
    browser.jar[SIGNUP_DEVICE_COOKIE] = opened.cookies.get(SIGNUP_DEVICE_COOKIE)!.value;

    usePhone(`b02-stranger-${ts}`);
    const res = await openPOST(json({}), tokenParams(token));
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("opened_elsewhere");

    login({ id: strangerId, email: `tps-stranger-${ts}@test.local` });
    const claim = await reconcilePOST(json({}), tokenParams(token));
    expect(claim.status).toBe(409);
    expect(await holderOf(ticketId)).toBeNull();
    login(null);
  });

  it("B-03: 開いたスマホでログイン済みなら、その場で紐付く（翌日でも可）", async () => {
    const { ticketId, token } = await touchPay();
    usePhone(`b03-${ts}`);
    const opened = await openPOST(json({}), tokenParams(token));
    browser.jar[SIGNUP_DEVICE_COOKIE] = opened.cookies.get(SIGNUP_DEVICE_COOKIE)!.value;
    // 翌日（有効期限は30日）
    await testAdmin.from("touchpay_signup_tokens").update({ created_at: new Date(Date.now() - 24 * 3600_000).toISOString() }).eq("token", token);

    login({ id: customerId, email: customerEmail });
    const res = await reconcilePOST(json({}), tokenParams(token));
    expect(res.status).toBe(200);
    expect((await res.json()).ticket_id).toBe(ticketId);
    expect(await holderOf(ticketId)).toBe(customerId);

    // 同じ本人の再読込は成功扱い、別人は used
    expect((await reconcilePOST(json({}), tokenParams(token))).status).toBe(200);
    login({ id: strangerId, email: `tps-stranger-${ts}@test.local` });
    const other = await reconcilePOST(json({}), tokenParams(token));
    expect((await other.json()).reason).toBe("used");
    login(null);
  });

  it("B-04: 30日を過ぎた合言葉は開けない", async () => {
    const { token } = await touchPay();
    await testAdmin.from("touchpay_signup_tokens").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("token", token);
    usePhone(`b04-${ts}`);
    const res = await openPOST(json({}), tokenParams(token));
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("expired");
  });

  it("B-05: 発行時の有効期限は30日", async () => {
    const { token } = await touchPay();
    const { data } = await testAdmin.from("touchpay_signup_tokens").select("created_at, expires_at").eq("token", token).single();
    const days = (new Date(data!.expires_at).getTime() - new Date(data!.created_at).getTime()) / 86400_000;
    expect(Math.round(days)).toBe(30);
  });

  it("B-06: 旧形式のURL（チケットIDそのもの）では開けない", async () => {
    const { ticketId } = await touchPay();
    usePhone(`b06-${ts}`);
    const res = await openPOST(json({}), tokenParams(ticketId));
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("invalid");
  });
});

// ── C ──────────────────────────────────────────────────────────────────
describe("TC-TPS-C: ログインリンクを別ブラウザ（メールアプリ内など）で開いた場合", () => {
  it("C-01: 開いたスマホで入力したメールでログインすれば、別ブラウザでも紐付く", async () => {
    const { ticketId, token } = await touchPay();
    usePhone(`c01-safari-${ts}`);
    const opened = await openPOST(json({}), tokenParams(token));
    browser.jar[SIGNUP_DEVICE_COOKIE] = opened.cookies.get(SIGNUP_DEVICE_COOKIE)!.value;
    expect((await bindPOST(json({ email: customerEmail.toUpperCase() }), tokenParams(token))).status).toBe(200);

    usePhone(`c01-mailapp-${ts}`); // 端末キーを持たないブラウザ
    login({ id: customerId, email: customerEmail });
    const res = await reconcilePOST(json({}), tokenParams(token));
    expect(res.status).toBe(200);
    expect(await holderOf(ticketId)).toBe(customerId);
    login(null);
  });

  it("C-02: 別のメールでログインした人は other_email・紐付かない", async () => {
    const { ticketId, token } = await touchPay();
    usePhone(`c02-safari-${ts}`);
    const opened = await openPOST(json({}), tokenParams(token));
    browser.jar[SIGNUP_DEVICE_COOKIE] = opened.cookies.get(SIGNUP_DEVICE_COOKIE)!.value;
    await bindPOST(json({ email: customerEmail }), tokenParams(token));

    usePhone(`c02-other-${ts}`);
    login({ id: strangerId, email: `tps-stranger-${ts}@test.local` });
    const res = await reconcilePOST(json({}), tokenParams(token));
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("other_email");
    expect(await holderOf(ticketId)).toBeNull();
    login(null);
  });

  it("C-03: 開いていないスマホからはメールを入力できない", async () => {
    const { token } = await touchPay();
    usePhone(`c03-customer-${ts}`);
    const opened = await openPOST(json({}), tokenParams(token));
    browser.jar[SIGNUP_DEVICE_COOKIE] = opened.cookies.get(SIGNUP_DEVICE_COOKIE)!.value;

    usePhone(`c03-stranger-${ts}`);
    const res = await bindPOST(json({ email: `tps-stranger-${ts}@test.local` }), tokenParams(token));
    expect(res.status).toBe(409);
    const { data } = await testAdmin.from("touchpay_signup_tokens").select("bound_email").eq("token", token).single();
    expect(data!.bound_email).toBeNull();
  });
});

// ── D ──────────────────────────────────────────────────────────────────
describe("TC-TPS-D: ウォレットのパスは持ち主か決済した本人だけ", () => {
  let ticketId: string;
  let txId: string;
  const sessionId = `cs_tps_wallet_${ts}`;

  beforeAll(async () => {
    ({ ticketId } = await touchPay());
    const { data: t } = await testAdmin.from("tickets").select("transaction_id").eq("ticket_id", ticketId).single();
    txId = t!.transaction_id;
    const { data: tx } = await testAdmin.from("transactions").select("stripe_payment_intent_id").eq("transaction_id", txId).single();
    stripeMock.sessions[sessionId] = tx!.stripe_payment_intent_id;
    await testAdmin.from("tickets").update({ holder_profile_id: customerId }).eq("ticket_id", ticketId);
    await testAdmin.from("transactions").update({ sender_profile_id: customerId }).eq("transaction_id", txId);
  });

  const ticketReq = (q = "") => walletTicketGET(new Request(`http://localhost/api/wallet/ticket/${ticketId}${q}`), { params: Promise.resolve({ ticketId }) });
  const passReq = (q = "") => walletPassGET(new Request(`http://localhost/api/wallet/pass/${txId}${q}`), { params: Promise.resolve({ transactionId: txId }) });

  it("D-01: チケットIDだけ（未ログイン）→ 入場パスは404", async () => {
    login(null);
    expect((await ticketReq()).status).toBe(404);
  });

  it("D-02: 持ち主以外のログイン → 404", async () => {
    login({ id: strangerId, email: `tps-stranger-${ts}@test.local` });
    expect((await ticketReq()).status).toBe(404);
    login(null);
  });

  it("D-03: 持ち主のログイン → 200", async () => {
    login({ id: customerId, email: customerEmail });
    const res = await ticketReq();
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("pkpass-ticket");
    login(null);
  });

  it("D-04: 決済した本人の session_id → 200、他人の決済の session_id → 404", async () => {
    login(null);
    expect((await ticketReq(`?session_id=${sessionId}`)).status).toBe(200);
    stripeMock.sessions[`cs_tps_other_${ts}`] = "pi_someone_else";
    expect((await ticketReq(`?session_id=cs_tps_other_${ts}`)).status).toBe(404);
  });

  it("D-05: Cheersカードのパスも同じ（IDだけ404・送り主200・session_id 200）", async () => {
    login(null);
    expect((await passReq()).status).toBe(404);
    expect((await passReq(`?session_id=${sessionId}`)).status).toBe(200);
    login({ id: customerId, email: customerEmail });
    expect((await passReq()).status).toBe(200);
    login({ id: strangerId, email: `tps-stranger-${ts}@test.local` });
    expect((await passReq()).status).toBe(404);
    login(null);
  });
});

// ── E ──────────────────────────────────────────────────────────────────
describe("TC-TPS-E: アカウント復旧（金額＋日付）機能は削除済み", () => {
  it.each([
    "app/api/account/recover/route.ts",
    "app/account/recover/page.tsx",
    "app/account/recover-complete/page.tsx",
    "app/api/account/device-token/route.ts",
  ])("%s が無い", (file) => {
    expect(existsSync(path.resolve(__dirname, "../..", file))).toBe(false);
  });
});
