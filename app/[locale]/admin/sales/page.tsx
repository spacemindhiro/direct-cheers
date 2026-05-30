import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeConfig } from "@/lib/fee-config";
import { Loader2, TrendingUp, Zap, Users, Calendar } from "lucide-react";

async function AdminSalesContent() {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) redirect("/auth/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (me?.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();

  // 全体トランザクション集計
  const { data: transactions } = await admin
    .from("transactions")
    .select("total_gross_amount, status, created_at")
    .order("created_at", { ascending: false });

  const { stripe_rate, platform_rate } = await getFeeConfig();
  const completed = (transactions ?? []).filter((t) => t.status === "completed");
  const totalGross = completed.reduce((sum, t) => sum + (t.total_gross_amount ?? 0), 0);
  const platformRevenue = Math.floor(totalGross * platform_rate);
  const stripeRevenue = Math.floor(totalGross * stripe_rate);

  // 月別集計（直近6ヶ月）
  const now = new Date();
  const monthlyData: { month: string; amount: number; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    const start = d.toISOString();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
    const monthTx = completed.filter(
      (t) => t.created_at >= start && t.created_at < end,
    );
    monthlyData.push({
      month: label,
      amount: monthTx.reduce((s, t) => s + (t.total_gross_amount ?? 0), 0),
      count: monthTx.length,
    });
  }

  // イベント数
  const { count: eventCount } = await admin
    .from("events")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null);

  // アクティブユーザー数
  const { count: activeUserCount } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("status", "active")
    .neq("role", "user");

  const maxMonthly = Math.max(...monthlyData.map((m) => m.amount), 1);

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Admin</p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">Sales Overview</h1>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-2">
          <div className="w-10 h-10 bg-pink-500/10 rounded-2xl flex items-center justify-center border border-pink-500/20">
            <TrendingUp size={20} className="text-pink-500" />
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">総流通額</p>
          <p className="text-2xl font-black text-white italic">¥{totalGross.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-2">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
            <Zap size={20} className="text-emerald-400" />
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">プラットフォーム収益</p>
          <p className="text-2xl font-black text-white italic">¥{platformRevenue.toLocaleString()}</p>
          <p className="text-[10px] text-slate-600">Stripe ¥{stripeRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-2">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
            <Calendar size={20} className="text-indigo-400" />
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">総イベント数</p>
          <p className="text-2xl font-black text-white italic">{eventCount?.toLocaleString() ?? 0}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-2">
          <div className="w-10 h-10 bg-violet-500/10 rounded-2xl flex items-center justify-center border border-violet-500/20">
            <Users size={20} className="text-violet-400" />
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">アクティブ会員</p>
          <p className="text-2xl font-black text-white italic">{activeUserCount?.toLocaleString() ?? 0}</p>
        </div>
      </div>

      {/* 月別バーチャート（簡易） */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 space-y-6">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">月別流通額</h2>
        <div className="space-y-3">
          {monthlyData.map((m) => (
            <div key={m.month} className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span className="font-bold">{m.month}</span>
                <span>¥{m.amount.toLocaleString()} <span className="text-slate-600">({m.count}件)</span></span>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pink-600 to-pink-400 rounded-full transition-all"
                  style={{ width: `${(m.amount / maxMonthly) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 直近トランザクション */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">直近の取引</h2>
        {completed.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
            <p className="text-slate-600 text-sm font-bold italic">No transactions yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {completed.slice(0, 20).map((tx, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 flex items-center justify-between">
                <p className="text-xs text-slate-400">{new Date(tx.created_at).toLocaleString("ja-JP")}</p>
                <p className="font-black text-white text-sm">¥{(tx.total_gross_amount ?? 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminSalesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
      <AdminSalesContent />
    </Suspense>
  );
}
