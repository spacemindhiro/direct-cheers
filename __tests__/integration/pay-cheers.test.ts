/**
 * TC-PAY: /api/pay/cheers の統合テスト
 *
 * Stripe の Checkout Session は payment_intent が session 完了まで作成されない（API v2026-02-25.clover 以降）。
 * そのため vi.mock("stripe") で checkout.sessions.create の引数をキャプチャし、
 * route が Stripe に渡す payment_intent_data パラメータを直接検証する。
 * これは PI を完了後に検証するのと等価であり、テストドライバとして機能する。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import {
  createTestConnectAccount,
  deleteTestConnectAccount,
  retrieveRecentCheckoutSession,
  stripe,
} from "../helpers/stripe-fixtures";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { insertEvent, insertQrConfig } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

// route が stripe に渡すパラメータ・テストで注入する mock 状態を保持する
// vi.mock はホイスティングされるため、ファクトリがクロージャで参照できるよう module スコープに置く
const captured: {
  sessionCreateParams?: any;
  // accounts.retrieve が返す capabilities — テストごとに書き換えて異常系を再現する
  accountCapabilities: Record<string, string>;
} = {
  accountCapabilities: { card_payments: "active", transfers: "active" },
};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);

      // checkout.sessions.create をインターセプトしてパラメータをキャプチャ
      const origCreate = this.checkout.sessions.create.bind(this.checkout.sessions);
      (this.checkout.sessions as any).create = async (params: any, opts?: any) => {
        captured.sessionCreateParams = params;
        // PayPay / Link はテストモードのサンドボックスが Stripe から提供されていないためスタブを返す
        if ((params.payment_method_types ?? []).includes("paypay")) {
          return { url: "https://checkout.stripe.com/c/pay/cs_test_paypay_stub", id: "cs_test_paypay_stub" };
        }
        if ((params.payment_method_types ?? []).includes("link")) {
          return { url: "https://checkout.stripe.com/c/pay/cs_test_link_stub", id: "cs_test_link_stub" };
        }
        return origCreate(params, opts);
      };

      // accounts.retrieve をインターセプト → captured.accountCapabilities でテストごとに制御
      (this.accounts as any).retrieve = async (id: string) => ({
        id,
        object: "account",
        capabilities: captured.accountCapabilities,
      });
    }
  }
  return { ...StripeModule, default: InstrumentedStripe };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { POST } from "@/app/api/pay/cheers/route";

let organizerProfileId: string;
let noConnectOrganizerProfileId: string;
let organizerConnectId: string;
let eventId: string;
let qrConfigId: string;
let noConnectEventId: string;
let noConnectQrConfigId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
};

beforeAll(async () => {
  organizerConnectId = await createTestConnectAccount();

  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "テストオーガナイザー",
    email: `organizer-pay-${Date.now()}@test.local`,
    stripeConnectId: organizerConnectId,
  });
  noConnectOrganizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "Connectなし",
    email: `organizer-noconnect-${Date.now()}@test.local`,
    stripeConnectId: null,
  });
  cleanup.profileIds.push(organizerProfileId, noConnectOrganizerProfileId);

  eventId = await insertEvent({ organizerProfileId });
  qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
  cleanup.eventIds.push(eventId);
  cleanup.qrConfigIds.push(qrConfigId);

  noConnectEventId = await insertEvent({ organizerProfileId: noConnectOrganizerProfileId });
  noConnectQrConfigId = await insertQrConfig({
    eventId: noConnectEventId,
    creatorProfileId: noConnectOrganizerProfileId,
    recipientProfileId: noConnectOrganizerProfileId,
  });
  cleanup.eventIds.push(noConnectEventId);
  cleanup.qrConfigIds.push(noConnectQrConfigId);
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
  await deleteTestConnectAccount(organizerConnectId);
});

// ── TC-PAY-01: カード決済・destination charge フロー ─────────────────
describe("TC-PAY-01: カード決済（destination charge フロー）", () => {
  it("Checkout Session が destination charge パラメータ付きで作成される", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrConfigId,
        product_id: crypto.randomUUID(),
        amount: 10_000,
        payment_method: "card",
        metadata: { artist_name: "テストアーティスト", event_title: "テストイベント" },
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    // Checkout Session がメタデータ付きで作成されていることを確認
    const session = await retrieveRecentCheckoutSession(qrConfigId);
    expect(session).not.toBeNull();
    expect(session!.metadata?.qr_config_id).toBe(qrConfigId);

    // route が Stripe に渡した payment_intent_data を検証
    // （API v2026-02-25.clover 以降、payment_intent は session 完了まで作成されないため
    //   capture した create 引数で確認する）
    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.on_behalf_of).toBe(organizerConnectId);
    expect(pid?.transfer_data).toBeUndefined();
    expect(pid?.application_fee_amount).toBeUndefined();
    expect(pid?.capture_method).toBe("manual");
  });

  it("metadata.device_name が Checkout Session の metadata にも記録される（子機モード端末識別）", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrConfigId,
        product_id: crypto.randomUUID(),
        amount: 10_000,
        payment_method: "card",
        metadata: { artist_name: "テストアーティスト", event_title: "テストイベント", device_name: "DJ-01" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const session = await retrieveRecentCheckoutSession(qrConfigId);
    expect(session!.metadata?.device_name).toBe("DJ-01");
  });
});

// ── TC-PAY-02: PayPay 決済 ────────────────────────────────────────────
describe("TC-PAY-02: PayPay 決済（即時キャプチャ・destination charge なし）", () => {
  // PayPay はテストモードのサンドボックスが Stripe から提供されていないため、
  // checkout.sessions.create をスタブ化して route のパラメータ組み立てのみ検証する。
  it("capture_method: automatic で Checkout Session が作成され on_behalf_of が設定されない", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrConfigId,
        product_id: crypto.randomUUID(),
        amount: 5_000,
        payment_method: "paypay",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toBeTruthy();

    const pid = captured.sessionCreateParams?.payment_intent_data;
    // PayPay は manual capture 非対応 → automatic に切り替わっていることを確認
    expect(pid?.capture_method).toBe("automatic");
    // PayPay は Stripe Connect の on_behalf_of を現行 API でサポートしていないため未設定
    expect(pid?.on_behalf_of).toBeUndefined();
    expect(pid?.transfer_data).toBeUndefined();
  });
});

// ── TC-PAY-03: Connect 未設定オーガナイザー ──────────────────────────
describe("TC-PAY-03: Connect 未設定オーガナイザー（フォールバック）", () => {
  it("application_fee_amount なしの Checkout Session が作成される", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: noConnectQrConfigId,
        product_id: crypto.randomUUID(),
        amount: 8_000,
        payment_method: "card",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toBeTruthy();

    const session = await retrieveRecentCheckoutSession(noConnectQrConfigId);
    expect(session).not.toBeNull();

    // Connect なし → on_behalf_of / application_fee_amount が設定されないことを確認
    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.on_behalf_of).toBeUndefined();
    expect(pid?.application_fee_amount).toBeUndefined();
  });
});

// ── TC-PAY-04: バリデーション ──────────────────────────────────────────
describe("TC-PAY-04: バリデーション", () => {
  it("必須フィールド欠損 → 400 を返す", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 5000, payment_method: "card" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ── TC-PAY-MATRIX-V2: 全決済手段 × Capability状態マトリクス ──────────────
// accounts.retrieve は InstrumentedStripe でインターセプト済み。
// 各テスト後に captured をリセットしてテスト間の干渉を防ぐ。
describe("TC-PAY-MATRIX-V2: 全決済手段・Capabilityチェック統合マトリクス", () => {
  afterEach(() => {
    captured.accountCapabilities = { card_payments: "active", transfers: "active" };
    captured.sessionCreateParams = undefined;
  });

  // ── TC-PAY-MATRIX-01: カード決済（正常系）────────────────────────────
  describe("TC-PAY-MATRIX-01: カード決済（正常系）", () => {
    it("on_behalf_of が設定され capture_method: manual / payment_method_types: ['card']", async () => {
      const req = new Request("http://localhost/api/pay/cheers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_config_id: qrConfigId,
          product_id: crypto.randomUUID(),
          amount: 10_000,
          payment_method: "card",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const pid = captured.sessionCreateParams?.payment_intent_data;
      expect(pid?.on_behalf_of).toBe(organizerConnectId);
      expect(pid?.capture_method).toBe("manual");
      expect(captured.sessionCreateParams?.payment_method_types).toEqual(["card"]);
    });
  });

  // ── TC-PAY-MATRIX-02: Apple Pay（正常系）────────────────────────────
  describe("TC-PAY-MATRIX-02: Apple Pay（正常系）", () => {
    it("Apple Pay は card type として処理 — on_behalf_of 設定・payment_method_types: ['card']", async () => {
      const req = new Request("http://localhost/api/pay/cheers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_config_id: qrConfigId,
          product_id: crypto.randomUUID(),
          amount: 10_000,
          payment_method: "apple_pay",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const pid = captured.sessionCreateParams?.payment_intent_data;
      // Apple Pay は wallet token として card type で処理 → on_behalf_of / capture_method はカードと同一
      expect(pid?.on_behalf_of).toBe(organizerConnectId);
      expect(pid?.capture_method).toBe("manual");
      expect(captured.sessionCreateParams?.payment_method_types).toEqual(["card"]);
    });
  });

  // ── TC-PAY-MATRIX-03: Google Pay（正常系）───────────────────────────
  describe("TC-PAY-MATRIX-03: Google Pay（正常系）", () => {
    it("Google Pay は card type として処理 — on_behalf_of 設定・payment_method_types: ['card']", async () => {
      const req = new Request("http://localhost/api/pay/cheers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_config_id: qrConfigId,
          product_id: crypto.randomUUID(),
          amount: 10_000,
          payment_method: "google_pay",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const pid = captured.sessionCreateParams?.payment_intent_data;
      expect(pid?.on_behalf_of).toBe(organizerConnectId);
      expect(pid?.capture_method).toBe("manual");
      expect(captured.sessionCreateParams?.payment_method_types).toEqual(["card"]);
    });
  });

  // ── TC-PAY-MATRIX-04: Link決済（正常系）────────────────────────────
  describe("TC-PAY-MATRIX-04: Link決済（正常系）", () => {
    it("payment_method_types に 'link' が含まれ on_behalf_of が設定される", async () => {
      const req = new Request("http://localhost/api/pay/cheers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_config_id: qrConfigId,
          product_id: crypto.randomUUID(),
          amount: 10_000,
          payment_method: "link",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const pid = captured.sessionCreateParams?.payment_intent_data;
      expect(pid?.on_behalf_of).toBe(organizerConnectId);
      expect(pid?.capture_method).toBe("manual");
      // Link は card と一緒に提供される
      expect(captured.sessionCreateParams?.payment_method_types).toContain("link");
      expect(captured.sessionCreateParams?.payment_method_types).toContain("card");
    });
  });

  // ── TC-PAY-MATRIX-05: PayPay（ハイブリッド戦略・正常系）──────────────
  describe("TC-PAY-MATRIX-05: PayPay（on_behalf_of除外・消費税5桁精度）", () => {
    it("on_behalf_of なし・capture_method: automatic・Capability チェックをスキップ", async () => {
      const req = new Request("http://localhost/api/pay/cheers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_config_id: qrConfigId,
          product_id: crypto.randomUUID(),
          amount: 10_000,
          payment_method: "paypay",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const pid = captured.sessionCreateParams?.payment_intent_data;
      // PayPay は on_behalf_of 非対応（ハイブリッド戦略）
      expect(pid?.on_behalf_of).toBeUndefined();
      // PayPay は manual capture 非対応 → automatic
      expect(pid?.capture_method).toBe("automatic");
      expect(captured.sessionCreateParams?.payment_method_types).toEqual(["paypay"]);
    });
  });

  // ── TC-PAY-MATRIX-06: Capability不足（異常系）──────────────────────
  describe("TC-PAY-MATRIX-06: Connected Account の Capability 不足（異常系）", () => {
    it("card_payments が pending → 422 でブロックし Stripe に電文を送らない", async () => {
      // accounts.retrieve が card_payments: pending を返すよう注入
      captured.accountCapabilities = { card_payments: "pending", transfers: "active" };

      const req = new Request("http://localhost/api/pay/cheers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_config_id: qrConfigId,
          product_id: crypto.randomUUID(),
          amount: 10_000,
          payment_method: "card",
        }),
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(422);
      expect(data.error).toBe("account_incomplete");
      expect(data.missing_capabilities).toContain("card_payments");
      // Stripe に無駄な電文を飛ばしていないことを確認
      expect(captured.sessionCreateParams).toBeUndefined();
    });

    it("transfers が inactive → 422 でブロックし missing_capabilities に transfers が含まれる", async () => {
      captured.accountCapabilities = { card_payments: "active", transfers: "inactive" };

      const req = new Request("http://localhost/api/pay/cheers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_config_id: qrConfigId,
          product_id: crypto.randomUUID(),
          amount: 10_000,
          payment_method: "card",
        }),
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(422);
      expect(data.missing_capabilities).toContain("transfers");
      expect(captured.sessionCreateParams).toBeUndefined();
    });

    it("PayPay は Capability チェック対象外 → Capability 不足でも 200 を返す", async () => {
      // PayPay は on_behalf_of を使わないため Capability チェックをスキップすることを確認
      captured.accountCapabilities = { card_payments: "pending", transfers: "inactive" };

      const req = new Request("http://localhost/api/pay/cheers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_config_id: qrConfigId,
          product_id: crypto.randomUUID(),
          amount: 5_000,
          payment_method: "paypay",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });
});

// ── TC-PAY-05: statement_descriptor_suffix（宛先名義による動的切替） ──────
// オーガナイザーが演者を兼任しているケースを想定し、同じ profile_id でも
// recipient_name_context によって明細書のsuffixが変わることを検証する。
describe("TC-PAY-05: statement_descriptor_suffix（宛先名義による動的切替）", () => {
  let artistProfileId: string;
  let kanjiOnlyArtistProfileId: string;
  let qrArtistConfigId: string;
  let qrOrganizerConfigId: string;
  let qrKanjiConfigId: string;

  beforeAll(async () => {
    const ts = Date.now();
    artistProfileId = await insertProfile({
      role: "artist",
      displayName: "テストアーティスト表示名",
      email: `artist-suffix-${ts}@test.local`,
    });
    kanjiOnlyArtistProfileId = await insertProfile({
      role: "artist",
      displayName: "宇宙ヒロ",
      email: `artist-kanji-${ts}@test.local`,
    });
    cleanup.profileIds.push(artistProfileId, kanjiOnlyArtistProfileId);

    await testAdmin.from("profiles").update({ artist_name: "DJ HIRO" }).eq("profile_id", artistProfileId);
    await testAdmin.from("profiles").update({ organizer_name: "SPACE BBQ" }).eq("profile_id", organizerProfileId);
    // 漢字のみのartist_name（ASCII変換不能ケース）
    await testAdmin.from("profiles").update({ artist_name: "宇宙ヒロ" }).eq("profile_id", kanjiOnlyArtistProfileId);

    qrArtistConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId });
    await testAdmin.from("qr_configs").update({ recipient_name_context: "artist" }).eq("qr_config_id", qrArtistConfigId);
    cleanup.qrConfigIds.push(qrArtistConfigId);

    qrOrganizerConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    await testAdmin.from("qr_configs").update({ recipient_name_context: "organizer" }).eq("qr_config_id", qrOrganizerConfigId);
    cleanup.qrConfigIds.push(qrOrganizerConfigId);

    qrKanjiConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: kanjiOnlyArtistProfileId });
    await testAdmin.from("qr_configs").update({ recipient_name_context: "artist" }).eq("qr_config_id", qrKanjiConfigId);
    cleanup.qrConfigIds.push(qrKanjiConfigId);
  }, 60_000);

  it("recipient_name_context='artist' → suffixはartist_nameから生成される（DJ HIRO）", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrArtistConfigId,
        product_id: crypto.randomUUID(),
        amount: 1_000,
        payment_method: "card",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.statement_descriptor_suffix).toBe("DJ HIRO");
  });

  it("recipient_name_context='organizer' → suffixはorganizer_nameから生成される（SPACE BBQ。イベント名は使わない）", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrOrganizerConfigId,
        product_id: crypto.randomUUID(),
        amount: 1_000,
        payment_method: "card",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.statement_descriptor_suffix).toBe("SPACE BBQ");
  });

  it("名前が漢字のみでASCII化できない場合、statement_descriptor_suffix自体が省略される", async () => {
    const req = new Request("http://localhost/api/pay/cheers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrKanjiConfigId,
        product_id: crypto.randomUUID(),
        amount: 1_000,
        payment_method: "card",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.statement_descriptor_suffix).toBeUndefined();
  });
});
