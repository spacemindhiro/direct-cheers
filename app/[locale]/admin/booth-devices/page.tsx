import { fmtDateTime } from "@/lib/display-tz";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Loader2, Nfc } from "lucide-react";
import { AdminBreadcrumb } from "@/components/admin-breadcrumb";

async function BoothDevicesContent() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const { data: me } = await supabase.from("profiles").select("role").eq("profile_id", user.id).single();
  if (me?.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("booth_devices")
    .select(`
      device_code, nfc_routing_id, current_event_id, current_qr_config_id, updated_at,
      event:events!current_event_id(title),
      qr_config:qr_configs!current_qr_config_id(label)
    `)
    .order("device_code", { ascending: true });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <AdminBreadcrumb crumbs={[{ label: "Admin", href: "/dashboard" }, { label: "Booth Devices" }]} />
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">機材ペアリング</h1>
        <p className="text-xs text-slate-500">
          全イベント横断のNFCタグ⇔子機 ペアリング一覧です。設定変更は各イベントのコントロールパネルから行います。
        </p>
      </div>

      {!rows?.length ? (
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
          <Nfc size={32} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">No devices yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const event = row.event as unknown as { title: string } | null;
            const qrConfig = row.qr_config as unknown as { label: string | null } | null;
            return (
              <div key={row.device_code} className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-black text-white truncate">{row.device_code}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {row.nfc_routing_id ? `NFC: ${row.nfc_routing_id}` : "NFC未設定"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-300">{event?.title ?? "—"}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {qrConfig?.label ?? "—"} · 更新: {fmtDateTime(row.updated_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminBoothDevicesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={32} />
      </div>
    }>
      <BoothDevicesContent />
    </Suspense>
  );
}
