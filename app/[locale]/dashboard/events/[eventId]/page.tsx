import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Loader2, MapPin, Calendar, QrCode, FileImage, BarChart2, Pencil, CheckCircle2, ScanLine } from "lucide-react";
import { EventEndButton } from "@/components/event-end-button";
import Link from "next/link";
import { EventApproveButton } from "@/components/event-approve-button";
import { EventRequestReviewButton } from "@/components/event-request-review-button";
import { EventDeleteButton } from "@/components/event-delete-button";
import { EventCancelButton } from "@/components/event-cancel-button";
import { EventCancelApproveButton } from "@/components/event-cancel-approve-button";
import { LiveSalesBoard } from "@/components/live-sales-board";
import { EventPayPayToggle } from "@/components/event-paypay-toggle";

async function EventDetailContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const adminClient = createAdminClient();
  const { data: event } = await adminClient
    .from("events")
    .select(`
      event_id, title, venue, start_at, end_at, lifecycle_status, agent_id, paypay_enabled, organizer_profile_id,
      agent:profiles!agent_id(display_name),
      event_artists(
        artist_profile_id,
        status,
        deleted_at,
        artist:profiles!artist_profile_id(display_name, artist_name, credit_name, avatar_url)
      )
    `)
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();

  // このイベントの承認/中止通知を既読化（詳細ページを開いた時点で消し込み）
  await adminClient
    .from("notifications")
    .update({ is_read: true })
    .eq("profile_id", user.id)
    .in("type", ["event_approved", "event_cancelled", "event_cancel_rejected", "approval_requested"])
    .eq("is_read", false)
    .filter("metadata->>event_id", "eq", eventId);

  const isAgent = profile?.role === "agent" || profile?.role === "admin";
  const isOrganizer = profile?.role === "organizer" || profile?.role === "admin";
  const isArtist = profile?.role === "artist";

  const { data: allQrConfigs } = await adminClient
    .from("qr_configs")
    .select("qr_config_id, label, created_at")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  let qrConfigs = allQrConfigs ?? [];

  if (isArtist) {
    const { data: myTargets } = await adminClient
      .from("qr_config_targets")
      .select("qr_config_id")
      .eq("profile_id", user.id)
      .is("deleted_at", null);
    const myQrIds = new Set((myTargets ?? []).map((t: any) => t.qr_config_id));
    qrConfigs = qrConfigs.filter((qr) => myQrIds.has(qr.qr_config_id));
  }
  const canRequestReview = isOrganizer && event.lifecycle_status === "draft";
  const isSelfOrganized = event.agent_id === event.organizer_profile_id;
  const canApprove = isAgent && event.lifecycle_status === "review_requested" &&
    (!isSelfOrganized || profile?.role === "admin");
  const canCreateQR = (isOrganizer || isAgent) &&
    ["draft", "review_requested", "published", "ongoing"].includes(event.lifecycle_status);
  const hasEnded = new Date(event.end_at) < new Date() || event.lifecycle_status === "ended";
  const canSubmitEvidence = isOrganizer && hasEnded && event.lifecycle_status !== "settled";
  const canEndEvent = isOrganizer && ["published", "ongoing"].includes(event.lifecycle_status);

  const cancellableStatuses = ["draft", "review_requested", "published", "ongoing"];
  const canRequestCancel = isOrganizer &&
    cancellableStatuses.includes(event.lifecycle_status);
  const canApproveCancellation = isAgent &&
    event.lifecycle_status === "cancellation_requested" &&
    (profile?.role === "admin" || event.agent_id === user.id);

  const { data: evidences } = await adminClient
    .from("event_evidences")
    .select("evidence_id")
    .eq("event_id", eventId);
  const evidenceCount = evidences?.length ?? 0;

  const LIFECYCLE_LABELS: Record<string, string> = {
    draft: "下書き", review_requested: "承認待ち", published: "公開済み",
    ongoing: "開催中", ended: "終了", settled: "精算済み",
    cancellation_requested: "中止申請中", cancelled: "中止",
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
<div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Event</p>
            <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">{event.title}</h1>
          </div>
          {(isOrganizer || isAgent) && event.lifecycle_status !== "settled" && (
            <Link
              href={`/dashboard/events/${eventId}/edit`}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-black text-slate-300 transition-all shrink-0 mt-1"
            >
              <Pencil size={12} /> 編集
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400 pt-1">
          <span className="flex items-center gap-1.5"><MapPin size={14} />{event.venue ?? "—"}</span>
          <span className="flex items-center gap-1.5">
            <Calendar size={14} />
            {new Date(event.start_at).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}
          </span>
          <span className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-slate-800 border border-slate-700 text-slate-400">
            {LIFECYCLE_LABELS[event.lifecycle_status] ?? event.lifecycle_status}
          </span>
        </div>
        {["draft", "review_requested"].includes(event.lifecycle_status) && (event.agent as any)?.display_name && (
          <p className="text-[11px] text-slate-500 font-bold">
            担当エージェント: <span className="text-slate-300">{(event.agent as any).display_name}</span>
          </p>
        )}
      </div>

      {/* 出演アーティスト */}
      {(() => {
        const visibleArtists = (event.event_artists ?? []).filter(
          (ea: any) => ea.deleted_at === null && ea.status !== "rejected"
        );
        if (visibleArtists.length === 0) return null;
        return (
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">出演アーティスト</p>
            <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] divide-y divide-slate-800">
              {visibleArtists.map((ea: any) => {
                const isConfirmed = ea.status === "confirmed";
                return (
                  <div key={ea.artist_profile_id} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {ea.artist?.avatar_url ? (
                        <img
                          src={ea.artist.avatar_url}
                          alt={ea.artist.artist_name ?? ea.artist.display_name ?? ea.artist.credit_name ?? ""}
                          className="w-8 h-8 rounded-full object-cover border border-slate-700"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                          <span className="text-slate-500 text-xs font-black">
                            {(ea.artist?.artist_name ?? ea.artist?.display_name ?? ea.artist?.credit_name ?? "?")[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="text-sm font-bold text-slate-200">
                        {ea.artist?.artist_name ?? ea.artist?.display_name ?? ea.artist?.credit_name ?? "—"}
                      </span>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${
                      isConfirmed
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    }`}>
                      {isConfirmed ? "出演確定" : "交渉中"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* リアルタイム着金予測ボード */}
      {(isOrganizer || isAgent || isArtist) && (
        <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <BarChart2 size={14} className="text-pink-500" /> 着金予測
          </p>
          <Suspense fallback={<div className="h-48 bg-slate-900 border border-slate-800 rounded-[2rem] animate-pulse" />}>
            <LiveSalesBoard eventId={eventId} />
          </Suspense>
        </div>
      )}

      {/* 入場チェックインスキャナ */}
      {isOrganizer && (event.lifecycle_status === "ongoing" || event.lifecycle_status === "published") && (
        <Link
          href={`/dashboard/events/${eventId}/checkin`}
          className="flex items-center gap-4 bg-indigo-500/10 border border-indigo-500/20 hover:border-indigo-500/40 rounded-[1.5rem] p-5 transition-all group"
        >
          <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-all shrink-0">
            <ScanLine size={18} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Check-in</p>
            <p className="font-black text-indigo-400 text-sm">入場スキャナを起動</p>
          </div>
        </Link>
      )}

      {/* QR表示端末コントロール */}
      {(isOrganizer || isAgent) && ["published", "ongoing"].includes(event.lifecycle_status) && (
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/dashboard/events/${eventId}/control`}
            className="flex flex-col gap-3 bg-violet-500/10 border border-violet-500/20 hover:border-violet-500/40 rounded-[1.5rem] p-5 transition-all group"
          >
            <div className="w-10 h-10 bg-violet-500/10 rounded-2xl flex items-center justify-center border border-violet-500/20 group-hover:bg-violet-500/20 transition-all">
              <QrCode size={18} className="text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Control</p>
              <p className="font-black text-violet-400 text-sm leading-tight">親機パネル</p>
            </div>
          </Link>
          <Link
            href={`/display/${eventId}`}
            className="flex flex-col gap-3 bg-slate-800/60 border border-slate-700 hover:border-slate-500 rounded-[1.5rem] p-5 transition-all group"
          >
            <div className="w-10 h-10 bg-slate-700/50 rounded-2xl flex items-center justify-center border border-slate-600 group-hover:bg-slate-600/50 transition-all">
              <QrCode size={18} className="text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Display</p>
              <p className="font-black text-slate-300 text-sm leading-tight">子機モード</p>
            </div>
          </Link>
        </div>
      )}

      {/* PayPay設定（オーガナイザー） */}
      {isOrganizer && !["settled", "cancelled"].includes(event.lifecycle_status) && (
        <EventPayPayToggle
          eventId={eventId}
          enabled={(event as any).paypay_enabled ?? false}
        />
      )}

      {/* 承認依頼ボタン（オーガナイザー） */}
      {canRequestReview && <EventRequestReviewButton eventId={eventId} />}

      {/* 削除ボタン（承認前のみ、オーガナイザー） */}
      {isOrganizer && ["draft", "review_requested"].includes(event.lifecycle_status) && (
        <EventDeleteButton eventId={eventId} />
      )}

      {/* エージェント承認ボタン */}
      {canApprove && <EventApproveButton eventId={eventId} />}

      {/* 中止申請ボタン（オーガナイザー） */}
      {canRequestCancel && <EventCancelButton eventId={eventId} />}

      {/* 中止承認ボタン（エージェント） */}
      {canApproveCancellation && <EventCancelApproveButton eventId={eventId} />}

      {/* イベント終了ボタン（オーガナイザー） */}
      {canEndEvent && <EventEndButton eventId={eventId} />}

      {/* エビデンス提出ボタン（オーガナイザー） */}
      {canSubmitEvidence && (
        <Link
          href={`/dashboard/events/${eventId}/evidence`}
          className={`flex items-center gap-3 border rounded-[1.5rem] p-5 transition-all group ${
            evidenceCount > 0
              ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
              : "bg-amber-500/10 border-amber-500/20 hover:border-amber-500/40"
          }`}
        >
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all shrink-0 ${
            evidenceCount > 0
              ? "bg-emerald-500/10 border-emerald-500/20 group-hover:bg-emerald-500/20"
              : "bg-amber-500/10 border-amber-500/20 group-hover:bg-amber-500/20"
          }`}>
            {evidenceCount > 0
              ? <CheckCircle2 size={18} className="text-emerald-400" />
              : <FileImage size={18} className="text-amber-400" />
            }
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Evidence</p>
            {evidenceCount > 0 ? (
              <p className="font-black text-emerald-400 text-sm">証跡提出済み（{evidenceCount}件）· 追加提出</p>
            ) : (
              <p className="font-black text-amber-400 text-sm">開催証跡を提出して承認依頼する</p>
            )}
          </div>
        </Link>
      )}

      {/* 証跡確認リンク（admin） */}
      {profile?.role === "admin" && hasEnded && evidenceCount > 0 && event.lifecycle_status !== "settled" && (
        <Link
          href="/admin/settlements"
          className="flex items-center gap-3 bg-indigo-500/5 border border-indigo-500/20 hover:border-indigo-500/40 rounded-[1.5rem] p-5 transition-all group"
        >
          <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-all shrink-0">
            <CheckCircle2 size={18} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Settlement</p>
            <p className="font-black text-indigo-400 text-sm">証跡を確認して精算承認する</p>
          </div>
        </Link>
      )}

      {/* QR一覧 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <QrCode size={14} className="text-pink-500" /> QR コード
          </p>
          {canCreateQR && (
            <Link
              href={`/dashboard/events/${eventId}/qr/create`}
              className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-400 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
            >
              <QrCode size={14} /> QR 作成
            </Link>
          )}
        </div>


        {!qrConfigs || qrConfigs.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 text-center">
            <p className="text-slate-600 text-sm font-bold italic">No QR codes yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {qrConfigs.map((qr) => (
              <Link key={qr.qr_config_id} href={`/dashboard/events/${eventId}/qr/${qr.qr_config_id}`} className="bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-[1.5rem] px-6 py-4 flex items-center justify-between transition-colors">
                <div>
                  <p className="font-bold text-white text-sm">{qr.label ?? "QRコード"}</p>
                  <p className="text-xs text-slate-500">{new Date(qr.created_at).toLocaleDateString("ja-JP")}</p>
                </div>
                <QrCode size={20} className="text-slate-500" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
      <EventDetailContent params={params} />
    </Suspense>
  );
}
