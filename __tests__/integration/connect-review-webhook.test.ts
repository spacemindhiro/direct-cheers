/**
 * TC-CRW: Stripe Webhook（account.updated）経由でのadmin審査通知の統合テスト
 *
 * 背景: /api/stripe/connect/status（connect-returnページ到達時のみ呼ばれる）
 * だけに依存していたため、ユーザーがそのページに到達しなかった場合
 * （リダイレクト失敗・ページを閉じる等）verification_statusが永久にunverified
 * のままになり、adminに承認待ち通知が届かない障害があった。
 * Webhookからも同じ処理（advanceToReviewPendingIfNeeded）を呼ぶことで、
 * ページ到達に依存しないセーフティネットになっていることを確認する。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

// webhook の署名検証をバイパス
vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    webhooks = {
      ...super.webhooks,
      constructEvent: (body: string, _sig: string, _secret: string) => JSON.parse(body),
    };
  }
  return { ...StripeModule, default: MockStripe };
});

import { POST as webhookPOST } from "@/app/api/stripe/webhook/route";

const cleanup = {
  profileIds: [] as string[],
};

let adminProfileId: string;
let organizerProfileId: string;

function buildAccountUpdatedEvent(params: {
  accountId: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}) {
  return {
    id: `evt_test_${Math.random().toString(36).slice(2)}`,
    type: "account.updated",
    data: {
      object: {
        id: params.accountId,
        details_submitted: params.detailsSubmitted,
        charges_enabled: params.chargesEnabled,
        payouts_enabled: params.payoutsEnabled,
        requirements: { currently_due: [] },
      },
    },
  };
}

function postWebhook(event: unknown) {
  return webhookPOST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "test" },
      body: JSON.stringify(event),
    }),
  );
}

beforeAll(async () => {
  const ts = Date.now();
  adminProfileId = await insertProfile({
    role: "admin",
    displayName: "テスト管理者（CRW）",
    email: `admin-crw-${ts}@test.local`,
  });
  cleanup.profileIds.push(adminProfileId);
}, 30_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-CRW-01: account.updated（details_submitted=true）でverification_statusがpendingに進み、admin通知が作られる", () => {
  it("unverified → pending、connect_review_request通知が作られる", async () => {
    const ts = Date.now();
    organizerProfileId = await insertProfile({
      role: "organizer",
      displayName: "テストオーガナイザー（CRW）",
      email: `organizer-crw-${ts}@test.local`,
      stripeConnectId: `acct_test_crw_${ts}`,
    });
    cleanup.profileIds.push(organizerProfileId);

    const res = await postWebhook(buildAccountUpdatedEvent({
      accountId: `acct_test_crw_${ts}`,
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    }));
    expect(res.status).toBe(200);

    const { data: profile } = await testAdmin
      .from("profiles")
      .select("verification_status")
      .eq("profile_id", organizerProfileId)
      .single();
    expect(profile?.verification_status).toBe("pending");

    const { data: notif } = await testAdmin
      .from("notifications")
      .select("profile_id, type, metadata")
      .eq("profile_id", adminProfileId)
      .eq("type", "connect_review_request")
      .contains("metadata", { subject_profile_id: organizerProfileId })
      .maybeSingle();
    expect(notif?.profile_id).toBe(adminProfileId);
    expect((notif?.metadata as any)?.subject_profile_id).toBe(organizerProfileId);
  });
});

describe("TC-CRW-02: details_submitted=false の場合は何も起きない", () => {
  it("verification_statusはunverifiedのまま", async () => {
    const ts = Date.now();
    const profileId = await insertProfile({
      role: "artist",
      displayName: "テストアーティスト（CRW未完了）",
      email: `artist-crw-incomplete-${ts}@test.local`,
      stripeConnectId: `acct_test_crw_incomplete_${ts}`,
    });
    cleanup.profileIds.push(profileId);

    await postWebhook(buildAccountUpdatedEvent({
      accountId: `acct_test_crw_incomplete_${ts}`,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    }));

    const { data: profile } = await testAdmin
      .from("profiles")
      .select("verification_status")
      .eq("profile_id", profileId)
      .single();
    expect(profile?.verification_status).toBe("unverified");
  });
});

describe("TC-CRW-03: 既にpendingの場合は二重に通知しない（冪等）", () => {
  it("2回目の account.updated では通知が増えない", async () => {
    const ts = Date.now();
    const profileId = await insertProfile({
      role: "artist",
      displayName: "テストアーティスト（CRW冪等）",
      email: `artist-crw-idem-${ts}@test.local`,
      stripeConnectId: `acct_test_crw_idem_${ts}`,
    });
    cleanup.profileIds.push(profileId);

    const event = buildAccountUpdatedEvent({
      accountId: `acct_test_crw_idem_${ts}`,
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    });

    await postWebhook(event);
    await postWebhook({ ...event, id: `evt_test_${Math.random().toString(36).slice(2)}` });

    const { data: notifs } = await testAdmin
      .from("notifications")
      .select("notification_id")
      .eq("type", "connect_review_request")
      .contains("metadata", { subject_profile_id: profileId });
    expect((notifs ?? []).length).toBe(1);
  });
});
