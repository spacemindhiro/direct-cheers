/**
 * TC-ONB-SD: /api/stripe/connect/onboarding の statement_descriptor 送信仕様を検証する
 *
 * 仕様（2026-07-16 JCB加盟店審査指摘を受けて変更）:
 * - prefix（動的suffixと結合されるベース表記）: 常に固定 PLATFORM_PREFIX。
 *   ユーザーによるカスタマイズは一切許可しない（従来どおり）。
 * - 静的statement_descriptor: JCB審査要件（明細書表記に企業名を反映）のため
 *   本人確認対象の事業者名（個人: 本名 / 法人: 会社名）を登録する。
 *   名前から組み立てられない場合は作成時はPLATFORM_PREFIXにフォールバックし、
 *   更新時はフィールド自体を送らない（手動修正した既存値を上書きしないため）。
 *
 * Stripe呼び出し（accounts.create / accounts.update / accountLinks.create）は
 * モックして送信パラメータを直接検証する（実際のExpressアカウント作成は
 * KYC項目が多く本テストの目的に対して過剰なため）。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";
import { PLATFORM_PREFIX } from "@/lib/statement-descriptor";

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
  async function freshProfile(label: string): Promise<string> {
    const id = await insertProfile({
      role: "organizer", displayName: `テスト主催者${label}`, email: `org-onb-${label}-${Date.now()}@test.local`,
    });
    cleanup.profileIds.push(id);
    return id;
  }

  it("個人: 静的表記は本名（ASCII/漢字/カナ）、prefixは固定PLATFORM_PREFIX", async () => {
    const profileId = await freshProfile("indiv");
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({
      business_type: "individual",
      first_name: "Taro", last_name: "Yamada",
      first_name_kanji: "太郎", last_name_kanji: "山田",
      first_name_kana: "タロウ", last_name_kana: "ヤマダ",
    }));
    expect(res.status).toBe(200);

    const payments = captured.accountCreateParams?.settings?.payments;
    expect(payments).toBeDefined();
    expect(payments.statement_descriptor).toBe("TARO YAMADA");
    expect(payments.statement_descriptor_kanji).toBe("山田太郎");
    expect(payments.statement_descriptor_kana).toBe("ヤマダタロウ");
    expect(payments.statement_descriptor_prefix).toBe(PLATFORM_PREFIX);
    expect(payments.statement_descriptor_prefix_kanji).toBe(PLATFORM_PREFIX);
  }, 15_000);

  it("法人: 静的表記は会社名（ASCII/漢字/カナ）、prefixは固定PLATFORM_PREFIX", async () => {
    const profileId = await freshProfile("comp");
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({
      business_type: "company",
      business_name: "SPACEMIND",
      company_name_kanji: "スペースマインド合同会社",
      company_name_kana: "スペースマインドゴウドウガイシャ",
    }));
    expect(res.status).toBe(200);

    const payments = captured.accountCreateParams?.settings?.payments;
    expect(payments.statement_descriptor).toBe("SPACEMIND");
    expect(payments.statement_descriptor_kanji).toBe("スペースマインド合同会社");
    expect(payments.statement_descriptor_prefix).toBe(PLATFORM_PREFIX);
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

  it("氏名が無く事業者名を組み立てられない場合はPLATFORM_PREFIXにフォールバック", async () => {
    const profileId = await freshProfile("empty");
    mockAuth(profileId);
    await onboardingPOST(makeReq({ business_type: "individual" }));
    const payments = captured.accountCreateParams?.settings?.payments;
    expect(payments.statement_descriptor).toBe(PLATFORM_PREFIX);
    expect(payments.statement_descriptor_kanji).toBe(PLATFORM_PREFIX);
    expect(payments.statement_descriptor_prefix).toBe(PLATFORM_PREFIX);
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

  it("氏名付き再送信: 静的表記は本名で更新され、prefixは固定が再送される", async () => {
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({
      business_type: "individual",
      first_name: "Taro", last_name: "Yamada",
      first_name_kanji: "太郎", last_name_kanji: "山田",
    }));
    expect(res.status).toBe(200);

    expect(captured.accountUpdateId).toBe(existingConnectId);
    const payments = captured.accountUpdateParams?.settings?.payments;
    expect(payments).toBeDefined();
    expect(payments.statement_descriptor).toBe("TARO YAMADA");
    expect(payments.statement_descriptor_kanji).toBe("山田太郎");
    expect(payments.statement_descriptor_prefix).toBe(PLATFORM_PREFIX);
    expect(payments.statement_descriptor_prefix_kanji).toBe(PLATFORM_PREFIX);
  });

  it("氏名を組み立てられない再送信: 静的表記フィールドは送らず既存値を維持（PLATFORM_PREFIXでの上書き禁止）", async () => {
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({ business_name: "屋号だけでbusiness_typeなし" }));
    expect(res.status).toBe(200);

    const payments = captured.accountUpdateParams?.settings?.payments;
    expect(payments).toBeDefined();
    expect(payments.statement_descriptor).toBeUndefined();
    expect(payments.statement_descriptor_kanji).toBeUndefined();
    expect(payments.statement_descriptor_prefix).toBe(PLATFORM_PREFIX);
    expect(payments.statement_descriptor_prefix_kanji).toBe(PLATFORM_PREFIX);
  });
});
