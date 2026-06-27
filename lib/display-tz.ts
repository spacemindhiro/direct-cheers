// アプリ全体の表示タイムゾーン。ここを変更するだけで全画面に反映される。
export const DISPLAY_TZ = "Asia/Tokyo";

export function fmtDate(iso: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: DISPLAY_TZ, ...opts });
}

export function fmtDateTime(iso: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: DISPLAY_TZ, ...opts });
}

export function fmtTime(iso: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { timeZone: DISPLAY_TZ, ...opts });
}
