import { fmtDate } from "@/lib/display-tz";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeConfig } from "@/lib/fee-config";
import { SettleButton } from "@/components/settle-button";
import { SettlementDetails, type TxGroup, type DistributionRow } from "@/components/settlement-details";
import { AdminForcePayoutButton } from "@/components/admin-force-payout-button";
import { AdminAuthExpiryActions } from "@/components/admin-auth-expiry-actions";
import { CaptureAllButton } from "@/components/capture-all-button";
import { Loader2, Calendar, MapPin, ImageIcon, CheckCircle2, Clock, AlertTriangle, ExternalLink, Zap } from "lucide-react";
import { AdminBreadcrumb } from "@/components/admin-breadcrumb";
import Link from "next/link";

async function SettlementsContent() {
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

  const { net_rate } = await getFeeConfig();

  // 終了済みイベントを取得（end_at 経過 OR 手動終了・精算済み）
  const now = new Date();
  const AUTH_EXPIRE_DAYS = 7;
  const nowIso = now.toISOString();
  const { data: events } = await admin
    .from("events")
    .select(`
      event_id, title, venue, start_at, end_at, lifecycle_status,
      organizer:profiles!organizer_profile_id(display_name)
    `)
    .or(`end_at.lt.${nowIso},lifecycle_status.in.(ended,settled)`)
    .order("end_at", { ascending: false })
    .limit(50);

  const eventIds = (events ?? []).map((e) => e.event_id);

  const [evidencesRes, summariesRes, qrConfigsRes, holdStatusRes] = await Promise.all([
    admin
      .from("event_evidences")
      .select("event_id, evidence_id, photo_paths, attendance_count, created_at")
      .in("event_id", eventIds),
    admin
      .from("settlement_summaries")
      .select("event_id, is_approved_for_payout, approved_at, total_gross_amount")
      .in("event_id", eventIds),
    admin
      .from("qr_configs")
      .select("event_id, qr_config_id, label")
      .in("event_id", eventIds)
      .is("deleted_at", null),
    admin
      .from("transaction_distributions")
      .select("event_id, hold_released")
      .in("event_id", eventIds)
      .eq("distribution_status", "accrued"),
  ]);

  // イベントごとにhold_released=falseが残っているか集計
  const holdReleasedByEvent = new Map<string, boolean>();
  for (const d of holdStatusRes.data ?? []) {
    if (!holdReleasedByEvent.has(d.event_id)) {
      holdReleasedByEvent.set(d.event_id, true);
    }
    if (!d.hold_released) {
      holdReleasedByEvent.set(d.event_id, false);
    }
  }

  const evidenceByEvent = new Map<string, typeof evidencesRes.data>();
  for (const ev of evidencesRes.data ?? []) {
    const list = evidenceByEvent.get(ev.event_id) ?? [];
    list.push(ev);
    evidenceByEvent.set(ev.event_id, list);
  }

  const summaryByEvent = new Map(
    (summariesRes.data ?? []).map((s) => [s.event_id, s])
  );

  const qrConfigIdsByEvent = new Map<string, string[]>();
  const qrLabelById = new Map<string, string>();
  for (const q of qrConfigsRes.data ?? []) {
    const list = qrConfigIdsByEvent.get(q.event_id) ?? [];
    list.push(q.qr_config_id);
    qrConfigIdsByEvent.set(q.event_id, list);
    qrLabelById.set(q.qr_config_id, q.label ?? "QRコード");
  }

  const allQrIds = (qrConfigsRes.data ?? []).map((q) => q.qr_config_id);

  // トランザクション詳細取得
  const { data: txs } = await admin
    .from("transactions")
    .select("transaction_id, qr_config_id, total_gross_amount, net_amount, status, created_at, sender_name")
    .in("qr_config_id", allQrIds)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  // 配分先取得
  const { data: targets } = await admin
    .from("qr_config_targets")
    .select("qr_config_id, profile_id, distribution_ratio, profile:profiles!profile_id(display_name)")
    .in("qr_config_id", allQrIds)
    .is("deleted_at", null);

  // QR別集計（gross / net ともに保存値をそのまま足し算）
  const grossByQr = new Map<string, number>();
  const netByQr   = new Map<string, number>();
  const txsByQr   = new Map<string, typeof txs>();
  for (const tx of txs ?? []) {
    const id = tx.qr_config_id!;
    grossByQr.set(id, (grossByQr.get(id) ?? 0) + (tx.total_gross_amount ?? 0));
    netByQr.set(id,   (netByQr.get(id)   ?? 0) + ((tx as any).net_amount   ?? 0));
    const list = txsByQr.get(id) ?? [];
    list.push(tx);
    txsByQr.set(id, list);
  }

  // 全証跡画像の署名付きURL（1時間有効）を一括生成
  const allPhotoPaths = (evidencesRes.data ?? []).flatMap((ev) => ev.photo_paths as string[]);
  const signedUrlMap = new Map<string, string>();
  if (allPhotoPaths.length > 0) {
    const { data: signedUrls } = await admin.storage
      .from("event-evidence")
      .createSignedUrls(allPhotoPaths, 3600);
    for (const item of signedUrls ?? []) {
      if (item.signedUrl && item.path) signedUrlMap.set(item.path, item.signedUrl);
    }
  }

  return (
    <div className="space-y-8">

      <div className="space-y-1">
        <AdminBreadcrumb crumbs={[{ label: "Admin", href: "/dashboard" }, { label: "Settlements" }]} />
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">精算管理</h1>
        <p className="text-sm text-slate-500">終了したイベントのエビデンスを確認し、精算を承認します</p>
      </div>

        {(events ?? []).length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
            <p className="text-slate-600 text-sm font-bold">終了済みイベントがありません</p>
          </div>
        )}

        <div className="space-y-4">
          {(events ?? []).map((event) => {
            const evidences = evidenceByEvent.get(event.event_id) ?? [];
            const summary = summaryByEvent.get(event.event_id);
            const qrIds = qrConfigIdsByEvent.get(event.event_id) ?? [];
            const gross = qrIds.reduce((s, id) => s + (grossByQr.get(id) ?? 0), 0);
            const net   = qrIds.reduce((s, id) => s + (netByQr.get(id)   ?? 0), 0);
            const settled = event.lifecycle_status === "settled";
            const isRejected = !settled && summary?.is_approved_for_payout === false;
            const hasEvidence = evidences.length > 0;

            // オーソリ期限（開催開始日 + 7日）
            const authExpiresAt = event.start_at
              ? new Date(new Date(event.start_at).getTime() + AUTH_EXPIRE_DAYS * 24 * 60 * 60 * 1000)
              : null;
            const daysLeft = authExpiresAt
              ? Math.ceil((authExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
              : null;
            const isExpiring = !settled && gross > 0 && daysLeft !== null && daysLeft <= 2;
            const isExpired = !settled && gross > 0 && daysLeft !== null && daysLeft <= 0;

            // 売上明細（QR別）
            const txGroups: TxGroup[] = qrIds.map((qrId) => ({
              qr_config_id: qrId,
              qr_label: qrLabelById.get(qrId) ?? "QRコード",
              total: grossByQr.get(qrId) ?? 0,
              transactions: (txsByQr.get(qrId) ?? []).map((tx) => ({
                transaction_id: tx.transaction_id,
                amount: tx.total_gross_amount ?? 0,
                created_at: tx.created_at,
                sender_name: (tx as any).sender_name ?? null,
              })),
            })).filter((g) => g.total > 0);

            // 配分内訳（プロフィール別に集計）
            const profileAmounts = new Map<string, { display_name: string | null; amount: number }>();
            for (const qrId of qrIds) {
              const qrNet     = netByQr.get(qrId) ?? 0;
              const qrTargets = (targets ?? []).filter((t) => t.qr_config_id === qrId);
              for (const t of qrTargets) {
                const amount = Math.floor(qrNet * Number(t.distribution_ratio));
                const existing = profileAmounts.get(t.profile_id);
                profileAmounts.set(t.profile_id, {
                  display_name: (t.profile as any)?.display_name ?? null,
                  amount: (existing?.amount ?? 0) + amount,
                });
              }
            }
            const distributionRows: DistributionRow[] = Array.from(profileAmounts.entries())
              .map(([profile_id, v]) => ({ profile_id, display_name: v.display_name, amount: v.amount }))
              .sort((a, b) => b.amount - a.amount);

            return (
              <div
                key={event.event_id}
                className={`bg-slate-900 border rounded-2xl p-5 space-y-4 ${
                  settled ? "border-emerald-500/20" : isExpired ? "border-red-500/40" : isExpiring ? "border-orange-500/40" : isRejected ? "border-red-500/20" : hasEvidence ? "border-amber-500/20" : "border-slate-800"
                }`}
              >
                {/* ヘッダー */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {settled ? (
                        <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 uppercase tracking-wider">精算済み</span>
                      ) : isExpired ? (
                        <span className="text-[9px] font-black text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5 flex items-center gap-1"><Zap size={9} />オーソリ期限切れ</span>
                      ) : isExpiring ? (
                        <span className="text-[9px] font-black text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-2 py-0.5 flex items-center gap-1"><Zap size={9} />期限{daysLeft}日前</span>
                      ) : isRejected ? (
                        <span className="text-[9px] font-black text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5 uppercase tracking-wider">差戻し済み</span>
                      ) : hasEvidence ? (
                        <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 uppercase tracking-wider">要承認</span>
                      ) : (
                        <span className="text-[9px] font-black text-slate-600 bg-slate-800 rounded-full px-2 py-0.5 uppercase tracking-wider">未提出</span>
                      )}
                    </div>
                    <Link
                      href={`/dashboard/events/${event.event_id}`}
                      className="flex items-center gap-1.5 font-black text-white hover:text-indigo-300 transition-colors group"
                    >
                      {event.title}
                      <ExternalLink size={11} className="text-slate-600 group-hover:text-indigo-400 shrink-0" />
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      {event.venue && (
                        <span className="flex items-center gap-1"><MapPin size={10} />{event.venue}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {fmtDate(event.end_at)}
                      </span>
                      <span>{(event.organizer as any)?.display_name}</span>
                    </div>
                  </div>

                  {/* 精算ボタン */}
                  {!settled && !isRejected && hasEvidence && gross > 0 && (
                    <SettleButton eventId={event.event_id} />
                  )}
                </div>

                {/* 金額（クリックで明細展開） */}
                <SettlementDetails
                  gross={gross}
                  net={net}
                  netRateLabel={`${parseFloat((net_rate * 100).toFixed(3))}%`}
                  txGroups={txGroups}
                  distributionRows={distributionRows}
                />

                {/* エビデンス */}
                {hasEvidence ? (
                  <div className="space-y-3">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                      <CheckCircle2 size={10} className="text-green-400" />
                      エビデンス {evidences.length}件
                    </p>
                    {evidences.map((ev) => {
                      const paths = ev.photo_paths as string[];
                      return (
                        <div key={ev.evidence_id} className="bg-slate-800/50 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            {paths.length > 0 && (
                              <span className="flex items-center gap-1"><ImageIcon size={10} />{paths.length}枚</span>
                            )}
                            {ev.attendance_count != null && (
                              <span>動員 {ev.attendance_count}人</span>
                            )}
                            <span>{fmtDate(ev.created_at)}</span>
                          </div>
                          {paths.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {paths.map((path) => {
                                const url = signedUrlMap.get(path);
                                return url ? (
                                  <a key={path} href={url} target="_blank" rel="noopener noreferrer">
                                    <img src={url} alt="証跡" className="w-20 h-20 object-cover rounded-lg border border-slate-700 hover:border-slate-500 transition-colors" />
                                  </a>
                                ) : null;
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Clock size={12} />
                    エビデンス未提出
                  </div>
                )}

                {/* 精算済み情報 + キャプチャ再実行 + 強制出金 */}
                {settled && summary && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-[10px] text-slate-500">
                        精算済み · {summary.approved_at ? fmtDate(summary.approved_at) : ""}
                      </p>
                      <AdminForcePayoutButton
                        eventId={event.event_id}
                        eventTitle={event.title}
                        alreadyReleased={holdReleasedByEvent.get(event.event_id) ?? false}
                      />
                    </div>
                    <CaptureAllButton eventId={event.event_id} />
                  </div>
                )}

                {/* オーソリ期限警告 + キャプチャ/返金 */}
                {(isExpiring || isExpired) && (
                  <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-black text-red-400 flex items-center gap-1.5">
                      <AlertTriangle size={10} />
                      {isExpired
                        ? "オーソリ期限が切れています。キャプチャするか全件返金してください。"
                        : `オーソリ期限まであと${daysLeft}日です。精算またはキャプチャを実施してください。`}
                    </p>
                    <AdminAuthExpiryActions eventId={event.event_id} eventTitle={event.title} />
                  </div>
                )}

                {/* 売上なしのアラート */}
                {!settled && hasEvidence && gross === 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-400">
                    <AlertTriangle size={12} />
                    売上トランザクションがありません
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
}

export default function SettlementsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <SettlementsContent />
    </Suspense>
  );
}
