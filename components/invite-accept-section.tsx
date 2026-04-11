// Server Component（Suspense 内で呼び出す）
// cookies() アクセスがあるため Suspense 必須
import { createClient } from "@/lib/supabase/server";
import { InviteLoginPrompt, InviteAcceptButton } from "./invite-accept-client";

export async function InviteAcceptSection({
  token,
  targetEmail,
}: {
  token: string;
  targetEmail?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <InviteLoginPrompt token={token} targetEmail={targetEmail} />;
  }

  return <InviteAcceptButton token={token} />;
}
