import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QRBoardDisplay } from "@/components/qr-board-display";

export default async function DisplayPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  return <QRBoardDisplay eventId={eventId} eventTitle={event.title} />;
}
