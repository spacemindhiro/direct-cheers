"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2 } from "lucide-react";

export function AdminApproveButton({ profileId }: { profileId: string }) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleApprove = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/admin/users/${profileId}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      setDone(true);
      router.refresh();
    });
  };

  if (done) {
    return (
      <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-black uppercase tracking-widest">
        <CheckCircle size={14} /> 承認済み
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleApprove}
        disabled={isPending}
        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
        承認
      </button>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
