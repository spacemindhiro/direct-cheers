import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QRDisplay } from "@/components/qr-display";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

async function QRDetailContent({
  params,
}: {
  params: Promise<{ eventId: string; qrConfigId: string }>;
}) {
  const { eventId, qrConfigId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: qr } = await supabase
    .from("qr_configs")
    .select("qr_config_id, label, created_at, event_id")
    .eq("qr_config_id", qrConfigId)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .single();

  if (!qr) notFound();

  const { data: event } = await supabase
    .from("events")
    .select("title")
    .eq("event_id", eventId)
    .single();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com";
  const qrUrl = `${siteUrl}/c/${qrConfigId}`;

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
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
          {qr.label ?? "QRコード"}
        </h1>
        <p className="text-slate-500 text-sm">{event?.title}</p>
      </div>

      <QRDisplay qrConfigId={qrConfigId} qrUrl={qrUrl} label={qr.label ?? "QRコード"} />
    </div>
  );
}

export default function QRDetailPage({
  params,
}: {
  params: Promise<{ eventId: string; qrConfigId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-600" size={32} />
        </div>
      }
    >
      <QRDetailContent params={params} />
    </Suspense>
  );
}
