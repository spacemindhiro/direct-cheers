"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

export function EventDeleteButton({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleDelete = () => {
    if (!confirm("このイベントを削除しますか？この操作は取り消せません。")) return;
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "削除に失敗しました");
        return;
      }
      router.push("/dashboard/events");
    });
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="flex items-center gap-2 w-full px-5 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 rounded-2xl text-sm font-bold text-red-400 transition-all disabled:opacity-50"
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        このイベントを削除する
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
