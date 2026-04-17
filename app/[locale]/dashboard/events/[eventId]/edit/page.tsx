import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventEditForm } from "@/components/event-edit-form";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

async function EventEditContent({ params }: { params: Promise<{ eventId: string }> }) {
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
    .select("event_id, title, venue, start_at, end_at, lifecycle_status, organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();

  const isOrganizer = event.organizer_profile_id === user.id;
  const isAgent =
    (profile?.role === "agent" || profile?.role === "admin") &&
    event.agent_id === user.id;

  if (!isOrganizer && !isAgent) redirect("/dashboard");
  if (event.lifecycle_status === "settled") redirect(`/dashboard/events/${eventId}`);

  // 現在の出演アーティスト（出演確定のみ）
  const { data: eventArtists } = await supabase
    .from("event_artists")
    .select("artist_profile_id, status, artist:profiles!artist_profile_id(display_name)")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .neq("status", "rejected");

  // 確定済みのみ編集対象に含める（交渉中は別イベントと混同を防ぐためこのイベント単位で管理）
  const currentArtists = (eventArtists ?? [])
    .filter((ea: any) => ea.status === "confirmed")
    .map((ea: any) => ({
      profile_id: ea.artist_profile_id,
      display_name: ea.artist?.display_name ?? "—",
    }));

  // コネクション済みアーティスト
  const { data: connections } = await supabase
    .from("connections")
    .select("artist_profile_id, artist:profiles!artist_profile_id(display_name)")
    .eq("organizer_profile_id", event.organizer_profile_id)
    .eq("status", "active")
    .is("deleted_at", null);

  const connectedArtists = (connections ?? []).map((c: any) => ({
    profile_id: c.artist_profile_id,
    display_name: c.artist?.display_name ?? "Unknown",
  }));

  const toLocalDatetime = (iso: string) => iso.slice(0, 16);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors"
        >
          <ArrowLeft size={12} /> イベント詳細に戻る
        </Link>
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Event</p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          イベントを編集
        </h1>
        <p className="text-slate-500 text-sm">{event.title}</p>
      </div>

      <EventEditForm
        eventId={eventId}
        defaultValues={{
          title: event.title,
          venue: event.venue ?? "",
          start_at: toLocalDatetime(event.start_at),
          end_at: toLocalDatetime(event.end_at),
        }}
        currentArtists={currentArtists}
        connectedArtists={connectedArtists}
        lifecycleStatus={event.lifecycle_status}
      />
    </div>
  );
}

export default function EventEditPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
      <EventEditContent params={params} />
    </Suspense>
  );
}
