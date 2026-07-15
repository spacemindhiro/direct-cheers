import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QRDisplay } from "@/components/qr-display";
import { QREditDelete } from "@/components/qr-edit-delete";
import { QRThanksEditor } from "@/components/qr-thanks-editor";
import { QRRecipientImageEdit } from "@/components/qr-recipient-image-edit";
import { QRInviteIssuer } from "@/components/qr-invite-issuer";
import { Loader2 } from "lucide-react";
import Link from "next/link";

async function QRDetailContent({
  params,
}: {
  params: Promise<{ eventId: string; qrConfigId: string }>;
}) {
  const { eventId, qrConfigId } = await params;
  const supabase = await createClient();
  const user = await getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const adminClient = createAdminClient();

  const { data: qr } = await adminClient
    .from("qr_configs")
    .select("qr_config_id, label, image_url, strip_image_url, bg_color, fg_color, label_color, recipient_profile_id, recipient_name_context, created_at, event_id, bypass_validity, product_id, amount_step, default_amount, touchpay_enabled, serial_scope")
    .eq("qr_config_id", qrConfigId)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .single();

  if (!qr) notFound();
  const { data: event } = await adminClient
    .from("events")
    .select(`
      title, organizer_profile_id, agent_id, start_at, end_at, venue, serial_scope,
      organizer:profiles!organizer_profile_id(display_name, organizer_name, organizer_avatar_url, avatar_url),
      event_artists(artist_profile_id, status, deleted_at, artist:profiles!artist_profile_id(display_name, artist_name, artist_avatar_url, avatar_url))
    `)
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();

  const isOrganizer = event.organizer_profile_id === user.id;
  const isAgent =
    (profile?.role === "agent" || profile?.role === "admin") &&
    event.agent_id === user.id;
  // ロールではなく「このイベントの出演者として招待されているか」で判定
  const isLineupArtist = (event.event_artists ?? []).some(
    (ea: any) => ea.artist_profile_id === user.id && ea.deleted_at === null && ea.status !== "rejected"
  );
  const isRecipient = qr.recipient_profile_id === user.id;
  const canEdit = isOrganizer || isAgent;

  // 配分対象候補: オーガナイザー + 出演依頼済みアーティスト（rejected/deleted以外）
  // 表示名・画像は名義（organizer_name/artist_name、organizer_avatar_url/artist_avatar_url）
  // 優先で、無ければ基本のavatar_urlにフォールバック
  const candidates = [
    {
      profile_id: event.organizer_profile_id,
      display_name: (event.organizer as any)?.organizer_name ?? (event.organizer as any)?.display_name ?? "オーガナイザー",
      avatar_url: (event.organizer as any)?.organizer_avatar_url ?? (event.organizer as any)?.avatar_url ?? null,
      role: "organizer" as const,
      status: "confirmed" as const,
    },
    ...(event.event_artists ?? [])
      .filter((ea: any) => ea.status !== "rejected" && ea.deleted_at === null)
      .map((ea: any) => ({
        profile_id: ea.artist_profile_id,
        display_name: ea.artist?.artist_name ?? ea.artist?.display_name ?? "Unknown",
        avatar_url: ea.artist?.artist_avatar_url ?? ea.artist?.avatar_url ?? null,
        role: "artist" as const,
        status: ea.status as string,
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

  // 決済発生済みかどうか（配分編集の可否判定用）
  const { count: txCount } = await adminClient
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .eq("qr_config_id", qrConfigId);
  const hasTransactions = (txCount ?? 0) > 0;

  // 有効期間情報
  const productId = (qr as any).product_id as string | null;
  let validityInfo: { label: string; from: string; to: string } | null = null;
  let isEntrance = false;
  let isVoucher = false; // custom かつ payment_type='V' のとき true
  let productInfo: {
    typeLabel: string;
    isRange: boolean;
    minAmount: number;
    maxAmount: number;
    paymentType: "A" | "B" | "C" | "V" | null;
    stockLimit: number | null;
    trackInventory: boolean;
  } | null = null;
  if (productId && event) {
    const { data: product } = await adminClient
      .from("products")
      .select("type, payment_type, sales_start_at, sales_end_at, name, min_amount, max_amount, stock_limit, track_inventory")
      .eq("product_id", productId)
      .single();
    if (product) {
      isEntrance = product.type === "entrance";
      isVoucher = product.type === "custom" && product.payment_type === "V";
      const isEntranceAB = isEntrance && (product.payment_type === "A" || product.payment_type === "B");
      const fmt = (d: string) => new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      if (isEntranceAB && product.sales_start_at && product.sales_end_at) {
        validityInfo = { label: "前売り販売期間", from: fmt(product.sales_start_at), to: fmt(product.sales_end_at) };
      } else if ((event as any).start_at && (event as any).end_at) {
        const endPlus3h = new Date(new Date((event as any).end_at).getTime() + 3 * 60 * 60 * 1000).toISOString();
        validityInfo = { label: "決済有効期間", from: fmt((event as any).start_at), to: fmt(endPlus3h) };
      }
      productInfo = {
        typeLabel: ({ standard: "スタンダード", message: "メッセージ", entrance: "エントランス", custom: "カスタム（バウチャー）" } as Record<string, string>)[product.type as string] ?? (product.type as string),
        isRange: (product.min_amount ?? 0) !== (product.max_amount ?? 0),
        minAmount: product.min_amount ?? 0,
        maxAmount: product.max_amount ?? 0,
        paymentType: (isEntrance || isVoucher) ? (product.payment_type as "A" | "B" | "C" | "V" | null) : null,
        stockLimit: product.stock_limit ?? null,
        trackInventory: product.track_inventory ?? true,
      };
    }
  }

  // SEQ採番単位（qr_configs側で未設定ならevents側の設定を継承）
  const SERIAL_SCOPE_LABELS: Record<string, string> = {
    event: "イベント通し",
    qr: "QRコード別",
    artist: "アーティスト別",
  };
  const qrSerialScope = (qr as any).serial_scope as string | null;
  const effectiveSerialScope = qrSerialScope ?? (event as any).serial_scope ?? "event";
  const serialScopeLabel = SERIAL_SCOPE_LABELS[effectiveSerialScope] ?? effectiveSerialScope;
  const serialScopeInherited = qrSerialScope === null;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com";
  const qrUrl = `${siteUrl}/c/${qrConfigId}`;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
<p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">QR Code</p>
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
          {qr.label ?? "QRコード"}
        </h1>
        <p className="text-slate-500 text-sm">{event.title}</p>
      </div>

      <QRDisplay qrConfigId={qrConfigId} qrUrl={qrUrl} label={qr.label ?? "QRコード"} />

      {/* 有効期間 */}
      {validityInfo && (
        <div className={`border rounded-2xl px-5 py-3 space-y-1 ${(qr as any).bypass_validity ? "bg-amber-500/5 border-amber-500/20" : "bg-slate-900 border-slate-800"}`}>
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{validityInfo.label}</p>
          <p className="text-xs font-bold text-slate-200">{validityInfo.from} 〜 {validityInfo.to}</p>
          {(qr as any).bypass_validity && (
            <p className="text-[10px] font-black text-amber-400">⚠ テストモード：有効期間バイパス中</p>
          )}
        </div>
      )}

      {!canEdit && isLineupArtist && (
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
                artistName={candidates.find((c) => c.profile_id === user.id && c.role === "artist")?.display_name ?? ""}
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

      {canEdit && isEntrance && (
        <QRInviteIssuer eventId={eventId} qrConfigId={qrConfigId} />
      )}

      {canEdit && (
        <QREditDelete
          qrConfigId={qrConfigId}
          eventId={eventId}
          eventTitle={event.title}
          eventStartAt={(event as any).start_at ?? null}
          eventVenue={(event as any).venue ?? null}
          isEntrance={isEntrance}
          isVoucher={isVoucher}
          currentLabel={qr.label ?? ""}
          currentImageUrl={(qr as any).image_url ?? null}
          currentStripImageUrl={(qr as any).strip_image_url ?? null}
          currentBgColor={(qr as any).bg_color ?? "#0f172a"}
          currentFgColor={(qr as any).fg_color ?? "#ffffff"}
          currentLabelColor={(qr as any).label_color ?? "#94a3b8"}
          currentRecipientId={qr.recipient_profile_id ?? ""}
          currentRecipientRole={((qr as any).recipient_name_context as "organizer" | "artist" | null) ?? "artist"}
          currentTargets={currentTargets}
          hasTransactions={hasTransactions}
          candidates={candidates}
          currentAmountStep={((qr as any).amount_step ?? 100) as 100 | 500 | 1000}
          currentDefaultAmount={(qr as any).default_amount ?? productInfo?.minAmount ?? 0}
          currentTouchpayEnabled={(qr as any).touchpay_enabled ?? false}
          productTypeLabel={productInfo?.typeLabel ?? ""}
          isRange={productInfo?.isRange ?? false}
          minAmount={productInfo?.minAmount ?? 0}
          maxAmount={productInfo?.maxAmount ?? 0}
          paymentType={productInfo?.paymentType ?? null}
          stockLimit={productInfo?.stockLimit ?? null}
          trackInventory={productInfo?.trackInventory ?? true}
          serialScopeLabel={serialScopeLabel}
          serialScopeInherited={serialScopeInherited}
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
