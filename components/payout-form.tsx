"use client";

import { useState } from "react";
import { Loader2, ArrowDownToLine, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  available: number;
  transferFee: number;
};

export function PayoutForm({ available, transferFee }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState(available);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const net = amount - transferFee;
  const canSubmit = amount > transferFee && amount <= available && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: amount }),
    });
    const data = await res.json();

    setLoading(false);
    if (data.error) {
      setError(data.error);
    } else {
      setSuccess(true);
      router.refresh();
    }
  };

  if (success) {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-5 text-center space-y-2">
        <p className="font-black text-green-400">出金申請を受け付けました</p>
        <p className="text-xs text-slate-500">振込完了まで数営業日かかります</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">出金額</p>
          <p className="text-3xl font-black text-white italic tracking-tighter">
            ¥{amount.toLocaleString()}
          </p>
        </div>
        <input
          type="range"
          min={transferFee + 1}
          max={available}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full accent-pink-500"
          disabled={available <= transferFee}
        />
        <div className="flex justify-between text-[10px] text-slate-600 font-bold">
          <span>¥{(transferFee + 1).toLocaleString()}〜</span>
          <span>最大 ¥{available.toLocaleString()}</span>
        </div>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-2">
        <div className="flex justify-between text-xs text-slate-400">
          <span>出金申請額</span>
          <span className="font-bold text-white">¥{amount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>振込手数料</span>
          <span className="text-red-400 font-bold">-¥{transferFee.toLocaleString()}</span>
        </div>
        <div className="border-t border-slate-700 pt-2 flex justify-between text-sm">
          <span className="font-black text-white">実際の振込額</span>
          <span className="font-black text-emerald-400">¥{Math.max(0, net).toLocaleString()}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full h-12 bg-emerald-500 hover:brightness-110 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {loading ? (
          <><Loader2 size={16} className="animate-spin" />処理中...</>
        ) : (
          <><ArrowDownToLine size={16} />¥{Math.max(0, net).toLocaleString()} を出金する</>
        )}
      </button>
    </form>
  );
}
