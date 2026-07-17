/**
 * TC-INV-ACC: POST /api/invitations/[token]/accept — 指名招待の受諾者制限
 *
 * 招待トークンは従来ベアラー（リンクを持つ人なら誰でも受諾可）だったが、
 * target_profile_id 付きの指名招待は本人以外受諾不可となった。
 *
 * カバレッジ:
 *   A. 本人受諾: role が昇格し invitation が accepted になる
 *   B. 他人受諾: route 層で 403 wrong_recipient、RPC 直呼びでも wrong_recipient（DB層防御）
 *   C. 回帰: 旧形式（target_email のみ）の招待は従来通り受諾できる
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as acceptPOST } from "@/app/api/invitations/[token]/accept/route";

// ─── フィクスチャ ──────────────────────────────────────────────────────
let agentId: string;
let inviteeId: string;
let inviteeEmail: string;
let strangerId: string;
let legacyInviteeId: string;
let legacyInviteeEmail: string;

const cleanup = { profileIds: [] as string[] };

// route は supabase.rpc を呼ぶため、実DBの RPC に委譲する
function mockAs(id: string, email: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id, email } }, error: null }) },
    rpc: (fn: string, args: Record<string, unknown>) => testAdmin.rpc(fn, args),
  });
}

async function insertInvitation(params: {
  invitedBy: string;
  targetRole: string;
  targetProfileId?: string | null;
  targetEmail?: string | null;
}): Promise<{ invitationId: string; token: string }> {
  const { data, error } = await testAdmin
    .from("invitations")
    .insert({
      invited_by_profile_id: params.invitedBy,
      target_role: params.targetRole,
      target_profile_id: params.targetProfileId ?? null,
      target_email: params.targetEmail ?? null,
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
  inviteeEmail = `invitee-acc-${ts}@test.local`;
  legacyInviteeEmail = `legacy-acc-${ts}@test.local`;
  agentId = await insertProfile({ role: "agent", displayName: "受諾テストエージェント", email: `agent-acc-${ts}@test.local` });
  inviteeId = await insertProfile({ role: "user", displayName: "指名された本人", email: inviteeEmail });
  strangerId = await insertProfile({ role: "user", displayName: "無関係な第三者", email: `stranger-acc-${ts}@test.local` });
  legacyInviteeId = await insertProfile({ role: "user", displayName: "旧形式招待の本人", email: legacyInviteeEmail });
  cleanup.profileIds.push(agentId, inviteeId, strangerId, legacyInviteeId);
}, 30_000);

afterAll(async () => {
  await testAdmin.from("connections").delete().in("artist_profile_id", cleanup.profileIds);
  await testAdmin.from("invitations").delete().in("invited_by_profile_id", cleanup.profileIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── A. 本人受諾 ────────────────────────────────────────────────────────
describe("TC-INV-ACC-A: 指名招待を本人が受諾できる", () => {
  it("TC-INV-ACC-A-01: 受諾成功でroleが昇格しinvitationがacceptedになる", async () => {
    const { invitationId, token } = await insertInvitation({
      invitedBy: agentId,
      targetRole: "artist",
      targetProfileId: inviteeId,
      targetEmail: inviteeEmail,
    });
    mockAs(inviteeId, inviteeEmail);

    const res = await acceptPOST(new Request("http://localhost"), buildParams(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.role).toBe("artist");

    const { data: prof } = await testAdmin
      .from("profiles").select("role").eq("profile_id", inviteeId).single();
    expect(prof!.role).toBe("artist");

    const { data: inv } = await testAdmin
      .from("invitations")
      .select("status, accepted_by_profile_id")
      .eq("invitation_id", invitationId)
      .single();
    expect(inv!.status).toBe("accepted");
    expect(inv!.accepted_by_profile_id).toBe(inviteeId);
  });
});

// ── B. 他人受諾の拒否 ──────────────────────────────────────────────────
describe("TC-INV-ACC-B: 指名招待は本人以外受諾できない", () => {
  it("TC-INV-ACC-B-01: 別ユーザーの受諾はroute層で403 wrong_recipientになりDBは無変化", async () => {
    const { invitationId, token } = await insertInvitation({
      invitedBy: agentId,
      targetRole: "organizer",
      targetProfileId: inviteeId,
      targetEmail: inviteeEmail,
    });
    mockAs(strangerId, `stranger-acc-b01@test.local`);

    const res = await acceptPOST(new Request("http://localhost"), buildParams(token));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("wrong_recipient");

    const { data: inv } = await testAdmin
      .from("invitations")
      .select("status, accepted_by_profile_id")
      .eq("invitation_id", invitationId)
      .single();
    expect(inv!.status).toBe("pending");
    expect(inv!.accepted_by_profile_id).toBeNull();

    const { data: prof } = await testAdmin
      .from("profiles").select("role").eq("profile_id", strangerId).single();
    expect(prof!.role).toBe("user");
  });

  it("TC-INV-ACC-B-02: route層を迂回してRPCを直接呼んでもwrong_recipientで拒否される", async () => {
    const { invitationId, token } = await insertInvitation({
      invitedBy: agentId,
      targetRole: "organizer",
      targetProfileId: inviteeId,
      targetEmail: inviteeEmail,
    });

    const { data, error } = await testAdmin.rpc("accept_invitation", {
      p_token: token,
      p_user_id: strangerId,
    });
    expect(error).toBeNull();
    expect(data.error).toBe("wrong_recipient");

    const { data: inv } = await testAdmin
      .from("invitations").select("status").eq("invitation_id", invitationId).single();
    expect(inv!.status).toBe("pending");
  });
});

// ── C. 旧形式招待の回帰 ────────────────────────────────────────────────
describe("TC-INV-ACC-C: 旧形式（target_emailのみ）招待の回帰", () => {
  it("TC-INV-ACC-C-01: target_profile_idなしの招待はメール一致で従来通り受諾できる", async () => {
    const { invitationId, token } = await insertInvitation({
      invitedBy: agentId,
      targetRole: "artist",
      targetProfileId: null,
      targetEmail: legacyInviteeEmail,
    });
    mockAs(legacyInviteeId, legacyInviteeEmail);

    const res = await acceptPOST(new Request("http://localhost"), buildParams(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.role).toBe("artist");

    const { data: inv } = await testAdmin
      .from("invitations").select("status").eq("invitation_id", invitationId).single();
    expect(inv!.status).toBe("accepted");
  });

  it("TC-INV-ACC-C-02: 旧形式招待でメール不一致ならemail_mismatchで拒否される", async () => {
    const { invitationId, token } = await insertInvitation({
      invitedBy: agentId,
      targetRole: "artist",
      targetProfileId: null,
      targetEmail: `someone-else-${Date.now()}@test.local`,
    });
    mockAs(strangerId, `stranger-acc-c02@test.local`);

    const res = await acceptPOST(new Request("http://localhost"), buildParams(token));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("email_mismatch");

    const { data: inv } = await testAdmin
      .from("invitations").select("status").eq("invitation_id", invitationId).single();
    expect(inv!.status).toBe("pending");
  });
});
