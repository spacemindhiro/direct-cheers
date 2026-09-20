/**
 * TC-PASSKEYS: passkeys 認証ルートのスモークテスト
 *
 * WebAuthn のフルフロー（実デバイス）はテスト環境では再現不可のため、
 * 以下を検証する:
 *   A. register-options — バリデーション・既存ユーザーでのオプション生成
 *      （登録は auth.users に行がある本人のセッション必須。auth 未作成の
 *      新規客は /auth/claim 経由でしかアカウントを作れないので 401）
 *   B. auth-options — 未登録ユーザーで適切なエラー
 *   C. credentials GET — 権限チェック
 *   D. register-verify — 本人セッション必須・auth 未作成は新規作成せず 401
 *      （WebAuthn検証の手前でガードが効くことを確認）
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
import { POST as registerVerifyPOST } from "@/app/api/passkeys/register-verify/route";
import { POST as authOptionsPOST } from "@/app/api/passkeys/auth-options/route";
import { GET as credentialsGET } from "@/app/api/passkeys/credentials/route";

let profileId: string;
let testEmail: string;
// 既存アカウントに対する「別人のセッション」役
let otherProfileId: string;
// 決済済みだが auth.users 未作成（provisional_users のみ）の新規客
let provisionalOnlyEmail: string;

const cleanup = { profileIds: [] as string[], provisionalEmails: [] as string[] };

async function countRegistrationChallenges(): Promise<number> {
  const { count } = await testAdmin
    .from("passkey_challenges")
    .select("*", { count: "exact", head: true })
    .eq("purpose", "registration");
  return count ?? 0;
}

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

  otherProfileId = await insertProfile({
    role: "user",
    displayName: "Passkeys 別人",
    email: `passkeys-other-${ts}@test.local`,
  });
  cleanup.profileIds.push(otherProfileId);

  provisionalOnlyEmail = `passkeys-prov-${ts}@test.local`;
  await testAdmin.from("provisional_users").insert({ email: provisionalOnlyEmail });
  cleanup.provisionalEmails.push(provisionalOnlyEmail);
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

  it("TC-PASSKEYS-A-02: 既存ユーザーのメール＋本人セッション → 200（options.challenge が返る）", async () => {
    mockAuth(profileId);
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

  it("TC-PASSKEYS-A-04: 既存ユーザーのメール＋セッション無し → 401（他人のアカウントへの鍵追加を拒否）", async () => {
    mockAuth(null);
    const req = new Request("http://localhost/api/passkeys/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost" },
      body: JSON.stringify({ email: testEmail }),
    });
    const res = await registerOptionsPOST(req);
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
    expect(data.options).toBeUndefined();
  });

  it("TC-PASSKEYS-A-05: 既存ユーザーのメール＋別人のセッション → 401", async () => {
    mockAuth(otherProfileId);
    const req = new Request("http://localhost/api/passkeys/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost" },
      body: JSON.stringify({ email: testEmail }),
    });
    const res = await registerOptionsPOST(req);
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("TC-PASSKEYS-A-06: provisional_users のみ（auth未作成）のメール＋セッション無し → 401（新規作成は /auth/claim 経由のみ・challenge も発行しない）", async () => {
    mockAuth(null);
    const before = await countRegistrationChallenges();
    const req = new Request("http://localhost/api/passkeys/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost" },
      body: JSON.stringify({ email: provisionalOnlyEmail }),
    });
    const res = await registerOptionsPOST(req);
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
    expect(data.options).toBeUndefined();
    expect(await countRegistrationChallenges()).toBe(before);
  });

  it("TC-PASSKEYS-A-07: 既存ユーザーのメール＋本人セッション → excludeCredentials に登録済み鍵が入る", async () => {
    mockAuth(profileId);
    const credentialId = `tc-a-07-cred-${Date.now()}`;
    const { error } = await testAdmin.from("passkey_credentials").insert({
      credential_id: credentialId,
      profile_id: profileId,
      public_key: "\\x00",
      counter: 0,
      device_type: "singleDevice",
      backed_up: false,
      transports: [],
    });
    if (error) throw new Error(`credential 挿入失敗: ${error.message}`);
    try {
      const req = new Request("http://localhost/api/passkeys/register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "localhost" },
        body: JSON.stringify({ email: testEmail }),
      });
      const res = await registerOptionsPOST(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.options.excludeCredentials.map((c: { id: string }) => c.id)).toEqual([credentialId]);
    } finally {
      await testAdmin.from("passkey_credentials").delete().eq("credential_id", credentialId);
    }
  });
});

// ── TC-PASSKEYS-D: register-verify 本人セッションガード ─────────────────
// clientDataJSON に埋めた challenge を passkey_challenges から引けるようにし、
// WebAuthn 検証の手前（セッションガード）まで到達させる。
async function buildVerifyRequest(email: string, challenge: string): Promise<Request> {
  const clientDataJSON = Buffer.from(
    JSON.stringify({ type: "webauthn.create", challenge, origin: "http://localhost:3000" }),
  ).toString("base64url");
  return new Request("http://localhost/api/passkeys/register-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost", origin: "http://localhost:3000" },
    body: JSON.stringify({
      email,
      credential: {
        id: "dummy",
        rawId: "dummy",
        type: "public-key",
        response: { clientDataJSON, attestationObject: "AA", transports: [] },
        clientExtensionResults: {},
      },
    }),
  });
}

async function insertChallenge(challenge: string): Promise<void> {
  const { error } = await testAdmin
    .from("passkey_challenges")
    .insert({ challenge, profile_id: null, purpose: "registration" });
  if (error) throw new Error(`challenge 挿入失敗: ${error.message}`);
}

describe("TC-PASSKEYS-D: register-verify — 既存アカウントへの追加登録は本人セッション必須", () => {
  it("TC-PASSKEYS-D-01: 既存ユーザーのメール＋セッション無し → 401（challengeは消費されない）", async () => {
    mockAuth(null);
    const challenge = `tc-d-01-${Date.now()}`;
    await insertChallenge(challenge);
    const res = await registerVerifyPOST(await buildVerifyRequest(testEmail, challenge));
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
    expect(data.session_token).toBeUndefined();
    // ガードは challenge 削除より前に効く（拒否後も challenge は残る）
    const { data: row } = await testAdmin
      .from("passkey_challenges").select("challenge_id").eq("challenge", challenge).maybeSingle();
    expect(row).not.toBeNull();
    // 既存ユーザーに鍵が増えていないこと
    const { count } = await testAdmin
      .from("passkey_credentials").select("*", { count: "exact", head: true }).eq("profile_id", profileId);
    expect(count).toBe(0);
  });

  it("TC-PASSKEYS-D-02: 既存ユーザーのメール＋別人のセッション → 401", async () => {
    mockAuth(otherProfileId);
    const challenge = `tc-d-02-${Date.now()}`;
    await insertChallenge(challenge);
    const res = await registerVerifyPOST(await buildVerifyRequest(testEmail, challenge));
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("TC-PASSKEYS-D-03: 既存ユーザーのメール＋本人セッション → ガード通過（WebAuthn検証で400、401ではない）", async () => {
    mockAuth(profileId);
    const challenge = `tc-d-03-${Date.now()}`;
    await insertChallenge(challenge);
    const res = await registerVerifyPOST(await buildVerifyRequest(testEmail, challenge));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).not.toBe("Unauthorized");
  });

  it("TC-PASSKEYS-D-04: provisional_users のみ（auth未作成）のメール＋セッション無し → 401（auth ユーザーを作らない）", async () => {
    mockAuth(null);
    const challenge = `tc-d-04-${Date.now()}`;
    await insertChallenge(challenge);
    const res = await registerVerifyPOST(await buildVerifyRequest(provisionalOnlyEmail, challenge));
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
    expect(data.session_token).toBeUndefined();
    // 以前はここで createUser({ email_confirm: true }) が走っていた。auth.users が増えていないこと
    const { data: authUserId } = await testAdmin.rpc("find_auth_user_id_by_email", { p_email: provisionalOnlyEmail });
    expect(authUserId).toBeNull();
    // provisional_users も昇格されていないこと
    const { data: prov } = await testAdmin
      .from("provisional_users").select("profile_id, converted_at").eq("email", provisionalOnlyEmail).single();
    expect(prov?.profile_id).toBeNull();
    expect(prov?.converted_at).toBeNull();
  });

  it("TC-PASSKEYS-D-05: どこにも無いメール＋セッション無し → 404（401より前に Email not found）", async () => {
    mockAuth(null);
    const challenge = `tc-d-05-${Date.now()}`;
    await insertChallenge(challenge);
    const res = await registerVerifyPOST(await buildVerifyRequest(`nobody-${Date.now()}@test.local`, challenge));
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe("Email not found");
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
