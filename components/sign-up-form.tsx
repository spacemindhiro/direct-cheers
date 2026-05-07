"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, ArrowRight, Mail, Lock } from "lucide-react";

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const emailLock = searchParams.get("email") ?? "";

  const handleSignUp = (formData: FormData) => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const repeatPassword = formData.get("repeat-password") as string;

    if (password !== repeatPassword) {
      setError("パスワードが一致しません");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で設定してください");
      return;
    }

    startTransition(async () => {
      setError(null);
      const supabase = createClient();
      // emailRedirectTo は PKCE フロー用（token_hash テンプレートでは使われない）
      // redirect 先は user_metadata にも保存し token_hash フローでも復元できるようにする
      const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
      callbackUrl.searchParams.set("redirect", redirectTo ?? "/dashboard");
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: callbackUrl.toString(),
          data: redirectTo ? { post_auth_redirect: redirectTo } : {},
        },
      });
      if (error) {
        setError(error.message);
      } else {
        const successUrl = `/auth/sign-up-success?email=${encodeURIComponent(email)}`;
        router.push(redirectTo ? `${successUrl}&redirect=${encodeURIComponent(redirectTo)}` : successUrl);
      }
    });
  };

  return (
    <div className={cn("w-full space-y-8", className)} {...props}>

      {/* ヘッダー */}
      <div className="text-center space-y-2">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Create Account
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          Join Us
        </h1>
        <p className="text-sm text-slate-400">
          メールアドレスで無料登録
        </p>
      </div>

      {/* フォーム */}
      <form action={handleSignUp} className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-5">

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Mail size={11} className="text-pink-500" /> Email
            </label>
            <Input
              name="email"
              type="email"
              placeholder="your@email.com"
              defaultValue={emailLock}
              readOnly={!!emailLock}
              required
              className={`h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0 ${emailLock ? "opacity-60 cursor-not-allowed" : ""}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Lock size={11} className="text-pink-500" /> Password
            </label>
            <Input
              name="password"
              type="password"
              placeholder="8文字以上"
              required
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Lock size={11} className="text-pink-500" /> Confirm Password
            </label>
            <Input
              name="repeat-password"
              type="password"
              placeholder="パスワードを再入力"
              required
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 font-bold text-center">{error}</p>
          )}

          <p className="text-[10px] text-slate-600 leading-relaxed text-center">
            登録することで
            <Link href="/terms" className="text-slate-500 hover:text-pink-500 transition-colors">利用規約</Link>
            および
            <Link href="/privacy" className="text-slate-500 hover:text-pink-500 transition-colors">プライバシーポリシー</Link>
            に同意したものとみなします
          </p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <>登録する <ArrowRight size={18} /></>
          )}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500">
        すでにアカウントをお持ちの方は{" "}
        <Link href="/auth/login" className="text-pink-500 hover:text-pink-400 font-bold transition-colors">
          ログイン
        </Link>
      </p>

    </div>
  );
}
