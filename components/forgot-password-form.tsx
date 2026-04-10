"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, ArrowRight, Mail, MailCheck } from "lucide-react";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleForgotPassword = (formData: FormData) => {
    const email = formData.get("email") as string;

    startTransition(async () => {
      setError(null);
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      if (error) {
        setError("メールの送信に失敗しました。アドレスをご確認ください。");
      } else {
        setSentEmail(email);
        setSuccess(true);
      }
    });
  };

  if (success) {
    return (
      <div className={cn("w-full space-y-8 text-center", className)} {...props}>
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-pink-500/10 rounded-full flex items-center justify-center border border-pink-500/20 shadow-[0_0_40px_rgba(236,72,153,0.2)]">
            <MailCheck className="text-pink-500" size={36} />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Check Your Email</p>
          <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">メールを送信しました</h1>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-4">
          <p className="text-slate-400 text-sm">以下のアドレスにパスワードリセットのメールを送りました。</p>
          <div className="bg-slate-950/60 border border-pink-500/20 rounded-2xl px-6 py-4">
            <p className="text-pink-400 font-black text-base tracking-tight break-all">{sentEmail}</p>
          </div>
          <p className="text-slate-600 text-xs">メールが届かない場合は迷惑メールフォルダをご確認ください。</p>
        </div>
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 text-xs text-slate-600 hover:text-pink-500 transition-colors font-bold uppercase tracking-widest"
        >
          ログインページへ <ArrowRight size={13} />
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("w-full space-y-8", className)} {...props}>
      <div className="text-center space-y-2">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Password Reset</p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">パスワードをお忘れですか？</h1>
        <p className="text-sm text-slate-400">登録済みのメールアドレスを入力してください</p>
      </div>

      <form action={handleForgotPassword} className="space-y-4">
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
          {error && <p className="text-sm text-red-400 font-bold text-center">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 size={20} className="animate-spin" /> : <>リセットメールを送る <ArrowRight size={18} /></>}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500">
        パスワードを思い出した方は{" "}
        <Link href="/auth/login" className="text-pink-500 hover:text-pink-400 font-bold transition-colors">
          ログイン
        </Link>
      </p>
    </div>
  );
}
