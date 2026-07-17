import { fmtDateTime } from "@/lib/display-tz";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Loader2, Nfc, Tablet } from "lucide-react";
import { AdminBreadcrumb } from "@/components/admin-breadcrumb";

async function BoothDevicesContent() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const { data: me } = await supabase.from("profiles").select("role").eq("profile_id", user.id).single();
  if (me?.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();
  const [{ data: holders }, { data: equipment }] = await Promise.all([
    admin
      .from("booth_holders")
      .select(`
        holder_id, name, nfc_routing_id, updated_at,
        device:equipment_devices!current_device_id(display_name),
        event:events!current_event_id(title),
        qr_config:qr_configs!current_qr_config_id(label)
      `)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    admin
      .from("equipment_devices")
      .select("device_id, display_name, last_seen_at, owner:profiles!owner_profile_id(display_name)")
      .is("deleted_at", null)
      .order("display_name", { ascending: true }),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <AdminBreadcrumb crumbs={[{ label: "Admin", href: "/dashboard" }, { label: "Booth Devices" }]} />
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">機材・ホルダー</h1>
        <p className="text-xs text-slate-500">
          全イベント横断の機材マスタと、NFCタグ⇔機材のホルダー紐付け一覧です。設定変更は各イベントのコントロールパネルから行います。
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Nfc size={14} className="text-indigo-400" /> タブレットホルダー
        </h2>
        {!holders?.length ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
            <Nfc size={32} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">No holders yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {holders.map((row) => {
              const device = row.device as unknown as { display_name: string } | null;
              const event = row.event as unknown as { title: string } | null;
              const qrConfig = row.qr_config as unknown as { label: string | null } | null;
              return (
                <div key={row.holder_id} className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{row.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {row.nfc_routing_id ? `NFC: ${row.nfc_routing_id}` : "NFC未設定"}
                      {" · "}
                      {device ? `機材: ${device.display_name}` : "機材なし"}
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

      <div className="space-y-3">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Tablet size={14} className="text-indigo-400" /> 機材マスタ
        </h2>
        {!equipment?.length ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
            <Tablet size={32} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">No devices yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {equipment.map((row) => {
              const owner = row.owner as unknown as { display_name: string } | null;
              return (
                <div key={row.device_id} className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{row.display_name}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{row.device_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-300">所有: {owner?.display_name ?? "—"}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      最終接続: {row.last_seen_at ? fmtDateTime(row.last_seen_at) : "—"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
