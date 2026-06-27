'use client';

import { useState } from 'react';
import { PasskeySetup } from '@/components/passkey-setup';
import { ShieldCheck, Fingerprint } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  email: string;
  redirectTo: string;
  hasPasskeys: boolean;
};

export function StepUpForm({ email, redirectTo, hasPasskeys }: Props) {
  const router = useRouter();
  // hasPasskeys=true は「ユーザーがどこかの端末で登録済み」を意味するだけで、
  // 今この端末で使えるとは限らない（別端末で登録した場合、この端末には
  // 対応する鍵が無く認証できない）。そのため「登録済みパスキーで認証」を
  // 常に試せるようにしつつ、「この端末に新しく登録する」という代替手段も
  // 常に見せておく（失敗してから初めて出すのではなく、最初から両方見せる）。
  const [showNewDeviceRegister, setShowNewDeviceRegister] = useState(!hasPasskeys);

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

      {hasPasskeys && (
        <PasskeySetup
          mode="stepup"
          email={email}
          buttonLabel="登録済みのパスキーで認証する"
          onSuccess={() => router.replace(redirectTo)}
        />
      )}

      {hasPasskeys && !showNewDeviceRegister && (
        <button
          type="button"
          onClick={() => setShowNewDeviceRegister(true)}
          className="flex w-full items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors font-bold"
        >
          <Fingerprint size={13} /> このデバイスにパスキーが無い場合
        </button>
      )}

      {showNewDeviceRegister && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-[1.5rem] px-6 py-6 space-y-4 text-center">
          <p className="text-sm font-black text-amber-300">
            {hasPasskeys ? 'このデバイス用に新しく登録します' : 'パスキーが未登録です'}
          </p>
          <p className="text-xs text-slate-500 leading-relaxed">
            {hasPasskeys
              ? '別の端末で登録したパスキーは、この端末では使えません。今ログイン中のこのメールアドレスの本人として、この端末用のパスキーを新規登録します。'
              : '管理画面にアクセスするには、まずパスキーを登録してください。'}
          </p>
          <PasskeySetup
            mode="stepup-register"
            buttonLabel="このデバイスに登録する"
            onSuccess={() => router.replace(redirectTo)}
          />
        </div>
      )}

    </div>
  );
}
