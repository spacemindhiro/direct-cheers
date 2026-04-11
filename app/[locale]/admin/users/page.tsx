import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminApproveButton } from "@/components/admin-approve-button";
import { Loader2, Users } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  agent: "エージェント",
  organizer: "オーガナイザー",
  artist: "アーティスト / DJ",
  user: "ファン",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending_onboarding: {
    label: "Stripe未完了",
    className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  },
  pending_interview: {
    label: "面談待ち",
    className: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  },
  active: {
    label: "承認済み",
    className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  rejected: {
    label: "却下",
    className: "text-red-400 bg-red-500/10 border-red-500/20",
  },
};

async function AdminUsersContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (me?.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();
  const { data: users } = await admin
    .from("profiles")
    .select("profile_id, display_name, role, status, created_at")
    .neq("role", "user")
    .neq("status", "active")
    .order("created_at", { ascending: false });

  // 承認済みも別途表示
  const { data: activeUsers } = await admin
    .from("profiles")
    .select("profile_id, display_name, role, status, created_at")
    .neq("role", "user")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20);

  const pendingUsers = users ?? [];
  const approvedUsers = activeUsers ?? [];

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Admin
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          User Management
        </h1>
      </div>

      {/* 審査待ちユーザー */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Users size={14} className="text-pink-500" /> 審査待ち ({pendingUsers.length})
        </h2>

        {pendingUsers.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
            <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">
              No pending users.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingUsers.map((u) => {
              const statusConfig = STATUS_CONFIG[u.status] ?? STATUS_CONFIG.pending_onboarding;
              return (
                <div
                  key={u.profile_id}
                  className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-5 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-bold text-white">{u.display_name}</p>
                    <p className="text-xs text-slate-500">
                      {ROLE_LABELS[u.role] ?? u.role} ·{" "}
                      {new Date(u.created_at).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${statusConfig.className}`}
                    >
                      {statusConfig.label}
                    </span>
                    {u.status === "pending_interview" && (
                      <AdminApproveButton profileId={u.profile_id} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 承認済みユーザー */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Users size={14} className="text-emerald-500" /> 承認済み ({approvedUsers.length})
        </h2>
        {approvedUsers.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
            <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">
              No active users yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {approvedUsers.map((u) => (
              <div
                key={u.profile_id}
                className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-5 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-bold text-white">{u.display_name}</p>
                  <p className="text-xs text-slate-500">
                    {ROLE_LABELS[u.role] ?? u.role} ·{" "}
                    {new Date(u.created_at).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <span className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                  承認済み
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-600" size={32} />
        </div>
      }
    >
      <AdminUsersContent />
    </Suspense>
  );
}
