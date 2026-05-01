import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QRControlPanel } from "@/components/qr-control-panel";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

async function ControlContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!["organizer", "agent", "admin"].includes(profile?.role ?? "")) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("event_id, title, organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();

  // オーガナイザーまたはエージェントのみ
  if (
    event.organizer_profile_id !== user.id &&
    event.agent_id !== user.id &&
    profile?.role !== "admin"
  ) {
    redirect("/dashboard");
  }

  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select(`
      qr_config_id, label, image_url, strip_image_url, bg_color,
      product:products(name, type, artist_id, artist:profiles!artist_id(display_name))
    `)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com";

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <Link
        href={`/dashboard/events/${eventId}`}
        className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-6 transition-colors"
      >
        <ArrowLeft size={12} /> イベントに戻る
      </Link>
      <QRControlPanel
        eventId={eventId}
        eventTitle={event.title}
        qrConfigs={(qrConfigs ?? []) as any}
        siteUrl={siteUrl}
      />
    </div>
  );
}

export default function ControlPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="text-indigo-400 animate-spin" />
      </div>
    }>
      <ControlContent params={params} />
    </Suspense>
  );
}
