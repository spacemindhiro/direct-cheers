export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import { BatchReportClient } from "@/components/batch-report-client";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AlertCircle } from "lucide-react";

export default async function BatchReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: me } = await supabase.from("profiles").select("role").eq("profile_id", user.id).single();
  if (me?.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();

  // 最新30件のサマリー
  const { data: reports } = await admin
    .from("daily_business_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  // 初期選択レポートの明細（要確認があれば最初のもの、なければ最新）
  const initialReport = (reports ?? []).find(r => r.status === "要確認・未回収あり") ?? (reports ?? [])[0];

  const { data: initialDetails } = initialReport
    ? await admin
        .from("uncollected_revenue_details")
        .select("*")
        .eq("report_id", initialReport.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const alertCount = (reports ?? []).filter(r => r.status === "要確認・未回収あり").length;

  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            バッチ処理レポート
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            全Cron処理の実行結果・未回収リスクをビジネス視点で確認する
          </p>
        </div>
        {alertCount > 0 && (
          <div className="flex items-center gap-2 bg-red-950/40 border border-red-500/30 px-4 py-2 rounded-2xl">
            <AlertCircle size={16} className="text-red-400" />
            <span className="text-red-300 text-sm font-black">
              要確認 {alertCount}件
            </span>
          </div>
        )}
      </div>

      {/* サマリー統計 */}
      {reports && reports.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: "今日の処理",
              value: (reports ?? []).filter(r => r.process_date === new Date().toISOString().slice(0, 10)).length + "件",
              sub: "本日実行済みバッチ",
              color: "text-white",
            },
            {
              label: "要確認",
              value: alertCount + "件",
              sub: "未回収・エラーあり",
              color: alertCount > 0 ? "text-red-400" : "text-slate-500",
            },
            {
              label: "未対応明細",
              value: (initialDetails ?? []).filter(d => d.action_status === "未対応").length + "件",
              sub: "対応待ちリスク",
              color: "text-amber-400",
            },
            {
              label: "直近30件",
              value: (reports ?? []).length + "件",
              sub: "レポート総数",
              color: "text-slate-300",
            },
          ].map(stat => (
            <div key={stat.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-2">{stat.label}</p>
              <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-slate-600 mt-1">{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* インタラクティブ部分（クライアントコンポーネント） */}
      <BatchReportClient
        reports={reports ?? []}
        initialDetails={initialDetails ?? []}
      />
    </div>
  );
}
