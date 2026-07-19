/**
 * TC-SIMPLE-LOGIN: 決済QR画面の「簡易ログイン」認識ロジックの検証
 *
 * app/c/[qrConfigId]/page.tsx が dc_ce Cookie（メールアドレス）から
 * provisional_users → profiles を辿って表示名を解決するロジックを、
 * 実際のDBクエリチェーンとして検証する（page.tsx自体はServer Componentで
 * 直接unit testできないため、同一のクエリ手順を再現して検証する）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

let profileId: string;
const email = `simple-login-${Date.now()}@test.local`;

async function resolveRecognizedName(cookieEmail: string | null): Promise<string | null> {
  if (!cookieEmail) return null;
  const { data: provisional } = await testAdmin
    .from("provisional_users")
    .select("profile_id")
    .eq("email", cookieEmail)
    .maybeSingle();
  if (!provisional?.profile_id) return null;
  const { data: profile } = await testAdmin
    .from("profiles")
    .select("display_name")
    .eq("profile_id", provisional.profile_id)
    .maybeSingle();
  return profile?.display_name ?? null;
}

beforeAll(async () => {
  profileId = await insertProfile({
    role: "user",
    displayName: "簡易ログイン太郎",
    email: `profile-${email}`,
  });
  const { error } = await testAdmin
    .from("provisional_users")
    .insert({ email, profile_id: profileId });
  if (error) throw new Error(`provisional_users挿入失敗: ${error.message}`);
});

afterAll(async () => {
  await testAdmin.from("provisional_users").delete().eq("email", email);
  await testAdmin.from("profiles").delete().eq("profile_id", profileId);
  await deleteAuthUsers([profileId]);
});

describe("TC-SIMPLE-LOGIN: dc_ce Cookie経由の本人認識", () => {
  it("TC-SIMPLE-LOGIN-01: 登録済みメールのCookie → 表示名が解決できる", async () => {
    const name = await resolveRecognizedName(email);
    expect(name).toBe("簡易ログイン太郎");
  });

  it("TC-SIMPLE-LOGIN-02: 未登録メールのCookie → nullが返る（本人特定できない）", async () => {
    const name = await resolveRecognizedName(`unknown-${Date.now()}@test.local`);
    expect(name).toBeNull();
  });

  it("TC-SIMPLE-LOGIN-03: Cookie自体が無い → nullが返る", async () => {
    const name = await resolveRecognizedName(null);
    expect(name).toBeNull();
  });
});
