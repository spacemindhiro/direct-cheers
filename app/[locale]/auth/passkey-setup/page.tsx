"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PasskeySetup } from "@/components/passkey-setup";
import { ChevronRight, KeyRound } from "lucide-react";

function PasskeySetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const emailParam = searchParams.get("email") ?? "";

  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        // ログイン済みならそのまま目的地へ
        router.replace(redirect);
      } else {
        // 未ログイン: メールパラメータを使用
        setEmail(emailParam || null);
        setLoading(false);
      }
    });
  }, [emailParam, redirect, router]);

  const handleSuccess = () => router.replace(redirect);
  const handleSkip = () => router.replace(redirect);

  const signupUrl = emailParam
    ? `/auth/signup?email=${encodeURIComponent(emailParam)}&redirect=${encodeURIComponent(redirect)}`
    : `/auth/signup?redirect=${encodeURIComponent(redirect)}`;

  if (loading) return null;

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="text-center space-y-2">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Welcome
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          アカウント登録
        </h1>
        <p className="text-sm text-slate-400">
          {email ? `${email} として登録します` : "メールアドレスでアカウントを作成"}
        </p>
      </div>

      <div className="space-y-3">
        {email && (
          <PasskeySetup
            mode="register"
            email={email}
            onSuccess={handleSuccess}
          />
        )}

        <Link
          href={signupUrl}
          className="w-full flex items-center justify-between gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl p-4 transition-all"
        >
          <div className="flex items-center gap-3">
            <KeyRound size={22} className="text-indigo-400 shrink-0" />
            <div className="text-left">
              <p className="text-sm font-black text-white">パスワードで登録</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                メールアドレスとパスワードでアカウント作成
              </p>
            </div>
          </div>
          <ChevronRight size={16} className="text-slate-600 shrink-0" />
        </Link>

        <div className="text-center pt-1">
          <Link
            href={`/auth/login?redirect=${encodeURIComponent(redirect)}`}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            すでにアカウントをお持ちの方はこちら
          </Link>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSkip}
        className="w-full flex items-center justify-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors font-bold uppercase tracking-widest pt-2"
      >
        あとで設定する <ChevronRight size={13} />
      </button>
    </div>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-950 font-sans flex flex-col">
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
          <PasskeySetupContent />
        </Suspense>
      </div>
    </div>
  );
}
