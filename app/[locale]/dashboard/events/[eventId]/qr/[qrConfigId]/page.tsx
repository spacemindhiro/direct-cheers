import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QRDisplay } from "@/components/qr-display";
import { QREditDelete } from "@/components/qr-edit-delete";
import { QRThanksEditor } from "@/components/qr-thanks-editor";
import { QRRecipientImageEdit } from "@/components/qr-recipient-image-edit";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const adminClient = createAdminClient();

  const { data: qr } = await adminClient
    .from("qr_configs")
    .select("qr_config_id, label, image_url, recipient_profile_id, created_at, event_id")
    .eq("qr_config_id", qrConfigId)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .single();

  if (!qr) notFound();
  const { data: event } = await adminClient
    .from("events")
    .select(`
      title, organizer_profile_id, agent_id,
      organizer:profiles!organizer_profile_id(display_name),
      event_artists(artist_profile_id, status, deleted_at, artist:profiles!artist_profile_id(display_name))
    `)
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();

  const isOrganizer = event.organizer_profile_id === user.id;
  const isAgent =
    (profile?.role === "agent" || profile?.role === "admin") &&
    event.agent_id === user.id;
  const isArtist = profile?.role === "artist";
  const isRecipient = qr.recipient_profile_id === user.id;
  const canEdit = isOrganizer || isAgent;

  // 配分対象候補: オーガナイザー + 出演確定アーティスト
  const candidates = [
    {
      profile_id: event.organizer_profile_id,
      display_name: (event.organizer as any)?.display_name ?? "オーガナイザー",
      role: "organizer" as const,
    },
    ...(event.event_artists ?? [])
      .filter((ea: any) => ea.status === "confirmed" && ea.deleted_at === null)
      .map((ea: any) => ({
        profile_id: ea.artist_profile_id,
        display_name: ea.artist?.display_name ?? "Unknown",
        role: "artist" as const,
      })),
  ];

  // 現在の配分設定（adminClient で全員分取得）
  const { data: configTargets } = await adminClient
    .from("qr_config_targets")
    .select("profile_id, distribution_ratio")
    .eq("qr_config_id", qrConfigId)
    .is("deleted_at", null);

  const currentTargets = (configTargets ?? []).map((t: any) => ({
    profile_id: t.profile_id,
    distribution_ratio: t.distribution_ratio as number,
  }));

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
        <p className="text-slate-500 text-sm">{event.title}</p>
      </div>

      <QRDisplay qrConfigId={qrConfigId} qrUrl={qrUrl} label={qr.label ?? "QRコード"} />

      {!canEdit && isArtist && (
        <div className="space-y-6">
          {/* Cheersカードプレビュー / 画像変更 */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
              <span className="text-pink-500">✦</span> Cheers カード
            </p>
            {isRecipient ? (
              <QRRecipientImageEdit
                qrConfigId={qrConfigId}
                currentImageUrl={(qr as any).image_url ?? null}
                eventTitle={event.title}
                artistName={candidates.find((c) => c.profile_id === user.id)?.display_name ?? ""}
              />
            ) : (qr as any).image_url ? (
              <img
                src={(qr as any).image_url}
                alt="Cheers card"
                className="w-full max-w-[270px] rounded-2xl object-cover border border-slate-700"
                style={{ aspectRatio: "3/2" }}
              />
            ) : (
              <p className="text-xs text-slate-600 font-bold">画像未設定</p>
            )}
          </div>

          {/* 配分設定 */}
          {currentTargets.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
                <span className="text-pink-500">✦</span> 配分設定
              </p>
              <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] divide-y divide-slate-800">
                {(() => {
                  const myTarget = currentTargets.find((t) => t.profile_id === user.id);
                  const othersRatio = currentTargets
                    .filter((t) => t.profile_id !== user.id)
                    .reduce((s, t) => s + Number(t.distribution_ratio), 0);
                  return (
                    <>
                      {myTarget && (
                        <div className="flex items-center justify-between px-5 py-3.5 bg-pink-500/5">
                          <p className="text-sm font-black text-pink-400">あなた</p>
                          <p className="text-lg font-black text-pink-400 tabular-nums">
                            {Math.round(Number(myTarget.distribution_ratio) * 100)}%
                          </p>
                        </div>
                      )}
                      {othersRatio > 0 && (
                        <div className="flex items-center justify-between px-5 py-3.5">
                          <p className="text-sm font-black text-slate-500">その他</p>
                          <p className="text-lg font-black text-slate-500 tabular-nums">
                            {Math.round(othersRatio * 100)}%
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <QREditDelete
          qrConfigId={qrConfigId}
          eventId={eventId}
          eventTitle={event.title}
          currentLabel={qr.label ?? ""}
          currentImageUrl={(qr as any).image_url ?? null}
          currentRecipientId={qr.recipient_profile_id ?? ""}
          currentTargets={currentTargets}
          candidates={candidates}
        />
      )}

      {(canEdit || isRecipient) && (
        <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <span className="text-pink-500">✦</span> Thanks Gift
          </p>
          <QRThanksEditor qrConfigId={qrConfigId} />
        </div>
      )}
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
