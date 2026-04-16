import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QRCreateForm } from "@/components/qr-create-form";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

async function QRCreateContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: event } = await supabase
    .from("events")
    .select(`
      event_id, title, lifecycle_status,
      organizer_profile_id,
      organizer:profiles!organizer_profile_id(display_name),
      event_artists(artist_profile_id, artist:profiles!artist_profile_id(display_name))
    `)
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();
  if (event.lifecycle_status !== "published" && event.lifecycle_status !== "ongoing") {
    redirect(`/dashboard/events/${eventId}`);
  }

  // 配分対象候補: オーガナイザー自身 + 出演アーティスト
  const targets = [
    {
      profile_id: event.organizer_profile_id,
      display_name: (event.organizer as any)?.display_name ?? "オーガナイザー",
      role: "organizer" as const,
    },
    ...(event.event_artists ?? []).map((ea: any) => ({
      profile_id: ea.artist_profile_id,
      display_name: ea.artist?.display_name ?? "Unknown",
      role: "artist" as const,
    })),
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors"
        >
          <ArrowLeft size={12} /> イベントに戻る
        </Link>
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">QR Code</p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">QR を作成</h1>
        <p className="text-slate-500 text-sm">{event.title}</p>
      </div>
      <QRCreateForm eventId={eventId} targets={targets} />
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
