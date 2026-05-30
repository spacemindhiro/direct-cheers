import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvitationsSection } from "@/components/invitations-section";
import { type InvitationRow } from "@/components/invitations-list";
import { Loader2 } from "lucide-react";
import Link from "next/link";

async function InvitationsContent() {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!profile) redirect("/onboarding/profile");

  const canInvite = ["admin", "agent", "organizer"].includes(profile.role);

  if (!canInvite) redirect("/dashboard");

  // admin クライアントで取得（RLS を回避し、新カラムがなくてもフォールバック）
  const admin = createAdminClient();
  const { data: invitations, error: invError } = await admin
    .from("invitations")
    .select(`
      invitation_id,
      token,
      target_role,
      target_email,
      status,
      is_sent,
      viewed_at,
      expires_at,
      created_at,
      accepted_by:profiles!accepted_by_profile_id(display_name)
    `)
    .eq("invited_by_profile_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  // migration 未適用時は is_sent/viewed_at なしでフォールバック
  let rows: InvitationRow[] = [];
  if (invError) {
    const { data: fallback } = await admin
      .from("invitations")
      .select("invitation_id, token, target_role, target_email, status, expires_at, created_at")
      .eq("invited_by_profile_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    rows = (fallback ?? []).map((r: any) => ({
      ...r,
      is_sent: false,
      viewed_at: null,
      accepted_by: null,
    }));
  } else {
    rows = (invitations ?? []) as unknown as InvitationRow[];
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return (
    <div className="space-y-10">
      <div className="space-y-1">
<p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Invitations
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          招待を送る
        </h1>
        <p className="text-slate-500 text-sm font-medium">
          招待リンクを発行して仲間を招待しましょう
        </p>
      </div>

      <InvitationsSection
        myRole={profile.role}
        initialInvitations={rows}
        origin={origin}
      />
    </div>
  );
}

export default function InvitationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-600" size={32} />
        </div>
      }
    >
      <InvitationsContent />
    </Suspense>
  );
}
