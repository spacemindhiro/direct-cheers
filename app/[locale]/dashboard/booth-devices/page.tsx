import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { BoothDevicePairing } from "@/components/booth-device-pairing";
import { Loader2 } from "lucide-react";

async function BoothDevicesContent() {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!profile) redirect("/onboarding/profile");
  if (!["organizer", "agent", "admin"].includes(profile.role)) redirect("/dashboard");

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Booth Devices
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          機材ペアリング
        </h1>
        <p className="text-slate-500 text-sm font-medium">
          子機タブレットとNFCタグを紐付けて、現在の決済画面へ自動でリダイレクトさせます
        </p>
      </div>

      <BoothDevicePairing />
    </div>
  );
}

export default function BoothDevicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-600" size={32} />
        </div>
      }
    >
      <BoothDevicesContent />
    </Suspense>
  );
}
