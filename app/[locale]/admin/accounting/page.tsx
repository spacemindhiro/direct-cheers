import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Loader2, CheckCircle2, AlertTriangle, Clock, FileText } from "lucide-react";
import { AdminBreadcrumb } from "@/components/admin-breadcrumb";
import { AccountingRunButton, AccountingDownloadButton } from "@/components/accounting-run-button";

// 直近 13 ヶ月分の year/month リストを生成（最新月が上）
function recentMonths(n = 13): { year: number; month: number; yearMonth: string; label: string }[] {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  let y = jstNow.getUTCFullYear();
  let m = jstNow.getUTCMonth() + 1;
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push({
      year: y, month: m,
      yearMonth: `${y}-${String(m).padStart(2, "0")}`,
      label: `${y}年${m}月度`,
    });
    m--;
    if (m === 0) { m = 12; y--; }
  }
  return result;
}

async function AccountingContent() {
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

  type ReportRow = {
    target_year: number;
    target_month: number;
    status: string;
    error_message: string | null;
    created_at: string;
  };

  const months = recentMonths(13);
  const { data: reports } = await admin
    .from("monthly_accounting_reports")
    .select("target_year, target_month, status, error_message, created_at")
    .gte("target_year", months[months.length - 1].year)
    .order("target_year", { ascending: false })
    .order("target_month", { ascending: false });

  const reportMap = new Map<string, ReportRow>();
  for (const r of (reports ?? []) as unknown as ReportRow[]) {
    reportMap.set(`${r.target_year}-${String(r.target_month).padStart(2, "0")}`, r);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <AdminBreadcrumb crumbs={[{ label: "Admin", href: "/dashboard" }, { label: "Accounting" }]} />
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">弥生会計 CSV</h1>
        <p className="text-sm text-slate-500">月次仕訳CSVの生成・ダウンロード（月初 cron 自動生成 + 手動実行）</p>
        <p className="text-xs text-slate-600">金額の確認は収支レポートで行う。この画面は仕訳CSVの取り出し専用。</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
        {/* ヘッダー行 */}
        <div className="px-5 py-2 grid grid-cols-[1fr_100px_80px] gap-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">
          <span>対象月</span>
          <span>状態</span>
          <span>操作</span>
        </div>

        {months.map(({ year, month, yearMonth, label }) => {
          const r = reportMap.get(yearMonth);
          const isCompleted = r?.status === "completed";
          const isError = r?.status === "error";
          const isPending = !r;

          return (
            <div key={yearMonth} className="px-5 py-3 grid grid-cols-[1fr_100px_80px] gap-4 items-center">
              {/* 対象月 */}
              <div className="flex items-center gap-2">
                <FileText size={13} className={isCompleted ? "text-indigo-400" : "text-slate-600"} />
                <span className="text-xs font-black text-white">{label}</span>
              </div>

              {/* ステータス */}
              <div>
                {isCompleted && (
                  <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400">
                    <CheckCircle2 size={11} /> 完了
                  </span>
                )}
                {isError && (
                  <span className="flex items-center gap-1 text-[10px] font-black text-red-400" title={r?.error_message ?? ""}>
                    <AlertTriangle size={11} /> エラー
                  </span>
                )}
                {isPending && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-600">
                    <Clock size={11} /> 未生成
                  </span>
                )}
              </div>

              {/* 操作 */}
              <div className="flex items-center gap-3">
                {isCompleted && (
                  <AccountingDownloadButton yearMonth={yearMonth} label={label} />
                )}
                {!isCompleted && (
                  <AccountingRunButton year={year} month={month} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AccountingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <AccountingContent />
    </Suspense>
  );
}
