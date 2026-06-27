import { Suspense } from "react";
import { LinkSetupForm } from "@/components/link-setup-form";
import { getUser } from "@/lib/supabase/server";
import { Zap, Loader2 } from "lucide-react";
import Link from "next/link";

async function LinkSetupContent() {
  const user = await getUser();

  return (
    <div className="max-w-md mx-auto px-6 py-12 space-y-8">

      <div className="space-y-1">
        {user ? (
          <Link href="/dashboard" className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-pink-500 transition-colors">
            ← ダッシュボード
          </Link>
        ) : (
          <Link href="/" className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-pink-500 transition-colors">
            ← トップへ
          </Link>
        )}
      </div>

      <div className="space-y-3">
        <div className="w-12 h-12 bg-pink-500/10 rounded-2xl flex items-center justify-center border border-pink-500/20">
          <Zap size={22} className="text-pink-400" />
        </div>
        <div>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Stripe Link</p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter mt-1">
            カードを登録する
          </h1>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          カードを登録しておくと、イベント当日はメールアドレスだけでワンタッチ決済できます。今すぐ登録して当日をスムーズに。
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-6">
        <LinkSetupForm userEmail={user?.email ?? null} />
      </div>

    </div>
  );
}

export default function LinkSetupPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Suspense fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-600" size={28} />
        </div>
      }>
        <LinkSetupContent />
      </Suspense>
    </div>
  );
}
