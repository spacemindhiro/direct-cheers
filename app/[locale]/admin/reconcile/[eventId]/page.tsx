import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { ReconcileButton } from "@/components/reconcile-button";
import { CaptureAllButton } from "@/components/capture-all-button";
import Link from "next/link";

function fmt(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString("ja-JP") + "円";
}

async function ReconcileEventContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const user = await getUser();
  if (!user) redirect("/auth/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/dashboard");

  const { data: event } = await admin
    .from("events")
    .select("event_id, title, end_at, lifecycle_status, reconciled_at")
    .eq("event_id", eventId)
    .single();
  if (!event) notFound();

  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("event_id", eventId);
  const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);

  const { data: transactions } = await admin
    .from("transactions")
    .select(`
      transaction_id, stripe_payment_intent_id, total_gross_amount,
      stripe_fee, net_amount, platform_fee,
      amount_verified, amount_mismatch, stripe_fee_actual, stripe_net_actual,
      reconciled_at, reconcile_error, created_at,
      transaction_distributions(profile_id, actual_amount, amount_before_reconcile, distribution_status,
        profile:profiles!profile_id(display_name, role))
    `)
    .in("qr_config_id", qrIds.length > 0 ? qrIds : ["__none__"])
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  const txList = transactions ?? [];
  const total = txList.length;
  const reconciled = txList.filter((t) => t.reconciled_at !== null).length;
  const matched = txList.filter((t) => t.amount_verified === true).length;
  const mismatched = txList.filter((t) => t.amount_verified === false).length;
  const pending = txList.filter((t) => t.reconciled_at === null && !t.reconcile_error).length;
  const errored = txList.filter((t) => t.reconcile_error !== null).length;

  const needsReconcile = txList.some(
    (t) => t.reconciled_at === null || t.reconcile_error !== null || t.amount_verified === false
  );

  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div className="space-y-1">
        <Link
          href="/admin/reconcile"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-4"
        >
          <ArrowLeft size={12} /> 照合管理へ
        </Link>
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">Admin / Reconcile</p>
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter truncate">{event.title}</h1>
        <p className="text-xs text-slate-500">
          終了: {new Date(event.end_at).toLocaleDateString("ja-JP")}
          　{event.lifecycle_status === "settled" ? "精算済み" : event.lifecycle_status === "ended" ? "終了" : event.lifecycle_status}
          {event.reconciled_at && (
            <span className="ml-2 text-emerald-400">照合完了</span>
          )}
        </p>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "総件数", value: total, color: "text-slate-200" },
          { label: "照合済み", value: reconciled, color: "text-slate-200" },
          { label: "金額一致", value: matched, color: "text-emerald-400" },
          { label: "不一致", value: mismatched, color: mismatched > 0 ? "text-red-400" : "text-slate-500" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
            <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ボタン群 */}
      <div className="flex flex-wrap gap-3">
        {event.lifecycle_status === "settled" && (
          <CaptureAllButton eventId={eventId} />
        )}
        {needsReconcile && (
          <ReconcileButton
            eventId={eventId}
            pendingCount={pending + errored + mismatched}
          />
        )}
      </div>

      {/* トランザクション一覧 */}
      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">決済明細・照合状況</p>
        {txList.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <p className="text-slate-600 text-sm font-bold">トランザクションなし</p>
          </div>
        ) : (
          <div className="space-y-2">
            {txList.map((tx) => {
              const isMatched = tx.amount_verified === true;
              const isMismatch = tx.amount_verified === false;
              const hasError = tx.reconcile_error !== null;
              const isPending = tx.reconciled_at === null && !hasError;

              return (
                <div
                  key={tx.transaction_id}
                  className={`bg-slate-900 border rounded-2xl p-4 space-y-3 ${
                    hasError ? "border-red-500/30" :
                    isMismatch ? "border-amber-500/30" :
                    isMatched ? "border-emerald-500/20" :
                    "border-slate-800"
                  }`}
                >
                  {/* 上段: ステータス + PI ID + 日時 */}
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      {hasError ? <XCircle size={15} className="text-red-400" /> :
                       isMismatch ? <AlertTriangle size={15} className="text-amber-400" /> :
                       isMatched ? <CheckCircle2 size={15} className="text-emerald-400" /> :
                       <Clock size={15} className="text-slate-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono text-slate-500 truncate">
                        PI: {typeof tx.stripe_payment_intent_id === "string" && tx.stripe_payment_intent_id.startsWith("{")
                          ? (() => { try { return JSON.parse(tx.stripe_payment_intent_id)?.id ?? tx.stripe_payment_intent_id; } catch { return tx.stripe_payment_intent_id; } })()
                          : (tx.stripe_payment_intent_id ?? "—")}
                      </p>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {new Date(tx.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {tx.reconciled_at && (
                          <span className="ml-2">
                            照合: {new Date(tx.reconciled_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {isPending && <span className="ml-2 text-slate-500">未照合</span>}
                      </p>
                    </div>
                  </div>

                  {/* 金額グリッド — 推計→実績の前後表示 */}
                  {(() => {
                    const stripeGross = tx.reconciled_at && tx.total_gross_amount !== null && tx.amount_mismatch !== null
                      ? tx.total_gross_amount + tx.amount_mismatch : null;
                    const grossChanged = tx.amount_mismatch !== null && tx.amount_mismatch !== 0;
                    const feeChanged = tx.stripe_fee_actual !== null && tx.stripe_fee_actual !== tx.stripe_fee;
                    const netChanged = tx.stripe_net_actual !== null && tx.stripe_net_actual !== tx.net_amount;
                    return (
                      <div className="pl-6 space-y-2">
                        <div className="grid grid-cols-3 gap-x-4">
                          {/* Gross */}
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest">Gross</p>
                            {grossChanged ? (
                              <p className="text-sm font-black text-amber-300">
                                <span className="text-slate-500 line-through text-xs mr-1">{fmt(tx.total_gross_amount)}</span>
                                → {fmt(stripeGross)}
                              </p>
                            ) : (
                              <p className="text-sm font-black text-slate-300">{fmt(tx.total_gross_amount)}</p>
                            )}
                          </div>
                          {/* Stripe手数料 */}
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest">Stripe手数料</p>
                            {tx.reconciled_at ? (
                              feeChanged ? (
                                <p className="text-sm font-black text-amber-300">
                                  <span className="text-slate-500 line-through text-xs mr-1">{fmt((tx as any).stripe_fee ?? null)}</span>
                                  → {fmt(tx.stripe_fee_actual)}
                                </p>
                              ) : (
                                <p className="text-sm font-black text-slate-300">{fmt(tx.stripe_fee_actual)}</p>
                              )
                            ) : (
                              <p className="text-sm font-black text-slate-500">{fmt((tx as any).stripe_fee ?? null)}<span className="text-[9px] ml-1 text-slate-600">推計</span></p>
                            )}
                          </div>
                          {/* Stripe Net */}
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest">Stripe Net</p>
                            {tx.reconciled_at ? (
                              netChanged ? (
                                <p className="text-sm font-black text-amber-300">
                                  <span className="text-slate-500 line-through text-xs mr-1">{fmt((tx as any).net_amount ?? null)}</span>
                                  → {fmt(tx.stripe_net_actual)}
                                </p>
                              ) : (
                                <p className="text-sm font-black text-emerald-300">{fmt(tx.stripe_net_actual)}</p>
                              )
                            ) : (
                              <p className="text-sm font-black text-slate-500">{fmt((tx as any).net_amount ?? null)}<span className="text-[9px] ml-1 text-slate-600">推計</span></p>
                            )}
                          </div>
                        </div>
                        {/* Gross差分（不一致時のみ表示） */}
                        {grossChanged && (
                          <p className="text-[10px] text-amber-400 font-bold">Gross差分: {fmt(tx.amount_mismatch)}</p>
                        )}
                      </div>
                    );
                  })()}

                  {/* 分配金 */}
                  {((tx.transaction_distributions ?? []) as any[]).length > 0 && (() => {
                    const dists = (tx.transaction_distributions ?? []) as any[];
                    const hasAdjustment = dists.some((d: any) => d.amount_before_reconcile != null);
                    return (
                      <div className="pl-6 space-y-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest">分配</p>
                          {hasAdjustment && (
                            <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">照合時に金額調整済み</span>
                          )}
                        </div>
                        {dists.map((d: any, i: number) => {
                          const wasAdjusted = d.amount_before_reconcile != null;
                          return (
                            <div key={`${d.profile_id}-${i}`} className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">
                                {d.profile?.display_name ?? d.profile_id.slice(0, 8)}
                                <span className="text-slate-600 ml-1">({d.profile?.role ?? "—"})</span>
                              </span>
                              <span className="font-bold">
                                {wasAdjusted ? (
                                  <span className="text-amber-300">
                                    <span className="text-slate-500 line-through mr-1">{fmt(d.amount_before_reconcile)}</span>
                                    → {fmt(d.actual_amount)}
                                  </span>
                                ) : (
                                  <span className="text-slate-200">{fmt(d.actual_amount)}</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* エラー */}
                  {hasError && (
                    <div className="pl-6">
                      <p className="text-[10px] text-red-300 break-all font-bold">{tx.reconcile_error}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReconcileEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <ReconcileEventContent params={params} />
    </Suspense>
  );
}
