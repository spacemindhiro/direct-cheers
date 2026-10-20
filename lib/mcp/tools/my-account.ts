// my_account：本人のアカウントの状態（ロール・パスキー・Stripe Link・売上受取口座）。
// 返さないもの：メールアドレス・口座番号・Stripe のID
import { bankState, BANK_STATE_LABEL } from "@/lib/bank-status";
import { roleRank } from "@/lib/role-rank";
import type { DcMcpContext } from "../context";
import { lines } from "../format";

export const MY_ACCOUNT = {
  name: "my_account",
  minRole: "user",
  title: "アカウントの状態",
  description: "この人のアカウントの状態（ロール・パスキーの登録数・Stripe Link の登録・売上受取口座の審査状況・出金の停止）を返す。",
  inputSchema: {},
} as const;

const ROLE_LABEL: Record<string, string> = {
  user: "一般ユーザー", artist: "アーティスト", organizer: "オーガナイザー", agent: "エージェント", admin: "運営（admin）",
};

export async function myAccount(ctx: DcMcpContext): Promise<string> {
  const isAdmin = ctx.role === "admin";
  const [{ count: passkeys }, { data: profile }, link] = await Promise.all([
    ctx.admin.from("passkey_credentials").select("*", { count: "exact", head: true }).eq("profile_id", ctx.userId),
    ctx.admin.from("profiles").select("stripe_connect_id, verification_status, balance_frozen").eq("profile_id", ctx.userId).maybeSingle(),
    // ダッシュボードの「Stripe Link 登録済み」と同じ判定（admin には出していない）
    !isAdmin && ctx.email
      ? ctx.admin.from("provisional_users").select("stripe_customer_id").eq("email", ctx.email).not("stripe_customer_id", "is", null).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // 売上受取口座はプロフィール画面と同じく artist・organizer・agent に出す
  const isCreator = roleRank(ctx.role) >= roleRank("artist") && !isAdmin;
  return lines("アカウントの状態", [
    ["ロール", ROLE_LABEL[ctx.role] ?? ctx.role],
    ["パスキー", (passkeys ?? 0) > 0 ? `${passkeys}台の端末に登録済み` : "未登録（アカウント管理の「パスキー管理」から登録できます）"],
    ["Stripe Link", isAdmin ? null : link.data ? "登録済み" : "未登録（ダッシュボードの「Stripe Linkにカードを登録する」から登録できます）"],
    ["売上受取口座", isCreator ? BANK_STATE_LABEL[bankState(profile?.stripe_connect_id, profile?.verification_status)] : null],
    ["出金", isCreator && profile?.balance_frozen ? "口座が凍結されているため停止中" : null],
  ]);
}
