/**
 * TC-INV-MAIL: POST /api/invitations — ユーザー指名招待とメール自動送信
 *
 * カバレッジ:
 *   A. 送信成功時: is_sent=true が返り、DB にも反映され、メール内容が正しい
 *      （宛先メールはサーバー側で auth.users から解決される）
 *   B. 送信失敗時（Resend がエラー/例外）: 招待作成は成功し is_sent=false のまま
 *   C. RESEND_API_KEY 未設定時: 送信を試みず is_sent=false
 *   D. 権限なしロール / 宛先未指定: 403 / 400 でメール送信も走らない
 *   E. 宛先バリデーション: 自己招待・同等以上ロール・実在しないユーザー・再送時の旧pending無効化
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as invitationsPOST } from "@/app/api/invitations/route";

// ─── フィクスチャ ──────────────────────────────────────────────────────
let agentId: string;
let artistId: string;
let inviteeUserId: string;
let inviteeUserEmail: string;
let inviteeArtistId: string;
let organizerId: string;

const cleanup = {
  profileIds: [] as string[],
};

const AGENT_DISPLAY_NAME = "招待テストエージェント";
const INVITEE_USER_NAME = "招待される一般ユーザー";

function mockAs(id: string, role: string, displayName: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role, display_name: displayName } }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

function buildRequest(body: { target_role: string; target_profile_id?: string }) {
  return new Request("http://localhost/api/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  inviteeUserEmail = `invitee-user-invmail-${ts}@test.local`;
  agentId = await insertProfile({ role: "agent", displayName: AGENT_DISPLAY_NAME, email: `agent-invmail-${ts}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: "権限なしアーティスト", email: `artist-invmail-${ts}@test.local` });
  inviteeUserId = await insertProfile({ role: "user", displayName: INVITEE_USER_NAME, email: inviteeUserEmail });
  inviteeArtistId = await insertProfile({ role: "artist", displayName: "昇格候補アーティスト", email: `invitee-artist-invmail-${ts}@test.local` });
  organizerId = await insertProfile({ role: "organizer", displayName: "既存オーガナイザー", email: `organizer-invmail-${ts}@test.local` });
  cleanup.profileIds.push(agentId, artistId, inviteeUserId, inviteeArtistId, organizerId);
}, 30_000);

afterAll(async () => {
  // invited_by_profile_id は on delete restrict のため invitations を先に削除
  await testAdmin.from("invitations").delete().in("invited_by_profile_id", cleanup.profileIds);
  await deleteAuthUsers(cleanup.profileIds);
});

beforeEach(() => {
  sendMock.mockReset();
  process.env.RESEND_API_KEY = "re_test_dummy_key";
});

// ── A. 送信成功 ────────────────────────────────────────────────────────
describe("TC-INV-MAIL-A: 招待メール送信成功", () => {
  it("TC-INV-MAIL-A-01: is_sent=true が返り、宛先メールがサーバー側で解決されDBにも反映される", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_profile_id: inviteeUserId }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.is_sent).toBe(true);
    expect(body.target_profile_id).toBe(inviteeUserId);
    expect(body.target_email).toBe(inviteeUserEmail);
    expect(body.target_role).toBe("artist");
    expect(body.status).toBe("pending");
    expect(body.target_profile.display_name).toBe(INVITEE_USER_NAME);

    const { data: row } = await testAdmin
      .from("invitations")
      .select("is_sent, status, target_profile_id, target_email")
      .eq("invitation_id", body.invitation_id)
      .single();
    expect(row!.is_sent).toBe(true);
    expect(row!.status).toBe("pending");
    expect(row!.target_profile_id).toBe(inviteeUserId);
    expect(row!.target_email).toBe(inviteeUserEmail);
  });

  it("TC-INV-MAIL-A-02: メールの宛先・件名・本文リンク・宛名が正しい", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const res = await invitationsPOST(buildRequest({ target_role: "organizer", target_profile_id: inviteeUserId }));
    const body = await res.json();
    expect(res.status).toBe(200);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0];
    expect(sent.to).toBe(inviteeUserEmail);
    expect(sent.from).toBe("Direct Cheers <noreply@direct-cheers.com>");
    expect(sent.subject).toBe(`${AGENT_DISPLAY_NAME}さんからDirect Cheersへの招待が届いています`);
    expect(sent.html).toContain(`/invite/${body.token}`);
    expect(sent.html).toContain(INVITEE_USER_NAME);
    expect(sent.html).toContain("オーガナイザー");
    expect(sent.html).toContain("30日間");
  });
});

// ── B. 送信失敗 ────────────────────────────────────────────────────────
describe("TC-INV-MAIL-B: 送信失敗でも招待作成は成功する", () => {
  it("TC-INV-MAIL-B-01: Resendがerrorを返した場合、is_sent=false のまま200", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_profile_id: inviteeUserId }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.is_sent).toBe(false);
    expect(body.token).toBeTruthy();

    const { data: row } = await testAdmin
      .from("invitations")
      .select("is_sent")
      .eq("invitation_id", body.invitation_id)
      .single();
    expect(row!.is_sent).toBe(false);
  });

  it("TC-INV-MAIL-B-02: Resendが例外をthrowした場合も、is_sent=false のまま200", async () => {
    sendMock.mockRejectedValue(new Error("network error"));
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_profile_id: inviteeUserId }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.is_sent).toBe(false);

    const { data: row } = await testAdmin
      .from("invitations")
      .select("is_sent")
      .eq("invitation_id", body.invitation_id)
      .single();
    expect(row!.is_sent).toBe(false);
  });
});

// ── C. APIキー未設定 ───────────────────────────────────────────────────
describe("TC-INV-MAIL-C: RESEND_API_KEY 未設定", () => {
  it("TC-INV-MAIL-C-01: 送信を試みず is_sent=false で招待は作成される", async () => {
    delete process.env.RESEND_API_KEY;
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_profile_id: inviteeUserId }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.is_sent).toBe(false);
    expect(sendMock).toHaveBeenCalledTimes(0);
  });
});

// ── D. 権限なし / 宛先未指定 ───────────────────────────────────────────
describe("TC-INV-MAIL-D: 権限・入力バリデーション", () => {
  it("TC-INV-MAIL-D-01: artistロールは招待を発行できない（403）", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(artistId, "artist", "権限なしアーティスト");

    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_profile_id: inviteeUserId }));
    expect(res.status).toBe(403);
    expect(sendMock).toHaveBeenCalledTimes(0);
  });

  it("TC-INV-MAIL-D-02: 宛先ユーザー未指定は400でメールも送信されない", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const res = await invitationsPOST(buildRequest({ target_role: "artist" }));
    expect(res.status).toBe(400);
    expect(sendMock).toHaveBeenCalledTimes(0);
  });
});

// ── E. 宛先バリデーション ──────────────────────────────────────────────
describe("TC-INV-MAIL-E: 宛先ユーザーのバリデーション", () => {
  it("TC-INV-MAIL-E-01: 自分自身への招待は400", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_profile_id: agentId }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("自分自身は招待できません");
    expect(sendMock).toHaveBeenCalledTimes(0);
  });

  it("TC-INV-MAIL-E-02: 既に同等以上のロールを持つユーザーへの招待は400", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    // organizer(rank2) に artist(rank1) 招待 → 無意味なので拒否
    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_profile_id: organizerId }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("このユーザーは既に同等以上のロールを持っています");
    expect(sendMock).toHaveBeenCalledTimes(0);
  });

  it("TC-INV-MAIL-E-03: 下位ロールから上位ロールへの昇格招待は成功する", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    // artist(rank1) に organizer(rank2) 招待 → 昇格なので許可
    const res = await invitationsPOST(buildRequest({ target_role: "organizer", target_profile_id: inviteeArtistId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.target_role).toBe("organizer");
    expect(body.target_profile_id).toBe(inviteeArtistId);
  });

  it("TC-INV-MAIL-E-04: 実在しないユーザーへの招待は404", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_profile_id: crypto.randomUUID() }));
    expect(res.status).toBe(404);
    expect(sendMock).toHaveBeenCalledTimes(0);
  });

  it("TC-INV-MAIL-E-05: 同一宛先への再発行で旧pending招待がexpiredになる", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const res1 = await invitationsPOST(buildRequest({ target_role: "artist", target_profile_id: inviteeUserId }));
    const first = await res1.json();
    expect(res1.status).toBe(200);

    const res2 = await invitationsPOST(buildRequest({ target_role: "artist", target_profile_id: inviteeUserId }));
    const second = await res2.json();
    expect(res2.status).toBe(200);

    const { data: firstRow } = await testAdmin
      .from("invitations")
      .select("status")
      .eq("invitation_id", first.invitation_id)
      .single();
    expect(firstRow!.status).toBe("expired");

    const { data: secondRow } = await testAdmin
      .from("invitations")
      .select("status")
      .eq("invitation_id", second.invitation_id)
      .single();
    expect(secondRow!.status).toBe("pending");
  });
});
