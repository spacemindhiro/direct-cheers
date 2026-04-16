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

  // datetime-local が受け取れる形式に変換（YYYY-MM-DDTHH:mm）
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
