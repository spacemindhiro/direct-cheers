"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Loader2, Mail, Send, MailCheck } from "lucide-react";
import type { PasskeySetup as PasskeySetupType } from "@/components/passkey-setup";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [emailValue, setEmailValue] = useState("");
  const [emailHint, setEmailHint] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicPending, setMagicPending] = useState(false);
  const [PasskeySetup, setPasskeySetup] = useState<typeof PasskeySetupType | null>(null);
  const [redirectTo, setRedirectTo] = useState("/dashboard");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setRedirectTo(p.get("redirect") || "/dashboard");
    setEmailHint(p.get("email") ?? "");
  }, []);

  useEffect(() => {
    import("@/components/passkey-setup")
      .then(m => setPasskeySetup(() => m.PasskeySetup))
      .catch(() => {});
  }, []);

  const email = emailValue || emailHint;

  const sendMagicLink = async () => {
    if (!email || magicPending) return;
    setMagicPending(true);
    const supabase = createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
      },
    });
    setMagicPending(false);
    setMagicSent(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") sendMagicLink();
  };

  if (magicSent) {
    return (
      <div className={cn("w-full space-y-8", className)} {...props}>
        <div className="text-center space-y-2">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Check Your Email</p>
          <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
            メールを確認
          </h1>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-5 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-pink-500/10 rounded-full flex items-center justify-center border border-pink-500/20 shadow-[0_0_30px_rgba(236,72,153,0.15)]">
              <MailCheck size={28} className="text-pink-500" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-slate-300 text-sm font-bold">ログインリンクを送りました</p>
            <p className="text-pink-400 font-black text-sm break-all">{email}</p>
          </div>
          <p className="text-slate-500 text-xs leading-relaxed">
            メール内のリンクをタップするとログインします。<br />
            届かない場合は迷惑メールフォルダをご確認ください。
          </p>
        </div>

        <button
          type="button"
          onClick={() => { setMagicSent(false); setEmailValue(""); }}
          className="w-full text-center text-xs text-slate-600 hover:text-slate-400 transition-colors font-bold uppercase tracking-widest"
        >
          やり直す
        </button>
      </div>
    );
  }

  return (
    <div className={cn("w-full space-y-8", className)} {...props}>

      {/* ヘッダー */}
      <div className="text-center space-y-2">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Member Access
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          Welcome
        </h1>
        <p className="text-sm text-slate-400">
          ログイン / 新規登録
        </p>
      </div>

      {/* パスキー（登録済みの方向け） */}
      {PasskeySetup && (
        <div className="space-y-2">
          <p className="text-center text-[10px] text-slate-500 uppercase tracking-[0.3em] font-bold">
            パスキー登録済みの方
          </p>
          <PasskeySetup
            mode="authenticate"
            email={email || undefined}
            onSuccess={() => window.location.replace(redirectTo)}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs text-slate-600 font-bold">または</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
        <p className="text-center text-[10px] text-slate-500">
          はじめての方・メールでログインの方はメールアドレスを入力してください
        </p>
      </div>

      {/* マジックリンク */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-5">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
            <Mail size={11} className="text-pink-500" /> Email
          </label>
          <Input
            type="email"
            placeholder="your@email.com"
            value={emailValue || emailHint}
            onChange={e => setEmailValue(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <p className="text-[10px] text-slate-600 leading-relaxed text-center">
          初めての方はこのままアカウント作成。すでにお持ちの方はそのままログインできます。
        </p>
      </div>

      <button
        type="button"
        onClick={sendMagicLink}
        disabled={!email || magicPending}
        className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {magicPending
          ? <Loader2 size={20} className="animate-spin" />
          : <><Send size={16} /> ログインリンクを送る</>
        }
      </button>

    </div>
  );
}
