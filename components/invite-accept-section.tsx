// Server Component（Suspense 内で呼び出す）
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteLoginPrompt, InviteAcceptButton } from "./invite-accept-client";

async function checkIsMember(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("provisional_users")
    .select("profile_id")
    .eq("email", email)
    .maybeSingle();
  if (data?.profile_id) return true;
  try {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = users?.users?.find((u) => u.email === email);
    // メール確認済みのユーザーのみ既存会員として扱う
    // 未確認の場合はサインアップ扱いにして再度確認メールを送らせる
    return !!(authUser?.email_confirmed_at);
  } catch {
    return false;
  }
}

export async function InviteAcceptSection({
  token,
  targetEmail,
}: {
  token: string;
  targetEmail?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const isMember = targetEmail ? await checkIsMember(targetEmail) : false;
    return <InviteLoginPrompt token={token} targetEmail={targetEmail} isMember={isMember} />;
  }

  // onboarding 未完了（profiles なし）の場合は onboarding に誘導
  // accept_invitation RPC の accepted_by_profile_id FK制約を満たすため必須
  const { data: profile } = await supabase
    .from("profiles")
    .select("profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect(`/onboarding/profile?redirect=/invite/${token}`);
  }

  return <InviteAcceptButton token={token} />;
}
