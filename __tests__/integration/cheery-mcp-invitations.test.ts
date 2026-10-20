/**
 * TC-CHEERY-MCP-INV: MCP ツール my_invitations（発行した会員招待。状態の判定は lib/invitation-status.ts を招待管理画面と共用）
 *
 * アクセス範囲表
 * | 対象の招待                         | 出すか |
 * |------------------------------------|--------|
 * | 本人が発行（未開封・閲覧済み・受諾済み・期限切れ） | ○ |
 * | 本人が発行して削除した               | ×      |
 * | 別の人が発行した                     | ×      |
 * 返さない項目：招待リンクのトークン・相手のメールアドレス
 * 登録するロール：オーガナイザー以上（招待管理画面・/api/invitations と同じ。アーティストは招待を出せない）
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { testAdmin } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { connectDcMcp, type DcMcpSession } from "@/lib/mcp/in-process";
import { jstDateTime } from "@/lib/mcp/format";
import { invitationStatusLabel } from "@/lib/invitation-status";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;
const email = (k: string) => `mcpi-${k}-${ts}@test.local`;
const P: Record<string, string> = {};
const profiles: string[] = [];
const invIds: string[] = [];
const tokens: string[] = [];
const sessions: DcMcpSession[] = [];

async function mcpAs(key: string, role: string) {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: "TestPass123!" });
  if (error) throw error;
  const s = await connectDcMcp({ userId: P[key], email: email(key), role, supabase: c, admin: testAdmin, now: NOW });
  sessions.push(s);
  return s;
}
async function call(s: DcMcpSession) {
  const r = await s.tools.find((t) => t.name === "my_invitations")!.run({});
  expect(r.isError).toBe(false);
  return r.content;
}
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();
async function inv(by: string, row: Record<string, unknown>) {
  const { data, error } = await testAdmin.from("invitations").insert({ invited_by_profile_id: P[by], ...row }).select("invitation_id, token").single();
  if (error) throw error;
  invIds.push(data.invitation_id);
  tokens.push(data.token);
}

beforeAll(async () => {
  for (const [k, role] of [["org", "organizer"], ["joined", "artist"], ["known", "user"], ["other", "organizer"], ["art", "artist"]] as const) {
    P[k] = await insertProfile({ role, displayName: `MCPI ${k}`, email: email(k) });
    profiles.push(P[k]);
  }
  // 古い順に作る（新しい順に並ぶことを確かめる）
  await inv("org", { target_role: "artist", target_email: `expired-${ts}@example.com`, created_at: at(40), expires_at: at(10) });
  await inv("org", { target_role: "artist", target_email: `accepted-${ts}@example.com`, status: "accepted", accepted_by_profile_id: P.joined, accepted_at: at(5), created_at: at(6), expires_at: at(-24), is_sent: true });
  await inv("org", { target_role: "artist", target_profile_id: P.known, created_at: at(3), expires_at: at(-27), viewed_at: at(2) });
  await inv("org", { target_role: "artist", target_email: `unopened-${ts}@example.com`, created_at: at(1), expires_at: at(-29) });
  await inv("org", { target_role: "artist", target_email: `deleted-${ts}@example.com`, created_at: at(0.5), deleted_at: at(0.1) });
  await inv("other", { target_role: "artist", target_email: `others-${ts}@example.com`, created_at: at(0.2) });
}, 60_000);

afterAll(async () => {
  for (const s of sessions) await s.close();
  await testAdmin.from("invitations").delete().in("invitation_id", invIds);
  await deleteAuthUsers(profiles);
}, 60_000);

describe("TC-CHEERY-MCP-INV: my_invitations", () => {
  it("本人が発行した招待を新しい順に、画面と同じ状態で出す（削除済み・他人の招待は出さない）", async () => {
    expect(await call(await mcpAs("org", "organizer"))).toBe([
      "発行した会員招待 4件（未開封 1件・閲覧済み 1件・受諾済み・ログイン可 1件・期限切れ 1件。4件を表示）",
      "1. アーティスト / DJとして招待",
      "  - 相手: メールアドレスで招待（宛先は招待管理画面で確認）",
      "  - 状態: 未開封",
      `  - 発行: ${jstDateTime(at(1))}`,
      `  - 有効期限: ${jstDateTime(at(-29))}`,
      "  - 送信済みの印: なし",
      "2. アーティスト / DJとして招待",
      "  - 相手: MCPI known",
      "  - 状態: 閲覧済み",
      `  - 発行: ${jstDateTime(at(3))}`,
      `  - 有効期限: ${jstDateTime(at(-27))}`,
      "  - 送信済みの印: なし",
      "3. アーティスト / DJとして招待",
      "  - 相手: MCPI joined",
      "  - 状態: 受諾済み・ログイン可",
      `  - 発行: ${jstDateTime(at(6))}`,
      `  - 有効期限: ${jstDateTime(at(-24))}`,
      "  - 送信済みの印: あり",
      "4. アーティスト / DJとして招待",
      "  - 相手: メールアドレスで招待（宛先は招待管理画面で確認）",
      "  - 状態: 期限切れ",
      `  - 発行: ${jstDateTime(at(40))}`,
      `  - 有効期限: ${jstDateTime(at(10))}`,
      "  - 送信済みの印: なし",
    ].join("\n"));
  });

  it("招待リンクのトークンとメールアドレスは返さない", async () => {
    const text = await call(await mcpAs("org", "organizer"));
    for (const t of tokens) expect(`${t}:${text.includes(t)}`).toBe(`${t}:false`);
    expect(text.includes("@example.com")).toBe(false);
  });

  it("状態の判定：期限切れは status が pending のままでも有効期限で決まる（画面と同じ）", () => {
    expect(invitationStatusLabel({ status: "pending", expires_at: at(1), viewed_at: at(2), accepted_by: null }, NOW)).toBe("期限切れ");
    expect(invitationStatusLabel({ status: "accepted", expires_at: at(1), viewed_at: null, accepted_by: null }, NOW)).toBe("受諾済み");
    expect(invitationStatusLabel({ status: "expired", expires_at: at(-5), viewed_at: null, accepted_by: null }, NOW)).toBe("期限切れ");
  });

  it("アーティストには登録しない（招待を出せない）", async () => {
    const s = await mcpAs("art", "artist");
    expect(s.tools.some((t) => t.name === "my_invitations")).toBe(false);
  });
});
