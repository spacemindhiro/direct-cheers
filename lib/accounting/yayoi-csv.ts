/**
 * 弥生会計 仕訳インポートCSV 生成
 *
 * フォーマット仕様:
 * - 弥生会計 デスクトップ/クラウド 仕訳帳インポート形式
 * - エンコード: UTF-8 with BOM（弥生/Excel 対応）
 * - 改行: CRLF
 * - 全フィールドをダブルクォートで囲む
 *
 * 税区分:
 * - 売上（システム利用料・出金手数料）: 課税売上10%（内税）
 * - 売掛金(Stripe)・預り金: 対象外
 *
 * 仕訳構成（月末日で計上）:
 *   Row 1a Dr 売掛金(Stripe) platform_fee / Cr 売上高 platform_fee  ← システム利用料
 *   Row 1b Dr 売掛金(Stripe) net_amount   / Cr 預り金 net_amount    ← 預り金受入
 *   Row 2  Dr 預り金 reversal / Cr 売上高 reversal                   ← 出金手数料回収
 *   Row 3  Dr 預り金 payout   / Cr 売掛金(Stripe) payout            ← 銀行出金
 *
 * Row 1a + 1b の借方合計 = gross - stripe_fee = platform_fee + net_amount
 * Row 2・Row 3 は金額が 0 の場合はスキップ
 */

import { getMonthLastDay } from "./date-utils";

export type MonthlySummary = {
  year: number;
  month: number;
  label: string;
  totalGross: number;
  totalStripeFee: number;
  totalPlatformFee: number;
  totalNetAmount: number;
  totalReversalAmount: number;
  totalPayoutAmount: number;
  monthEndBalance: number;
  monthEndBalancePlatform: number;
  monthEndBalanceConnect: number;
};

// ── 弥生会計 仕訳帳 CSVヘッダー (16列) ─────────────────────────────────
const YAYOI_HEADER = [
  "辞書番号", "取引日",
  "借方勘定科目", "借方補助科目", "借方税区分", "借方金額", "借方消費税額",
  "貸方勘定科目", "貸方補助科目", "貸方税区分", "貸方金額", "貸方消費税額",
  "摘要", "番号", "期日", "入出金",
];

type JournalRow = {
  date: string;           // YYYY/MM/DD
  drAccount: string;      // 借方勘定科目
  drSub: string;          // 借方補助科目
  drTax: string;          // 借方税区分
  drAmount: number;       // 借方金額
  drTaxAmount: number;    // 借方消費税額
  crAccount: string;      // 貸方勘定科目
  crSub: string;          // 貸方補助科目
  crTax: string;          // 貸方税区分
  crAmount: number;       // 貸方金額
  crTaxAmount: number;    // 貸方消費税額
  description: string;    // 摘要
  entryNo: string;        // 番号（辞書番号）
};

/** 内税10%の消費税額（課税売上に適用） */
function calcTax10(amount: number): number {
  return Math.floor(amount * 10 / 110);
}

function rowToCsv(no: number, r: JournalRow): string[] {
  return [
    String(no),               // 辞書番号
    r.date,                   // 取引日
    r.drAccount,              // 借方勘定科目
    r.drSub,                  // 借方補助科目
    r.drTax,                  // 借方税区分
    String(r.drAmount),       // 借方金額
    String(r.drTaxAmount),    // 借方消費税額
    r.crAccount,              // 貸方勘定科目
    r.crSub,                  // 貸方補助科目
    r.crTax,                  // 貸方税区分
    String(r.crAmount),       // 貸方金額
    String(r.crTaxAmount),    // 貸方消費税額
    r.description,            // 摘要
    r.entryNo,                // 番号
    "",                       // 期日
    "",                       // 入出金
  ];
}

function toCsvLine(fields: string[]): string {
  return fields.map((f) => `"${f.replace(/"/g, '""')}"`).join(",");
}

/**
 * MonthlySummary から弥生会計インポート用 CSV 文字列を生成する。
 * UTF-8 BOM + CRLF 形式。
 */
