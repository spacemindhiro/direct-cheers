import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { ShieldCheck, Loader2, Clock, FileSignature, ChevronRight } from "lucide-react";
import { AdminBreadcrumb } from "@/components/admin-breadcrumb";
import { AdminConnectReview } from "@/components/admin-connect-review";
import { AdminRetryPendingTransferButton } from "@/components/admin-retry-pending-transfer-button";
import { getRequiredTermsTypes } from "@/lib/terms";

const ROLE_LABELS: Record<string, string> = {
  agent: "エージェント",
  organizer: "オーガナイザー",
  artist: "アーティスト / DJ",
};

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

  // 口座承認は完了済みだが、organizer/agentに必須の調印式（対面確認）がまだの人。
  // 口座承認と調印式は独立した手続きで、調印式を後回しにして口座だけ先に
  // 有効化したいケース（例: オーガナイザー登録したが最初はアーティストとして
  // 使う）があるため、承認後もここに残して忘れないようにする。
  const { data: verifiedOrganizersAndAgents } = await admin
    .from("profiles")
    .select("profile_id, display_name, role, created_at")
    .eq("verification_status", "verified")
    .in("role", ["organizer", "agent"])
    .order("created_at", { ascending: true });

  // signed_documentsは1人につき複数レコードを持ちうる（ロールが上がるたびに
  // 追加で署名するため）。「行が1件でもあるか」だけでは、organizerとして署名済みの
  // 人がagentに上がった場合にagent規約への署名漏れを見逃してしまうため、
  // 現在のroleが要求する全タイプ（getRequiredTermsTypes）が、その人の
  // signed_documents全レコードのterms_typesを合算した集合に含まれているかで判定する。
  const { data: signedDocs } = await admin
    .from("signed_documents")
    .select("profile_id, terms_types");
  const signedTypesByProfile = new Map<string, Set<string>>();
  for (const d of signedDocs ?? []) {
    const set = signedTypesByProfile.get(d.profile_id) ?? new Set<string>();
    for (const t of d.terms_types ?? []) set.add(t);
    signedTypesByProfile.set(d.profile_id, set);
  }
  const needsSigning = (verifiedOrganizersAndAgents ?? []).filter((u) => {
    const required = getRequiredTermsTypes(u.role);
    const signedTypes = signedTypesByProfile.get(u.profile_id) ?? new Set<string>();
    return !required.every((t) => signedTypes.has(t));
  });

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
          口座承認済み・調印式待ち — {needsSigning.length}件
        </p>
        {needsSigning.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-600 text-sm font-bold">調印式待ちのユーザーはいません</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
            {needsSigning.map((u) => (
              <Link
                key={u.profile_id}
                href={`/admin/terms/sign/${u.profile_id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-800/50 transition-colors group"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <FileSignature size={14} className="text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{u.display_name ?? "—"}</p>
                    <p className="text-[10px] text-slate-500">{ROLE_LABELS[u.role] ?? u.role}・口座は有効化済み</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-600 group-hover:text-amber-400 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        )}
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
