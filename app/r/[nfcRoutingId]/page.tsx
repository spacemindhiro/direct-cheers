import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function NfcRoutingPage({
  params,
}: {
  params: Promise<{ nfcRoutingId: string }>;
}) {
  const { nfcRoutingId } = await params;
  const admin = createAdminClient();

  const { data: booth } = await admin
    .from("booth_devices")
    .select("current_qr_config_id")
    .eq("nfc_routing_id", nfcRoutingId)
    .maybeSingle();

  if (!booth?.current_qr_config_id) redirect("/");

  redirect(`/c/${booth.current_qr_config_id}`);
}
