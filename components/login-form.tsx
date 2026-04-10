"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, ArrowRight, Mail, Lock } from "lucide-react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleLogin = (formData: FormData) => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    startTransition(async () => {
      setError(null);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError("メールアドレスまたはパスワードが正しくありません");
      } else {
        router.push("/dashboard");
      }
    });
  };

  return (
    <div className={cn("w-full space-y-8", className)} {...props}>

      {/* ヘッダー */}
      <div className="text-center space-y-2">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Member Login
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          Welcome Back
        </h1>
        <p className="text-sm text-slate-400">
          メールアドレスとパスワードでログイン
        </p>
      </div>

      {/* フォーム */}
      <form action={handleLogin} className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-5">

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Mail size={11} className="text-pink-500" /> Email
            </label>
            <Input
              name="email"
              type="email"
              placeholder="your@email.com"
              required
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <Lock size={11} className="text-pink-500" /> Password
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-[10px] text-slate-500 hover:text-pink-500 transition-colors font-bold uppercase tracking-wider"
              >
                パスワードを忘れた方
              </Link>
            </div>
            <Input
              name="password"
              type="password"
              placeholder="••••••••"
              required
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 font-bold text-center">{error}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <>ログイン <ArrowRight size={18} /></>
          )}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500">
        アカウントをお持ちでない方は{" "}
        <Link href="/auth/sign-up" className="text-pink-500 hover:text-pink-400 font-bold transition-colors">
          新規登録
        </Link>
      </p>

    </div>
  );
}
