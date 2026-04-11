import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteCreateForm } from "@/components/invite-create-form";
import { Loader2, Users, Clock, CheckCircle, XCircle } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  agent: "エージェント",
  organizer: "オーガナイザー",
  artist: "アーティスト / DJ",
};

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending: {
    label: "待機中",
    className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    icon: <Clock size={12} />,
  },
  accepted: {
    label: "承諾済み",
    className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    icon: <CheckCircle size={12} />,
  },
  expired: {
    label: "期限切れ",
    className: "text-slate-500 bg-slate-800 border-slate-700",
    icon: <XCircle size={12} />,
  },
};

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
    .select("invitation_id, target_role, target_email, status, expires_at, created_at")
    .eq("invited_by_profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

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

      <InviteCreateForm myRole={profile.role} />

      {/* 発行済み招待一覧 */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Users size={14} className="text-pink-500" /> 発行済み招待
        </h2>

        {!invitations || invitations.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
            <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">
              No invitations yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {invitations.map((inv) => {
              const statusConfig = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.expired;
              const isExpiredByDate =
                inv.status === "pending" && new Date(inv.expires_at) < new Date();
              const effectiveConfig = isExpiredByDate
                ? STATUS_CONFIG.expired
                : statusConfig;

              return (
                <div
                  key={inv.invitation_id}
                  className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-bold text-white">
                      {ROLE_LABELS[inv.target_role] ?? inv.target_role}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {inv.target_email ?? "メールなし"} ·{" "}
                      {new Date(inv.created_at).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${effectiveConfig.className}`}
                  >
                    {effectiveConfig.icon}
                    {isExpiredByDate ? "期限切れ" : effectiveConfig.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
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
