import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function NfcRoutingContent({
  params,
}: {
  params: Promise<{ nfcRoutingId: string }>;
}): Promise<never> {
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

export default function NfcRoutingPage({
  params,
}: {
  params: Promise<{ nfcRoutingId: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <NfcRoutingContent params={params} />
    </Suspense>
  );
}
