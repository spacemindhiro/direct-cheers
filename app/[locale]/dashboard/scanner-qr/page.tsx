import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScannerQrClient } from "@/components/scanner-qr-client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function ScannerQrPage() {
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!profile || !["organizer", "agent", "admin"].includes(profile.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/profile"
          className="w-9 h-9 bg-slate-800 border border-slate-700 hover:border-pink-500/30 rounded-2xl flex items-center justify-center transition-all"
        >
          <ArrowLeft size={16} className="text-slate-400" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-white">子機ログインQR</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">タブレット・子機端末にこのアカウントでログインさせる</p>
        </div>
      </div>

      <ScannerQrClient />
    </div>
  );
}
