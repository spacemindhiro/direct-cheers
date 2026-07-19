import { fmtDate } from "@/lib/display-tz";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { CheersPaymentForm } from "@/components/cheers-payment-form";
import { InAppBrowserBanner } from "@/components/in-app-browser-banner";
import { resolveStatementDescriptorSource, resolveRecipientAvatarUrl } from "@/lib/statement-descriptor";
import { MapPin, Calendar, Clock, Loader2 } from "lucide-react";

function ValidityMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <Clock size={40} className="text-slate-600 mx-auto" />
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">Direct Cheers</p>
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">{title}</h1>
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}

async function CheersContent({
  params,
  searchParams,
}: {
  params: Promise<{ qrConfigId: string }>;
  searchParams: Promise<{ device?: string }>;
}) {
  const { qrConfigId } = await params;
  const { device: deviceName } = await searchParams;
  const admin = createAdminClient();
  const user = await getUser();

  // 決済時は「簡易ログイン」の方針: passkey等のセッションが無くても、
  // 過去の購入で発行された dc_ce Cookie（メールアドレス）だけで本人を
  // 認識し、名前表示・メール事前入力を行う（フルログインは要求しない）。
  let lockedEmail: string | null = user?.email ?? null;
  let recognizedName: string | null = null;

  if (user) {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("profile_id", user.id)
      .maybeSingle();
    recognizedName = profile?.display_name ?? null;
  } else {
    const cookieStore = await cookies();
    const cookieEmail = cookieStore.get("dc_ce")?.value ?? null;
    if (cookieEmail) {
      lockedEmail = cookieEmail;
      const { data: provisional } = await admin
        .from("provisional_users")
        .select("profile_id")
        .eq("email", cookieEmail)
        .maybeSingle();
      if (provisional?.profile_id) {
        const { data: profile } = await admin
          .from("profiles")
          .select("display_name")
          .eq("profile_id", provisional.profile_id)
          .maybeSingle();
        recognizedName = profile?.display_name ?? null;
      }
    }
  }

  const { data: qr } = await admin
    .from("qr_configs")
    .select(`
      qr_config_id,
      label,
      image_url,
      product_id,
      bypass_validity,
      amount_step,
      default_amount,
      recipient_name_context,
      event:events!event_id (
        event_id,
        title,
        venue,
        start_at,
        end_at,
        lifecycle_status,
        paypay_enabled
      ),
      recipient:profiles!recipient_profile_id (
        display_name,
        avatar_url,
        artist_name,
        organizer_name,
        artist_avatar_url,
        organizer_avatar_url
      )
    `)
    .eq("qr_config_id", qrConfigId)
    .is("deleted_at", null)
    .single();

  if (!qr) notFound();

  const event = qr.event as any;
  if (!event || ["draft", "cancelled"].includes(event.lifecycle_status)) {
    notFound();
  }

  const qrProductId = (qr as any).product_id as string | null;
  const bypassValidity = (qr as any).bypass_validity as boolean;

  const productsQuery = admin
    .from("products")
    .select("product_id, name, type, payment_type, min_amount, max_amount, sales_start_at, sales_end_at")
    .is("deleted_at", null);

  const { data: products } = qrProductId
    ? await productsQuery.eq("product_id", qrProductId)
    : await productsQuery.eq("event_id", event.event_id);

  if (!products || products.length === 0) notFound();

  // 有効期間チェック
  if (!bypassValidity) {
    const now = new Date();
    const product = products[0] as any;
    const isEntranceAB =
      product.type === "entrance" &&
      (product.payment_type === "A" || product.payment_type === "B");

    if (isEntranceAB) {
      const salesStart = product.sales_start_at ? new Date(product.sales_start_at) : null;
      const salesEnd = product.sales_end_at ? new Date(product.sales_end_at) : null;
      if (salesStart && now < salesStart) {
        return (
          <ValidityMessage
            title="販売期間前です"
            message={`前売り販売は ${salesStart.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} から開始します`}
          />
        );
      }
      if (salesEnd && now > salesEnd) {
        return (
          <ValidityMessage
            title="販売期間が終了しました"
            message="このQRコードの前売り販売は終了しました"
          />
        );
      }
    } else {
      const eventStart = new Date(event.start_at);
      const eventEndPlus3h = new Date(new Date(event.end_at).getTime() + 3 * 60 * 60 * 1000);
      if (now < eventStart) {
        return (
          <ValidityMessage
            title="イベント当日からご利用いただけます"
            message={`${eventStart.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric" })} 開場後にお使いください`}
          />
        );
      }
      if (now > eventEndPlus3h) {
        return (
          <ValidityMessage
            title="決済受付が終了しました"
            message="イベント終了から3時間が経過したため、このQRコードは無効になりました"
          />
        );
      }
    }
  }

  const recipient = qr.recipient as any;
  // 画面表示名は名義コンテキスト（organizer/artist）に応じて organizer_name/artist_name を優先する。
  // entrance（入場券）は宛先の個人名ではなく主催者名を表示する（MoRがオーガナイザーのため）。
  // Stripeのstatement_descriptor解決と同じ「誰の名義か」というビジネスルールなので、
  // 同じ関数（lib/statement-descriptor.ts）を再利用し、表示箇所ごとにロジックが
  // 重複・分岐しないようにする。
  const recipientNameContext = ((qr as any).recipient_name_context as "organizer" | "artist" | undefined) ?? "artist";
  const isEntranceQr = (products[0] as any)?.type === "entrance";
  const recipientNameSource = resolveStatementDescriptorSource({
    isEntrance: isEntranceQr,
    recipientNameContext,
    organizerName: recipient?.organizer_name,
    artistName: recipient?.artist_name,
    recipientDisplayName: recipient?.display_name,
  });
  const recipientName = recipientNameSource ?? event.title ?? "Artist";
  const recipientAvatar = resolveRecipientAvatarUrl({
    isEntrance: isEntranceQr,
    recipientNameContext,
    organizerAvatarUrl: recipient?.organizer_avatar_url,
    artistAvatarUrl: recipient?.artist_avatar_url,
    recipientAvatarUrl: recipient?.avatar_url,
  });
  const qrImageUrl = (qr as any).image_url as string | null;

  const qrAmountStep = ((qr as any).amount_step as number) ?? 100;
  const qrDefaultAmount = (qr as any).default_amount as number | null;
  const formProducts = products.map((p: any) => ({
    product_id: p.product_id,
    name: p.name,
    type: p.type,
    payment_type: p.payment_type ?? null,
    min_amount: p.min_amount,
    max_amount: p.max_amount,
    amount_step: qrAmountStep,
    default_amount: qrDefaultAmount ?? p.min_amount,
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-20">

      <InAppBrowserBanner />

      {/* ヒーロー */}
      <div className="relative h-[40vh] overflow-hidden">
        {qrImageUrl ? (
          <img src={qrImageUrl} className="w-full h-full object-cover opacity-70" alt={qr.label ?? recipientName} />
        ) : recipientAvatar ? (
          <img src={recipientAvatar} className="w-full h-full object-cover opacity-60 grayscale" alt={recipientName} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        <div className="absolute bottom-8 left-6 right-6 space-y-3">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">Direct Cheers</p>
          <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter leading-none">
            {recipientName}
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
                {fmtDate(event.start_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* テスト用バイパス表示 */}
      {bypassValidity && (
        <div className="mx-6 mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 text-[10px] font-black text-amber-400 uppercase tracking-widest">
          ⚠ テストモード：有効期間チェックをバイパス中
        </div>
      )}

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
          recipientName={recipientName}
          eventTitle={event.title}
          paypayEnabled={event.paypay_enabled ?? false}
          deviceName={deviceName}
          lockedEmail={lockedEmail ?? undefined}
          recognizedName={recognizedName ?? undefined}
        />

        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-700 font-bold uppercase tracking-widest">
          <span>Secure Checkout by Stripe</span>
        </div>
      </div>
    </div>
  );
}

export default function CheersPage({
  params,
  searchParams,
}: {
  params: Promise<{ qrConfigId: string }>;
  searchParams: Promise<{ device?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <Loader2 size={28} className="text-pink-500 animate-spin" />
        </div>
      }
    >
      <CheersContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
