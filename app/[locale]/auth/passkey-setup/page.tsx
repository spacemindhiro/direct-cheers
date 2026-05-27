"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PasskeySetup } from "@/components/passkey-setup";
import { ChevronRight, Fingerprint } from "lucide-react";

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
        // ログイン済み（新規ユーザーがマジックリンク後にここへ来る）
        setEmail(data.user.email);
      } else {
        // 未ログイン: URLパラメータのメールを使用
        setEmail(emailParam || null);
      }
      setLoading(false);
    });
  }, [emailParam]);

  const handleSuccess = () => router.replace(redirect);
  const handleSkip = () => router.replace(redirect);

  if (loading) return null;

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-pink-500/10 rounded-full flex items-center justify-center border border-pink-500/20 shadow-[0_0_40px_rgba(236,72,153,0.2)]">
            <Fingerprint size={28} className="text-pink-500" />
          </div>
        </div>
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Passkey Setup
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          1秒でログイン
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          顔認証・指紋認証（パスキー）を登録すると<br />
          次回から1タップでログインできます
        </p>
      </div>

      <div className="space-y-3">
        {email ? (
          <PasskeySetup
            mode="register"
            email={email}
            onSuccess={handleSuccess}
          />
        ) : (
          <p className="text-center text-xs text-slate-600">
            メールアドレスが取得できませんでした
          </p>
        )}

        <button
          type="button"
          onClick={handleSkip}
          className="w-full flex items-center justify-center gap-1 h-12 text-xs text-slate-600 hover:text-slate-400 transition-colors font-bold uppercase tracking-widest"
        >
          あとで設定する <ChevronRight size={13} />
        </button>
      </div>
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
