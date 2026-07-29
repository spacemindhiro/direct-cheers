"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { PasskeySetup } from "@/components/passkey-setup";
import { Loader2, ArrowRight, CheckCircle2, Ticket, Send, MailCheck } from "lucide-react";

type Step = "loading" | "landing" | "magic_sent" | "redeeming" | "done" | "error";

// Facebook/Instagram/LINE等のアプリ内ブラウザ(WebView)はパスキーが機能しない、
// または端末のキーチェーンと連携しないことがあり、押しても無言で失敗する
// (実際に本番で遭遇した不具合)。UAから検知して案内する。
function detectInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /FBAN|FBAV|Instagram|Line\//i.test(navigator.userAgent);
}

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

function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("loading");
  const [eventInfo, setEventInfo] = useState<{ title: string; start_at: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  useEffect(() => {
    setIsInAppBrowser(detectInAppBrowser());
  }, []);

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

  const signInWithGoogle = async () => {
    if (googlePending) return;
    setGooglePending(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(`/join/${code}`)}`,
      },
    });
    // Googleにリダイレクトするのでpendingのまま
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setPending(true);
    await supabase.auth.signInWithOtp({
      email,
      options: {
        data: {
          skip_onboarding: true,
          post_auth_redirect: `/join/${code}`,
        },
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

      {/* アプリ内ブラウザ案内: パスキーが機能しないため、代わりの方法へ誘導する */}
      {isInAppBrowser && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-xs text-amber-300 leading-relaxed">
          アプリ内のブラウザで開いているため、パスキーがご利用いただけない場合があります。メニューから外部ブラウザで開き直すか、下のGoogleログイン・メールアドレスをお使いください。
        </div>
      )}

      {/* パスキー（既存ユーザー向け。emailを入力済みならそのアカウントのパスキーで
          スコープする。空のままでも試せるが、この端末に該当パスキーが無い場合は
          エラーになる） */}
      {!isInAppBrowser && (
        <PasskeySetup
          mode="authenticate"
          email={email || undefined}
          buttonLabel="パスキーでログインして受け取る"
          onSuccess={() => window.location.replace(window.location.href)}
        />
      )}

      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-xs text-slate-600 font-bold">または</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      {/* Google（新規・既存どちらでも使える） */}
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
