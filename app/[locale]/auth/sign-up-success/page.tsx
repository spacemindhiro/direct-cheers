'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useTransition } from 'react';
import Link from 'next/link';
import { MailCheck, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';
function SignUpSuccessContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const redirectTo = searchParams.get('redirect');
  const decodedEmail = email ? decodeURIComponent(email) : null;

  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleResend = () => {
    if (!decodedEmail) return;
    startTransition(async () => {
      setResendError(null);
      const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
      callbackUrl.searchParams.set('redirect', redirectTo ?? '/dashboard');
      const res = await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: decodedEmail, callbackUrl: callbackUrl.toString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResendError(data.error ?? '再送に失敗しました。しばらく待ってから再度お試しください。');
      } else {
        setResent(true);
      }
    });
  };

  return (
    <div className="w-full max-w-md space-y-8 text-center">

      {/* アイコン */}
      <div className="flex justify-center">
        <div className="w-20 h-20 bg-pink-500/10 rounded-full flex items-center justify-center border border-pink-500/20 shadow-[0_0_40px_rgba(236,72,153,0.2)]">
          <MailCheck className="text-pink-500" size={36} />
        </div>
      </div>

      {/* タイトル */}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Check Your Email
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          メールを送信しました
        </h1>
      </div>

      {/* メアド表示 */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-4 text-left">
        {decodedEmail ? (
          <>
            <p className="text-slate-400 text-sm leading-relaxed text-center">
              以下のアドレスに確認メールを送りました。
            </p>
            <div className="bg-slate-950/60 border border-pink-500/20 rounded-2xl px-6 py-4 text-center">
              <p className="text-pink-400 font-black text-base tracking-tight break-all">
                {decodedEmail}
              </p>
            </div>
          </>
        ) : (
          <p className="text-slate-400 text-sm leading-relaxed text-center">
            入力されたメールアドレスに確認メールを送りました。
          </p>
        )}
        <div className="space-y-1.5 pt-2">
          <p className="text-slate-500 text-xs leading-relaxed text-center">
            メール内のリンクをクリックしてアカウントを有効化してください。
          </p>
          <p className="text-slate-600 text-xs text-center">
            メールが届かない場合は迷惑メールフォルダをご確認ください。
          </p>
        </div>
      </div>

      {/* アクション */}
      <div className="space-y-3">

        {/* 再送ボタン */}
        {decodedEmail && (
          <button
            onClick={handleResend}
            disabled={isPending || resent}
            className="w-full h-14 bg-slate-900 border border-slate-700 hover:border-pink-500/50 text-slate-300 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resent ? (
              <><CheckCircle2 size={16} className="text-emerald-400" /> 再送しました</>
            ) : isPending ? (
              <><RefreshCw size={16} className="animate-spin" /> 送信中...</>
            ) : (
              <><RefreshCw size={16} /> 確認メールを再送する</>
            )}
          </button>
        )}
        {resendError && (
          <p className="text-xs text-red-400 text-center">{resendError}</p>
        )}

        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 text-xs text-slate-600 hover:text-pink-500 transition-colors font-bold uppercase tracking-widest pt-2"
        >
          ログインページへ <ArrowRight size={13} />
        </Link>
      </div>

    </div>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-950 font-sans flex flex-col">
      {/* ロゴ */}
      <div className="px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <img
            src="/logo-emblem.png"
            alt="Direct Cheers"
            className="w-7 h-7 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform"
          />
          <span className="text-base font-black tracking-tighter text-white uppercase italic">
            Direct Cheers
          </span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <Suspense fallback={null}>
          <SignUpSuccessContent />
        </Suspense>
      </div>
    </div>
  );
}
