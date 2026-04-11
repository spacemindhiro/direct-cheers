import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Loader2, MapPin, Calendar, QrCode, CheckCircle } from "lucide-react";
import Link from "next/link";
import { EventApproveButton } from "@/components/event-approve-button";

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
      event_id, title, venue, start_at, end_at, lifecycle_status,
      event_artists(
        artist_profile_id,
        artist:profiles!artist_profile_id(display_name)
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
  const canApprove = isAgent && event.lifecycle_status === "draft";
  const canCreateQR = event.lifecycle_status === "published" || event.lifecycle_status === "ongoing";

  const LIFECYCLE_LABELS: Record<string, string> = {
    draft: "承認待ち", published: "公開済み", ongoing: "開催中", ended: "終了", settled: "精算済み",
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Event</p>
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">{event.title}</h1>
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
      </div>

      {/* 出演アーティスト */}
      {event.event_artists && event.event_artists.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">出演アーティスト</p>
          <div className="flex flex-wrap gap-2">
            {event.event_artists.map((ea: any) => (
              <span key={ea.artist_profile_id} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300">
                {ea.artist?.display_name ?? "—"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* エージェント承認ボタン */}
      {canApprove && <EventApproveButton eventId={eventId} />}

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
          <p className="text-xs text-slate-600">エージェントが承認するとQRを作成できます</p>
        )}

        {!qrConfigs || qrConfigs.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 text-center">
            <p className="text-slate-600 text-sm font-bold italic">No QR codes yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {qrConfigs.map((qr) => (
              <div key={qr.qr_config_id} className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-white text-sm">{qr.label ?? "QRコード"}</p>
                  <p className="text-xs text-slate-500">{new Date(qr.created_at).toLocaleDateString("ja-JP")}</p>
                </div>
                <QrCode size={20} className="text-slate-500" />
              </div>
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
