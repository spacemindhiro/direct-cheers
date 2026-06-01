"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Loader2, Mail, Send, MailCheck } from "lucide-react";
import type { PasskeySetup as PasskeySetupType } from "@/components/passkey-setup";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [emailValue, setEmailValue] = useState("");
  const [emailHint, setEmailHint] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicPending, setMagicPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
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

  const signInWithGoogle = async () => {
    if (googlePending) return;
    setGooglePending(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
      },
    });
    // Googleにリダイレクトするのでpendingのまま
  };

  const sendMagicLink = async () => {
    if (!email || magicPending) return;
    setMagicPending(true);
    const supabase = createClient();
    // token_hash フロー: emailRedirectTo の代わりに user_metadata 経由でリダイレクト先を伝える。
    // メールテンプレートが {{ .TokenHash }} を使用するため、別ブラウザ・別端末でも開けるようになる。
    await supabase.auth.signInWithOtp({
      email,
      options: {
        data: { post_auth_redirect: redirectTo },
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

      {/* パスキー（メインログイン手段） */}
      {PasskeySetup && (
        <div className="space-y-2">
          <PasskeySetup
            mode="authenticate"
            email={email || undefined}
            onSuccess={() => window.location.replace(redirectTo)}
          />
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-xs text-slate-600 font-bold">または</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      {/* Google（初回サインイン向け） */}
      <div className="space-y-2">
        <p className="text-center text-[10px] text-slate-500 uppercase tracking-[0.3em] font-bold">
          はじめての方
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={googlePending}
          className="w-full h-14 bg-white text-slate-800 rounded-2xl font-black text-sm flex items-center justify-center gap-3 hover:bg-slate-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {googlePending
            ? <Loader2 size={18} className="animate-spin text-slate-600" />
            : <><GoogleIcon /> Googleでサインイン</>
          }
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs text-slate-600 font-bold">または</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
        <p className="text-center text-[10px] text-slate-500">
          メールアドレスでログイン / 新規登録
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
