import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { ShieldCheck, Loader2, Clock } from "lucide-react";
import { AdminBreadcrumb } from "@/components/admin-breadcrumb";
import { AdminConnectReview } from "@/components/admin-connect-review";
import { AdminRetryPendingTransferButton } from "@/components/admin-retry-pending-transfer-button";

function fmt(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

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

  // オンボーディング未完了で settle 時にTransferできずプールされている分配
  const { data: pendingTransfers } = await admin
    .from("pending_connect_transfers")
    .select(`
      pending_transfer_id, amount, role, last_error, created_at,
      profile:profiles!profile_id(display_name, stripe_restricted),
      event:events!event_id(title)
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
          審査待ち — {pendingUsers?.length ?? 0}件
        </p>
        <AdminConnectReview users={pendingUsers ?? []} />
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
          オンボーディング待ち滞留Transfer — {pendingTransfers?.length ?? 0}件
        </p>
        {(pendingTransfers ?? []).length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-600 text-sm font-bold">滞留中のTransferはありません</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
            {(pendingTransfers ?? []).map((p: any) => {
              const daysWaiting = Math.floor((Date.now() - new Date(p.created_at).getTime()) / (24 * 60 * 60 * 1000));
              return (
                <div key={p.pending_transfer_id} className="px-5 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-white truncate">
                        {p.profile?.display_name ?? "(不明)"}
                        <span className="text-slate-500 font-normal ml-1.5">{p.role}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">{p.event?.title ?? "(不明イベント)"}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-xs font-black text-amber-400">{fmt(p.amount)}</p>
                      <p className="text-[10px] text-slate-500 flex items-center justify-end gap-1">
                        <Clock size={9} /> {daysWaiting}日経過
                      </p>
                    </div>
                  </div>
                  {p.last_error && (
                    <p className="text-[10px] text-red-400/80 break-all">{p.last_error}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${p.profile?.stripe_restricted === false ? "text-emerald-400" : "text-slate-600"}`}>
                      {p.profile?.stripe_restricted === false ? "オンボーディング完了済み（次回cron/webhookで自動送金）" : "オンボーディング未完了"}
                    </span>
                    <AdminRetryPendingTransferButton pendingTransferId={p.pending_transfer_id} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminConnectReviewPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
      <div className="space-y-1">
        <AdminBreadcrumb crumbs={[{ label: "Admin", href: "/dashboard" }, { label: "口座審査" }]} />
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter flex items-center gap-2">
          <ShieldCheck size={22} className="text-indigo-400" /> 口座開設審査
        </h1>
      </div>

      <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
        <ConnectReviewContent />
      </Suspense>
    </div>
  );
}
