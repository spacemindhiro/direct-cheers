"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Loader2, ArrowRight, Mail, Lock, Send, CheckCircle2 } from "lucide-react";
import type { PasskeySetup as PasskeySetupType } from "@/components/passkey-setup";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicPending, setMagicPending] = useState(false);
  const [PasskeySetup, setPasskeySetup] = useState<typeof PasskeySetupType | null>(null);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState("");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setRedirectTo(p.get("redirect"));
    setEmailHint(p.get("email") ?? "");
  }, []);

  useEffect(() => {
    import("@/components/passkey-setup")
      .then(m => setPasskeySetup(() => m.PasskeySetup))
      .catch(() => {}); // 読み込めなくてもフォームには影響しない
  }, []);

  const handleMagicLink = async () => {
    const email = emailValue || emailHint;
    if (!email) return;
    setMagicPending(true);
    const supabase = createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}` },
    });
    setMagicPending(false);
    setMagicSent(true);
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    setIsPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "ログインに失敗しました");
        setShowForgot(true);
      } else {
        // DEBUG: クッキーの状態を確認
        const cookieCount = document.cookie.split(";").filter(c => c.trim().startsWith("sb-")).length;
        setError(`✓ ログインOK / クッキー: ${cookieCount}件 / 遷移先: ${redirectTo ?? "/dashboard"} — この表示が見えたらクロに教えてください`);
        setTimeout(() => {
          window.location.replace(redirectTo ?? "/dashboard");
        }, 5000);
      }
    } catch (err: any) {
      setError(err?.message ?? "ログインに失敗しました");
    } finally {
      setIsPending(false);
    }
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
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-5">

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Mail size={11} className="text-pink-500" /> Email
            </label>
            <Input
              name="email"
              type="email"
              placeholder="your@email.com"
              value={emailValue || emailHint}
              onChange={e => setEmailValue(e.target.value)}
              required
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <Lock size={11} className="text-pink-500" /> Password
              </label>
              {showForgot && (
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-pink-500 hover:text-pink-400 transition-colors font-bold"
                >
                  パスワードをお忘れですか？
                </Link>
              )}
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

      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-xs text-slate-600 font-bold">または</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      {PasskeySetup && <PasskeySetup
        mode="authenticate"
        email={emailValue || emailHint}
        onSuccess={() => window.location.replace(redirectTo ?? "/dashboard")}
      />}

      {/* マジックリンク（別デバイス・パスキー未登録端末向け） */}
      {magicSent ? (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-400 font-bold">ログインリンクを送りました</p>
        </div>
      ) : (
        <button
          type="button"
          disabled={!(emailValue || emailHint) || magicPending}
          onClick={handleMagicLink}
          className="w-full flex items-center justify-center gap-2 h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl text-sm text-slate-300 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {magicPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
          メールでログインリンクを受け取る
        </button>
      )}

      <p className="text-center text-sm text-slate-500">
        アカウントをお持ちでない方は{" "}
        <Link href="/auth/sign-up" className="text-pink-500 hover:text-pink-400 font-bold transition-colors">
          新規登録
        </Link>
      </p>

    </div>
  );
}
