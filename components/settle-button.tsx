"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, X, Zap, Banknote } from "lucide-react";
import { useRouter } from "next/navigation";

// 開催承認（PaymentIntentのキャプチャのみ）と送金（全決済が照合済みであれば
// Stripe送金を実行）は別操作。照合(reconciled_at)はキャプチャ後のStripe実
// チャージ情報が無いと成立しないため、開催承認→（cron/管理者による）照合→
// 送金、という順で必ず進む。送金を先に押しても、未照合が残っていればエラー
// メッセージが出るだけで実際には何も送金されない。
export function SettleButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [captureLoading, setCaptureLoading] = useState(false);
  const [settleLoading, setSettleLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [settleError, setSettleError] = useState("");
  const [error, setError] = useState("");
  const [captureDone, setCaptureDone] = useState(false);
  const [done, setDone] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [comment, setComment] = useState("");

  const handleCapture = async () => {
    if (!confirm("このイベントを開催承認しますか？決済のキャプチャ（与信枠から実際の売上への確定）を行います。送金はこの後、照合完了後に別途実行します。")) return;
    setCaptureLoading(true);
    setCaptureError("");

    const res = await fetch(`/api/admin/events/${eventId}/capture-all`, { method: "POST" });
    const data = await res.json();
    setCaptureLoading(false);

    if (!res.ok || data.error) {
      setCaptureError(data.error ?? "キャプチャに失敗しました");
    } else {
      setCaptureDone(true);
      router.refresh();
    }
  };

  const handleSettle = async () => {
    if (!confirm("送金を実行しますか？全決済が照合済みでなければ中断され、送金は行われません。")) return;
    setSettleLoading(true);
    setSettleError("");

    const res = await fetch(`/api/events/${eventId}/settle`, { method: "POST" });
    const data = await res.json();
    setSettleLoading(false);

    if (!res.ok || data.error) {
      setSettleError(data.error ?? "送金に失敗しました");
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
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button
          onClick={handleCapture}
          disabled={captureLoading || settleLoading || rejectLoading}
          className="h-9 px-4 bg-sky-500 hover:brightness-110 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {captureLoading ? <Loader2 size={13} className="animate-spin" /> : captureDone ? <CheckCircle2 size={13} /> : <Zap size={13} />}
          開催承認
        </button>
        <button
          onClick={handleSettle}
          disabled={captureLoading || settleLoading || rejectLoading}
          className="h-9 px-4 bg-emerald-500 hover:brightness-110 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {settleLoading ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />}
          送金実行
        </button>
        <button
          onClick={() => { setShowRejectForm((v) => !v); setError(""); }}
          disabled={captureLoading || settleLoading || rejectLoading}
          className="h-9 px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          <RotateCcw size={13} />
          差戻し
        </button>
      </div>

      {showRejectForm && (
        <div className="bg-slate-800 rounded-xl p-3 space-y-2 w-64 ml-auto">
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

      {captureError && <p className="text-xs text-red-400 text-right">開催承認: {captureError}</p>}
      {settleError && <p className="text-xs text-red-400 text-right">送金: {settleError}</p>}
      {error && <p className="text-xs text-red-400 text-right">{error}</p>}
    </div>
  );
}
