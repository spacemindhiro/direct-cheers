import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PayoutForm } from "@/components/payout-form";
import { PayoutBypassButton } from "@/components/payout-bypass-button";
import { getFeeConfig } from "@/lib/fee-config";
import {
  Loader2, Wallet, Clock, Lock, AlertTriangle,
  CheckCircle2, RefreshCw, CalendarClock, ExternalLink,
} from "lucide-react";
import Link from "next/link";

const HOLD_DAYS = 14;
const TRANSFER_FEE = 500;

const LIFECYCLE_LABELS: Record<string, string> = {
  draft: "承認待ち", published: "公開済み", ongoing: "開催中",
  ended: "終了", settled: "精算済み",
  cancellation_requested: "中止申請中", cancelled: "中止",
};

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

  const cutoff = new Date(Date.now() - HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { net_rate: NET_RATE } = await getFeeConfig();

  // 未精算（distributions未作成）の見込み保留額をイベント別に加算するため先に取得
  const { data: myTargets } = await admin
    .from("qr_config_targets")
    .select(`
      qr_config_id, distribution_ratio,
      qr_config:qr_configs!qr_config_id(
        event_id,
        event:events!event_id(event_id, title, lifecycle_status, reconciled_at)
      )
    `)
    .eq("profile_id", user.id)
    .is("deleted_at", null);

  // 配分済み: actual_amount を使用（照合調整済みの金額を反映）
  const { data: dists } = await admin
    .from("transaction_distributions")
    .select(`
      is_frozen, hold_released, transaction_id, actual_amount,
      transaction:transactions!transaction_id(
        created_at, qr_config_id, status,
        qr_config:qr_configs!qr_config_id(
          event_id,
          event:events!event_id(event_id, title, lifecycle_status, reconciled_at)
        )
      )
    `)
    .eq("profile_id", user.id)
    .eq("distribution_status", "accrued")
    .is("deleted_at", null);

  // イベント別集計
  type EventRow = {
    event_id: string;
    title: string;
    lifecycle_status: string;
    reconciled_at: string | null;
    available: number;
    pending: number;
    frozen: number;
    latestTxDate: string | null; // pending の中で最も新しい（＝最後に解放される）
  };
  const eventMap = new Map<string, EventRow>();

  let available = 0;
  let pending = 0;
  let frozen = 0;
  const distributedTxIds = new Set<string>();

  for (const d of dists ?? []) {
    const tx = (d as any).transaction;
    // completedのトランザクションのみ集計（cancelled/failed/requires_captureは除外）
    if (tx?.status !== "completed") continue;

    distributedTxIds.add((d as any).transaction_id);
    const qrConfig = tx?.qr_config;
    const event = qrConfig?.event;
    const eventId: string = event?.event_id ?? "__unknown__";
    const txDate: string | null = tx?.created_at ?? null;
    // 照合調整済みの実績額を使用（formula再計算はしない）
    const amt = (d as any).actual_amount ?? 0;

    if (!eventMap.has(eventId)) {
      eventMap.set(eventId, {
        event_id: eventId,
        title: event?.title ?? "不明なイベント",
        lifecycle_status: event?.lifecycle_status ?? "",
        reconciled_at: event?.reconciled_at ?? null,
        available: 0, pending: 0, frozen: 0,
        latestTxDate: null,
      });
    }
    const row = eventMap.get(eventId)!;

    const isSettledAndReconciled = event?.lifecycle_status === "settled" && event?.reconciled_at !== null;

    if (d.is_frozen) {
      frozen += amt;
      row.frozen += amt;
    } else if ((d as any).hold_released || (isSettledAndReconciled && txDate && txDate < cutoff)) {
      available += amt;
      row.available += amt;
    } else {
      pending += amt;
      row.pending += amt;
      if (!row.latestTxDate || (txDate && txDate > row.latestTxDate)) {
        row.latestTxDate = txDate;
      }
    }
  }

  // 未精算（distributions未作成）の見込み保留額をイベント別に加算
  if ((myTargets ?? []).length > 0) {
    const qrConfigIds = myTargets!.map((t) => t.qr_config_id);
    const { data: unsettledTxs } = await admin
      .from("transactions")
      .select("transaction_id, qr_config_id, total_gross_amount, created_at")
      .in("qr_config_id", qrConfigIds)
      .eq("status", "completed");

    for (const tx of unsettledTxs ?? []) {
      if (distributedTxIds.has(tx.transaction_id)) continue;
      const target = myTargets!.find((t) => t.qr_config_id === tx.qr_config_id);
      if (!target) continue;
      const ratio = Number(target.distribution_ratio ?? 0);
      if (ratio <= 0) continue;
      const amt = Math.floor(Math.floor((tx.total_gross_amount ?? 0) * NET_RATE) * ratio);
      if (amt <= 0) continue;

      const event = (target as any).qr_config?.event;
      const eventId: string = event?.event_id ?? "__unknown__";
      if (!eventMap.has(eventId)) {
        eventMap.set(eventId, {
          event_id: eventId,
          title: event?.title ?? "不明なイベント",
          lifecycle_status: event?.lifecycle_status ?? "",
          reconciled_at: event?.reconciled_at ?? null,
          available: 0, pending: 0, frozen: 0,
          latestTxDate: null,
        });
      }
      const row = eventMap.get(eventId)!;
      pending += amt;
      row.pending += amt;
      const txDate = tx.created_at ?? null;
      if (!row.latestTxDate || (txDate && txDate > row.latestTxDate)) {
        row.latestTxDate = txDate;
      }
    }
  }

  // 出金履歴
  const { data: history } = await admin
    .from("payout_requests")
    .select("request_id, requested_amount, net_payout_amount, stripe_fee_deducted, status, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const eventRows = [...eventMap.values()]
    .filter((r) => r.available + r.pending + r.frozen > 0)
    .sort((a, b) => (b.available + b.pending) - (a.available + a.pending));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <div className="max-w-xl mx-auto px-6 py-10 space-y-8">

        <div className="space-y-1">
<p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">Payout</p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">出金管理</h1>
        </div>

        {/* 凍結警告 */}
        {profile?.balance_frozen && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
            <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-red-400">残高が凍結されています</p>
              <p className="text-xs text-slate-500 mt-0.5">チャージバックが発生したため出金が停止されています。サポートにお問い合わせください。</p>
            </div>
          </div>
        )}

        {/* チャージバック */}
        {(profile?.chargeback_count ?? 0) > 0 && (
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3">
            <AlertTriangle size={14} className="text-amber-400" />
            <p className="text-xs text-amber-400 font-bold">チャージバック発生回数: {profile!.chargeback_count}回</p>
          </div>
        )}

        {/* 残高サマリー */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <Wallet size={14} className="text-emerald-400" />
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">出金可能</p>
            </div>
            <p className="text-xl font-black text-emerald-400 italic tracking-tighter">¥{available.toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-amber-400" />
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">保留中</p>
            </div>
            <p className="text-xl font-black text-amber-400 italic tracking-tighter">¥{pending.toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <Lock size={14} className="text-red-400" />
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">凍結中</p>
            </div>
            <p className="text-xl font-black text-red-400 italic tracking-tighter">¥{frozen.toLocaleString()}</p>
          </div>
        </div>

        <p className="text-[10px] text-slate-600 leading-relaxed">
          売上は入金から{HOLD_DAYS}日後に出金可能になります。振込手数料 ¥{TRANSFER_FEE.toLocaleString()} が差し引かれます。
        </p>

        {/* イベント別内訳 */}
        {eventRows.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">イベント別内訳</p>
            <div className="space-y-2">
              {eventRows.map((row) => {
                const payoutDate = row.latestTxDate
                  ? new Date(new Date(row.latestTxDate).getTime() + HOLD_DAYS * 24 * 60 * 60 * 1000)
                  : null;
                const isSettled = row.lifecycle_status === "settled";
                const isReconciled = row.reconciled_at !== null;

                return (
                  <div key={row.event_id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                    {/* イベント名 + ステータスバッジ */}
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/dashboard/events/${row.event_id}`}
                        className="flex items-center gap-1.5 font-black text-white hover:text-indigo-300 transition-colors text-sm group"
                      >
                        {row.title}
                        <ExternalLink size={11} className="text-slate-600 group-hover:text-indigo-400 shrink-0" />
                      </Link>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        {/* 承認状況 */}
                        <span className={`text-[9px] font-black rounded-full px-2 py-0.5 uppercase tracking-wider ${
                          isSettled
                            ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                            : "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                        }`}>
                          {LIFECYCLE_LABELS[row.lifecycle_status] ?? row.lifecycle_status}
                        </span>
                        {/* 照合状況 */}
                        {isReconciled ? (
                          <span className="flex items-center gap-0.5 text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                            <CheckCircle2 size={9} /> 照合済
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-[9px] font-black text-slate-500 bg-slate-800 rounded-full px-2 py-0.5">
                            <RefreshCw size={9} /> 照合待ち
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 金額内訳 */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {row.available > 0 && (
                        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-2">
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest">出金可能</p>
                          <p className="text-sm font-black text-emerald-400">¥{row.available.toLocaleString()}</p>
                        </div>
                      )}
                      {row.pending > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-2">
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest">保留中</p>
                          <p className="text-sm font-black text-amber-400">¥{row.pending.toLocaleString()}</p>
                        </div>
                      )}
                      {row.frozen > 0 && (
                        <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-2">
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest">凍結中</p>
                          <p className="text-sm font-black text-red-400">¥{row.frozen.toLocaleString()}</p>
                        </div>
                      )}
                    </div>

                    {/* payout可能日 */}
                    {payoutDate && row.pending > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <CalendarClock size={11} />
                        {payoutDate <= new Date()
                          ? "出金可能になっています"
                          : `${payoutDate.toLocaleDateString("ja-JP")} 以降に出金可能`}
                      </div>
                    )}

                    {/* adminテスト用バイパス */}
                    {profile?.role === "admin" && row.pending > 0 && row.event_id !== "__unknown__" && (
                      <PayoutBypassButton
                        eventId={row.event_id}
                        eventTitle={row.title}
                        pendingAmount={row.pending}
                        transferFee={TRANSFER_FEE}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 出金フォーム */}
        {!profile?.balance_frozen && available > TRANSFER_FEE ? (
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">出金申請</p>
            {!profile?.stripe_connect_id && (
              <p className="text-xs text-amber-400">※ Stripe Connectアカウントの設定が必要です</p>
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
                      手数料 ¥{h.stripe_fee_deducted} 控除 · {new Date(h.created_at).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                    h.status === "completed" ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"
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
