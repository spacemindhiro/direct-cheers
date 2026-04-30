"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { PasskeySetup } from "@/components/passkey-setup";
import { Loader2, ArrowRight, Lock, CheckCircle2, Ticket } from "lucide-react";

type Step = "loading" | "landing" | "email" | "login" | "signup" | "redeeming" | "done" | "error";

function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("loading");
  const [eventInfo, setEventInfo] = useState<{ title: string; start_at: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);

  // コード情報取得 + ログイン済みなら即引き換え
  useEffect(() => {
    (async () => {
      const [infoRes, { data: { user } }] = await Promise.all([
        fetch(`/api/invite/${code}/info`),
        supabase.auth.getUser(),
      ]);

      if (!infoRes.ok) {
        const json = await infoRes.json();
        setErrorMsg(json.error ?? "無効な招待コードです");
        setStep("error");
        return;
      }

      const { event } = await infoRes.json();
      setEventInfo(event);

      if (user) {
        await redeem();
      } else {
        setStep("landing");
      }
    })();
  }, []);

  const redeem = async () => {
    setStep("redeeming");
    const res = await fetch(`/api/invite/${code}/redeem`, { method: "POST" });
    if (res.ok) {
      setStep("done");
      setTimeout(() => router.replace("/dashboard"), 1500);
    } else {
      const json = await res.json();
      setErrorMsg(json.error ?? "引き換えに失敗しました");
      setStep("error");
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
    const { exists } = await res.json();
    setPending(false);
    setStep(exists ? "login" : "signup");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) { setErrorMsg(error.message); return; }
    await redeem();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setErrorMsg("パスワードが一致しません"); return; }
    if (password.length < 8) { setErrorMsg("パスワードは8文字以上で設定してください"); return; }
    setPending(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/join/${code}`,
        data: { skip_onboarding: true },
      },
    });
    setPending(false);
    if (error) { setErrorMsg(error.message); return; }
    // メール確認待ち画面へ
    router.push(`/auth/sign-up-success?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(`/join/${code}`)}`);
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric",
  });

  if (step === "loading" || step === "redeeming") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Loader2 className="animate-spin text-pink-500" size={32} />
        <p className="text-sm text-slate-400 font-bold">
          {step === "redeeming" ? "チケットを受け取っています..." : "読み込み中..."}
        </p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <CheckCircle2 className="text-emerald-400" size={48} />
        <p className="text-lg font-black text-white">チケットを受け取りました！</p>
        <p className="text-sm text-slate-400">ダッシュボードへ移動します...</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="text-lg font-black text-red-400">{errorMsg}</p>
        <Link href="/" className="text-sm text-slate-500 hover:text-pink-500 transition-colors font-bold">
          トップへ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-8">

      {/* イベント情報 */}
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center border border-indigo-500/20">
            <Ticket size={28} className="text-indigo-400" />
          </div>
        </div>
        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Invitation</p>
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
          {eventInfo?.title ?? "イベント"}
        </h1>
        {eventInfo?.start_at && (
          <p className="text-sm text-slate-400">{fmt(eventInfo.start_at)}</p>
        )}
        <p className="text-sm text-slate-500 pt-1">招待チケットが届いています</p>
      </div>

      {/* パスキー */}
      <PasskeySetup
        mode="authenticate"
        buttonLabel="パスキーでログインして受け取る"
        onSuccess={redeem}
      />

      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-xs text-slate-600 font-bold">または</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      {/* メールアドレス入力 */}
      {step === "landing" || step === "email" ? (
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="メールアドレスを入力"
            required
            className="h-14 bg-slate-900 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <button
            type="submit"
            disabled={pending || !email}
            className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <>続ける <ArrowRight size={16} /></>}
          </button>
        </form>
      ) : step === "login" ? (
        <form onSubmit={handleLogin} className="space-y-4">
          <p className="text-xs text-slate-400 text-center">登録済みのアカウントでログインしてください</p>
          <Input
            type="email"
            value={email}
            readOnly
            className="h-14 bg-slate-900 border-slate-700 rounded-2xl px-5 text-sm text-slate-400 opacity-60"
          />
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="パスワード"
            required
            autoFocus
            className="h-14 bg-slate-900 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {errorMsg && <p className="text-xs text-red-400 font-bold text-center">{errorMsg}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <><Lock size={15} /> ログインして受け取る</>}
          </button>
          <button type="button" onClick={() => { setStep("landing"); setErrorMsg(""); }} className="w-full text-xs text-slate-600 hover:text-slate-400 font-bold transition-colors">
            メールアドレスを変更する
          </button>
        </form>
      ) : step === "signup" ? (
        <form onSubmit={handleSignUp} className="space-y-4">
          <p className="text-xs text-slate-400 text-center">アカウントを作成してチケットを受け取ります</p>
          <Input
            type="email"
            value={email}
            readOnly
            className="h-14 bg-slate-900 border-slate-700 rounded-2xl px-5 text-sm text-slate-400 opacity-60"
          />
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="パスワード（8文字以上）"
            required
            autoFocus
            className="h-14 bg-slate-900 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="パスワードを再入力"
            required
            className="h-14 bg-slate-900 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {errorMsg && <p className="text-xs text-red-400 font-bold text-center">{errorMsg}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <>登録してチケットを受け取る <ArrowRight size={16} /></>}
          </button>
          <button type="button" onClick={() => { setStep("landing"); setErrorMsg(""); }} className="w-full text-xs text-slate-600 hover:text-slate-400 font-bold transition-colors">
            メールアドレスを変更する
          </button>
        </form>
      ) : null}

    </div>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-950 font-sans flex flex-col">
      <div className="px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <img src="/logo-emblem.png" alt="Direct Cheers" className="w-7 h-7 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform" />
          <span className="text-base font-black tracking-tighter text-white uppercase italic">Direct Cheers</span>
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <Suspense fallback={<Loader2 className="animate-spin text-slate-600" size={32} />}>
          <InvitePage />
        </Suspense>
      </div>
    </div>
  );
}
