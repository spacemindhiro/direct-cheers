"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PasskeySetup } from "@/components/passkey-setup";
import { ChevronRight } from "lucide-react";

function PasskeySetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/onboarding/profile";

  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setLoading(false);
    });
  }, []);

  const handleSuccess = () => router.replace(redirect);
  const handleSkip = () => router.replace(redirect);

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="text-center space-y-2">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Secure Your Account
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          パスキー登録
        </h1>
        <p className="text-sm text-slate-400">
          顔認証・指紋認証でかんたんにログインできます
        </p>
      </div>

      {!loading && email && (
        <PasskeySetup
          mode="register"
          email={email}
          onSuccess={handleSuccess}
        />
      )}

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
