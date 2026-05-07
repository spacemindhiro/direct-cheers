import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QRCreateForm } from "@/components/qr-create-form";
import { getFeeConfig } from "@/lib/fee-config";
import { Loader2 } from "lucide-react";
import Link from "next/link";

async function QRCreateContent({ params }: { params: Promise<{ eventId: string }> }) {
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

  const role = profile?.role ?? "";
  if (role !== "organizer" && role !== "agent" && role !== "admin") {
    redirect(`/dashboard/events/${eventId}`);
  }

  const adminForEvent = createAdminClient();
  const { data: event } = await adminForEvent
    .from("events")
    .select(`
      event_id, title, lifecycle_status, start_at, venue, paypay_enabled,
      organizer_profile_id,
      organizer:profiles!organizer_profile_id(display_name),
      event_artists(artist_profile_id, status, deleted_at, artist:profiles!artist_profile_id(display_name))
    `)
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();
  if (!["draft", "review_requested", "published", "ongoing"].includes(event.lifecycle_status)) {
    redirect(`/dashboard/events/${eventId}`);
  }

  // 配分対象候補: オーガナイザー自身 + 出演依頼済みアーティスト（rejected/deleted以外）
  const targets = [
    {
      profile_id: event.organizer_profile_id,
      display_name: (event.organizer as any)?.display_name ?? "オーガナイザー",
      role: "organizer" as const,
      status: "confirmed" as const,
    },
    ...(event.event_artists ?? [])
      .filter((ea: any) => ea.status !== "rejected" && ea.deleted_at === null)
      .map((ea: any) => ({
        profile_id: ea.artist_profile_id,
        display_name: ea.artist?.display_name ?? "—",
        role: "artist" as const,
        status: ea.status as string,
      })),
  ];

  const feeConfig = await getFeeConfig();

  // 商品タイプ定義をDBから取得（No.6）
  const { data: productTypeConfigs } = await supabase
    .from("product_type_configs")
    .select("type, label, min_amount, max_amount, is_enabled")
    .order("sort_order");

  // オーガナイザーの現在残高（タイプB 残高チェック用）
  const admin = createAdminClient();
  const { data: balanceDists } = await admin
    .from("transaction_distributions")
    .select("actual_amount, is_frozen")
    .eq("profile_id", event.organizer_profile_id)
    .eq("distribution_status", "accrued")
    .is("deleted_at", null);
  const organizerBalance = (balanceDists ?? []).reduce(
    (sum, d) => (d.is_frozen ? sum : sum + (d.actual_amount ?? 0)),
    0
  );

  return (
    <div className="space-y-8">
      <div className="space-y-1">
<p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">QR Code</p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">QR を作成</h1>
        <p className="text-slate-500 text-sm">{event.title}</p>
      </div>
      <QRCreateForm
        eventId={eventId}
        eventTitle={event.title}
        eventStartAt={(event as any).start_at ?? null}
        eventVenue={(event as any).venue ?? null}
        targets={targets}
        feeConfig={feeConfig}
        paypayEnabled={(event as any).paypay_enabled ?? false}
        organizerBalance={organizerBalance}
        productTypeConfigs={productTypeConfigs ?? []}
      />
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
