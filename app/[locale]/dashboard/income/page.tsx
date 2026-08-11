import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { Loader2 } from "lucide-react";
import { IncomeSummaryClient } from "@/components/income-summary-client";

async function IncomeContent() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!["admin", "agent", "organizer", "artist"].includes(profile?.role ?? "")) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <div className="max-w-xl mx-auto px-6 py-10 space-y-8">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">Income</p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">収支レポート</h1>
          <p className="text-xs text-slate-500">確定申告・青色申告記帳用の月次内訳</p>
        </div>
        <IncomeSummaryClient />
      </div>
    </div>
  );
}

export default function IncomePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <IncomeContent />
    </Suspense>
  );
}
