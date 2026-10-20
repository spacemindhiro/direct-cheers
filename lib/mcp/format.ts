// ツールの返答の書式（AIが読みやすく、外に出してよい形）

export const LIFECYCLE_LABEL: Record<string, string> = {
  draft: "下書き",
  review_requested: "承認待ち",
  published: "公開済み",
  ongoing: "開催中",
  ended: "終了",
  settled: "精算済み",
  cancellation_requested: "中止申請中",
  cancelled: "中止",
};

// 日本時間の「2026年10月25日(土) 19:00」
export function jstDateTime(iso: string | null | undefined): string {
  if (!iso) return "未定";
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const wd = "日月火水木金土"[d.getUTCDay()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${wd}) ${hh}:${mm}`;
}

export function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

// 「- 項目: 値」の箇条書き。値が null/undefined の行は出さない
export function lines(title: string, fields: [string, string | number | null | undefined][]): string {
  return [title, ...fields.filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `  - ${k}: ${v}`)].join("\n");
}
