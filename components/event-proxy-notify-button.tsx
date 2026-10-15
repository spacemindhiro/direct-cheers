"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2 } from "lucide-react";
import { fmtDateTime } from "@/lib/display-tz";

// 担当エージェント：下書きを主催者に送る（確認依頼の通知＋メール）
export function EventProxyNotifyButton({
  eventId,
  lastSentAt,
}: {
  eventId: string;
  lastSentAt: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSend = () => {
    if (!confirm("主催者にメールで確認依頼を送ります。よろしいですか？")) return;
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/events/${eventId}/proxy-notify`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/40 rounded-[1.5rem] px-5 py-4 space-y-3">
      <p className="text-sm text-slate-200 leading-relaxed">
        {lastSentAt
          ? `主催者に確認を依頼済みです（${fmtDateTime(lastSentAt, { dateStyle: "short", timeStyle: "short" })}）。主催者が承認依頼を送ると、承認できるようになります。`
          : "この下書きは、まだ主催者に届いていません。内容が整ったら、下のボタンで主催者に確認を依頼してください。"}
      </p>
      <button
        onClick={handleSend}
        disabled={isPending}
        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
          lastSentAt
            ? "bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
            : "bg-amber-500 hover:bg-amber-400 text-slate-950"
        }`}
      >
        {isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        {lastSentAt ? "もう一度送る" : "主催者に確認を依頼する"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
