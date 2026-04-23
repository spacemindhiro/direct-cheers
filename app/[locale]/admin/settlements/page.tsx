import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeConfig } from "@/lib/fee-config";
import { SettleButton } from "@/components/settle-button";
import { Loader2, Calendar, MapPin, ImageIcon, CheckCircle2, Clock, AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";

async function SettlementsContent() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (me?.role !== "admin") redirect("/dashboard");

  const { net_rate } = await getFeeConfig();

  // 終了済みイベントを取得（end_at 経過 OR 手動終了・精算済み）
  const now = new Date().toISOString();
  const { data: events } = await admin
    .from("events")
    .select(`
      event_id, title, venue, end_at, lifecycle_status,
      organizer:profiles!organizer_profile_id(display_name)
    `)
    .or(`end_at.lt.${now},lifecycle_status.in.(ended,settled)`)
    .order("end_at", { ascending: false })
    .limit(50);

  // 各イベントのエビデンス・売上・精算状況を取得
  const eventIds = (events ?? []).map((e) => e.event_id);

  const [evidencesRes, summariesRes, qrConfigsRes] = await Promise.all([
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
      .select("event_id, qr_config_id")
      .in("event_id", eventIds)
      .is("deleted_at", null),
  ]);

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
  for (const q of qrConfigsRes.data ?? []) {
    const list = qrConfigIdsByEvent.get(q.event_id) ?? [];
    list.push(q.qr_config_id);
    qrConfigIdsByEvent.set(q.event_id, list);
  }

  // 全 qr_config_id → transaction 集計
  const allQrIds = (qrConfigsRes.data ?? []).map((q) => q.qr_config_id);
  const { data: txs } = await admin
    .from("transactions")
    .select("qr_config_id, total_gross_amount, status")
    .in("qr_config_id", allQrIds)
    .eq("status", "completed");

  const grossByQr = new Map<string, number>();
  for (const tx of txs ?? []) {
    grossByQr.set(tx.qr_config_id!, (grossByQr.get(tx.qr_config_id!) ?? 0) + (tx.total_gross_amount ?? 0));
  }

  const grossByEvent = new Map<string, number>();
  for (const [eventId, qrIds] of qrConfigIdsByEvent.entries()) {
    const total = qrIds.reduce((s, id) => s + (grossByQr.get(id) ?? 0), 0);
    grossByEvent.set(eventId, total);
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
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        <div className="space-y-1">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-4">
            <ArrowLeft size={12} /> ダッシュボードへ
          </Link>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">Admin</p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
            精算管理
          </h1>
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
            const gross = grossByEvent.get(event.event_id) ?? 0;
            const net = Math.floor(gross * net_rate);
            const settled = event.lifecycle_status === "settled";
            const hasEvidence = evidences.length > 0;

            return (
              <div
                key={event.event_id}
                className={`bg-slate-900 border rounded-2xl p-5 space-y-4 ${
                  settled ? "border-emerald-500/20" : hasEvidence ? "border-amber-500/20" : "border-slate-800"
                }`}
              >
                {/* ヘッダー */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {settled ? (
                        <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 uppercase tracking-wider">
                          精算済み
                        </span>
                      ) : hasEvidence ? (
                        <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 uppercase tracking-wider">
                          要承認
                        </span>
                      ) : (
                        <span className="text-[9px] font-black text-slate-600 bg-slate-800 rounded-full px-2 py-0.5 uppercase tracking-wider">
                          未提出
                        </span>
                      )}
                    </div>
                    <p className="font-black text-white">{event.title}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      {event.venue && (
                        <span className="flex items-center gap-1"><MapPin size={10} />{event.venue}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(event.end_at).toLocaleDateString("ja-JP")}
                      </span>
                      <span>{(event.organizer as any)?.display_name}</span>
                    </div>
                  </div>

                  {/* 精算ボタン */}
                  {!settled && hasEvidence && gross > 0 && (
                    <SettleButton eventId={event.event_id} />
                  )}
                </div>

                {/* 金額 */}
                <div className="flex gap-4">
                  <div className="bg-slate-800/60 rounded-xl px-4 py-2">
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">総売上</p>
                    <p className="text-lg font-black text-white italic">¥{gross.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl px-4 py-2">
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">配分額 ({(net_rate * 100).toFixed(1)}%)</p>
                    <p className="text-lg font-black text-emerald-400 italic">¥{net.toLocaleString()}</p>
                  </div>
                </div>

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
                              <span className="flex items-center gap-1">
                                <ImageIcon size={10} />{paths.length}枚
                              </span>
                            )}
                            {ev.attendance_count != null && (
                              <span>動員 {ev.attendance_count}人</span>
                            )}
                            <span>{new Date(ev.created_at).toLocaleDateString("ja-JP")}</span>
                          </div>
                          {paths.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {paths.map((path) => {
                                const url = signedUrlMap.get(path);
                                return url ? (
                                  <a key={path} href={url} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={url}
                                      alt="証跡"
                                      className="w-20 h-20 object-cover rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
                                    />
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

                {/* 精算済み情報 */}
                {settled && summary && (
                  <p className="text-[10px] text-slate-500">
                    精算済み · {summary.approved_at ? new Date(summary.approved_at).toLocaleDateString("ja-JP") : ""}
                  </p>
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
