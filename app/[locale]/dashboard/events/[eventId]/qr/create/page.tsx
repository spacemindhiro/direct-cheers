import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QRCreateForm } from "@/components/qr-create-form";
import { Loader2 } from "lucide-react";

async function QRCreateContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: event } = await supabase
    .from("events")
    .select("event_id, title, lifecycle_status, event_artists(artist_profile_id, artist:profiles!artist_profile_id(display_name))")
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();
  if (event.lifecycle_status !== "published" && event.lifecycle_status !== "ongoing") {
    redirect(`/dashboard/events/${eventId}`);
  }

  const artists = (event.event_artists ?? []).map((ea: any) => ({
    profile_id: ea.artist_profile_id,
    display_name: ea.artist?.display_name ?? "Unknown",
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">QR Code</p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">QR を作成</h1>
        <p className="text-slate-500 text-sm">{event.title}</p>
      </div>
      <QRCreateForm eventId={eventId} artists={artists} />
    </div>
  );
}

export default function QRCreatePage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
      <QRCreateContent params={params} />
    </Suspense>
  );
}
