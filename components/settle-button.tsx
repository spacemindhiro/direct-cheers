"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";

export function SettleButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [comment, setComment] = useState("");

  const handleApprove = async () => {
    if (!confirm("このイベントの精算を承認しますか？Stripe送金が実行されます。")) return;
    setApproveLoading(true);
    setError("");

    const res = await fetch(`/api/events/${eventId}/settle`, { method: "POST" });
    const data = await res.json();
    setApproveLoading(false);

    if (data.error) {
      setError(data.error);
    } else {
      setDone(true);
      router.refresh();
    }
  };

  const handleReject = async () => {
    if (!comment.trim()) {
      setError("差戻しコメントを入力してください");
      return;
    }
    setRejectLoading(true);
    setError("");

    const res = await fetch(`/api/events/${eventId}/evidence/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    });
    const data = await res.json();
    setRejectLoading(false);

    if (data.error) {
      setError(data.error);
    } else {
      setRejected(true);
      router.refresh();
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm font-black">
        <CheckCircle2 size={16} /> 精算完了
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="flex items-center gap-2 text-amber-400 text-sm font-black">
        <RotateCcw size={16} /> 差戻し済み
      </div>
    );
  }

  return (
    <div className="space-y-2 shrink-0">
      <div className="flex items-center gap-2">
        <button
          onClick={handleApprove}
          disabled={approveLoading || rejectLoading}
          className="h-9 px-4 bg-emerald-500 hover:brightness-110 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {approveLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          精算承認
        </button>
        <button
          onClick={() => { setShowRejectForm((v) => !v); setError(""); }}
          disabled={approveLoading || rejectLoading}
          className="h-9 px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          <RotateCcw size={13} />
          差戻し
        </button>
      </div>

      {showRejectForm && (
        <div className="bg-slate-800 rounded-xl p-3 space-y-2 w-64">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">差戻しコメント</p>
            <button onClick={() => { setShowRejectForm(false); setComment(""); setError(""); }}>
              <X size={12} className="text-slate-500 hover:text-slate-300" />
            </button>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="差戻し理由を入力してください"
            rows={3}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-amber-500/50"
          />
          <button
            onClick={handleReject}
            disabled={rejectLoading || !comment.trim()}
            className="w-full h-8 bg-amber-500 hover:brightness-110 text-white rounded-lg font-black text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {rejectLoading ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
            差戻し送信
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
