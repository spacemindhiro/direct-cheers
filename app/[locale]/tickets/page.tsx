import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Loader2, Ticket, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { DigitalTicket } from "@/components/digital-ticket";
import { WelcomeCheerPicker } from "@/components/welcome-cheer-picker";
import { ListPager } from "@/components/list-pager";

const PAGE_SIZE = 20;

async function TicketsContent({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/auth/login?redirect=/tickets");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();
  const selectQuery = `
    ticket_id, ticket_code, status, checked_in_at, email, created_at, quantity,
    reservation_id,
    reservation:entrance_reservations(status),
    product:products(name, type, payment_type, min_amount),
    event:events(event_id, title, venue, start_at),
    transaction:transactions!transaction_id(
      total_gross_amount, stripe_payment_intent_id,
      qr_config:qr_configs!qr_config_id(strip_image_url, bg_color, fg_color, label_color)
    )
  `;

  // 持ち主の条件が2本立てなのは、ゲスト購入時に holder_profile_id が NULL のまま
  // 発行されるため。あとから同じメアドで登録しても tickets を埋め直す処理は無く
  // （埋めるのは TouchPay の card_fingerprint 経由のRPCのみ）、登録前に買った
  // チケットは email 側でしか拾えない。
  // 以前は2本のクエリを連結していたが、それぞれ独立にソートされるだけで全体の
  // 並びが保証されず、かつ件数が増えると .limit() で黙って切り捨てられていた。
  // 1本の or にまとめてDB側で並べ替え・ページングする。
  const ownership = user.email
    ? `holder_profile_id.eq.${user.id},and(email.eq."${user.email}",holder_profile_id.is.null)`
    : `holder_profile_id.eq.${user.id}`;

  const { data: list, count } = await admin
    .from("tickets")
    .select(selectQuery, { count: "exact" })
    .or(ownership)
    // チケットが要るのは購入日ではなく開催日。開催が新しい順に並べる。
    // （order の event(...) は select に event の埋め込みがあることが前提）
    .order("event(start_at)", { ascending: false })
    // start_at は一意でない（同日開催が普通にある）。タイブレーカーを付けないと
    // ページ間で同じ行が重複したり抜け落ちたりする。
    .order("ticket_id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // ウェルカムチア（2階transaction）: 同一PIのstripe_pi_sequence=1行をバッチ取得し、
  // 「本体+ウェルカムチア」の内訳表示に使う。無ければ従来通りのシンプル表示。
  const piIds = [...new Set(
    (list ?? []).map((t: any) => t.transaction?.stripe_payment_intent_id).filter((id): id is string => !!id)
  )];
  const welcomeCheerByPi = new Map<string, number>();
  if (piIds.length > 0) {
    const { data: wcRows } = await admin
      .from("transactions")
      .select("stripe_payment_intent_id, total_gross_amount")
      .in("stripe_payment_intent_id", piIds)
      .eq("stripe_pi_sequence", 1);
    for (const row of wcRows ?? []) {
      welcomeCheerByPi.set(row.stripe_payment_intent_id as string, row.total_gross_amount as number);
    }
  }

  return (
    <div className="space-y-8 pt-16 pb-20">
      <div className="space-y-1">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors"
        >
          <ArrowLeft size={12} /> ダッシュボードに戻る
        </Link>
        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Wallet</p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          My Tickets
        </h1>
        <p className="text-sm text-slate-500">購入済みチケット一覧</p>
      </div>

      {!list || list.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto bg-slate-800 rounded-2xl flex items-center justify-center">
            <Ticket size={20} className="text-slate-600" />
          </div>
          <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">
            No tickets yet.
          </p>
          <p className="text-slate-700 text-xs">入場チケットを購入するとここに表示されます</p>
        </div>
      ) : (
        <div className="space-y-6">
          {list.map((t: any) => (
            <div
              key={t.ticket_id}
              id={`ticket-${t.ticket_id}`}
              className="space-y-3 rounded-3xl scroll-mt-6 target:ring-2 target:ring-pink-500 target:ring-offset-4 target:ring-offset-slate-950"
            >
              <DigitalTicket
                ticketId={t.ticket_id}
                ticketCode={t.ticket_code}
                eventTitle={t.event?.title ?? ""}
                productName={t.product?.name ?? ""}
                eventVenue={t.event?.venue ?? null}
                startAt={t.event?.start_at ?? null}
                holderEmail={t.email}
                status={t.status}
                checkedInAt={t.checked_in_at ?? null}
                paymentType={t.product?.payment_type ?? null}
                productType={t.product?.type ?? undefined}
                amount={
                  (t.transaction?.total_gross_amount ?? t.product?.min_amount ?? 0) +
                  (welcomeCheerByPi.get(t.transaction?.stripe_payment_intent_id ?? "") ?? 0)
                }
                welcomeCheerAmount={welcomeCheerByPi.get(t.transaction?.stripe_payment_intent_id ?? "") ?? null}
                quantity={t.quantity ?? null}
                stripImageUrl={t.transaction?.qr_config?.strip_image_url ?? null}
                bgColor={t.transaction?.qr_config?.bg_color ?? undefined}
                fgColor={t.transaction?.qr_config?.fg_color ?? undefined}
                labelColor={t.transaction?.qr_config?.label_color ?? undefined}
                reservationId={t.reservation_id ?? null}
                reservationStatus={Array.isArray(t.reservation) ? (t.reservation[0] as any)?.status ?? null : (t.reservation as any)?.status ?? null}
              />
              {t.product?.type === "entrance" && <WelcomeCheerPicker ticketId={t.ticket_id} />}
            </div>
          ))}
        </div>
      )}

      <ListPager
        page={page}
        totalPages={totalPages}
        hrefFor={(p) => (p > 1 ? `/tickets?page=${p}` : "/tickets")}
      />

      {/* フッター：ダッシュボードに戻る */}
      <div className="pt-4 border-t border-slate-800">
        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2 w-full h-12 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl text-xs font-black text-slate-500 hover:text-slate-300 transition-all"
        >
          <ArrowLeft size={14} /> ダッシュボードに戻る
        </Link>
      </div>
    </div>
  );
}

export default function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="text-indigo-400 animate-spin" />
      </div>
    }>
      <TicketsContent searchParams={searchParams} />
    </Suspense>
  );
}
