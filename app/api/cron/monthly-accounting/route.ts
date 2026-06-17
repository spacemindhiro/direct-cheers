/**
 * GET /api/cron/monthly-accounting
 *
 * Vercel Cron: "0 2 1 * *" UTC (= 毎月1日 11:00 JST)
 * 先月度（JST 1日 0:00:00 〜 末日 23:59:59）を対象に集計し、
 * 弥生会計インポート用CSVを生成・DBに保存する。
 *
 * 認証: Authorization: Bearer $CRON_SECRET
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPreviousMonthBounds, getMonthBoundsUtc } from "@/lib/accounting/date-utils";
import { generateYayoiCsv, buildBalanceSummary, type MonthlySummary } from "@/lib/accounting/yayoi-csv";

export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 手動実行時は ?year=2026&month=5 で対象月を指定可能（省略時は前月）
  const url = new URL(req.url);
  const qYear = url.searchParams.get("year");
  const qMonth = url.searchParams.get("month");
  const bounds =
    qYear && qMonth
      ? getMonthBoundsUtc(parseInt(qYear, 10), parseInt(qMonth, 10))
      : getPreviousMonthBounds();

  const { startUtc, endUtc, targetYear, targetMonth, label } = bounds;

  console.log(`[monthly-accounting] 集計開始: ${label}`);
  console.log(`  期間(UTC): ${startUtc.toISOString()} ～ ${endUtc.toISOString()}`);

  // 冪等性: 既に当月分が生成済みなら上書きしない
  const { data: existing } = await admin
    .from("monthly_accounting_reports")
    .select("report_id, created_at")
    .eq("target_year", targetYear)
    .eq("target_month", targetMonth)
    .maybeSingle();

  if (existing) {
    console.log(`[monthly-accounting] ${label} は既に生成済み (report_id=${existing.report_id})`);
    return NextResponse.json({
      skipped: true,
      reason: "already_generated",
      report_id: existing.report_id,
      label,
    });
  }

  let summary: MonthlySummary;
  try {
    // DB集計: 単一RPC呼び出しで全数値を取得（JS側の行数上限を回避）
    const { data: rpcData, error: rpcErr } = await admin.rpc(
      "get_monthly_accounting_summary",
      {
        p_start_utc: startUtc.toISOString(),
        p_end_utc:   endUtc.toISOString(),
      }
    );

    if (rpcErr) throw new Error(`RPC失敗: ${rpcErr.message}`);
    if (!rpcData)  throw new Error("RPC が null を返しました");

    const d = rpcData as Record<string, number>;

    summary = {
      year: targetYear,
      month: targetMonth,
      label,
      totalGross:              d.total_gross              ?? 0,
      totalStripeFee:          d.total_stripe_fee          ?? 0,
      totalPlatformFee:        d.total_platform_fee        ?? 0,
      totalNetAmount:          d.total_net_amount          ?? 0,
      totalPlatformFeeTax:     d.total_platform_fee_tax    ?? 0,
      totalReversalAmount:     d.total_reversal_amount     ?? 0,
      totalReversalTax:        d.total_reversal_tax        ?? 0,
      totalPayoutAmount:       d.total_payout_amount       ?? 0,
      monthEndBalance:         d.balance_total             ?? 0,
      monthEndBalancePlatform: d.balance_platform          ?? 0,
      monthEndBalanceConnect:  d.balance_connect           ?? 0,
    };

    // 不変量チェック: gross - stripe_fee - platform_fee === net_amount
    const expectedNet = summary.totalGross - summary.totalStripeFee - summary.totalPlatformFee;
    if (summary.totalNetAmount !== expectedNet) {
      console.error(
        `[monthly-accounting] 不変量違反 ${label}:` +
        ` totalNetAmount=${summary.totalNetAmount}` +
        ` expected=${expectedNet}` +
        ` diff=${summary.totalNetAmount - expectedNet}`
      );
    }
  } catch (err: any) {
    // 集計失敗をDBに記録して 500 で返す
    await admin.from("monthly_accounting_reports").upsert({
      target_year: targetYear, target_month: targetMonth,
      status: "error", error_message: err.message,
    }, { onConflict: "target_year,target_month" });
    console.error(`[monthly-accounting] 集計失敗: ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  // CSV 生成
  const csv = generateYayoiCsv(summary);
  const balanceSummary = buildBalanceSummary(summary);

  console.log(`[monthly-accounting] ${label} 集計完了`);
  console.log(`  A: 総決済額 ¥${summary.totalGross.toLocaleString("ja-JP")} / システム利用料 ¥${summary.totalPlatformFee.toLocaleString("ja-JP")}`);
  console.log(`  B: 出金手数料回収 ¥${summary.totalReversalAmount.toLocaleString("ja-JP")}`);
  console.log(`  C: 銀行出金 ¥${summary.totalPayoutAmount.toLocaleString("ja-JP")}`);
  console.log(`  D: 月末預り金残高 ¥${summary.monthEndBalance.toLocaleString("ja-JP")}`);
  console.log(balanceSummary);

  // DBに保存（CSV全文を含む）
  const { data: report, error: insertErr } = await admin
    .from("monthly_accounting_reports")
    .insert({
      target_year: targetYear,
      target_month: targetMonth,
      total_gross:                summary.totalGross,
      total_stripe_fee:           summary.totalStripeFee,
      total_platform_fee:         summary.totalPlatformFee,
      total_net_amount:           summary.totalNetAmount,
      total_platform_fee_tax:     summary.totalPlatformFeeTax,
      total_reversal_amount:      summary.totalReversalAmount,
      total_reversal_tax:         summary.totalReversalTax,
      total_payout_amount:        summary.totalPayoutAmount,
      month_end_balance:             summary.monthEndBalance,
      month_end_balance_platform:    summary.monthEndBalancePlatform,
      month_end_balance_connect:     summary.monthEndBalanceConnect,
      csv_content: csv,
      status: "completed",
    })
    .select("report_id")
    .single();

  if (insertErr) {
    console.error(`[monthly-accounting] DB保存失敗: ${insertErr.message}`);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    report_id: report.report_id,
    label,
    summary: {
      totalGross:          summary.totalGross,
      totalStripeFee:      summary.totalStripeFee,
      totalPlatformFee:    summary.totalPlatformFee,
      totalNetAmount:      summary.totalNetAmount,
      totalReversalAmount: summary.totalReversalAmount,
      totalPayoutAmount:   summary.totalPayoutAmount,
      monthEndBalance:     summary.monthEndBalance,
    },
    csvRows: csv.split("\r\n").length - 2, // ヘッダー+BOMを除いたデータ行数
  });
}
