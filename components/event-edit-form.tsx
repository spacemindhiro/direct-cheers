"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2 } from "lucide-react";

type EventEditFormProps = {
  eventId: string;
  defaultValues: {
    title: string;
    venue: string;
    start_at: string;
    end_at: string;
  };
};

export function EventEditForm({ eventId, defaultValues }: EventEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = fd.get("title") as string;
    const venue = fd.get("venue") as string;
    const start_at = fd.get("start_at") as string;
    const end_at = fd.get("end_at") as string;

    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, venue, start_at, end_at }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      router.push(`/dashboard/events/${eventId}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            イベントタイトル
          </label>
          <Input
            name="title"
            defaultValue={defaultValues.title}
            required
            className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            会場
          </label>
          <Input
            name="venue"
            defaultValue={defaultValues.venue}
            required
            className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              開始
            </label>
            <input
              name="start_at"
              type="datetime-local"
              defaultValue={defaultValues.start_at}
              required
              className="block w-full min-h-[3.5rem] bg-slate-950/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-white focus:border-pink-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              終了
            </label>
            <input
              name="end_at"
              type="datetime-local"
              defaultValue={defaultValues.end_at}
              required
              className="block w-full min-h-[3.5rem] bg-slate-950/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-white focus:border-pink-500 outline-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-400 font-bold">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-6 w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 size={20} className="animate-spin" /> : <>変更を保存 <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
