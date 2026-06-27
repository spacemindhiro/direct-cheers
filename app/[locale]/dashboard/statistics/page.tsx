import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeConfig } from "@/lib/fee-config";
import { Heart, Zap, TrendingUp, BarChart2 } from "lucide-react";
import Link from "next/link";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

async function StatisticsContent() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("profile_id", user.id)
    .single();

  if (!profile) redirect("/onboarding/profile");
  if (profile.role === "admin") redirect("/dashboard");

  const admin = createAdminClient();
  const role = profile.role as string;
  const isEarner = ["artist", "organizer", "agent"].includes(role);

  // ── ユーザー送信チア（全件） ──────────────────────────────
  const { data: userEmail } = await supabase.auth.getUser();
  const email = userEmail?.user?.email ?? "";

  const [byProfileRaw, byEmailRaw] = await Promise.all([
    admin
      .from("transactions")
      .select("transaction_id, total_gross_amount")
      .eq("sender_profile_id", user.id)
      .eq("status", "completed")
      .neq("transaction_type", "invitation"),
    email
      ? admin
          .from("transactions")
          .select("transaction_id, total_gross_amount")
          .eq("sender_email", email)
          .eq("status", "completed")
          .neq("transaction_type", "invitation")
      : Promise.resolve({ data: [] }),
  ]);

  const seen = new Set<string>();
  const allMySentTxs: { transaction_id: string; total_gross_amount: number }[] = [];
  for (const tx of [...(byProfileRaw.data ?? []), ...((byEmailRaw as any).data ?? [])]) {
    if (!seen.has(tx.transaction_id)) {
      seen.add(tx.transaction_id);
      allMySentTxs.push(tx as any);
    }
  }
  const totalSentCount  = allMySentTxs.length;
  const totalSentAmount = allMySentTxs.reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);

  // ── 受取側（artist / organizer / agent） ────────────────
  let totalReceivedAmount = 0;
  let totalReceivedTxCount = 0;
  let artistGross = 0;
  let artistNet   = 0;
  let artistTxCount = 0;

  if (isEarner) {
    const { data: distData } = await admin
      .from("transaction_distributions")
      .select("actual_amount, transaction:transactions!transaction_id(status)")
      .eq("profile_id", user.id)
      .is("deleted_at", null);

    const completedDists = (distData ?? []).filter(
      (d) => (d.transaction as any)?.status === "completed"
    );
    totalReceivedAmount  = completedDists.reduce((s, d) => s + (d.actual_amount ?? 0), 0);
    totalReceivedTxCount = completedDists.length;
  }

  // ロールは上位互換のため、organizer/agentに上がった後もartist時代の受取明細は表示し続ける
  if (isEarner) {
    const { net_rate } = await getFeeConfig();
    const { data: salesData } = await supabase
      .from("transactions")
      .select("total_gross_amount, product:products!product_id(artist_id)")
      .eq("status", "completed");
    const myTxs = (salesData ?? []).filter((tx: any) => tx.product?.artist_id === user.id);
    artistTxCount = myTxs.length;
    artistGross   = myTxs.reduce((s: number, tx: any) => s + (tx.total_gross_amount ?? 0), 0);
    artistNet     = Math.floor(artistGross * net_rate);
  }

  return (
    <div className="space-y-8 max-w-lg">
      {/* ヘッダー */}
      <div>
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Statistics</p>
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">統計</h1>
        <p className="text-slate-500 text-xs mt-1">累計データのサマリー</p>
      </div>

      {/* ── ユーザー送信チア ── */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Heart size={12} className="text-pink-500" /> 送ったチア（累計）
        </h2>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-slate-800">
            <div className="p-5 space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">件数</p>
              <p className="text-2xl font-black text-white tabular-nums">{totalSentCount.toLocaleString()}<span className="text-sm text-slate-500 ml-1">件</span></p>
            </div>
            <div className="p-5 space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">合計金額</p>
              <p className="text-2xl font-black text-white tabular-nums">{yen(totalSentAmount)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── アーティスト受取（organizer/agentに上がった後もartist実績があれば表示） ── */}
      {artistTxCount > 0 && (
        <section className="space-y-3">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <Zap size={12} className="text-indigo-400" /> 受け取りチア（累計）
          </h2>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-slate-800">
              <div className="p-5 space-y-1">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">チア件数</p>
                <p className="text-2xl font-black text-white tabular-nums">{artistTxCount.toLocaleString()}<span className="text-sm text-slate-500 ml-1">件</span></p>
              </div>
              <div className="p-5 space-y-1">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">総流通額</p>
                <p className="text-2xl font-black text-white tabular-nums">{yen(artistGross)}</p>
              </div>
            </div>
            <div className="border-t border-slate-800 px-5 py-4 flex items-center justify-between">
              <p className="text-[10px] text-slate-500">手数料控除後の受取額（概算）</p>
              <p className="text-lg font-black text-emerald-400 tabular-nums">{yen(artistNet)}</p>
            </div>
          </div>
        </section>
      )}

      {/* ── オーガナイザー・エージェント受取 ── */}
      {["organizer", "agent"].includes(role) && (
        <section className="space-y-3">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <TrendingUp size={12} className="text-emerald-400" /> 受取配分（累計）
          </h2>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-slate-800">
              <div className="p-5 space-y-1">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">配分件数</p>
                <p className="text-2xl font-black text-white tabular-nums">{totalReceivedTxCount.toLocaleString()}<span className="text-sm text-slate-500 ml-1">件</span></p>
              </div>
              <div className="p-5 space-y-1">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">受取総額</p>
                <p className="text-2xl font-black text-white tabular-nums">{yen(totalReceivedAmount)}</p>
              </div>
            </div>
          </div>
          <Link
            href="/dashboard/payout"
            className="block text-center text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors py-2"
          >
            出金管理 →
          </Link>
        </section>
      )}

      {/* ── ノート ── */}
      <p className="text-[10px] text-slate-700 leading-relaxed">
        ※ 金額はシステム計上ベースの参考値です。税務申告等には正式な精算レポートをご使用ください。
      </p>
    </div>
  );
}

export default function StatisticsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4 animate-pulse max-w-lg">
        <div className="h-12 bg-slate-900 rounded-2xl" />
        <div className="h-28 bg-slate-900 rounded-2xl" />
        <div className="h-28 bg-slate-900 rounded-2xl" />
      </div>
    }>
      <StatisticsContent />
    </Suspense>
  );
}
