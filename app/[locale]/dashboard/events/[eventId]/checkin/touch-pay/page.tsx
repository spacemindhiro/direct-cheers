import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TouchPayClient } from "@/components/touch-pay-client";
import { resolveTerminalLocationId } from "@/lib/stripe-terminal-location";
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
    .select("event_id, title, venue_id")
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();

  // venue_idがあれば会場マスタからLocationを解決（未作成なら遅延作成）、
  // 無い（venue_id未設定の既存イベント）場合は従来の環境変数にフォールバックする
  const terminalLocationId = event.venue_id
    ? await resolveTerminalLocationId(event.venue_id)
    : process.env.STRIPE_TERMINAL_LOCATION_ID ?? null;

  // 対面タッチ決済（Case④）はtouchpay_enabled=trueのQRに紐づく商品のみが対象。
  // 対象になりうるのは entrance×Cタイプ、または custom×バウチャー(V)×金額固定のみ。
  const { data: qrProducts } = await admin
    .from("qr_configs")
    .select("touchpay_enabled, product:products!product_id(product_id, name, type, payment_type, min_amount, max_amount)")
    .eq("event_id", eventId)
    .eq("touchpay_enabled", true)
    .is("deleted_at", null);

  type EligibleProduct = { product_id: string; name: string; type: string; payment_type: string | null; min_amount: number; max_amount: number };
  const products = (qrProducts ?? [])
    .map((r) => r.product as unknown as EligibleProduct | null)
    .filter((p): p is EligibleProduct => !!p && (
      (p.type === "entrance" && p.payment_type === "C") ||
      (p.type === "custom" && p.payment_type === "V" && p.min_amount === p.max_amount)
    ))
    .map((p) => ({ product_id: p.product_id, name: p.name, min_amount: p.min_amount }));

  return (
    <TouchPayClient
      eventId={event.event_id}
      eventTitle={event.title}
      products={products}
      terminalLocationId={terminalLocationId}
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
