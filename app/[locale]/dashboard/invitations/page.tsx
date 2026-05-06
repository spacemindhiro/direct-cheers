import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { InviteCreateForm } from "@/components/invite-create-form";
import { InvitationsList, type InvitationRow } from "@/components/invitations-list";
import { Loader2, Users, ArrowLeft } from "lucide-react";
import Link from "next/link";

async function InvitationsContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!profile) redirect("/onboarding/profile");

  const canInvite = ["admin", "agent", "organizer"].includes(profile.role);

  if (!canInvite) redirect("/dashboard");

  const { data: invitations } = await supabase
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

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors"
        >
          <ArrowLeft size={12} /> ダッシュボードに戻る
        </Link>
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

      <InviteCreateForm myRole={profile.role} />

      {/* 発行済み招待一覧 */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Users size={14} className="text-pink-500" /> 発行済み招待
        </h2>
        <InvitationsList
          initialInvitations={(invitations ?? []) as unknown as InvitationRow[]}
          origin={origin}
        />
      </div>
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
