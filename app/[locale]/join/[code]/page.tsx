"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { PasskeySetup } from "@/components/passkey-setup";
import { Loader2, ArrowRight, CheckCircle2, Ticket, Send, MailCheck } from "lucide-react";

type Step = "loading" | "landing" | "magic_sent" | "redeeming" | "done" | "error";

function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("loading");
  const [eventInfo, setEventInfo] = useState<{ title: string; start_at: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

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

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setPending(true);
    const callbackUrl = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(`/join/${code}`)}`;
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl,
        data: { skip_onboarding: true },
      },
    });
    setPending(false);
    setStep("magic_sent");
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

  if (step === "magic_sent") {
    return (
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-pink-500/10 rounded-full flex items-center justify-center border border-pink-500/20 shadow-[0_0_30px_rgba(236,72,153,0.15)]">
            <MailCheck size={28} className="text-pink-500" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Check Your Email</p>
          <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">メールを確認</h2>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-3">
          <p className="text-slate-300 text-sm font-bold">ログインリンクを送りました</p>
          <p className="text-pink-400 font-black text-sm break-all">{email}</p>
          <p className="text-slate-500 text-xs leading-relaxed">
            メール内のリンクをタップするとチケットが自動的に受け取られます。<br />
            届かない場合は迷惑メールフォルダをご確認ください。
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setStep("landing"); setEmail(""); }}
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors font-bold uppercase tracking-widest"
        >
          やり直す
        </button>
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
        onSuccess={() => window.location.replace(window.location.href)}
      />

      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-xs text-slate-600 font-bold">または</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      {/* マジックリンク */}
      <form onSubmit={handleSendMagicLink} className="space-y-4">
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
          {pending
            ? <Loader2 size={16} className="animate-spin" />
            : <><Send size={15} /> ログインリンクを送る</>
          }
        </button>
        <p className="text-[10px] text-slate-600 text-center leading-relaxed">
          初めての方はこのままアカウント作成。すでにお持ちの方はそのままログインできます。
        </p>
      </form>

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
