/**
 * TC-PASSKEYS: passkeys 認証ルートのスモークテスト
 *
 * WebAuthn のフルフロー（実デバイス）はテスト環境では再現不可のため、
 * 以下を検証する:
 *   A. register-options — バリデーション・既存ユーザーでのオプション生成
 *   B. auth-options — 未登録ユーザーで適切なエラー
 *   C. credentials GET — 権限チェック
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
import { POST as registerOptionsPOST } from "@/app/api/passkeys/register-options/route";
import { POST as authOptionsPOST } from "@/app/api/passkeys/auth-options/route";
import { GET as credentialsGET } from "@/app/api/passkeys/credentials/route";

let profileId: string;
let testEmail: string;

const cleanup = { profileIds: [] as string[], provisionalEmails: [] as string[] };

function mockAuth(id: string | null) {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: id ? { id } : null },
        error: null,
      }),
    },
    from: vi.fn((table: string) => testAdmin.from(table)),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  testEmail = `passkeys-test-${ts}@test.local`;
  profileId = await insertProfile({
    role: "organizer",
    displayName: "Passkeys テストユーザー",
    email: testEmail,
  });
  cleanup.profileIds.push(profileId);

  // register-options は provisional_users を先に検索する。
  // auth.admin.listUsers() はページネーションの関係で見つからないことがあるため、
  // provisional_users に明示的に登録しておく。
  await testAdmin.from("provisional_users").upsert(
    { email: testEmail, profile_id: profileId },
    { onConflict: "email" }
  );
  cleanup.provisionalEmails.push(testEmail);
}, 20_000);

afterAll(async () => {
  if (cleanup.provisionalEmails.length)
    await testAdmin.from("provisional_users").delete().in("email", cleanup.provisionalEmails);
  await deleteAuthUsers(cleanup.profileIds);
  // passkey_challenges のクリーンアップ（テスト中に挿入されたもの）
  await testAdmin.from("passkey_challenges").delete().is("profile_id", null).gte("created_at", new Date(Date.now() - 60_000).toISOString());
});

// ── TC-PASSKEYS-A: register-options ─────────────────────────────────────
describe("TC-PASSKEYS-A: register-options — 登録オプション生成", () => {
  it("TC-PASSKEYS-A-01: メールアドレス欠損 → 400", async () => {
    const req = new Request("http://localhost/api/passkeys/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost" },
      body: JSON.stringify({}),
    });
    const res = await registerOptionsPOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it("TC-PASSKEYS-A-02: 存在するユーザーのメール → 200（options.challenge が返る）", async () => {
    const req = new Request("http://localhost/api/passkeys/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost" },
      body: JSON.stringify({ email: testEmail }),
    });
    const res = await registerOptionsPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    // レスポンス: { options: { challenge, ... }, email, has_account }
    expect(data.options?.challenge).toBeTruthy();
    expect(Array.isArray(data.options?.excludeCredentials)).toBe(true);
    expect(data.has_account).toBe(true);
    expect(data.email).toBe(testEmail);
  });

  it("TC-PASSKEYS-A-03: 存在しないメール → 404 Email not found", async () => {
    const req = new Request("http://localhost/api/passkeys/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost" },
      body: JSON.stringify({ email: `nonexistent-${Date.now()}@test.local` }),
    });
    const res = await registerOptionsPOST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });
});

// ── TC-PASSKEYS-B: auth-options ──────────────────────────────────────────
describe("TC-PASSKEYS-B: auth-options — 認証オプション生成", () => {
  it("TC-PASSKEYS-B-01: パスキー未登録ユーザーのメール → 400（パスキーなし）", async () => {
    const req = new Request("http://localhost/api/passkeys/auth-options", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost" },
      body: JSON.stringify({ email: testEmail }),
    });
    const res = await authOptionsPOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it("TC-PASSKEYS-B-02: メールなし → 200（全クレデンシャル対象、options が返る）", async () => {
    const req = new Request("http://localhost/api/passkeys/auth-options", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost" },
      body: JSON.stringify({}),
    });
    const res = await authOptionsPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    // レスポンス: { options: { challenge, ... } }
    expect(data.options?.challenge).toBeTruthy();
  });
});

// ── TC-PASSKEYS-C: credentials 権限チェック ────────────────────────────
describe("TC-PASSKEYS-C: credentials — 権限チェック", () => {
  it("TC-PASSKEYS-C-01: 未認証 → 401", async () => {
    mockAuth(null);
    const res = await credentialsGET();
    expect(res.status).toBe(401);
  });

  it("TC-PASSKEYS-C-02: 認証済み → 200（credentials が配列）", async () => {
    mockAuth(profileId);
    const res = await credentialsGET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data.credentials)).toBe(true);
    expect(data.credentials).toHaveLength(0); // パスキー未登録
  });
});
