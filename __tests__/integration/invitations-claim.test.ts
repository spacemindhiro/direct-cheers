/**
 * TC-INV-CLAIM: POST /api/invitations/[token]/claim
 *
 * 未登録ユーザー向け（target_emailのみの）招待を、追加のマジックリンクメール
 * 往復なしにその場で認証まで完了させるエンドポイントの検証。
 *
 * カバレッジ:
 *   A. 未登録メールアドレスの招待をclaimすると認証が成立し、onboarding未完了
 *      なのでonboardingへのredirectが返る
 *   B. target_profile_id指定（既存ユーザー指名）の招待はclaim対象外で400
 *   C. トークンが不正・期限切れ・削除済みの場合は404/400
 *   D. 既に確認済みユーザーのメールアドレスを持つ招待はclaimに失敗し409
 *      （通常のログイン導線へフォールバックさせるため）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [], set: () => {} })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as claimPOST } from "@/app/api/invitations/[token]/claim/route";

// verifyOtp成功時にクライアント内部のセッションが認証済みユーザーへ書き換わり、
// 以後のPostgREST/GoTrue呼び出しがservice_roleではなくなってしまう。
// フィクスチャ操作に使う testAdmin とセッションを共有させないよう、
// verifyOtp専用に独立したクライアントインスタンスを用意する。
const verifyOtpClient = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(createClient as any).mockResolvedValue({
  auth: { verifyOtp: (args: unknown) => verifyOtpClient.auth.verifyOtp(args as any) },
});

// ─── フィクスチャ ──────────────────────────────────────────────────────
let agentId: string;
let existingUserId: string;
let existingUserEmail: string;

const cleanup = {
  profileIds: [] as string[],
  claimedEmails: [] as string[],
};

async function insertInvitation(params: {
  invitedBy: string;
  targetRole: string;
  targetProfileId?: string | null;
  targetEmail?: string | null;
  expiresAt?: string;
  status?: string;
  deletedAt?: string | null;
}): Promise<{ invitationId: string; token: string }> {
  const { data, error } = await testAdmin
    .from("invitations")
    .insert({
      invited_by_profile_id: params.invitedBy,
      target_role: params.targetRole,
      target_profile_id: params.targetProfileId ?? null,
      target_email: params.targetEmail ?? null,
      expires_at: params.expiresAt,
      status: params.status,
      deleted_at: params.deletedAt ?? null,
    })
    .select("invitation_id, token")
    .single();
  if (error) throw new Error(`招待挿入失敗: ${error.message}`);
  return { invitationId: data.invitation_id, token: data.token };
}

function buildParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

beforeAll(async () => {
  const ts = Date.now();
  existingUserEmail = `existing-claim-${ts}@test.local`;
  agentId = await insertProfile({ role: "agent", displayName: "claimテストエージェント", email: `agent-claim-${ts}@test.local` });
  existingUserId = await insertProfile({ role: "user", displayName: "既存ユーザー", email: existingUserEmail });
  cleanup.profileIds.push(agentId, existingUserId);
}, 30_000);

afterAll(async () => {
  await testAdmin.from("invitations").delete().in("invited_by_profile_id", cleanup.profileIds);
  await deleteAuthUsers(cleanup.profileIds);

  // claim成功時にgenerateLinkで新規作成されたauth userを掃除する
  for (const email of cleanup.claimedEmails) {
    try {
      const { data } = await testAdmin.auth.admin.generateLink({ type: "magiclink", email });
      if (data?.user?.id) await testAdmin.auth.admin.deleteUser(data.user.id);
    } catch {
      // 既に削除済み等は無視
    }
  }
});

// ── A. 未登録メールアドレスのclaim成功 ────────────────────────────────
describe("TC-INV-CLAIM-A: 未登録メールアドレスの招待をclaimできる", () => {
  it("TC-INV-CLAIM-A-01: 認証が成立しonboardingへのredirectが返る", async () => {
    const ts = Date.now();
    const email = `unregistered-claim-a01-${ts}@test.local`;
    cleanup.claimedEmails.push(email);

    const { token } = await insertInvitation({
      invitedBy: agentId,
      targetRole: "artist",
      targetEmail: email,
    });

    const res = await claimPOST(new Request("http://localhost", { method: "POST" }), buildParams(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirect).toBe(`/onboarding/profile?redirect=${encodeURIComponent(`/invite/${token}`)}`);
  });
});

// ── B. 既存ユーザー指名招待はclaim対象外 ──────────────────────────────
describe("TC-INV-CLAIM-B: target_profile_id指定の招待はclaimできない", () => {
  it("TC-INV-CLAIM-B-01: 400 not_email_invite が返る", async () => {
    const { token } = await insertInvitation({
      invitedBy: agentId,
      targetRole: "artist",
      targetProfileId: existingUserId,
      targetEmail: existingUserEmail,
    });

    const res = await claimPOST(new Request("http://localhost", { method: "POST" }), buildParams(token));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("not_email_invite");
  });
});

// ── C. 不正なトークン ──────────────────────────────────────────────────
describe("TC-INV-CLAIM-C: トークンが不正な場合", () => {
  it("TC-INV-CLAIM-C-01: 存在しないトークンは404 invalid_token", async () => {
    const res = await claimPOST(new Request("http://localhost", { method: "POST" }), buildParams(crypto.randomUUID()));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("invalid_token");
  });

  it("TC-INV-CLAIM-C-02: 期限切れのトークンは400 invalid_token", async () => {
    const { token } = await insertInvitation({
      invitedBy: agentId,
      targetRole: "artist",
      targetEmail: `expired-claim-c02-${Date.now()}@test.local`,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await claimPOST(new Request("http://localhost", { method: "POST" }), buildParams(token));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_token");
  });

  it("TC-INV-CLAIM-C-03: 削除済みのトークンは404 invalid_token", async () => {
    const { token } = await insertInvitation({
      invitedBy: agentId,
      targetRole: "artist",
      targetEmail: `deleted-claim-c03-${Date.now()}@test.local`,
      deletedAt: new Date().toISOString(),
    });

    const res = await claimPOST(new Request("http://localhost", { method: "POST" }), buildParams(token));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("invalid_token");
  });
});

// ── D. 既に確認済みユーザーのメールアドレス ────────────────────────────
describe("TC-INV-CLAIM-D: 既に確認済みのメールアドレスはclaimに失敗する", () => {
  it("TC-INV-CLAIM-D-01: 409 claim_failed が返り、通常ログイン導線へフォールバックできる", async () => {
    const { token } = await insertInvitation({
      invitedBy: agentId,
      targetRole: "artist",
      targetEmail: existingUserEmail,
    });

    const res = await claimPOST(new Request("http://localhost", { method: "POST" }), buildParams(token));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("claim_failed");
  });
});
