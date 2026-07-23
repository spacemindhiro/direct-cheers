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

  // ホルダーマスタ（NFCタグ→ホルダー→現在表示）を正とし、
  // 移行期間中のみ旧booth_devicesにフォールバックする
  const { data: holder } = await admin
    .from("booth_holders")
    .select("current_qr_config_id")
    .eq("nfc_routing_id", nfcRoutingId)
    .is("deleted_at", null)
    .maybeSingle();

  let qrConfigId = holder?.current_qr_config_id ?? null;

  if (!qrConfigId) {
    const { data: booth } = await admin
      .from("booth_devices")
      .select("current_qr_config_id")
      .eq("nfc_routing_id", nfcRoutingId)
      .maybeSingle();
    qrConfigId = booth?.current_qr_config_id ?? null;
  }

  if (!qrConfigId) redirect("/");

  redirect(`/c/${qrConfigId}`);
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
