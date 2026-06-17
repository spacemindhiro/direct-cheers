/**
 * TC-YAYOI: 弥生会計CSV生成ロジックの厳格テスト
 *
 * 検証ポイント:
 *   1. UTF-8 BOM の存在
 *   2. CRLF 改行
 *   3. 各行の借方合計 = 貸方合計（複式簿記の大原則）
 *   4. 金額0行のスキップ
 *   5. 内税10%消費税計算の端数処理（floor）
 *   6. 不変量: totalGross - stripeFee - platformFee = netAmount 違反時の警告
 *   7. CSV フィールドのエスケープ（ダブルクォート内のダブルクォート）
 *   8. 月末日の正確なフォーマット
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateYayoiCsv, buildBalanceSummary, type MonthlySummary } from "@/lib/accounting/yayoi-csv";

const BASE: MonthlySummary = {
  year: 2026,
  month: 5,
  label: "2026年5月度",
  totalGross:            1_000_000,
  totalStripeFee:           39_600, // ceil(1000000 × 0.0396)
  totalPlatformFee:        100_000, // floor(1000000 × 0.10)
  totalNetAmount:          860_400, // 1000000 - 39600 - 100000
  totalReversalAmount:       5_000, // 10 payouts × 500
  totalPayoutAmount:       850_000, // net payouts
  monthEndBalance:          50_000,
  monthEndBalancePlatform:  30_000,
  monthEndBalanceConnect:   20_000,
};

// ── ヘルパー ─────────────────────────────────────────────────────────────
function parseCsv(csv: string): string[][] {
  // BOM除去後に行分割（CRLF）、空行はスキップ
  const cleaned = csv.startsWith("﻿") ? csv.slice(1) : csv;
  return cleaned
    .split("\r\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      // ダブルクォートで囲まれた CSV をパース
      const fields: string[] = [];
      let cur = "";
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
          else { inQuote = !inQuote; }
        } else if (ch === ',' && !inQuote) {
          fields.push(cur); cur = "";
        } else {
          cur += ch;
        }
      }
      fields.push(cur);
      return fields;
    });
}

function getDataRows(csv: string): string[][] {
  const all = parseCsv(csv);
  return all.slice(1); // ヘッダーを除く
}

// ── TC-YAYOI-01: ファイル形式 ────────────────────────────────────────
describe("TC-YAYOI-01: ファイル形式（BOM・CRLF・クォート）", () => {
  const csv = generateYayoiCsv(BASE);

  it("UTF-8 BOM (\\uFEFF) で始まる", () => {
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it("CRLF で改行されている", () => {
    const lines = csv.split("\r\n");
    expect(lines.length).toBeGreaterThan(2);
    // LF単体の行がないこと
    const hasLfOnly = csv.includes("\n") && !csv.includes("\r\n");
    expect(hasLfOnly).toBe(false);
  });

  it("最後の行も CRLF で終わる（末尾改行あり）", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("全フィールドがダブルクォートで囲まれている", () => {
    const lines = csv.replace(/^﻿/, "").split("\r\n").filter(Boolean);
    for (const line of lines) {
      const fields = line.split('","');
      // 先頭が " 始まり、末尾が " 終わり
      expect(line.startsWith('"')).toBe(true);
      expect(line.endsWith('"')).toBe(true);
    }
  });

  it("ヘッダー1行 + データ行（最低1行）", () => {
    const rows = parseCsv(csv);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0][1]).toBe("取引日");
  });
});

// ── TC-YAYOI-02: 仕訳データ行の複式簿記整合性 ────────────────────────
describe("TC-YAYOI-02: 複式簿記整合性（借方金額 = 貸方金額）", () => {
  const csv = generateYayoiCsv(BASE);
  const rows = getDataRows(csv);

  it("全データ行で 借方金額(col5) = 貸方金額(col10)", () => {
    for (const row of rows) {
      const dr = parseInt(row[5], 10);
      const cr = parseInt(row[10], 10);
      expect(dr).toBe(cr);
    }
  });

  it("借方 売掛金/預り金 の消費税=0、貸方 売上高（課税売上）の消費税>0 または 0（対象外は 0）", () => {
    // 弥生の内税方式: 借方（売掛金・預り金）に消費税欄はなし（0）、
    // 貸方の課税売上（売上高）にのみ消費税額を記載する。
    for (const row of rows) {
      const drAccount = row[2];
      const crAccount = row[7];
      const drTax     = parseInt(row[6], 10);
      const crTaxCode = row[9];
      const crTax     = parseInt(row[11], 10);
      // 借方（売掛金・預り金）は消費税 = 0
      if (drAccount === "売掛金" || drAccount === "預り金") {
        expect(drTax).toBe(0);
      }
      // 貸方が「対象外」なら消費税 = 0
      if (crTaxCode === "対象外") {
        expect(crTax).toBe(0);
      }
      // 貸方が「課税売上10%」なら消費税 > 0（金額が正の場合）
      if (crTaxCode === "課税売上10%") {
        expect(crTax).toBeGreaterThan(0);
      }
    }
  });
});

// ── TC-YAYOI-03: 各仕訳行の金額・科目確認 ────────────────────────────
describe("TC-YAYOI-03: 仕訳行の科目・金額", () => {
  const csv = generateYayoiCsv(BASE);
  const rows = getDataRows(csv);

  it("行1a: 借方=売掛金 / 貸方=売上高（システム利用料）/ 金額=platformFee", () => {
    const row = rows.find((r) => r[12].includes("システム利用料（決済手数料"));
    expect(row).toBeDefined();
    expect(row![2]).toBe("売掛金");
    expect(row![7]).toBe("売上高");
    expect(row![8]).toBe("システム利用料");
    expect(parseInt(row![5])).toBe(BASE.totalPlatformFee);
  });

  it("行1b: 借方=売掛金 / 貸方=預り金 / 金額=netAmount", () => {
    const row = rows.find((r) => r[12].includes("預り金受入"));
    expect(row).toBeDefined();
    expect(row![7]).toBe("預り金");
    expect(parseInt(row![5])).toBe(BASE.totalNetAmount);
  });

  it("行2: 借方=預り金 / 貸方=売上高（出金手数料）/ 金額=reversalAmount", () => {
    const row = rows.find((r) => r[12].includes("出金手数料回収"));
    expect(row).toBeDefined();
    expect(row![2]).toBe("預り金");
    expect(row![7]).toBe("売上高");
    expect(row![8]).toBe("出金手数料");
    expect(parseInt(row![5])).toBe(BASE.totalReversalAmount);
  });

  it("行3: 借方=預り金 / 貸方=売掛金 / 金額=payoutAmount", () => {
    const row = rows.find((r) => r[12].includes("銀行出金"));
    expect(row).toBeDefined();
    expect(row![2]).toBe("預り金");
    expect(row![7]).toBe("売掛金");
    expect(parseInt(row![5])).toBe(BASE.totalPayoutAmount);
  });

  it("取引日が末日 '2026/05/31' になっている", () => {
    for (const row of rows) {
      expect(row[1]).toBe("2026/05/31");
    }
  });
});

// ── TC-YAYOI-04: 内税10%消費税の端数処理 ─────────────────────────────
describe("TC-YAYOI-04: 内税10%消費税計算（floor）", () => {
  it("platform_fee=100,000 → 消費税=floor(100000*10/110)=9090", () => {
    const csv = generateYayoiCsv({ ...BASE, totalPlatformFee: 100_000 });
    const rows = getDataRows(csv);
    const row = rows.find((r) => r[12].includes("システム利用料"));
    expect(parseInt(row![11])).toBe(Math.floor(100_000 * 10 / 110)); // 9090
  });

  it("reversal=5,000 → 消費税=floor(5000*10/110)=454", () => {
    const csv = generateYayoiCsv({ ...BASE, totalReversalAmount: 5_000 });
    const rows = getDataRows(csv);
    const row = rows.find((r) => r[12].includes("出金手数料"));
    expect(parseInt(row![11])).toBe(Math.floor(5_000 * 10 / 110)); // 454
  });

  it("reversal=1 → 消費税=0（floor(1/11)=0）", () => {
    const csv = generateYayoiCsv({ ...BASE, totalReversalAmount: 1 });
    const rows = getDataRows(csv);
    const row = rows.find((r) => r[12].includes("出金手数料"));
    expect(parseInt(row![11])).toBe(0);
  });

  it("reversal=11 → 消費税=1（floor(11/11)=1）", () => {
    const csv = generateYayoiCsv({ ...BASE, totalReversalAmount: 11 });
    const rows = getDataRows(csv);
    const row = rows.find((r) => r[12].includes("出金手数料"));
    expect(parseInt(row![11])).toBe(1);
  });

  it("reversal=1,111,111 → 消費税=floor(1111111*10/110)=101010（端数なし）", () => {
    const csv = generateYayoiCsv({ ...BASE, totalReversalAmount: 1_111_111 });
    const rows = getDataRows(csv);
    const row = rows.find((r) => r[12].includes("出金手数料"));
    expect(parseInt(row![11])).toBe(Math.floor(1_111_111 * 10 / 110));
  });

  it("売上税区分は '課税売上10%'・預り金/売掛金は '対象外'", () => {
    const csv = generateYayoiCsv(BASE);
    const rows = getDataRows(csv);
    for (const row of rows) {
      const drAccount = row[2];
      const crAccount = row[7];
      const drTax     = row[4];
      const crTax     = row[9];
      if (drAccount === "預り金" || drAccount === "売掛金") {
        expect(drTax).toBe("対象外");
      }
      if (crAccount === "売上高") {
        expect(crTax).toBe("課税売上10%");
      }
      if (crAccount === "預り金" || crAccount === "売掛金") {
        expect(crTax).toBe("対象外");
      }
    }
  });
});

// ── TC-YAYOI-05: 金額0行のスキップ ──────────────────────────────────
describe("TC-YAYOI-05: 金額0の仕訳行はスキップ", () => {
  it("reversalAmount=0 → 出金手数料行なし", () => {
    const csv = generateYayoiCsv({ ...BASE, totalReversalAmount: 0 });
    expect(csv).not.toContain("出金手数料");
  });

  it("payoutAmount=0 → 銀行出金行なし", () => {
    const csv = generateYayoiCsv({ ...BASE, totalPayoutAmount: 0 });
    expect(csv).not.toContain("銀行出金");
  });

  it("platformFee=0 → システム利用料行なし", () => {
    const csv = generateYayoiCsv({ ...BASE, totalPlatformFee: 0 });
    expect(csv).not.toContain("システム利用料");
  });

  it("netAmount=0 → 預り金受入行なし", () => {
    const csv = generateYayoiCsv({ ...BASE, totalNetAmount: 0 });
    expect(csv).not.toContain("預り金受入");
  });

  it("全額0（決済なし月） → ヘッダーのみ（データ行0）", () => {
    const csv = generateYayoiCsv({
      ...BASE,
      totalGross: 0, totalStripeFee: 0, totalPlatformFee: 0,
      totalNetAmount: 0, totalReversalAmount: 0, totalPayoutAmount: 0,
    });
    const rows = getDataRows(csv);
    expect(rows.length).toBe(0);
  });
});

// ── TC-YAYOI-06: 端数処理・総和の一致 ────────────────────────────────
describe("TC-YAYOI-06: 端数処理総和の一致（不変量）", () => {
  it("各行の借方合計・貸方合計がどちらも非負", () => {
    const csv = generateYayoiCsv(BASE);
    const rows = getDataRows(csv);
    for (const row of rows) {
      expect(parseInt(row[5])).toBeGreaterThan(0);
      expect(parseInt(row[10])).toBeGreaterThan(0);
    }
  });

  it("totalGross - stripeFee - platformFee = netAmount が崩れていたら console.error を出す（不変量チェック）", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    generateYayoiCsv({
      ...BASE,
      totalNetAmount: BASE.totalGross - BASE.totalStripeFee - BASE.totalPlatformFee + 1, // 1円ずらす
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("不変量違反"));
    errorSpy.mockRestore();
  });

  it("不変量が正しい場合は console.error を呼ばない", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    generateYayoiCsv(BASE); // BASE は正しい不変量
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ── TC-YAYOI-07: ラベルの摘要への埋め込み ────────────────────────────
describe("TC-YAYOI-07: ラベルが摘要に含まれる", () => {
  it("摘要に '2026年5月度' が含まれる", () => {
    const csv = generateYayoiCsv(BASE);
    const rows = getDataRows(csv);
    for (const row of rows) {
      expect(row[12]).toContain("2026年5月度");
    }
  });

  it("12月度でも摘要に '2026年12月度' が含まれる", () => {
    const csv = generateYayoiCsv({
      ...BASE,
      year: 2026, month: 12,
      label: "2026年12月度",
    });
    const rows = getDataRows(csv);
    for (const row of rows) {
      expect(row[12]).toContain("2026年12月度");
    }
  });
});

// ── TC-YAYOI-08: buildBalanceSummary ─────────────────────────────────
describe("TC-YAYOI-08: buildBalanceSummary — 月末預り金残高テキスト", () => {
  it("月末残高・プラットフォーム留保・Connect口座を含む", () => {
    const text = buildBalanceSummary(BASE);
    expect(text).toContain("2026年5月度");
    expect(text).toContain("50,000");
    expect(text).toContain("30,000");
    expect(text).toContain("20,000");
  });

  it("残高0のときも正常にテキストが返る", () => {
    const text = buildBalanceSummary({ ...BASE, monthEndBalance: 0, monthEndBalancePlatform: 0, monthEndBalanceConnect: 0 });
    expect(text).toContain("¥0");
  });
});

// ── TC-YAYOI-09: 境界値・大金額・単一決済 ───────────────────────────
describe("TC-YAYOI-09: 境界値テスト", () => {
  it("最小取引: gross=501（振込手数料より大きい最小額）", () => {
    const summary: MonthlySummary = {
      year: 2026, month: 5, label: "2026年5月度",
      totalGross: 501,
      totalStripeFee: Math.ceil(501 * 0.0396), // 20
      totalPlatformFee: Math.floor(501 * 0.10), // 50
      totalNetAmount: 501 - Math.ceil(501 * 0.0396) - Math.floor(501 * 0.10), // 431
      totalReversalAmount: 500,
      totalPayoutAmount: 1,
      monthEndBalance: 0, monthEndBalancePlatform: 0, monthEndBalanceConnect: 0,
    };
    const csv = generateYayoiCsv(summary);
    const rows = getDataRows(csv);
    // 全行借方=貸方
    for (const row of rows) {
      expect(parseInt(row[5])).toBe(parseInt(row[10]));
    }
  });

  it("大金額: gross=100,000,000（1億円）でも整数精度が保たれる", () => {
    const gross = 100_000_000;
    const stripeFee = Math.ceil(gross * 0.0396);  // 3_960_000
    const platformFee = Math.floor(gross * 0.10); // 10_000_000
    const netAmount = gross - stripeFee - platformFee;
    const summary: MonthlySummary = {
      year: 2026, month: 5, label: "2026年5月度",
      totalGross: gross, totalStripeFee: stripeFee,
      totalPlatformFee: platformFee, totalNetAmount: netAmount,
      totalReversalAmount: 0, totalPayoutAmount: 0,
      monthEndBalance: netAmount, monthEndBalancePlatform: netAmount, monthEndBalanceConnect: 0,
    };
    const csv = generateYayoiCsv(summary);
    const rows = getDataRows(csv);
    const row1a = rows.find((r) => r[12].includes("システム利用料"));
    const row1b = rows.find((r) => r[12].includes("預り金受入"));
    expect(parseInt(row1a![5])).toBe(platformFee);
    expect(parseInt(row1b![5])).toBe(netAmount);
  });
});
