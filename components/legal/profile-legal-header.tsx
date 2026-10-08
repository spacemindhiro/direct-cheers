import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// ログイン後（プロフィール配下）で規約類を表示するときの見出し。戻り先は常にプロフィール。
export function ProfileLegalHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex items-center gap-4">
      <Link
        href="/dashboard/profile"
        aria-label="プロフィールに戻る"
        className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
      >
        <ArrowLeft size={16} />
      </Link>
      <div>
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">{eyebrow}</p>
        <h1 className="text-xl font-black text-white">{title}</h1>
      </div>
    </div>
  );
}
