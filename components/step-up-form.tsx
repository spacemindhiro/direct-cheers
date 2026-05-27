'use client';

import { PasskeySetup } from '@/components/passkey-setup';
import Link from 'next/link';
import { ShieldCheck, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  email: string;
  redirectTo: string;
  hasPasskeys: boolean;
};

export function StepUpForm({ email, redirectTo, hasPasskeys }: Props) {
  const router = useRouter();

  return (
    <div className="space-y-8">

      {/* ヘッダー */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center border border-indigo-500/20 shadow-[0_0_40px_rgba(99,102,241,0.15)]">
            <ShieldCheck size={28} className="text-indigo-400" />
          </div>
        </div>
        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">
          Security Check
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          本人確認
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          管理画面へのアクセスには<br />パスキー認証が必要です
        </p>
      </div>

      {hasPasskeys ? (
        <PasskeySetup
          mode="stepup"
          email={email}
          buttonLabel="パスキーで認証する"
          onSuccess={() => router.replace(redirectTo)}
        />
      ) : (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-[1.5rem] px-6 py-6 space-y-4 text-center">
          <p className="text-sm font-black text-amber-300">パスキーが未登録です</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            管理画面にアクセスするには、まずパスキーを登録してください。<br />
            登録後に自動でこのページに戻ります。
          </p>
          <Link
            href={`/auth/passkey-setup?redirect=${encodeURIComponent(`/auth/step-up?redirect=${encodeURIComponent(redirectTo)}`)}`}
            className="flex items-center justify-center gap-2 w-full h-12 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl font-black text-sm transition-all"
          >
            パスキーを登録する <ChevronRight size={16} />
          </Link>
        </div>
      )}

    </div>
  );
}
