"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Loader2, Check, X } from "lucide-react";

export function QREditDelete({
  qrConfigId,
  eventId,
  currentLabel,
}: {
  qrConfigId: string;
  eventId: string;
  currentLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(currentLabel);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/qr/${qrConfigId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!confirm("このQRコードを削除しますか？削除すると決済リンクが無効になります。")) return;
    startTransition(async () => {
      const res = await fetch(`/api/qr/${qrConfigId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "削除に失敗しました");
        return;
      }
      router.push(`/dashboard/events/${eventId}`);
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-4">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">QR 管理</p>

      {/* ラベル編集 */}
      {editing ? (
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            ラベル
          </label>
          <div className="flex items-center gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="例: DJ ブース用"
              autoFocus
              className="flex-1 h-12 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="w-10 h-10 flex items-center justify-center bg-pink-500 hover:bg-pink-400 rounded-xl text-white transition-all disabled:opacity-50"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setLabel(currentLabel); }}
              className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 transition-all"
            >
              <X size={14} />
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-2 w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-bold text-slate-300 transition-all text-left"
        >
          <Pencil size={14} className="text-slate-500 shrink-0" />
          ラベルを編集
        </button>
      )}

      {/* 削除 */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="flex items-center gap-2 w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-sm font-bold text-red-400 transition-all disabled:opacity-50"
      >
        <Trash2 size={14} className="shrink-0" />
        このQRコードを削除
      </button>
    </div>
  );
}
