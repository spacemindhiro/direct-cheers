/**
 * TC-ONB-SD: /api/stripe/connect/onboarding の statement_descriptor 固定を検証する
 *
 * 背景: account-levelのベース表記（statement_descriptor系）はユーザーによる
 * カスタマイズを一切許可せず、常に固定文字列 "DC"（PLATFORM_PREFIX）を送る。
 * 屋号を明細に出したい場合は organizer_name/artist_name（suffix側）に
 * 自分で入力すればよく、ベース側に名前のカスタマイズ機構は持たない。
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

// ── TC-ONB-SD-01: 新規アカウント作成時、常に固定 "DC" が送られる ──────────
describe("TC-ONB-SD-01: 新規Connectアカウント作成時、statement_descriptor系は常に固定文字列'DC'になる", () => {
  async function freshProfile(label: string): Promise<string> {
    const id = await insertProfile({
      role: "organizer", displayName: `テスト主催者${label}`, email: `org-onb-${label}-${Date.now()}@test.local`,
    });
    cleanup.profileIds.push(id);
    return id;
  }

  it("statement_descriptor系は常に固定文字列'DC'になる（ユーザー入力欄自体が存在しない）", async () => {
    const profileId = await freshProfile("fixed");
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({ business_type: "individual", business_name: "何を入力しても無視される事業者名" }));
    expect(res.status).toBe(200);

    const payments = captured.accountCreateParams?.settings?.payments;
    expect(payments).toBeDefined();
    expect(payments.statement_descriptor).toBe(PLATFORM_PREFIX);
    expect(payments.statement_descriptor_prefix).toBe(PLATFORM_PREFIX);
    expect(payments.statement_descriptor_kanji).toBe(PLATFORM_PREFIX);
    expect(payments.statement_descriptor_prefix_kanji).toBe(PLATFORM_PREFIX);
  }, 15_000);

  it("入力フォームが空でも、固定文字列'DC'が送られる", async () => {
    const profileId = await freshProfile("empty");
    mockAuth(profileId);
    await onboardingPOST(makeReq({ business_type: "individual" }));
    const payments = captured.accountCreateParams?.settings?.payments;
    expect(payments.statement_descriptor).toBe(PLATFORM_PREFIX);
  }, 15_000);
});

// ── TC-ONB-SD-02: 既存アカウントの再編集時もStripeへ反映される ──────────────
describe("TC-ONB-SD-02: 既存Connectアカウントの再編集時、stripe.accounts.updateで固定'DC'が再送される", () => {
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

  it("既存アカウントでも stripe.accounts.update が呼ばれ、固定'DC'が再送される", async () => {
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({ business_name: "何を入力しても無視される事業者名" }));
    expect(res.status).toBe(200);

    expect(captured.accountUpdateId).toBe(existingConnectId);
    const payments = captured.accountUpdateParams?.settings?.payments;
    expect(payments).toBeDefined();
    expect(payments.statement_descriptor_prefix).toBe(PLATFORM_PREFIX);
    expect(payments.statement_descriptor_prefix_kanji).toBe(PLATFORM_PREFIX);
  });
});
