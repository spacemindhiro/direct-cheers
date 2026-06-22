/**
 * TC-ONB-SD: /api/stripe/connect/onboarding の statement_descriptor prefix 強制を検証する
 *
 * 背景: オンボーディング時に自由文字列のベース表記を直接Stripeに送ると、
 * 動的suffixと結合した際に意味不明な明細になりチャージバックの原因になる。
 * このルートは、ユーザー入力をそのまま使わず、必ず "DC-"（PLATFORM_PREFIX）を
 * 冠したprefixをシステム側で構築してStripeに送る必要がある。
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

// ── TC-ONB-SD-01: 新規アカウント作成時、自由入力は無視されprefixが強制される ──
// 各テストごとに新規プロファイルを作る: 1回目のテストでstripe_connect_idが
// DBに保存されると、以降は「既存アカウント」分岐に流れてしまうため。
describe("TC-ONB-SD-01: 新規Connectアカウント作成時、statement_descriptor系は常にDC-で固定される", () => {
  async function freshProfile(label: string): Promise<string> {
    const id = await insertProfile({
      role: "organizer", displayName: `テスト主催者${label}`, email: `org-onb-${label}-${Date.now()}@test.local`,
    });
    cleanup.profileIds.push(id);
    return id;
  }

  it("ユーザーが自由文字列を入力しても、Stripeに送るprefixは必ず'DC-'で始まる", async () => {
    const profileId = await freshProfile("free");
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({
      business_type: "individual",
      statement_descriptor_kanji: "完全に自由な文字列ここに書く",
      statement_descriptor_kana: "ジユウナモジレツ",
    }));
    expect(res.status).toBe(200);

    const payments = captured.accountCreateParams?.settings?.payments;
    expect(payments).toBeDefined();
    expect(payments.statement_descriptor).toMatch(new RegExp(`^${PLATFORM_PREFIX}`));
    expect(payments.statement_descriptor_prefix).toMatch(new RegExp(`^${PLATFORM_PREFIX}`));
    expect(payments.statement_descriptor_kanji).toMatch(new RegExp(`^${PLATFORM_PREFIX}`));
    expect(payments.statement_descriptor_prefix_kanji).toMatch(new RegExp(`^${PLATFORM_PREFIX}`));
  }, 15_000);

  it("漢字入力欄の内容が漢字prefixに反映される（DCに続けて）", async () => {
    const profileId = await freshProfile("kanji");
    mockAuth(profileId);
    await onboardingPOST(makeReq({
      business_type: "individual",
      // prefix内の名前部分は6文字までに制限される（演者名suffix用の余地を残すため）。
      // 6文字に収まる名前を使い、切り詰めなしで反映されることを確認する。
      statement_descriptor_kanji: "宇宙スペース",
    }));
    const payments = captured.accountCreateParams?.settings?.payments;
    expect(payments.statement_descriptor_kanji).toBe(`${PLATFORM_PREFIX} 宇宙スペース`);
  }, 15_000);

  it("漢字prefixの名前部分は6文字を超えると切り詰められる（suffix用の余地を残すため）", async () => {
    const profileId = await freshProfile("kanji-long");
    mockAuth(profileId);
    await onboardingPOST(makeReq({
      business_type: "individual",
      statement_descriptor_kanji: "スペースBBQ運営委員会",
    }));
    const payments = captured.accountCreateParams?.settings?.payments;
    expect(payments.statement_descriptor_kanji).toBe(`${PLATFORM_PREFIX} スペースBB`);
  }, 15_000);

  it("カナフィールドにはDCマーカーが付かない（半角英字を受け付けないため名前のみ）", async () => {
    const profileId = await freshProfile("kana");
    mockAuth(profileId);
    await onboardingPOST(makeReq({
      business_type: "individual",
      statement_descriptor_kana: "スペースビービーキュー",
    }));
    const payments = captured.accountCreateParams?.settings?.payments;
    expect(payments.statement_descriptor_kana).toBe("スペースビービーキュー");
    expect(payments.statement_descriptor_kana).not.toContain(PLATFORM_PREFIX);
  }, 15_000);

  it("statement_descriptor関連の入力が無くても、表示名からprefixが構築される（空にはならない）", async () => {
    const profileId = await freshProfile("fallback");
    mockAuth(profileId);
    await onboardingPOST(makeReq({ business_type: "individual" }));
    const payments = captured.accountCreateParams?.settings?.payments;
    expect(payments.statement_descriptor).toBeTruthy();
    expect(payments.statement_descriptor.startsWith(PLATFORM_PREFIX)).toBe(true);
  }, 15_000);
});

// ── TC-ONB-SD-02: 既存アカウントの再編集時もStripeへ反映される ──────────────
describe("TC-ONB-SD-02: 既存Connectアカウントの再編集時、stripe.accounts.updateでprefixが再送される", () => {
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

  it("既存アカウントでも stripe.accounts.update が呼ばれ、prefixがDC-で固定される", async () => {
    mockAuth(profileId);
    const res = await onboardingPOST(makeReq({
      statement_descriptor_kanji: "改めて自由な文字列",
    }));
    expect(res.status).toBe(200);

    expect(captured.accountUpdateId).toBe(existingConnectId);
    const payments = captured.accountUpdateParams?.settings?.payments;
    expect(payments).toBeDefined();
    expect(payments.statement_descriptor_prefix.startsWith(PLATFORM_PREFIX)).toBe(true);
    // prefixの名前部分は6文字まで（演者名suffix用の余地を残すため切り詰められる）
    expect(payments.statement_descriptor_prefix_kanji).toBe(`${PLATFORM_PREFIX} 改めて自由な`);
  });
});
