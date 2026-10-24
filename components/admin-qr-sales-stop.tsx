"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, OctagonX, Play } from "lucide-react";

// admin が QR の販売を止める・再開するボタン（app/api/admin/qr-sales-stop）。
// target が qr なら QR 1つ、event ならそのイベントの QR をまとめて。不正に気づいたときにその場で止めるため
export function AdminQrSalesStop({ target, id, stopped }: { target: "qr" | "event"; id: string; stopped: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scope = target === "qr" ? "この QR" : "このイベントの QR すべて";

  const run = (action: "stop" | "resume") => {
    const message = action === "stop"
      ? `${scope}の販売を止めます。止めている間はお客様が支払えなくなります。よろしいですか？`
      : `${scope}の販売を再開します。よろしいですか？`;
    if (!window.confirm(message)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/qr-sales-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, [target === "qr" ? "qr_config_id" : "event_id"]: id, note: note.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      setNote("");
      router.refresh();
    });
  };

  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-3">
      <p className="text-[10px] font-black text-red-400 tracking-[0.2em]">運営：販売の停止（{scope}）</p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="理由のメモ（記録に残ります・任意）"
        className="w-full h-11 bg-slate-950/50 border border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 outline-none focus:border-red-400"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run("stop")}
          disabled={isPending || (target === "qr" && stopped)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-xl text-xs font-black text-white"
        >
          {isPending ? <Loader2 size={12} className="animate-spin" /> : <OctagonX size={12} />} 販売を止める
        </button>
        <button
          type="button"
          onClick={() => run("resume")}
          disabled={isPending || (target === "qr" && !stopped)}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 rounded-xl text-xs font-black text-slate-200"
        >
          <Play size={12} /> 販売を再開する
        </button>
      </div>
      {error && <p className="text-xs font-bold text-red-400">{error}</p>}
    </div>
  );
}