export function generateYayoiCsv(summary: MonthlySummary): string {
  const {
    year, month, label,
    totalPlatformFee, totalNetAmount,
    totalReversalAmount, totalPayoutAmount,
  } = summary;

  // 不変量チェック（エラーログ用 — 呼び出し元の責任でもある）
  const expectedNet = summary.totalGross - summary.totalStripeFee - summary.totalPlatformFee;
  if (totalNetAmount !== expectedNet) {
    console.error(
      `[yayoi-csv] 不変量違反 ${label}: net=${totalNetAmount} ≠ expected=${expectedNet}`,
    );
  }

  const date = getMonthLastDay(year, month);
  const rows: JournalRow[] = [];

  // ── Row 1a: システム利用料（決済 platform_fee 分）────────────────────
  if (totalPlatformFee > 0) {
    rows.push({
      date,
      drAccount: "売掛金", drSub: "Stripe", drTax: "対象外",
      drAmount: totalPlatformFee, drTaxAmount: 0,
      crAccount: "売上高",  crSub: "システム利用料", crTax: "課税売上10%",
      crAmount: totalPlatformFee, crTaxAmount: calcTax10(totalPlatformFee),
      description: `${label} システム利用料（決済手数料10%）`,
      entryNo: "1",
    });
  }

  // ── Row 1b: 預り金受入（オーガナイザー分 net_amount）─────────────────
  if (totalNetAmount > 0) {
    rows.push({
      date,
      drAccount: "売掛金", drSub: "Stripe", drTax: "対象外",
      drAmount: totalNetAmount, drTaxAmount: 0,
      crAccount: "預り金", crSub: "", crTax: "対象外",
      crAmount: totalNetAmount, crTaxAmount: 0,
      description: `${label} 預り金受入（オーガナイザー分）`,
      entryNo: "2",
    });
  }

  // ── Row 2: 出金手数料回収（Reverse Transfer）─────────────────────────
  if (totalReversalAmount > 0) {
    rows.push({
      date,
      drAccount: "預り金", drSub: "", drTax: "対象外",
      drAmount: totalReversalAmount, drTaxAmount: 0,
      crAccount: "売上高",  crSub: "出金手数料", crTax: "課税売上10%",
      crAmount: totalReversalAmount, crTaxAmount: calcTax10(totalReversalAmount),
      description: `${label} 出金手数料回収（振込手数料Reversal）`,
      entryNo: "3",
    });
  }

  // ── Row 3: 銀行出金（オーガナイザー Payout）─────────────────────────
  if (totalPayoutAmount > 0) {
    rows.push({
      date,
      drAccount: "預り金", drSub: "", drTax: "対象外",
      drAmount: totalPayoutAmount, drTaxAmount: 0,
      crAccount: "売掛金", crSub: "Stripe", crTax: "対象外",
      crAmount: totalPayoutAmount, crTaxAmount: 0,
      description: `${label} 銀行出金（オーガナイザーPayout）`,
      entryNo: "4",
    });
  }

  const lines: string[] = [
    toCsvLine(YAYOI_HEADER),
    ...rows.map((r, i) => toCsvLine(rowToCsv(i + 1, r))),
  ];

  // UTF-8 BOM + CRLF
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/**
 * 月末預り金残高のサマリーテキスト（CSVファイル名や管理画面表示用）
 */
export function buildBalanceSummary(summary: MonthlySummary): string {
  const { label, monthEndBalance, monthEndBalancePlatform, monthEndBalanceConnect } = summary;
  return [
    `${label} 月末預り金残高: ¥${monthEndBalance.toLocaleString("ja-JP")}`,
    `  └ プラットフォーム留保: ¥${monthEndBalancePlatform.toLocaleString("ja-JP")}`,
    `  └ Connect口座滞留: ¥${monthEndBalanceConnect.toLocaleString("ja-JP")}`,
  ].join("\n");
}
