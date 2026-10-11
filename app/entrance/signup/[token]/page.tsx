"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, MailCheck, CheckCircle2 } from "lucide-react";

type Step = "loading" | "landing" | "magic_sent" | "skipped" | "already_done" | "failed";

// token: 子機のサインアップQRに載る使い切りの合言葉（最初に開いたブラウザ専用・30日有効。
// lib/touchpay-signup-token.ts）。以前はチケットIDそのものを載せていた。
function TouchpaySignupPageContent() {
  const { token } = useParams<{ token: string }>();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("loading");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    (async () => {
      // 最初に開いたブラウザ専用にする（後から別の端末で開いた人は使えない）
      const open = await fetch(`/api/entrance/touchpay-signup/${token}/open`, { method: "POST" });
      if (!open.ok) {
        const data = await open.json().catch(() => ({}));
        setFailure(data.error ?? "このQRコードは無効です。");
        setStep("failed");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // 既にログイン済み → その場で名寄せさせる
        const res = await fetch(`/api/entrance/touchpay-signup/${token}/reconcile`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setTicketId(data.ticket_id ?? null);
          setStep("already_done");
        } else {
          setFailure(data.error ?? "このQRコードは無効です。");
          setStep("failed");
        }
        return;
      }
      setStep("landing");
    })();
  }, [token]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setPending(true);
    // ログインリンクは別ブラウザで開かれうるので、戻ってきた人をこのメールで照合できるようにしておく
    const bind = await fetch(`/api/entrance/touchpay-signup/${token}/bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!bind.ok) {
      const data = await bind.json().catch(() => ({}));
      setPending(false);
      setFailure(data.error ?? "このQRコードは無効です。");
      setStep("failed");
      return;
    }
    await fetch("/api/auth/send-magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, redirect: `/entrance/signup/${token}/complete` }),
    });
    setPending(false);
    setStep("magic_sent");
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={28} className="text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (step === "already_done") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <CheckCircle2 size={44} className="text-emerald-400" />
        <p className="text-lg font-black text-white">アカウントに紐付けました</p>
        <p className="text-sm text-slate-400">今日の入場チケットはマイチケットからいつでも確認できます</p>
        <Link
          href={ticketId ? `/tickets#ticket-${ticketId}` : "/tickets"}
          className="w-full max-w-xs h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center mt-2"
        >
          マイチケットを見る
        </Link>
      </div>
    );
  }

  if (step === "magic_sent") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <MailCheck size={44} className="text-indigo-400" />
        <p className="text-lg font-black text-white">メールを確認してください</p>
        <p className="text-sm text-slate-400">届いたリンクを開くとサインアップが完了します</p>
      </div>
    );
  }

  if (step === "failed") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-black text-white">サインアップできませんでした</p>
        <p className="text-sm text-slate-400 max-w-sm">{failure}</p>
        <p className="text-xs text-slate-600">入場は完了しています</p>
      </div>
    );
  }

  if (step === "skipped") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <CheckCircle2 size={44} className="text-emerald-400" />
        <p className="text-lg font-black text-white">ご来場ありがとうございました</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-6">
      <div className="max-w-sm w-full space-y-6 text-center">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Direct Cheers</p>
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">ご購入ありがとうございます</h1>
        <p className="text-sm text-slate-400">サインアップすると、次回以降の決済がよりスムーズになります（任意）</p>

        <form onSubmit={handleSendMagicLink} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoFocus
            className="w-full h-12 bg-slate-900 border border-slate-700 focus:border-indigo-500/50 rounded-2xl px-4 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={pending || !email}
            className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : "サインアップ"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setStep("skipped")}
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          スキップする（入場は完了しています）
        </button>
      </div>
    </div>
  );
}

export default function TouchpaySignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={28} className="text-indigo-400 animate-spin" />
      </div>
    }>
      <TouchpaySignupPageContent />
    </Suspense>
  );
}
