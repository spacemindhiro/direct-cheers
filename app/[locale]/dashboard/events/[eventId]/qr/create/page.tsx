import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventAccess } from "@/lib/event-access";
import { QRCreateForm } from "@/components/qr-create-form";
import { getFeeConfig } from "@/lib/fee-config";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { qrCandidateEvent } from "@/lib/qr/candidates";
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
  // 宛先・配分先の候補はチアリーの確認カードと同じ関数（lib/qr/candidates.ts）
  const event = await qrCandidateEvent(adminForEvent, eventId);

  if (!event) notFound();
  // このイベントを操作できる人（主催者・エージェント・admin。lib/event-access.ts）以外には存在しない扱い。
  // 以前はロールしか見ておらず、他の主催者のイベントでも開けた
  const access = await getEventAccess(adminForEvent, eventId, user.id, profile?.role);
  if (!access?.canOperate) notFound();
  if (!["draft", "review_requested", "published", "ongoing"].includes(event.lifecycle_status)) {
    redirect(`/dashboard/events/${eventId}`);
  }
  const targets = event.targets;

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
        eventStartAt={event.start_at}
        eventVenue={event.venue}
        targets={targets}
        eventFlyerUrl={event.base_flyer_url}
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
