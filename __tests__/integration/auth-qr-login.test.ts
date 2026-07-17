/**
 * TC-AUTH-QR: /auth/qr/[token] スキャナQRログインの統合テスト
 *
 * カバレッジ:
 *   A. 有効トークン → action_link へリダイレクトし、dc_stepup クッキーを発行する
 *      （QR生成者はstep-up済みスタッフ限定のため、QRログインをstep-up相当として扱う設計）
 *   B. 無効トークン → qr_invalid エラーへリダイレクトし、dc_stepup は発行しない
 *   C. 期限切れトークン → otp_expired エラーへリダイレクトし、dc_stepup は発行しない
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { GET } from "@/app/auth/qr/[token]/route";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

const ACTION_LINK = "https://example.com/auth/callback?token_hash=dummy&type=magiclink";

let staffId: string;
const tokens: string[] = [];

async function insertQrToken(params: { token: string; expiresAt?: string }) {
  const { error } = await testAdmin.from("scanner_qr_tokens").insert({
    token: params.token,
    action_link: ACTION_LINK,
    created_by: staffId,
    ...(params.expiresAt ? { expires_at: params.expiresAt } : {}),
  });
  if (error) throw new Error(`insertQrToken failed: ${error.message}`);
  tokens.push(params.token);
}

function callRoute(token: string) {
  return GET(new Request(`http://localhost:3000/auth/qr/${token}`), {
    params: Promise.resolve({ token }),
  });
}

beforeAll(async () => {
  staffId = await insertProfile({
    role: "organizer",
    displayName: "QRログインテスト用スタッフ",
    email: `qr-login-test-${randomUUID().slice(0, 8)}@example.com`,
  });
});

afterAll(async () => {
  await testAdmin.from("scanner_qr_tokens").delete().in("token", tokens);
  await testAdmin.from("profiles").delete().eq("profile_id", staffId);
  await deleteAuthUsers([staffId]);
});

describe("TC-AUTH-QR: /auth/qr/[token]", () => {
  it("A. 有効トークンはaction_linkへリダイレクトしdc_stepupを発行する", async () => {
    const token = `t${randomUUID().slice(0, 6)}`;
    await insertQrToken({ token });

    const res = await callRoute(token);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(ACTION_LINK);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("dc_stepup=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain(`Max-Age=${480 * 60}`);
    // 値は発行時刻(ms)であること（過去10秒以内）
    const value = Number(setCookie.match(/dc_stepup=(\d+)/)?.[1]);
    expect(value).toBeGreaterThan(Date.now() - 10_000);
    expect(value).toBeLessThanOrEqual(Date.now());
  });

  it("B. 無効トークンはqr_invalidへリダイレクトしdc_stepupを発行しない", async () => {
    const res = await callRoute("no-such-token");

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/error?error=qr_invalid");
    expect(res.headers.get("set-cookie") ?? "").not.toContain("dc_stepup=");
  });

  it("C. 期限切れトークンはotp_expiredへリダイレクトしdc_stepupを発行しない", async () => {
    const token = `t${randomUUID().slice(0, 6)}`;
    await insertQrToken({ token, expiresAt: new Date(Date.now() - 60_000).toISOString() });

    const res = await callRoute(token);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/error?error=otp_expired");
    expect(res.headers.get("set-cookie") ?? "").not.toContain("dc_stepup=");
  });
});
