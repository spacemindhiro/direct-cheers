/**
 * TC-INV-MAIL: POST /api/invitations — 招待メール自動送信
 *
 * カバレッジ:
 *   A. 送信成功時: is_sent=true が返り、DB にも反映され、メール内容が正しい
 *   B. 送信失敗時（Resend がエラー/例外）: 招待作成は成功し is_sent=false のまま
 *   C. RESEND_API_KEY 未設定時: 送信を試みず is_sent=false
 *   D. 権限なしロール: 403 でメール送信も走らない
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

const cleanup = {
  profileIds: [] as string[],
};

const AGENT_DISPLAY_NAME = "招待テストエージェント";

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

function buildRequest(body: { target_role: string; target_email?: string }) {
  return new Request("http://localhost/api/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  agentId = await insertProfile({ role: "agent", displayName: AGENT_DISPLAY_NAME, email: `agent-invmail-${ts}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: "権限なしアーティスト", email: `artist-invmail-${ts}@test.local` });
  cleanup.profileIds.push(agentId, artistId);
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
  it("TC-INV-MAIL-A-01: is_sent=true が返り、DBにも反映される", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const targetEmail = `invitee-a01-${Date.now()}@test.local`;
    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_email: targetEmail }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.is_sent).toBe(true);
    expect(body.target_email).toBe(targetEmail);
    expect(body.target_role).toBe("artist");
    expect(body.status).toBe("pending");

    const { data: row } = await testAdmin
      .from("invitations")
      .select("is_sent, status")
      .eq("invitation_id", body.invitation_id)
      .single();
    expect(row!.is_sent).toBe(true);
    expect(row!.status).toBe("pending");
  });

  it("TC-INV-MAIL-A-02: メールの宛先・件名・本文リンクが正しい", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const targetEmail = `invitee-a02-${Date.now()}@test.local`;
    const res = await invitationsPOST(buildRequest({ target_role: "organizer", target_email: targetEmail }));
    const body = await res.json();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0];
    expect(sent.to).toBe(targetEmail);
    expect(sent.from).toBe("Direct Cheers <noreply@direct-cheers.com>");
    expect(sent.subject).toBe(`${AGENT_DISPLAY_NAME}さんからDirect Cheersへの招待が届いています`);
    expect(sent.html).toContain(`/invite/${body.token}`);
    expect(sent.html).toContain("オーガナイザー");
    expect(sent.html).toContain("30日間");
  });
});

// ── B. 送信失敗 ────────────────────────────────────────────────────────
describe("TC-INV-MAIL-B: 送信失敗でも招待作成は成功する", () => {
  it("TC-INV-MAIL-B-01: Resendがerrorを返した場合、is_sent=false のまま200", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const targetEmail = `invitee-b01-${Date.now()}@test.local`;
    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_email: targetEmail }));
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

    const targetEmail = `invitee-b02-${Date.now()}@test.local`;
    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_email: targetEmail }));
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

    const targetEmail = `invitee-c01-${Date.now()}@test.local`;
    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_email: targetEmail }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.is_sent).toBe(false);
    expect(sendMock).toHaveBeenCalledTimes(0);
  });
});

// ── D. 権限なし ────────────────────────────────────────────────────────
describe("TC-INV-MAIL-D: 権限なしロールは403でメールも送信されない", () => {
  it("TC-INV-MAIL-D-01: artistロールは招待を発行できない", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(artistId, "artist", "権限なしアーティスト");

    const res = await invitationsPOST(buildRequest({ target_role: "artist", target_email: `invitee-d01-${Date.now()}@test.local` }));
    expect(res.status).toBe(403);
    expect(sendMock).toHaveBeenCalledTimes(0);
  });

  it("TC-INV-MAIL-D-02: メールアドレスなしは400でメールも送信されない", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_dummy" }, error: null });
    mockAs(agentId, "agent", AGENT_DISPLAY_NAME);

    const res = await invitationsPOST(buildRequest({ target_role: "artist" }));
    expect(res.status).toBe(400);
    expect(sendMock).toHaveBeenCalledTimes(0);
  });
});
