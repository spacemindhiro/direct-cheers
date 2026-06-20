import { fmtDate } from "@/lib/display-tz";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { AdminBreadcrumb } from "@/components/admin-breadcrumb";
import { ReconcileButton } from "@/components/reconcile-button";
import Link from "next/link";

async function ReconcileContent() {
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

  const [logsRes, eventsRes] = await Promise.all([
    admin
      .from("reconciliation_logs")
      .select("log_id, run_at, target_date, total_checked, total_matched, total_mismatched, total_errors, summary")
      .order("run_at", { ascending: false })
      .limit(15),
    admin
      .from("events")
      .select("event_id, title, end_at, lifecycle_status, reconciled_at")
      // draft/review_requested/cancelled等の未公開イベントはend_atが過去でも対象外
      .or("lifecycle_status.in.(ended,settled),and(lifecycle_status.in.(published,ongoing),end_at.lt." + new Date().toISOString() + ")")
      .order("end_at", { ascending: false })
      .limit(50),
  ]);

  const events = eventsRes.data ?? [];
  const eventIds = events.map((e) => e.event_id);

  // イベントごとのQR → トランザクション件数を集計
  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id, event_id")
    .in("event_id", eventIds);

  const qrByEvent = new Map<string, string[]>();
  for (const q of qrConfigs ?? []) {
    const list = qrByEvent.get(q.event_id) ?? [];
    list.push(q.qr_config_id);
    qrByEvent.set(q.event_id, list);
  }

  const allQrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);

  const [totalRes, reconciledRes, mismatchRes, erroredRes] = await Promise.all([
    admin
      .from("transactions")
      .select("qr_config_id")
      .in("qr_config_id", allQrIds)
      .eq("status", "completed"),
    admin
      .from("transactions")
      .select("qr_config_id")
      .in("qr_config_id", allQrIds)
      .eq("status", "completed")
      .not("reconciled_at", "is", null),
    admin
      .from("transactions")
      .select("transaction_id, qr_config_id, stripe_payment_intent_id, total_gross_amount, amount_mismatch")
      .in("qr_config_id", allQrIds)
      .eq("status", "completed")
      .eq("amount_verified", false),
    admin
      .from("transactions")
      .select("transaction_id, qr_config_id, stripe_payment_intent_id, reconcile_error")
      .in("qr_config_id", allQrIds)
      .eq("status", "completed")
      .not("reconcile_error", "is", null),
  ]);

  // qr_config_id → event_id のマップ
  const eventByQr = new Map<string, string>();
  for (const q of qrConfigs ?? []) eventByQr.set(q.qr_config_id, q.event_id);

  const totalByEvent = new Map<string, number>();
  const reconciledByEvent = new Map<string, number>();
  const mismatchByEvent = new Map<string, number>();
  const mismatchDetailsByEvent = new Map<string, Array<{ transaction_id: string; stripe_pi_id: string | null; expected: number; actual: number; diff: number }>>();
  const errorsByEvent = new Map<string, Array<{ transaction_id: string; stripe_pi_id: string | null; error: string }>>();

  for (const tx of totalRes.data ?? []) {
    const eid = eventByQr.get(tx.qr_config_id!) ?? "";
    totalByEvent.set(eid, (totalByEvent.get(eid) ?? 0) + 1);
  }
  for (const tx of reconciledRes.data ?? []) {
    const eid = eventByQr.get(tx.qr_config_id!) ?? "";
    reconciledByEvent.set(eid, (reconciledByEvent.get(eid) ?? 0) + 1);
  }
  for (const tx of mismatchRes.data ?? []) {
    const eid = eventByQr.get(tx.qr_config_id!) ?? "";
    mismatchByEvent.set(eid, (mismatchByEvent.get(eid) ?? 0) + 1);
    const list = mismatchDetailsByEvent.get(eid) ?? [];
    const expected = (tx as any).total_gross_amount ?? 0;
    const diff = (tx as any).amount_mismatch ?? 0;
    list.push({
      transaction_id: tx.transaction_id,
      stripe_pi_id: (tx as any).stripe_payment_intent_id ?? null,
      expected,
      actual: expected + diff,
      diff,
    });
    mismatchDetailsByEvent.set(eid, list);
  }
  for (const tx of erroredRes.data ?? []) {
    const eid = eventByQr.get(tx.qr_config_id!) ?? "";
    const list = errorsByEvent.get(eid) ?? [];
    list.push({
      transaction_id: tx.transaction_id,
      stripe_pi_id: (tx as any).stripe_payment_intent_id ?? null,
      error: (tx as any).reconcile_error as string,
    });
    errorsByEvent.set(eid, list);
  }

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <AdminBreadcrumb crumbs={[{ label: "Admin", href: "/dashboard" }, { label: "Reconcile" }]} />
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">照合管理</h1>
        <p className="text-sm text-slate-500">Stripe照合バッチの実行ログとイベント別照合状況</p>
      </div>

      {/* バッチ実行ログ */}
      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">バッチ実行ログ</p>
        {(logsRes.data ?? []).length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <p className="text-slate-600 text-sm font-bold">実行履歴がありません</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
            {(logsRes.data ?? []).map((log) => (
              <div key={log.log_id} className="px-5 py-3 flex items-center gap-4">
                <div className="min-w-0 flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5">
                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">実行日</p>
                    <p className="text-xs font-bold text-slate-200">
                      {new Date(log.run_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">対象日</p>
                    <p className="text-xs font-bold text-slate-200">{log.target_date}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">件数</p>
                    <p className="text-xs font-bold text-slate-200">
                      {log.total_checked}件 / 一致{log.total_matched}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {log.total_mismatched > 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-black text-red-400">
                        <XCircle size={11} /> 不一致{log.total_mismatched}
                      </span>
                    )}
                    {log.total_errors > 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-black text-amber-400">
                        <AlertTriangle size={11} /> エラー{log.total_errors}
                      </span>
                    )}
                    {log.total_mismatched === 0 && log.total_errors === 0 && log.total_checked > 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400">
                        <CheckCircle2 size={11} /> 正常
                      </span>
                    )}
                    {log.total_checked === 0 && (
                      <span className="text-[10px] text-slate-600">対象なし</span>
                    )}
                    {(log.total_mismatched > 0 || log.total_errors > 0) && (
                      <a href="#event-issues" className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 transition-colors">
                        明細を見る ↓
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* イベント別照合状況 */}
      <div id="event-issues" className="space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">イベント別照合状況（不一致・エラー明細はここに表示）</p>
        {events.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <p className="text-slate-600 text-sm font-bold">対象イベントがありません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => {
              const total = totalByEvent.get(event.event_id) ?? 0;
              const reconciled = reconciledByEvent.get(event.event_id) ?? 0;
              const mismatched = mismatchByEvent.get(event.event_id) ?? 0;
              const mismatchDetails = mismatchDetailsByEvent.get(event.event_id) ?? [];
              const txErrors = errorsByEvent.get(event.event_id) ?? [];
              const allDone = event.reconciled_at !== null;
              const hasError = mismatched > 0 || txErrors.length > 0;
              const inProgress = total > 0 && reconciled < total;

              return (
                <div
                  key={event.event_id}
                  className={`bg-slate-900 border rounded-2xl px-5 py-4 space-y-3 ${
                    hasError ? "border-red-500/20" : allDone ? "border-emerald-500/20" : inProgress ? "border-amber-500/20" : "border-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="shrink-0">
                      {hasError ? (
                        <XCircle size={18} className="text-red-400" />
                      ) : allDone ? (
                        <CheckCircle2 size={18} className="text-emerald-400" />
                      ) : inProgress ? (
                        <Clock size={18} className="text-amber-400" />
                      ) : (
                        <Clock size={18} className="text-slate-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/admin/reconcile/${event.event_id}`}
                        className="font-black text-white hover:text-indigo-300 transition-colors text-sm truncate block"
                      >
                        {event.title}
                      </Link>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        終了: {fmtDate(event.end_at)}
                        　{event.lifecycle_status === "settled" ? "精算済み" : "未精算"}
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-xs font-black text-slate-200">{reconciled} / {total} 件照合</p>
                      {hasError && <p className="text-[10px] font-black text-red-400">不一致 {mismatched}件</p>}
                      {allDone && !hasError && <p className="text-[10px] font-black text-emerald-400">照合完了</p>}
                      {!allDone && inProgress && <p className="text-[10px] font-black text-amber-400">照合中</p>}
                      {total === 0 && <p className="text-[10px] text-slate-600">売上なし</p>}
                    </div>
                  </div>
                  {/* 不一致詳細（金額差分を明細単位で表示） */}
                  {mismatchDetails.length > 0 && (
                    <div className="border border-red-500/30 bg-red-500/10 rounded-xl p-3 space-y-2">
                      <p className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                        <XCircle size={11} /> 金額不一致 {mismatchDetails.length}件
                      </p>
                      {mismatchDetails.map((m) => (
                        <div key={m.transaction_id} className="bg-slate-900/60 rounded-lg p-2 space-y-0.5">
                          <p className="text-[10px] font-mono text-slate-400 break-all">
                            PI: {m.stripe_pi_id ?? "(null)"}
                          </p>
                          <p className="text-[11px] text-red-300 font-bold">
                            DB ¥{m.expected.toLocaleString()} ≠ Stripe ¥{m.actual.toLocaleString()}
                            　差額 ¥{m.diff.toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* エラー詳細（目立つ位置に常時表示） */}
                  {txErrors.length > 0 && (
                    <div className="border border-red-500/30 bg-red-500/10 rounded-xl p-3 space-y-2">
                      <p className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                        <XCircle size={11} /> 照合エラー {txErrors.length}件
                      </p>
                      {txErrors.map((e) => (
                        <div key={e.transaction_id} className="bg-slate-900/60 rounded-lg p-2 space-y-0.5">
                          <p className="text-[10px] font-mono text-slate-400 break-all">
                            PI: {e.stripe_pi_id ?? "(null)"}
                          </p>
                          <p className="text-[11px] text-red-300 break-all font-bold">{e.error}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 照合ボタン：未照合またはエラー・不一致あり */}
                  {((!allDone && total > 0) || txErrors.length > 0 || mismatchDetails.length > 0) && (
                    <ReconcileButton
                      eventId={event.event_id}
                      pendingCount={(total - reconciled) + txErrors.length + mismatchDetails.length}
                    />
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

export default function ReconcilePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <ReconcileContent />
    </Suspense>
  );
}
