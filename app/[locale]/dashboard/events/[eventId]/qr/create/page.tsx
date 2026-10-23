import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventAccess } from "@/lib/event-access";
import { QRCreateForm } from "@/components/qr-create-form";
import { getFeeConfig } from "@/lib/fee-config";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { avatarFields } from "@/lib/image-source";
import { organizerBalance } from "@/lib/qr/rules";

async function QRCreateContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const user = await getUser();

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
      event_id, title, lifecycle_status, start_at, venue, paypay_enabled, base_flyer_url,
      organizer_profile_id,
      organizer:profiles!organizer_profile_id(display_name, organizer_name, organizer_avatar_url, avatar_url, organizer_avatar_original_url, avatar_original_url),
      event_artists(artist_profile_id, status, deleted_at, artist:profiles!artist_profile_id(display_name, artist_name, artist_avatar_url, avatar_url, artist_avatar_original_url, avatar_original_url))
    `)
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();
  // このイベントを操作できる人（主催者・エージェント・admin。lib/event-access.ts）以外には存在しない扱い。
  // 以前はロールしか見ておらず、他の主催者のイベントでも開けた
  const access = await getEventAccess(adminForEvent, eventId, user.id, profile?.role);
  if (!access?.canOperate) notFound();
  if (!["draft", "review_requested", "published", "ongoing"].includes(event.lifecycle_status)) {
    redirect(`/dashboard/events/${eventId}`);
  }

  // 配分対象候補: オーガナイザー自身 + 出演依頼済みアーティスト（rejected/deleted以外）
  // 宛先の表示名・画像は名義（organizer_name/artist_name、organizer_avatar_url/artist_avatar_url）
  // 優先で表示する（無ければ基本のavatar_urlにフォールバック）。
  // 同一人物がオーガナイザー兼演者の場合、profile_idは同じだがroleが異なる2行になる
  // （recipient_name_context で名義を区別して保存するため、UI上では別候補として扱う）
  const targets = [
    {
      profile_id: event.organizer_profile_id,
      display_name: (event.organizer as any)?.organizer_name ?? (event.organizer as any)?.display_name ?? "オーガナイザー",
      ...avatarFields(
        { url: (event.organizer as any)?.organizer_avatar_url, originalUrl: (event.organizer as any)?.organizer_avatar_original_url },
        { url: (event.organizer as any)?.avatar_url, originalUrl: (event.organizer as any)?.avatar_original_url },
      ),
      role: "organizer" as const,
      status: "confirmed" as const,
    },
    ...(event.event_artists ?? [])
      .filter((ea: any) => ea.status !== "rejected" && ea.deleted_at === null)
      .map((ea: any) => ({
        profile_id: ea.artist_profile_id,
        display_name: ea.artist?.artist_name ?? ea.artist?.display_name ?? "—",
        ...avatarFields(
          { url: ea.artist?.artist_avatar_url, originalUrl: ea.artist?.artist_avatar_original_url },
          { url: ea.artist?.avatar_url, originalUrl: ea.artist?.avatar_original_url },
        ),
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

  // オーガナイザーの現在残高（タイプB 残高チェック用。API も同じ関数で確かめる）
  const balance = await organizerBalance(adminForEvent, event.organizer_profile_id);

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
        eventFlyerUrl={(event as any).base_flyer_url ?? null}
        feeConfig={feeConfig}
        organizerBalance={balance}
        productTypeConfigs={productTypeConfigs ?? []}
        userRole={role}
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
