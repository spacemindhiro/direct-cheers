"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, MailCheck, CheckCircle2 } from "lucide-react";

type Step = "loading" | "landing" | "magic_sent" | "skipped" | "already_done";

function TouchpaySignupPageContent() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("loading");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // 既にログイン済み → その場で名寄せさせる
        await fetch(`/api/entrance/touchpay-signup/${ticketId}/reconcile`, { method: "POST" });
        setStep("already_done");
        return;
      }
      setStep("landing");
    })();
  }, [ticketId]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setPending(true);
    await fetch("/api/auth/send-magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, redirect: `/entrance/signup/${ticketId}/complete` }),
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
        <p className="text-sm text-slate-400">マイチケットからご確認いただけます</p>
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
