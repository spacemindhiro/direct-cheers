/**
 * TC-CLAIM: 決済後アカウント作成のメール所有証明
 *
 *   GET  /auth/claim/[token]        （app/[locale]/auth/claim/[token]/route.ts）
 *   POST /api/account/claim-resend  （サンクス画面の「確認メールを再送」）
 *   lib/purchase-claim.ts           （トークン発行・URL組み立て）
 *
 * 「アカウントは、そのメールに届いたリンクを踏んだ人しか作れない」を検証する。
 * トークンは purchase_claim_tokens（30日・1回のみ）。クリック時にサーバー内で
 * Supabase の短命リンクを generateLink → verifyOtp と連続実行してセッションを張る
 * （TC-INV-CLAIM と同じ仕組み）。
 *
 * カバレッジ:
 *   A. 新規客（auth 未作成）: auth ユーザー＋profiles(role=user, status=active) が作られ、
 *      provisional_users が昇格し、トークンが使用済みになり、/auth/passkey-setup へ
 *   B. 既存会員: 新規作成されず本人でログインし、パスキー有無で遷移先が変わる
 *   C. 使用済み・期限切れ・存在しないトークンは /auth/error へ（DBは一切変わらない）
 *   D. redirect_path はサイト内相対パス以外を無視する
 *   E. claim-resend: 宛先は決済行の sender_email と一致する場合のみ・60秒の連打抑止
 *   F. issuePurchaseClaimUrl: 発行した行の内容と URL の対応
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
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

const sendMock = vi.fn().mockResolvedValue({ data: { id: "email_test" }, error: null });
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { createClient } from "@/lib/supabase/server";
import { GET as claimGET } from "@/app/[locale]/auth/claim/[token]/route";
import { POST as resendPOST } from "@/app/api/account/claim-resend/route";
import { issuePurchaseClaimUrl, buildClaimUrl, claimRedirectPathFor, CLAIM_RESEND_INTERVAL_SEC } from "@/lib/purchase-claim";

// verifyOtp 成功時はクライアント内部のセッションがそのユーザーに切り替わるため、
// testAdmin と共有せず、呼び出しごとに独立したクライアントを使う。
// 直近のセッションユーザー（= ルートが getUser で見るログイン状態）を模擬する。
let sessionUserId: string | null = null;
(createClient as any).mockImplementation(async () => {
  const c = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return {
    auth: {
      getUser: async () => ({ data: { user: sessionUserId ? { id: sessionUserId } : null }, error: null }),
      verifyOtp: (args: unknown) => c.auth.verifyOtp(args as any),
    },
  };
});

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function buildParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

function claimRequest(token: string) {
  return new Request(`http://localhost:3000/auth/claim/${token}`, { method: "GET" });
}

function resendRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/account/claim-resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function insertToken(params: {
  email: string;
  transactionId?: string | null;
  redirectPath?: string;
  expiresAt?: string;
  usedAt?: string | null;
}): Promise<{ tokenId: string; token: string }> {
  const { data, error } = await testAdmin
    .from("purchase_claim_tokens")
    .insert({
      email: params.email,
      transaction_id: params.transactionId ?? null,
      ...(params.redirectPath ? { redirect_path: params.redirectPath } : {}),
      ...(params.expiresAt ? { expires_at: params.expiresAt } : {}),
      used_at: params.usedAt ?? null,
    })
    .select("token_id, token")
    .single();
  if (error) throw new Error(`トークン挿入失敗: ${error.message}`);
  return { tokenId: data.token_id, token: data.token };
}

async function getToken(tokenId: string) {
  const { data } = await testAdmin
    .from("purchase_claim_tokens")
    .select("used_at")
    .eq("token_id", tokenId)
    .single();
  return data!;
}

async function findAuthUserId(email: string): Promise<string | null> {
  const { data } = await testAdmin.rpc("find_auth_user_id_by_email", { p_email: email });
  return (data as string | null) ?? null;
}

async function insertMinimalTransaction(senderEmail: string): Promise<string> {
  const { data, error } = await testAdmin
    .from("transactions")
    .insert({
      stripe_payment_intent_id: `pi_tc_claim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      total_gross_amount: 1000,
      net_amount: 900,
      stripe_fee: 40,
      platform_fee: 60,
      status: "completed",
      transaction_type: "purchase",
      payment_method: "card",
      sender_email: senderEmail,
    })
    .select("transaction_id")
    .single();
  if (error) throw new Error(`transaction 挿入失敗: ${error.message}`);
  return data.transaction_id;
}

// ─── フィクスチャ ──────────────────────────────────────────────────────
let memberId: string;
let memberEmail: string;
let memberWithPasskeyId: string;
let memberWithPasskeyEmail: string;
let passkeyCredentialId: string;

const cleanup = {
  profileIds: [] as string[],
  claimedEmails: [] as string[],
  provisionalEmails: [] as string[],
  transactionIds: [] as string[],
  tokenEmails: [] as string[],
};

beforeAll(async () => {
  const ts = Date.now();
  memberEmail = `claim-member-${ts}@test.local`;
  memberId = await insertProfile({ role: "user", displayName: "claim既存会員", email: memberEmail });
  memberWithPasskeyEmail = `claim-member-pk-${ts}@test.local`;
  memberWithPasskeyId = await insertProfile({ role: "user", displayName: "claim既存会員(パスキー有)", email: memberWithPasskeyEmail });
  cleanup.profileIds.push(memberId, memberWithPasskeyId);

  passkeyCredentialId = `tc-claim-cred-${ts}`;
  const { error } = await testAdmin.from("passkey_credentials").insert({
    credential_id: passkeyCredentialId,
    profile_id: memberWithPasskeyId,
    public_key: "\\x00",
    counter: 0,
    device_type: "singleDevice",
    backed_up: false,
    transports: [],
  });
  if (error) throw new Error(`credential 挿入失敗: ${error.message}`);
}, 30_000);

afterAll(async () => {
  await testAdmin.from("passkey_credentials").delete().eq("credential_id", passkeyCredentialId);
  if (cleanup.tokenEmails.length)
    await testAdmin.from("purchase_claim_tokens").delete().in("email", cleanup.tokenEmails);
  if (cleanup.transactionIds.length)
    await testAdmin.from("transactions").delete().in("transaction_id", cleanup.transactionIds);
  if (cleanup.provisionalEmails.length)
    await testAdmin.from("provisional_users").delete().in("email", cleanup.provisionalEmails);
  // claim 成功時に invite で新規作成された auth user（＋profiles）を掃除する
  for (const email of cleanup.claimedEmails) {
    const id = await findAuthUserId(email);
    if (id) {
      await testAdmin.from("profiles").delete().eq("profile_id", id);
      await testAdmin.auth.admin.deleteUser(id).catch(() => {});
    }
  }
  await deleteAuthUsers(cleanup.profileIds);
});

beforeEach(() => {
  sessionUserId = null;
  sendMock.mockClear();
});

// ── A. 新規客のアカウント作成 ───────────────────────────────────────────
describe("TC-CLAIM-A: 新規客（auth 未作成）がリンクを踏むとアカウントが作られる", () => {
  it("TC-CLAIM-A-01: auth＋profiles(user/active) 作成・provisional 昇格・トークン使用済み・passkey-setup へ", async () => {
    const ts = Date.now();
    const email = `claim-new-a01-${ts}@test.local`;
    cleanup.claimedEmails.push(email);
    cleanup.provisionalEmails.push(email);
    cleanup.tokenEmails.push(email);

    // 決済時に作られる provisional_users（auth 未作成・profile_id null）
    const { error: provErr } = await testAdmin.from("provisional_users").insert({ email });
    if (provErr) throw new Error(`provisional 挿入失敗: ${provErr.message}`);
    expect(await findAuthUserId(email)).toBeNull();

    const { tokenId, token } = await insertToken({ email, redirectPath: "/tickets" });

    const res = await claimGET(claimRequest(token), buildParams(token));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      `http://localhost:3000/auth/passkey-setup?redirect=${encodeURIComponent("/tickets")}`,
    );

    // auth ユーザーがメール確認済みで作られている
    const authUserId = await findAuthUserId(email);
    expect(authUserId).not.toBeNull();
    const { data: authUser } = await testAdmin.auth.admin.getUserById(authUserId!);
    expect(authUser.user?.email).toBe(email);
    expect(authUser.user?.email_confirmed_at).not.toBeNull();

    // profiles: 買い手として role=user / status=active / display_name=email
    const { data: profile } = await testAdmin
      .from("profiles").select("role, status, display_name").eq("profile_id", authUserId!).single();
    expect(profile).toEqual({ role: "user", status: "active", display_name: email });

    // provisional_users が本登録に昇格
    const { data: prov } = await testAdmin
      .from("provisional_users").select("profile_id, converted_at").eq("email", email).single();
    expect(prov?.profile_id).toBe(authUserId);
    expect(prov?.converted_at).not.toBeNull();

    // トークンは使用済み
    expect((await getToken(tokenId)).used_at).not.toBeNull();
  });

  it("TC-CLAIM-A-02: 同じトークンを二度踏む → claim_used（アカウントは増えない）", async () => {
    const ts = Date.now();
    const email = `claim-new-a02-${ts}@test.local`;
    cleanup.claimedEmails.push(email);
    cleanup.tokenEmails.push(email);
    const { token } = await insertToken({ email });

    const first = await claimGET(claimRequest(token), buildParams(token));
    expect(first.status).toBe(307);
    const createdId = await findAuthUserId(email);
    expect(createdId).not.toBeNull();

    const second = await claimGET(claimRequest(token), buildParams(token));
    expect(second.status).toBe(307);
    expect(second.headers.get("location")).toBe("http://localhost:3000/auth/error?error=claim_used");
    expect(await findAuthUserId(email)).toBe(createdId);
  });

  it("TC-CLAIM-A-03: provisional_users が無くても（webhook 先行等）作成できる・遷移先の既定は /dashboard/collection", async () => {
    const ts = Date.now();
    const email = `claim-new-a03-${ts}@test.local`;
    cleanup.claimedEmails.push(email);
    cleanup.tokenEmails.push(email);
    const { token } = await insertToken({ email });

    const res = await claimGET(claimRequest(token), buildParams(token));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      `http://localhost:3000/auth/passkey-setup?redirect=${encodeURIComponent("/dashboard/collection")}`,
    );
    expect(await findAuthUserId(email)).not.toBeNull();
  });
});

// ── B. 既存会員 ─────────────────────────────────────────────────────────
describe("TC-CLAIM-B: 既存会員がリンクを踏んでも新規作成されず本人でログインする", () => {
  it("TC-CLAIM-B-01: パスキー未登録の会員 → 本人IDのまま・profiles 不変・passkey-setup へ", async () => {
    cleanup.tokenEmails.push(memberEmail);
    const { tokenId, token } = await insertToken({ email: memberEmail, redirectPath: "/dashboard/collection" });

    const res = await claimGET(claimRequest(token), buildParams(token));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      `http://localhost:3000/auth/passkey-setup?redirect=${encodeURIComponent("/dashboard/collection")}`,
    );
    expect(await findAuthUserId(memberEmail)).toBe(memberId);
    const { data: profile } = await testAdmin
      .from("profiles").select("role, status, display_name").eq("profile_id", memberId).single();
    expect(profile).toEqual({ role: "user", status: "active", display_name: "claim既存会員" });
    expect((await getToken(tokenId)).used_at).not.toBeNull();
  });

  it("TC-CLAIM-B-02: どこかの端末でパスキー登録済みの会員 → passkey-setup を挟まず遷移先へ直行", async () => {
    cleanup.tokenEmails.push(memberWithPasskeyEmail);
    const { token } = await insertToken({ email: memberWithPasskeyEmail, redirectPath: "/tickets" });

    const res = await claimGET(claimRequest(token), buildParams(token));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/tickets");
  });

  it("TC-CLAIM-B-03: そのアカウントで既にログイン中 → verifyOtp を経ずトークン消費して遷移先へ", async () => {
    sessionUserId = memberWithPasskeyId;
    cleanup.tokenEmails.push(memberWithPasskeyEmail);
    const { tokenId, token } = await insertToken({ email: memberWithPasskeyEmail, redirectPath: "/tickets" });

    const res = await claimGET(claimRequest(token), buildParams(token));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/tickets");
    expect((await getToken(tokenId)).used_at).not.toBeNull();
  });
});

// ── C. 無効トークン ─────────────────────────────────────────────────────
describe("TC-CLAIM-C: 無効なトークンは何も作らず /auth/error へ", () => {
  it("TC-CLAIM-C-01: 存在しないトークン → claim_invalid", async () => {
    const res = await claimGET(claimRequest("no-such-token"), buildParams("no-such-token"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth/error?error=claim_invalid");
  });

  it("TC-CLAIM-C-02: 期限切れ → claim_expired（auth ユーザーは作られない・used_at も付かない）", async () => {
    const ts = Date.now();
    const email = `claim-expired-c02-${ts}@test.local`;
    cleanup.tokenEmails.push(email);
    const { tokenId, token } = await insertToken({
      email,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await claimGET(claimRequest(token), buildParams(token));
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth/error?error=claim_expired");
    expect(await findAuthUserId(email)).toBeNull();
    expect((await getToken(tokenId)).used_at).toBeNull();
  });

  it("TC-CLAIM-C-03: 使用済み → claim_used（期限内でも）", async () => {
    const ts = Date.now();
    const email = `claim-used-c03-${ts}@test.local`;
    cleanup.tokenEmails.push(email);
    const { token } = await insertToken({ email, usedAt: new Date().toISOString() });

    const res = await claimGET(claimRequest(token), buildParams(token));
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth/error?error=claim_used");
    expect(await findAuthUserId(email)).toBeNull();
  });
});

// ── D. redirect_path の制限 ────────────────────────────────────────────
describe("TC-CLAIM-D: redirect_path はサイト内の相対パスのみ", () => {
  it.each([
    ["絶対URL", "https://evil.example/phish"],
    ["プロトコル相対", "//evil.example/phish"],
  ])("TC-CLAIM-D: %s は無視して /dashboard/collection へ", async (_label, redirectPath) => {
    cleanup.tokenEmails.push(memberWithPasskeyEmail);
    const { token } = await insertToken({ email: memberWithPasskeyEmail, redirectPath });
    const res = await claimGET(claimRequest(token), buildParams(token));
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard/collection");
  });
});

// ── E. 再送 ─────────────────────────────────────────────────────────────
describe("TC-CLAIM-E: claim-resend（サンクス画面の再送）", () => {
  it("TC-CLAIM-E-01: 必須欠損 → 400", async () => {
    const res = await resendPOST(resendRequest({ email: "x@test.local" }));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("TC-CLAIM-E-02: 決済行の sender_email と不一致 → 404（他人の決済IDで任意宛先には送れない）", async () => {
    const ts = Date.now();
    const senderEmail = `claim-resend-e02-${ts}@test.local`;
    const txId = await insertMinimalTransaction(senderEmail);
    cleanup.transactionIds.push(txId);

    const res = await resendPOST(resendRequest({ transaction_id: txId, email: `attacker-${ts}@test.local` }));
    expect(res.status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
    const { count } = await testAdmin
      .from("purchase_claim_tokens").select("*", { count: "exact", head: true }).eq("transaction_id", txId);
    expect(count).toBe(0);
  });

  it("TC-CLAIM-E-03: 一致 → トークン発行してそのメールへ送信、60秒以内の再送は 429", async () => {
    const ts = Date.now();
    const senderEmail = `claim-resend-e03-${ts}@test.local`;
    cleanup.tokenEmails.push(senderEmail);
    const txId = await insertMinimalTransaction(senderEmail);
    cleanup.transactionIds.push(txId);

    // メールアドレスは大文字小文字を無視して一致させる
    const res = await resendPOST(resendRequest({ transaction_id: txId, email: senderEmail.toUpperCase() }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const { data: rows } = await testAdmin
      .from("purchase_claim_tokens")
      .select("token, email, redirect_path, used_at")
      .eq("transaction_id", txId);
    expect(rows).toHaveLength(1);
    expect(rows![0].email).toBe(senderEmail);
    expect(rows![0].redirect_path).toBe("/dashboard/collection");
    expect(rows![0].used_at).toBeNull();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = sendMock.mock.calls[0][0];
    expect(mail.to).toBe(senderEmail);
    expect(mail.html).toContain(`href="${SITE_URL}/auth/claim/${rows![0].token}"`);
    expect(mail.html).toContain("利用規約");

    // 連打抑止
    const again = await resendPOST(resendRequest({ transaction_id: txId, email: senderEmail }));
    expect(again.status).toBe(429);
    expect((await again.json()).retry_after).toBe(CLAIM_RESEND_INTERVAL_SEC);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

// ── F. トークン発行ヘルパー ─────────────────────────────────────────────
describe("TC-CLAIM-F: issuePurchaseClaimUrl / claimRedirectPathFor", () => {
  it("TC-CLAIM-F-01: 発行した行（email / transaction_id / redirect_path / 30日期限）と URL が対応する", async () => {
    const ts = Date.now();
    const email = `claim-issue-f01-${ts}@test.local`;
    cleanup.tokenEmails.push(email);
    const txId = await insertMinimalTransaction(email);
    cleanup.transactionIds.push(txId);

    const before = Date.now();
    const url = await issuePurchaseClaimUrl(testAdmin as any, {
      email,
      transactionId: txId,
      redirectPath: "/tickets",
    });

    const { data: row } = await testAdmin
      .from("purchase_claim_tokens")
      .select("token, email, transaction_id, redirect_path, expires_at, used_at")
      .eq("email", email)
      .single();
    expect(url).toBe(buildClaimUrl(row!.token));
    expect(url).toBe(`${SITE_URL}/auth/claim/${row!.token}`);
    expect(row!.transaction_id).toBe(txId);
    expect(row!.redirect_path).toBe("/tickets");
    expect(row!.used_at).toBeNull();
    const expiresIn = new Date(row!.expires_at).getTime() - before;
    expect(expiresIn).toBeGreaterThan(29 * 24 * 3600 * 1000);
    expect(expiresIn).toBeLessThanOrEqual(30 * 24 * 3600 * 1000 + 60_000);
  });

  it("TC-CLAIM-F-02: 商品種別→遷移先（entrance のみ /tickets）", () => {
    expect(claimRedirectPathFor("entrance")).toBe("/tickets");
    expect(claimRedirectPathFor("custom")).toBe("/dashboard/collection");
    expect(claimRedirectPathFor("cheers")).toBe("/dashboard/collection");
    expect(claimRedirectPathFor(null)).toBe("/dashboard/collection");
    expect(claimRedirectPathFor(undefined)).toBe("/dashboard/collection");
  });
});
