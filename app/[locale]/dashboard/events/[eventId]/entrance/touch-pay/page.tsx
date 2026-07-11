import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TouchPayClient } from "@/components/touch-pay-client";
import { Loader2 } from "lucide-react";

async function TouchPayContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const user = await getUser();
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
    .select("event_id, title")
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();

  // 対面タッチ決済（Case④）はエントランスCタイプ商品のみが対象
  const { data: products } = await admin
    .from("products")
    .select("product_id, name, min_amount")
    .eq("event_id", eventId)
    .eq("type", "entrance")
    .eq("payment_type", "C")
    .is("deleted_at", null);

  return (
    <TouchPayClient
      eventId={event.event_id}
      eventTitle={event.title}
      products={products ?? []}
      terminalLocationId={process.env.STRIPE_TERMINAL_LOCATION_ID ?? null}
    />
  );
}

export default function TouchPayPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={28} className="text-indigo-400 animate-spin" />
      </div>
    }>
      <TouchPayContent params={params} />
    </Suspense>
  );
}
