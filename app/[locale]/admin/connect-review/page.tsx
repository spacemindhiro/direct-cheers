import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { ShieldCheck, Loader2 } from "lucide-react";
import { AdminConnectReview } from "@/components/admin-connect-review";

async function ConnectReviewContent() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (me?.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();
  const { data: pendingUsers } = await admin
    .from("profiles")
    .select("profile_id, display_name, role, stripe_connect_id, created_at")
    .eq("verification_status", "pending")
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
        審査待ち — {pendingUsers?.length ?? 0}件
      </p>
      <AdminConnectReview users={pendingUsers ?? []} />
    </div>
  );
}

export default function AdminConnectReviewPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
<div>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Admin</p>
          <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter flex items-center gap-2">
            <ShieldCheck size={22} className="text-indigo-400" /> 口座開設審査
          </h1>
        </div>
      </div>

      <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
        <ConnectReviewContent />
      </Suspense>
    </div>
  );
}
