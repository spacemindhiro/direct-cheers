"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2 } from "lucide-react";

export function EventRequestReviewButton({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleRequest = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/events/${eventId}/request-review`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleRequest}
        disabled={isPending}
        className="flex items-center gap-2 px-6 py-3 bg-pink-500 hover:bg-pink-400 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        エージェントに承認依頼を送る
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
