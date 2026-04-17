import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Loader2, MapPin, Calendar, QrCode, FileImage, BarChart2, ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { EventApproveButton } from "@/components/event-approve-button";
import { LiveSalesBoard } from "@/components/live-sales-board";
import { ScanLine } from "lucide-react";

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

  const { data: event } = await supabase
    .from("events")
    .select(`
      event_id, title, venue, start_at, end_at, lifecycle_status, agent_id,
      agent:profiles!agent_id(display_name),
      event_artists(
        artist_profile_id,
        status,
        deleted_at,
        artist:profiles!artist_profile_id(display_name, credit_name, avatar_url)
      )
    `)
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();

  const { data: qrConfigs } = await supabase
    .from("qr_configs")
    .select("qr_config_id, label, created_at")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const isAgent = profile?.role === "agent" || profile?.role === "admin";
  const isOrganizer = profile?.role === "organizer" || profile?.role === "admin";
  const isArtist = profile?.role === "artist";
  const canApprove = isAgent && event.lifecycle_status === "draft";
  const canCreateQR = (isOrganizer || isAgent) &&
    (event.lifecycle_status === "published" || event.lifecycle_status === "ongoing");
  const hasEnded = new Date(event.end_at) < new Date();
  const canSubmitEvidence = isOrganizer && hasEnded && event.lifecycle_status !== "settled";

  const LIFECYCLE_LABELS: Record<string, string> = {
    draft: "承認待ち", published: "公開済み", ongoing: "開催中", ended: "終了", settled: "精算済み",
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link
          href="/dashboard/events"
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors"
        >
          <ArrowLeft size={12} /> イベント一覧に戻る
        </Link>
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
        {event.lifecycle_status === "draft" && (event.agent as any)?.display_name && (
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
                          alt={ea.artist.display_name ?? ea.artist.credit_name ?? ""}
                          className="w-8 h-8 rounded-full object-cover border border-slate-700"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                          <span className="text-slate-500 text-xs font-black">
                            {(ea.artist?.display_name ?? ea.artist?.credit_name ?? "?")[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="text-sm font-bold text-slate-200">
                        {ea.artist?.display_name ?? ea.artist?.credit_name ?? "—"}
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

      {/* エージェント承認ボタン */}
      {canApprove && <EventApproveButton eventId={eventId} />}

      {/* エビデンス提出ボタン */}
      {canSubmitEvidence && (
        <Link
          href={`/dashboard/events/${eventId}/evidence`}
          className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 rounded-[1.5rem] p-5 transition-all group"
        >
          <div className="w-10 h-10 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 group-hover:bg-amber-500/20 transition-all shrink-0">
            <FileImage size={18} className="text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Evidence</p>
            <p className="font-black text-amber-400 text-sm">エビデンスを提出する</p>
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

        {!canCreateQR && event.lifecycle_status === "draft" && (
          <p className="text-xs text-slate-600">
            {(event.agent as any)?.display_name
              ? `担当エージェント「${(event.agent as any).display_name}」の承認後にQRを作成できます`
              : "エージェントが承認するとQRを作成できます"}
          </p>
        )}

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
