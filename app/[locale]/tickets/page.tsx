import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Loader2, Ticket, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { DigitalTicket } from "@/components/digital-ticket";

async function TicketsContent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/tickets");

  const admin = createAdminClient();
  const selectQuery = `
    ticket_id, ticket_code, status, checked_in_at, email, created_at,
    reservation_id,
    reservation:entrance_reservations(status),
    product:products(name, payment_type, min_amount),
    event:events(event_id, title, venue, start_at),
    transaction:transactions!transaction_id(
      total_gross_amount,
      qr_config:qr_configs!qr_config_id(strip_image_url, bg_color, fg_color, label_color)
    )
  `;

  const [byProfile, byEmail] = await Promise.all([
    admin.from("tickets").select(selectQuery)
      .eq("holder_profile_id", user.id)
      .order("created_at", { ascending: false }).limit(50),
    user.email
      ? admin.from("tickets").select(selectQuery)
          .eq("email", user.email)
          .is("holder_profile_id", null)
          .order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  const seen = new Set<string>();
  const list = [...(byProfile.data ?? []), ...(byEmail.data ?? [])].filter((t: any) => {
    if (seen.has(t.ticket_id)) return false;
    seen.add(t.ticket_id);
    return true;
  });

  return (
    <div className="space-y-8 pb-20">
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

      {list.length === 0 ? (
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
            <DigitalTicket
              key={t.ticket_id}
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
              amount={t.transaction?.total_gross_amount ?? t.product?.min_amount ?? 0}
              stripImageUrl={t.transaction?.qr_config?.strip_image_url ?? null}
              bgColor={t.transaction?.qr_config?.bg_color ?? undefined}
              fgColor={t.transaction?.qr_config?.fg_color ?? undefined}
              labelColor={t.transaction?.qr_config?.label_color ?? undefined}
              reservationId={t.reservation_id ?? null}
              reservationStatus={Array.isArray(t.reservation) ? (t.reservation[0] as any)?.status ?? null : (t.reservation as any)?.status ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="text-indigo-400 animate-spin" />
      </div>
    }>
      <TicketsContent />
    </Suspense>
  );
}
