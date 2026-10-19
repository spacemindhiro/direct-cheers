import Link from 'next/link';

// アカウントが作られうる操作の直下に置く、利用規約・プライバシーポリシーへのみなし同意の注記。
// lead: 「〇〇することで」の部分（どの操作で同意したとみなすかを画面ごとに書く）
// 同意した版は、操作日時に有効だった版（lib/legal-versions.ts の versionAt）で特定する。
export function ConsentNotice({ lead, className = "" }: { lead: string; className?: string }) {
  return (
    <p className={`text-[10px] text-slate-500 leading-relaxed text-center ${className}`}>
      {lead}
      <Link href="/terms" className="text-slate-400 hover:text-pink-500 transition-colors underline underline-offset-2">利用規約</Link>
      および
      <Link href="/privacy" className="text-slate-400 hover:text-pink-500 transition-colors underline underline-offset-2">プライバシーポリシー</Link>
      に同意したものとみなします
    </p>
  );
}
