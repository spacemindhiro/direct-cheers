/**
 * TC-CONNECT-UPDATE-LINK: /api/stripe/connect/update-link の検証
 *
 * 一度Stripe Connect登録（verified/pending）が完了すると、プロフィール画面から
 * 再編集する導線が無かった問題への対応。account_update タイプの
 * AccountLinkを発行し、既存アカウントの編集画面へ直接案内する。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

const captured: { accountLinkParams?: any } = {};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.accountLinks as any).create = async (params: any) => {
        captured.accountLinkParams = params;
        return { url: "https://connect.stripe.com/setup/e/acct_test_update_stub", object: "account_link" };
      };
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
import { POST as updateLinkPOST } from "@/app/api/stripe/connect/update-link/route";

let organizerWithConnectId: string;
let organizerWithoutConnectId: string;
let artistProfileId: string;

const cleanup = { profileIds: [] as string[] };

function mockAuth(userId: string) {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId, email: "test@test.local" } }, error: null }),
    },
    from: vi.fn((table: string) => testAdmin.from(table)),
  });
}

function makeReq(): Request {
  return new Request("http://localhost/api/stripe/connect/update-link", { method: "POST" });
}

beforeAll(async () => {
  const ts = Date.now();
  organizerWithConnectId = await insertProfile({
    role: "organizer", displayName: "更新リンクテスト（連携済み）", email: `connect-update-${ts}@test.local`,
    stripeConnectId: `acct_test_update_${ts}`,
  });
  organizerWithoutConnectId = await insertProfile({
    role: "organizer", displayName: "更新リンクテスト（未連携）", email: `connect-update-none-${ts}@test.local`,
  });
  artistProfileId = await insertProfile({
    role: "artist", displayName: "更新リンクテスト（演者・連携済み）", email: `connect-update-artist-${ts}@test.local`,
    stripeConnectId: `acct_test_update_artist_${ts}`,
  });
  cleanup.profileIds.push(organizerWithConnectId, organizerWithoutConnectId, artistProfileId);
}, 30_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-CONNECT-UPDATE-LINK", () => {
  it("TC-CONNECT-UPDATE-LINK-01: 連携済みorganizer → account_update タイプのリンクが返る", async () => {
    mockAuth(organizerWithConnectId);
    const res = await updateLinkPOST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toBe("https://connect.stripe.com/setup/e/acct_test_update_stub");
    expect(captured.accountLinkParams?.type).toBe("account_update");
    expect(captured.accountLinkParams?.account).toMatch(/^acct_test_update_\d+$/);
  });

  it("TC-CONNECT-UPDATE-LINK-02: 連携済みartist → account_update タイプのリンクが返る", async () => {
    mockAuth(artistProfileId);
    const res = await updateLinkPOST();
    expect(res.status).toBe(200);
    expect(captured.accountLinkParams?.type).toBe("account_update");
  });

  it("TC-CONNECT-UPDATE-LINK-03: 未連携（stripe_connect_id無し）→ 400", async () => {
    mockAuth(organizerWithoutConnectId);
    const res = await updateLinkPOST();
    expect(res.status).toBe(400);
  });

  it("TC-CONNECT-UPDATE-LINK-04: 未認証 → 401", async () => {
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      from: vi.fn((table: string) => testAdmin.from(table)),
    });
    const res = await updateLinkPOST();
    expect(res.status).toBe(401);
  });
});
