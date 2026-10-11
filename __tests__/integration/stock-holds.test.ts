/**
 * TC-STOCK: 在庫の仮押さえ（stock_holds）— 2026-10-11
 *
 * 以前はQR決済・タッチ決済からの販売を在庫に一切数えておらず、在庫上限を超えて売れた。
 *   A. 仮押さえ・確定の関数（上限・期限切れ・冪等・対象外）
 *   B. 外部（anon）から在庫の関数を呼べない
 *   C. QR決済（pay/cheers）: 人数分を仮押さえ・完売なら決済を作らない・支払い画面は30分で失効
 *   D. 決済完了（pay/complete）: 仮押さえを販売済みに移す（2回呼んでも1回分）
 *   E. タッチ決済（terminal）: 開始で仮押さえ・完了で販売済み
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile, deleteAuthUsers, insertEvent, insertProduct, insertQrConfig, insertQrConfigTargets, insertTransaction,
  ongoingEventWindow,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

const mock = {
  sessionCreateParams: undefined as any,
  sessionMetadata: {} as Record<string, string>,
  piId: "",
  piCreateParams: undefined as any,
  piMetadata: {} as Record<string, string>,
};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.checkout.sessions as any).create = async (params: any) => {
        mock.sessionCreateParams = params;
        return { id: "cs_stock_stub", url: "https://checkout.stripe.com/c/pay/cs_stock_stub" };
      };
      (this.checkout.sessions as any).retrieve = async (id: string) => ({
        id, status: "complete", payment_status: "unpaid",
        payment_intent: { id: mock.piId, status: "requires_capture", latest_charge: null },
        customer_email: "stock-buyer@test.local", customer: null, amount_total: 3000,
        payment_method_types: ["card"], metadata: mock.sessionMetadata,
      });
      (this.accounts as any).retrieve = async (id: string) => ({
        id, object: "account", capabilities: { card_payments: "active", transfers: "active" },
      });
      (this.paymentIntents as any).create = async (params: any) => {
        mock.piCreateParams = params;
        return { id: `pi_stock_${Date.now()}`, client_secret: "pi_stock_secret", metadata: params.metadata };
      };
      (this.paymentIntents as any).retrieve = async (id: string) => ({
        id, status: "requires_capture", amount: 3000, metadata: mock.piMetadata,
        latest_charge: { payment_method_details: { card_present: { fingerprint: `fp_stock_${id}` } } },
      });
    }
  }
  return { ...StripeModule, default: MockStripe };
});

const auth = { user: null as { id: string; email: string } | null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) },
    from: (t: string) => testAdmin.from(t),
  })),
  getUser: vi.fn(async () => auth.user),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastCheerNew: vi.fn(async () => {}),
  broadcastTouchpaySignup: vi.fn(async () => {}),
  broadcastTouchpayClear: vi.fn(async () => {}),
}));
vi.mock("@/lib/apple-wallet-push", () => ({ pushWalletUpdateBySerial: vi.fn(async () => {}) }));

import { POST as payCheersPOST } from "@/app/api/pay/cheers/route";
import { POST as payCompletePOST } from "@/app/api/pay/complete/route";
import { POST as terminalPiPOST } from "@/app/api/entrance/terminal/payment-intent/route";
import { POST as terminalCompletePOST } from "@/app/api/entrance/terminal/complete/route";

const ts = Date.now();
let organizerId: string;
let eventId: string;
const productIds: string[] = [];
const qrIds: string[] = [];

function json(body: unknown) {
  return new Request("http://localhost", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

async function makeProduct(p: { stockLimit: number | null; track: boolean; type?: string; paymentType?: "A" | "B" | "C" | "V" | "D"; touchpay?: boolean }) {
  const productId = await insertProduct({
    eventId, type: p.type ?? "entrance", paymentType: p.paymentType ?? "C", name: "STOCK",
    minAmount: 3000, maxAmount: 3000, trackInventory: p.track,
  });
  await testAdmin.from("products").update({ stock_limit: p.stockLimit, sold_count: 0 }).eq("product_id", productId);
  productIds.push(productId);
  const qrId = await insertQrConfig({ eventId, creatorProfileId: organizerId, recipientProfileId: organizerId, productId });
  await insertQrConfigTargets(qrId, [{ profileId: organizerId, ratio: 1 }]);
  if (p.touchpay) await testAdmin.from("qr_configs").update({ touchpay_enabled: true }).eq("qr_config_id", qrId);
  qrIds.push(qrId);
  return { productId, qrId };
}

const rpcHold = async (productId: string, qty: number, key: string, ttl = 600) =>
  (await testAdmin.rpc("hold_product_stock", { p_product_id: productId, p_quantity: qty, p_hold_key: key, p_ttl_seconds: ttl })).data;
const sold = async (productId: string) =>
  ((await testAdmin.from("products").select("sold_count").eq("product_id", productId).single()).data as { sold_count: number }).sold_count;
const holdsOf = async (productId: string) =>
  ((await testAdmin.from("stock_holds").select("hold_key, quantity").eq("product_id", productId).order("created_at")).data ?? []) as { hold_key: string; quantity: number }[];

beforeAll(async () => {
  organizerId = await insertProfile({ role: "organizer", displayName: "stock-org", email: `stock-org-${ts}@test.local`, stripeConnectId: `acct_stock_${ts}` });
  eventId = await insertEvent({ ...ongoingEventWindow(), organizerProfileId: organizerId, title: "STOCK" });
}, 60_000);

afterAll(async () => {
  const { data: txs } = await testAdmin.from("transactions").select("transaction_id").in("qr_config_id", qrIds);
  const txIds = (txs ?? []).map((t) => t.transaction_id);
  await testAdmin.from("tickets").delete().eq("event_id", eventId);
  if (txIds.length) {
    await testAdmin.from("transaction_distributions").delete().in("transaction_id", txIds);
    await testAdmin.from("transactions").delete().in("transaction_id", txIds);
  }
  await testAdmin.from("qr_config_targets").delete().in("qr_config_id", qrIds);
  await testAdmin.from("qr_configs").delete().in("qr_config_id", qrIds);
  await testAdmin.from("products").delete().in("product_id", productIds); // stock_holds は CASCADE
  await testAdmin.from("provisional_users").delete().like("email", "stock-%@test.local");
  await testAdmin.from("events").delete().eq("event_id", eventId);
  await deleteAuthUsers([organizerId]);
});

// ── A ──────────────────────────────────────────────────────────────────
describe("TC-STOCK-A: 仮押さえ・確定の関数", () => {
  it("A-01: 上限2に2人分 → held、続く1人分 → sold_out", async () => {
    const { productId } = await makeProduct({ stockLimit: 2, track: true });
    expect(await rpcHold(productId, 2, `a01-1-${ts}`)).toBe("held");
    expect(await rpcHold(productId, 1, `a01-2-${ts}`)).toBe("sold_out");
    expect(await holdsOf(productId)).toEqual([{ hold_key: `a01-1-${ts}`, quantity: 2 }]);
  });

  it("A-02: 期限切れの仮押さえは数えない", async () => {
    const { productId } = await makeProduct({ stockLimit: 1, track: true });
    expect(await rpcHold(productId, 1, `a02-1-${ts}`)).toBe("held");
    await testAdmin.from("stock_holds").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("hold_key", `a02-1-${ts}`);
    expect(await rpcHold(productId, 1, `a02-2-${ts}`)).toBe("held");
  });

  it("A-03: 確定で販売済みに移る。2回確定しても1回分", async () => {
    const { productId } = await makeProduct({ stockLimit: 5, track: true });
    await rpcHold(productId, 3, `a03-${ts}`);
    await testAdmin.rpc("commit_product_stock", { p_hold_key: `a03-${ts}` });
    await testAdmin.rpc("commit_product_stock", { p_hold_key: `a03-${ts}` });
    expect(await sold(productId)).toBe(3);
    expect(await holdsOf(productId)).toEqual([]);
  });

  it("A-04: 上限なし・在庫管理オフは対象外（unlimited・仮押さえを作らない）", async () => {
    const noLimit = await makeProduct({ stockLimit: null, track: true });
    const trackOff = await makeProduct({ stockLimit: 1, track: false });
    expect(await rpcHold(noLimit.productId, 5, `a04-1-${ts}`)).toBe("unlimited");
    expect(await rpcHold(trackOff.productId, 5, `a04-2-${ts}`)).toBe("unlimited");
    expect(await holdsOf(noLimit.productId)).toEqual([]);
    expect(await holdsOf(trackOff.productId)).toEqual([]);
  });

  it("A-05: 前売りAの即時確保（reserve_product_stock）も有効な仮押さえを残数に含める", async () => {
    const { productId } = await makeProduct({ stockLimit: 1, track: true, paymentType: "A" });
    await rpcHold(productId, 1, `a05-${ts}`);
    expect((await testAdmin.rpc("reserve_product_stock", { p_product_id: productId })).data).toBe(false);
    expect(await sold(productId)).toBe(0);
  });
});

// ── B ──────────────────────────────────────────────────────────────────
describe("TC-STOCK-B: 外部（公開鍵）から在庫の関数を呼べない", () => {
  const someProduct = () => productIds[0] ?? "00000000-0000-0000-0000-000000000000";
  it.each([
    ["reserve_product_stock", () => ({ p_product_id: someProduct() })],
    ["hold_product_stock", () => ({ p_product_id: someProduct(), p_quantity: 1, p_hold_key: "x", p_ttl_seconds: 60 })],
    ["commit_product_stock", () => ({ p_hold_key: "x" })],
  ] as const)("%s → 権限なし（42501）", async (fn, args) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const before = productIds[0] ? await sold(productIds[0]) : null;
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: JSON.stringify(args()),
    });
    expect((await res.json()).code).toBe("42501");
    if (before !== null) expect(await sold(productIds[0])).toBe(before);
  });
});

// ── C ──────────────────────────────────────────────────────────────────
describe("TC-STOCK-C: QR決済（pay/cheers）", () => {
  const pay = (qrId: string, productId: string, quantity: number) =>
    payCheersPOST(json({ qr_config_id: qrId, product_id: productId, amount: 3000, quantity, payment_method: "card", customer_email: `stock-c-${ts}@test.local` }));

  it("C-01: 上限3に2人分 → 仮押さえ2・支払い画面は30分で失効・合言葉キーがmetadataに載る", async () => {
    const { productId, qrId } = await makeProduct({ stockLimit: 3, track: true });
    mock.sessionCreateParams = undefined;
    const startedAt = Math.floor(Date.now() / 1000);
    const res = await pay(qrId, productId, 2);
    expect(res.status).toBe(200);
    const holds = await holdsOf(productId);
    expect(holds).toEqual([{ hold_key: mock.sessionCreateParams.metadata.stock_hold_key, quantity: 2 }]);
    expect(mock.sessionCreateParams.expires_at - startedAt).toBeGreaterThanOrEqual(30 * 60);
    expect(mock.sessionCreateParams.expires_at - startedAt).toBeLessThanOrEqual(30 * 60 + 5);
    expect(await sold(productId)).toBe(0);

    // 残り1に2人分 → 完売・決済を作らない
    mock.sessionCreateParams = undefined;
    const res2 = await pay(qrId, productId, 2);
    expect(res2.status).toBe(409);
    expect((await res2.json()).reason).toBe("sold_out");
    expect(mock.sessionCreateParams).toBeUndefined();
  });

  it("C-02: 在庫管理対象外の商品は仮押さえせず、支払い画面の期限も変えない", async () => {
    const { productId, qrId } = await makeProduct({ stockLimit: null, track: true });
    mock.sessionCreateParams = undefined;
    expect((await pay(qrId, productId, 1)).status).toBe(200);
    expect(mock.sessionCreateParams.expires_at).toBeUndefined();
    expect(mock.sessionCreateParams.metadata.stock_hold_key).toBeUndefined();
    expect(await holdsOf(productId)).toEqual([]);
  });
});

// ── D ──────────────────────────────────────────────────────────────────
describe("TC-STOCK-D: 決済完了（pay/complete）で販売済みに移る", () => {
  it("D-01: 完了で sold_count が人数分増え、仮押さえが消える。2回呼んでも1回分", async () => {
    const { productId, qrId } = await makeProduct({ stockLimit: 5, track: true });
    await rpcHold(productId, 2, `d01-${ts}`);
    mock.piId = `pi_stock_d01_${ts}`;
    mock.sessionMetadata = { qr_config_id: qrId, product_id: productId, quantity: "2", stock_hold_key: `d01-${ts}` };
    // 既存取引あり（冪等パス）でも在庫の確定は行われる
    await insertTransaction({ qrConfigId: qrId, grossAmount: 6000, netAmount: 5000, stripeFee: 300, platformFee: 600, stripePaymentIntentId: mock.piId });

    const r1 = await payCompletePOST(json({ session_id: `cs_stock_d01_${ts}` }));
    expect(r1.status).toBe(200);
    const r2 = await payCompletePOST(json({ session_id: `cs_stock_d01_${ts}` }));
    expect(r2.status).toBe(200);
    expect(await sold(productId)).toBe(2);
    expect(await holdsOf(productId)).toEqual([]);
  });
});

// ── E ──────────────────────────────────────────────────────────────────
describe("TC-STOCK-E: タッチ決済（terminal）", () => {
  it("E-01: 開始で人数分を仮押さえ（PIのmetadataに載る）、完了で販売済み", async () => {
    const { productId } = await makeProduct({ stockLimit: 4, track: true, touchpay: true });
    const deviceId = crypto.randomUUID();
    const { error: devErr } = await testAdmin.from("display_devices").insert({ event_id: eventId, device_id: deviceId, device_name: "STOCK子機" });
    expect(devErr).toBeNull();
    auth.user = { id: organizerId, email: `stock-org-${ts}@test.local` };

    const res = await terminalPiPOST(json({ product_id: productId, quantity: 3, target_device_id: deviceId }));
    expect(res.status).toBe(200);
    const key = mock.piCreateParams.metadata.stock_hold_key;
    expect(await holdsOf(productId)).toEqual([{ hold_key: key, quantity: 3 }]);

    // 残り1に2人分 → 完売
    const res2 = await terminalPiPOST(json({ product_id: productId, quantity: 2, target_device_id: deviceId }));
    expect(res2.status).toBe(409);

    mock.piMetadata = { ...mock.piCreateParams.metadata };
    const done = await terminalCompletePOST(json({ payment_intent_id: `pi_stock_e01_${ts}` }));
    expect(done.status).toBe(200);
    expect(await sold(productId)).toBe(3);
    expect(await holdsOf(productId)).toEqual([]);

    await testAdmin.from("display_devices").delete().eq("device_id", deviceId);
    auth.user = null;
  });
});
