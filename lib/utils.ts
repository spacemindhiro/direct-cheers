import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// datetime-local の値（JST として入力）を UTC ISO 文字列に変換して送信用に使う
export function jstLocalToUtcIso(v: string): string {
  if (!v) return v;
  return new Date(v + ":00+09:00").toISOString();
}

// UTC ISO 文字列を JST の datetime-local 表示値（"YYYY-MM-DDTHH:mm"）に変換
export function utcIsoToJstLocal(iso: string): string {
  if (!iso) return iso;
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 16);
}

// datetime-local 文字列（"YYYY-MM-DDTHH:mm"）に指定時間を加算。タイムゾーン非依存。
export function addHoursToLocalDT(localDT: string, hours: number): string {
  if (!localDT) return "";
  const [datePart, timePart] = localDT.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, hh, mm));
  d.setUTCHours(d.getUTCHours() + hours);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("-") + "T" + [
    String(d.getUTCHours()).padStart(2, "0"),
    String(d.getUTCMinutes()).padStart(2, "0"),
  ].join(":");
}
