import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PayoutForm } from "@/components/payout-form";
import { Loader2, Wallet, Clock, Lock, AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";

const HOLD_DAYS = 14;
const TRANSFER_FEE = 500;

async function PayoutContent() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, balance_frozen, stripe_connect_id, chargeback_count")
    .eq("profile_id", user.id)
    .single();

  if (!["artist", "organizer", "agent"].includes(profile?.role ?? "")) {
    redirect("/dashboard");
  }

  // 残高集計（14日経過判定）
  const cutoff = new Date(Date.now() - HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: dists } = await admin
    .from("transaction_distributions")
    .select("actual_amount, is_frozen, transaction:transactions!transaction_id(created_at)")
    .eq("profile_id", user.id)
    .eq("distribution_status", "accrued")
    .is("deleted_at", null);

  let available = 0;
  let pending = 0;
  let frozen = 0;

  for (const d of dists ?? []) {
    const txDate = (d.transaction as any)?.created_at;
    const amt = d.actual_amount ?? 0;
    if (d.is_frozen) frozen += amt;
    else if (txDate && txDate < cutoff) available += amt;
    else pending += amt;
  }

  // 出金履歴
  const { data: history } = await admin
    .from("payout_requests")
    .select("request_id, requested_amount, net_payout_amount, stripe_fee_deducted, status, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <div className="max-w-xl mx-auto px-6 py-10 space-y-8">

        <div className="space-y-1">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-4">
            <ArrowLeft size={12} /> ダッシュボードへ
          </Link>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">Payout</p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
            出金管理
          </h1>
        </div>

        {/* 凍結警告 */}
        {profile?.balance_frozen && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
            <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-red-400">残高が凍結されています</p>
              <p className="text-xs text-slate-500 mt-0.5">
                チャージバックが発生したため出金が停止されています。サポートにお問い合わせください。
              </p>
            </div>
          </div>
        )}

        {/* チャージバック回数 */}
        {(profile?.chargeback_count ?? 0) > 0 && (
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3">
            <AlertTriangle size={14} className="text-amber-400" />
            <p className="text-xs text-amber-400 font-bold">
              チャージバック発生回数: {profile!.chargeback_count}回
            </p>
          </div>
        )}

        {/* 残高サマリー */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <Wallet size={14} className="text-emerald-400" />
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">出金可能</p>
            </div>
            <p className="text-xl font-black text-emerald-400 italic tracking-tighter">
              ¥{available.toLocaleString()}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-amber-400" />
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">保留中</p>
            </div>
            <p className="text-xl font-black text-amber-400 italic tracking-tighter">
              ¥{pending.toLocaleString()}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <Lock size={14} className="text-red-400" />
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">凍結中</p>
            </div>
            <p className="text-xl font-black text-red-400 italic tracking-tighter">
              ¥{frozen.toLocaleString()}
            </p>
          </div>
        </div>

        <p className="text-[10px] text-slate-600 leading-relaxed">
          売上は入金から{HOLD_DAYS}日後に出金可能になります。振込手数料 ¥{TRANSFER_FEE.toLocaleString()} が差し引かれます。
        </p>

        {/* 出金フォーム */}
        {!profile?.balance_frozen && available > TRANSFER_FEE ? (
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">出金申請</p>
            {!profile?.stripe_connect_id && (
              <p className="text-xs text-amber-400">
                ※ Stripe Connectアカウントの設定が必要です
              </p>
            )}
            <PayoutForm available={available} transferFee={TRANSFER_FEE} />
          </div>
        ) : (
          !profile?.balance_frozen && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
              <p className="text-slate-600 text-sm font-bold">
                {available === 0
                  ? "出金可能な残高がありません"
                  : `出金可能額が振込手数料（¥${TRANSFER_FEE.toLocaleString()}）以下です`}
              </p>
            </div>
          )
        )}

        {/* 出金履歴 */}
        {(history ?? []).length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">出金履歴</p>
            <div className="space-y-2">
              {history!.map((h) => (
                <div key={h.request_id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-white">¥{h.net_payout_amount.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      手数料 ¥{h.stripe_fee_deducted} 控除 ·{" "}
                      {new Date(h.created_at).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                    h.status === "completed"
                      ? "bg-green-500/10 text-green-400"
                      : "bg-amber-500/10 text-amber-400"
                  }`}>
                    {h.status === "completed" ? "完了" : "処理中"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PayoutPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <PayoutContent />
    </Suspense>
  );
}
