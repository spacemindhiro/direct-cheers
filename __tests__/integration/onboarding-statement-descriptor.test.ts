/**
 * TC-ONB-SD: /api/stripe/connect/onboarding の statement_descriptor 送信仕様を検証する
 *
 * 仕様（2026-10-16 JCB審査の照合先が「連結アカウントの登録サイトの名称」と確定して変更）:
 * - 静的statement_descriptorのASCII欄: 新規作成時は本人の名前
 *   （buildAccountStaticDescriptor。本名・会社名は使わない）。既存アカウントの更新時は
 *   送らない（運営が手修正した値を上書きしないため）。
 * - 漢字/カナ欄: 全アカウント固定（PLATFORM_STATIC_DESCRIPTOR / _KANA）。
 * - prefix（動的suffixと結合されるベース表記）: 常に固定 PLATFORM_PREFIX。
 *   ユーザーによるカスタマイズは一切許可しない（従来どおり）。
 *   descriptor更新時のprefix自動上書き対策として、作成・更新の両パスで
 *   必ず同一コールで明示送信する。
 *
 * Stripe呼び出し（accounts.create / accounts.update / accountLinks.create）は
 * モックして送信パラメータを直接検証する（実際のExpressアカウント作成は
 * KYC項目が多く本テストの目的に対して過剰なため）。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";
import {
  PLATFORM_PREFIX,
  PLATFORM_STATIC_DESCRIPTOR,
  PLATFORM_STATIC_DESCRIPTOR_KANA,
} from "@/lib/statement-descriptor";

const captured: {
  accountCreateParams?: any;
  accountUpdateParams?: any;
  accountUpdateId?: string;
} = {};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.accounts as any).create = async (params: any) => {
        captured.accountCreateParams = params;
        return { id: `acct_test_onb_${Date.now()}`, object: "account" };
      };
      (this.accounts as any).update = async (id: string, params: any) => {
        captured.accountUpdateId = id;
        captured.accountUpdateParams = params;
        return { id, object: "account" };
      };
      (this.accountLinks as any).create = async (params: any) => ({
        url: "https://connect.stripe.com/setup/c/acct_test_onb_stub",
        object: "account_link",
      });
    }
  }
  return { ...StripeModule, default: InstrumentedStripe };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as onboardingPOST } from "@/app/api/stripe/connect/onboarding/route";

const cleanup = { profileIds: [] as string[] };

function mockAuth(userId: string) {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId, email: "test@test.local" } }, error: null }),
    },
    from: vi.fn((table: string) => testAdmin.from(table)),
  });
}

function makeReq(body: Record<string, any>): Request {
  return new Request("http://localhost/api/stripe/connect/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectCreateDescriptors(payments: any, expectedAscii: string) {
  expect(payments.statement_descriptor).toBe(expectedAscii);
  expectFixedDescriptors(payments);
}

// 漢字/カナ欄とprefix（作成・更新の両パス共通で固定）
function expectFixedDescriptors(payments: any) {
  expect(payments.statement_descriptor_kanji).toBe(PLATFORM_STATIC_DESCRIPTOR);
  expect(payments.statement_descriptor_kana).toBe(PLATFORM_STATIC_DESCRIPTOR_KANA);
  expect(payments.statement_descriptor_prefix).toBe(PLATFORM_PREFIX);
  expect(payments.statement_descriptor_prefix_kanji).toBe(PLATFORM_PREFIX);
}

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

afterEach(() => {
  captured.accountCreateParams = undefined;
  captured.accountUpdateParams = undefined;
  captured.accountUpdateId = undefined;
});

// ── TC-ONB-SD-01: 新規アカウント作成時の静的表記とprefix ──────────────────
describe("TC-ONB-SD-01: 新規Connectアカウント作成時の statement_descriptor 送信内容", () => {
  async function freshProfile(
    label: string,
    opts: { role?: "organizer" | "artist"; displayName?: string; names?: Record<string, string | null> } = {},
  ): Promise<string> {
    const id = await insertProfile({
      role: opts.role ?? "organizer",
      displayName: opts.displayName ?? `テスト主催者${label}`,
      email: `org-onb-${label}-${Date.now()}@test.local`,
    });
    cleanup.profileIds.push(id);
    if (opts.names) {
      const { error } = await testAdmin.from("profiles").update(opts.names).eq("profile_id", id);
      if (error) throw new Error(error.message);
    }
    return id;
  }

  it("個人: 本名ではなく主催者名（英字）がASCII欄に入る", async () => {
    const profileId = await freshProfile("indiv", { names: { organizer_name: "Night Rainbow" } });
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({
      business_type: "individual",
      first_name: "Taro", last_name: "Yamada",
      first_name_kanji: "太郎", last_name_kanji: "山田",
      first_name_kana: "タロウ", last_name_kana: "ヤマダ",
    }));
    expect(res.status).toBe(200);
    expectCreateDescriptors(captured.accountCreateParams?.settings?.payments, "NIGHT RAINBOW");
  }, 15_000);

  it("法人: 会社名ではなく主催者名の英字上書き（organizer_name_ascii）が入る", async () => {
    const profileId = await freshProfile("comp", { names: { organizer_name: "三本樫", organizer_name_ascii: "Three Oak" } });
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({
      business_type: "company",
      business_name: "SPACEMIND",
      company_name_kanji: "スペースマインド合同会社",
      company_name_kana: "スペースマインドゴウドウガイシャ",
    }));
    expect(res.status).toBe(200);
    expectCreateDescriptors(captured.accountCreateParams?.settings?.payments, "THREE OAK");
  }, 15_000);

  it("artist: artist_name_ascii が organizer側より優先される", async () => {
    const profileId = await freshProfile("artist", {
      role: "artist", displayName: "たけひで",
      names: { artist_name: "Natural Frequency", artist_name_ascii: "Natural Frequency", organizer_name: "Other Org" },
    });
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({ business_type: "individual" }));
    expect(res.status).toBe(200);
    expectCreateDescriptors(captured.accountCreateParams?.settings?.payments, "NATURAL FREQUENCY");
  }, 15_000);

  it("名前が漢字だけならフォールバックの PLATFORM_STATIC_DESCRIPTOR", async () => {
    const profileId = await freshProfile("kanji", { role: "artist", displayName: "御影理充", names: { artist_name: "御影理充" } });
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({ business_type: "individual" }));
    expect(res.status).toBe(200);
    expectCreateDescriptors(captured.accountCreateParams?.settings?.payments, PLATFORM_STATIC_DESCRIPTOR);
  }, 15_000);

  it("店舗名（business_profile.name）にdisplay_nameが設定される", async () => {
    const profileId = await freshProfile("bpname");
    mockAuth(profileId);
    await onboardingPOST(makeReq({
      business_type: "individual",
      first_name: "Taro", last_name: "Yamada",
    }));
    expect(captured.accountCreateParams?.business_profile?.name).toContain("テスト主催者bpname");
  }, 15_000);

  it("氏名が無くても、名前の列が無ければdisplay_name（英字）から作る", async () => {
    const profileId = await freshProfile("empty", { displayName: "Gossiy Live" });
    mockAuth(profileId);
    await onboardingPOST(makeReq({ business_type: "individual" }));
    expectCreateDescriptors(captured.accountCreateParams?.settings?.payments, "GOSSIY LIVE");
  }, 15_000);

  // 2026-08-07: payout_schedule未指定だとStripeのデフォルト(自動・毎週)のまま
  // 作成され、「出金管理」機能を使わずにStripeが勝手に銀行へ自動出金してしまう
  // 不具合が本番で発生した。新規作成時に必ずmanualを明示する回帰テスト。
  it("payout_scheduleは常にmanual（Stripeの自動出金を無効化）", async () => {
    const profileId = await freshProfile("payoutsched");
    mockAuth(profileId);
    await onboardingPOST(makeReq({ business_type: "individual" }));
    expect(captured.accountCreateParams?.settings?.payouts?.schedule?.interval).toBe("manual");
  }, 15_000);

  // 2026-08-10: link_paymentsを明示リクエストしていなかったため、Stripe側の
  // 自動付与に任せることになり付与有無がアカウントごとにばらついていた
  // (本番20アカウント中5件で未付与、うち1件はcard_paymentsは正常なのに
  // link_paymentsだけ丸ごと欠落)。決済画面でLinkの選択肢が出ない不具合として
  // 発覚・修正。新規作成時に必ずリクエストする回帰テスト。
  it("capabilitiesにlink_paymentsが常にrequested:trueで含まれる", async () => {
    const profileId = await freshProfile("linkcap");
    mockAuth(profileId);
    await onboardingPOST(makeReq({ business_type: "individual" }));
    expect(captured.accountCreateParams?.capabilities?.link_payments).toEqual({ requested: true });
  }, 15_000);
});

// ── TC-ONB-SD-02: 既存アカウントの再編集時 ──────────────────────────────
describe("TC-ONB-SD-02: 既存Connectアカウントの再編集時の stripe.accounts.update 送信内容", () => {
  let profileId: string;
  const existingConnectId = "acct_test_onb_existing_001";

  beforeAll(async () => {
    const ts = Date.now();
    profileId = await insertProfile({
      role: "organizer", displayName: "既存主催者オンボーディング", email: `org-onb-existing-${ts}@test.local`,
      stripeConnectId: existingConnectId,
    });
    cleanup.profileIds.push(profileId);
  }, 30_000);

  it("氏名付き再送信でもASCII欄は送らない（手修正の値を守る）。漢字/カナ・prefixは同一コールで再送される", async () => {
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({
      business_type: "individual",
      first_name: "Taro", last_name: "Yamada",
      first_name_kanji: "太郎", last_name_kanji: "山田",
    }));
    expect(res.status).toBe(200);

    expect(captured.accountUpdateId).toBe(existingConnectId);
    expectFixedDescriptors(captured.accountUpdateParams?.settings?.payments);
    expect("statement_descriptor" in captured.accountUpdateParams.settings.payments).toBe(false);
    // 既存アカウントが再訪問した際にもlink_paymentsを補うため常にリクエストする
    expect(captured.accountUpdateParams?.capabilities?.link_payments).toEqual({ requested: true });
  });

  it("英字の名前を持つ本人の再送信でもASCII欄は送らない", async () => {
    await testAdmin.from("profiles").update({ organizer_name: "Night Rainbow", organizer_name_ascii: "Night Rainbow" }).eq("profile_id", profileId);
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({ business_type: "individual" }));
    expect(res.status).toBe(200);
    expect(captured.accountUpdateId).toBe(existingConnectId);
    expect("statement_descriptor" in captured.accountUpdateParams.settings.payments).toBe(false);
    expectFixedDescriptors(captured.accountUpdateParams?.settings?.payments);
  });

  it("氏名なしの再送信でもASCII欄は送らない（入力に依存しない）", async () => {
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({ business_name: "屋号だけでbusiness_typeなし" }));
    expect(res.status).toBe(200);

    expect(captured.accountUpdateId).toBe(existingConnectId);
    expectFixedDescriptors(captured.accountUpdateParams?.settings?.payments);
    expect("statement_descriptor" in captured.accountUpdateParams.settings.payments).toBe(false);
    // 既存アカウントが再訪問した際にもlink_paymentsを補うため常にリクエストする
    expect(captured.accountUpdateParams?.capabilities?.link_payments).toEqual({ requested: true });
  });
});
