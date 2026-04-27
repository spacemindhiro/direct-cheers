// Server Component（Suspense 内で呼び出す）
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
    return users.users.some((u) => u.email === email);
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

  return <InviteAcceptButton token={token} />;
}
