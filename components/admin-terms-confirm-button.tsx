'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Loader2, Clock } from 'lucide-react';

export function AdminTermsConfirmButton({ profileId }: { profileId: string }) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleConfirm = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/admin/terms/confirm/${profileId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'エラーが発生しました');
        return;
      }
      setDone(true);
      router.refresh();
    });
  };

  if (done) {
    return (
      <span className="flex items-center gap-1.5 text-indigo-400 text-xs font-black uppercase tracking-widest">
        <ShieldCheck size={14} /> 規約承認済み
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleConfirm}
        disabled={isPending}
        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
        面談完了・規約承認
      </button>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
