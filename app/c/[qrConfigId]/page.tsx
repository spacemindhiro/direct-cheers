import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheersPaymentForm } from "@/components/cheers-payment-form";
import { MapPin, Calendar } from "lucide-react";

export default async function CheersPage({
  params,
}: {
  params: Promise<{ qrConfigId: string }>;
}) {
  const { qrConfigId } = await params;
  const admin = createAdminClient();

  // QR config + product + event + artist を取得
  const { data: qr } = await admin
    .from("qr_configs")
    .select(`
      qr_config_id,
      label,
      event:events!event_id (
        event_id,
        title,
        venue,
        start_at,
        lifecycle_status
      )
    `)
    .eq("qr_config_id", qrConfigId)
    .is("deleted_at", null)
    .single();

  if (!qr) notFound();

  const event = qr.event as any;
  if (!event || !["published", "ongoing"].includes(event.lifecycle_status)) {
    notFound();
  }

  // このQRに紐づく products を取得
  const { data: products } = await admin
    .from("products")
    .select(`
      product_id,
      name,
      type,
      min_amount,
      max_amount,
      artist:profiles!artist_id (display_name, avatar_url)
    `)
    .eq("event_id", event.event_id)
    .is("deleted_at", null);

  if (!products || products.length === 0) notFound();

  const artistName = (products[0].artist as any)?.display_name ?? "Artist";
  const artistAvatar = (products[0].artist as any)?.avatar_url ?? null;

  const formProducts = products.map((p) => ({
    product_id: p.product_id,
    name: p.name,
    type: p.type,
    min_amount: p.min_amount,
    max_amount: p.max_amount,
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-20">

      {/* ヒーロー */}
      <div className="relative h-[40vh] overflow-hidden">
        {artistAvatar ? (
          <img src={artistAvatar} className="w-full h-full object-cover opacity-60 grayscale" alt={artistName} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        <div className="absolute bottom-8 left-6 right-6 space-y-3">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">Direct Cheers</p>
          <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter leading-none">
            {artistName}
          </h1>
          <div className="space-y-1 border-l-2 border-pink-500/30 pl-4">
            <p className="text-sm font-bold text-slate-200 uppercase tracking-tight">{event.title}</p>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              {event.venue && (
                <span className="flex items-center gap-1">
                  <MapPin size={11} /> {event.venue}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {new Date(event.start_at).toLocaleDateString("ja-JP")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 決済フォーム */}
      <div className="px-6 py-8 max-w-md mx-auto space-y-6">
        <div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Send Cheers</p>
          <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mt-1">
            {qr.label ?? "応援する"}
          </h2>
        </div>

        <CheersPaymentForm
          qrConfigId={qrConfigId}
          products={formProducts}
          artistName={artistName}
          eventTitle={event.title}
        />

        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-700 font-bold uppercase tracking-widest">
          <span>Secure Checkout by Stripe</span>
        </div>
      </div>
    </div>
  );
}
