import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventAccess } from "@/lib/event-access";
import { QRBoardDisplay } from "@/components/qr-board-display";
import { QrBoardErrorBoundary } from "@/components/qr-board-error-boundary";

async function DisplayContent({ params }: { params: Promise<{ eventId: string }> }) {
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
  // このイベントを操作できる人（主催者・エージェント・admin。lib/event-access.ts）以外には存在しない扱い。
  // 以前はロールしか見ておらず、他の主催者のイベントでも開けた
  const access = await getEventAccess(admin, eventId, user.id, profile?.role);
  if (!access?.canOperate) notFound();

  return (
    <QrBoardErrorBoundary>
      <QRBoardDisplay eventId={eventId} eventTitle={event.title} />
    </QrBoardErrorBoundary>
  );
}

export default function DisplayPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-400 rounded-full animate-spin" />
      </div>
    }>
      <DisplayContent params={params} />
    </Suspense>
  );
}
