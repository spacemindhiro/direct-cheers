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
