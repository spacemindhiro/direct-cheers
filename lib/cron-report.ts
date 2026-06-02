/**
 * Cron業務レポート共通ヘルパー
 *
 * 全Cron処理がこのモジュールを通じて daily_business_reports と
 * uncollected_revenue_details に結果を書き込む。
 * オーナーがAdmin管理画面で翌朝一目で確認できる形にする。
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type FailureDetail = {
  eventName?: string;
  organizerName?: string;
  customerName?: string;
  targetName?: string;
  amount: number;
  failureReason: string;
};

export type CronReportPayload = {
  taskName: string;
  processDate?: string;          // YYYY-MM-DD 省略時は当日
  totalEvents?: number;
  targetCount: number;
  targetAmount: number;
  successCount: number;
  successAmount: number;
  failedCount: number;
  failedAmount: number;
  failures: FailureDetail[];
};

export async function saveCronReport(payload: CronReportPayload): Promise<void> {
  const admin = createAdminClient();

  const status = payload.failedCount > 0 ? "要確認・未回収あり" : "正常完了";
  const today = new Date().toISOString().slice(0, 10);

  const { data: report, error: reportErr } = await admin
    .from("daily_business_reports")
    .insert({
      process_date:   payload.processDate ?? today,
      task_name:      payload.taskName,
      total_events:   payload.totalEvents ?? 0,
      target_count:   payload.targetCount,
      target_amount:  payload.targetAmount,
      success_count:  payload.successCount,
      success_amount: payload.successAmount,
      failed_count:   payload.failedCount,
      failed_amount:  payload.failedAmount,
      status,
    })
    .select("id")
    .single();

  if (reportErr || !report) {
    console.error("[cron-report] サマリー書き込み失敗:", reportErr?.message);
    return;
  }

  if (payload.failures.length > 0) {
    const rows = payload.failures.map((f) => ({
      report_id:      report.id,
      task_name:      payload.taskName,
      event_name:     f.eventName     ?? null,
      organizer_name: f.organizerName ?? null,
      customer_name:  f.customerName  ?? null,
      target_name:    f.targetName    ?? null,
      amount:         f.amount,
      failure_reason: f.failureReason,
      action_status:  "未対応",
    }));

    const { error: detailErr } = await admin
      .from("uncollected_revenue_details")
      .insert(rows);

    if (detailErr) {
      console.error("[cron-report] 明細書き込み失敗:", detailErr.message);
    }
  }

  console.log(
    `[cron-report] ${payload.taskName} ${status}` +
    ` target=${payload.targetCount}件 ¥${payload.targetAmount.toLocaleString()}` +
    ` success=${payload.successCount} failed=${payload.failedCount}`
  );
}
