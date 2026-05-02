"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";

export function EventPayPayToggle({
  eventId,
  enabled,
}: {
  eventId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    startTransition(async () => {
      await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paypay_enabled: next }),
      });
      setShowModal(false);
      setAgreed(false);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5">
        <div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">PayPay 決済</p>
          <p className="font-black text-sm text-white mt-0.5">
            {enabled ? "有効" : "無効"}
          </p>
          {enabled && (
            <p className="text-[10px] text-amber-400 mt-0.5">決済手数料 3.98%（カードは {" "}
              <span className="font-black">3.6%</span>）・返金時手数料不返還</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (enabled) {
              toggle(false);
            } else {
              setShowModal(true);
            }
          }}
          disabled={isPending}
          className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
            enabled ? "bg-red-500" : "bg-slate-700"
          } disabled:opacity-50`}
        >
          {isPending
            ? <Loader2 size={12} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
            : <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? "left-6" : "left-0.5"}`} />}
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-white">PayPay決済を有効にする</p>
              <button onClick={() => { setShowModal(false); setAgreed(false); }}>
                <X size={16} className="text-slate-500" />
              </button>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-2 text-xs text-slate-300">
              <p className="font-black text-amber-400">PayPay 利用における注意事項</p>
              <ul className="space-y-1.5 list-disc list-inside text-slate-400">
                <li>決済手数料は <span className="font-black text-white">3.98%</span>（カード決済 3.6% より高い）</li>
                <li>デジタルコンテンツ販売とStripeに判定された場合、<span className="font-black text-amber-400">最大 9.48%</span> が適用される場合があります（当社でコントロールできません）</li>
                <li>PayPayは<span className="font-black text-white">即時決済</span>のため、返金時も<span className="font-black text-white">決済手数料は返還されません</span></li>
              </ul>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 accent-indigo-500"
              />
              <span className="text-xs text-slate-300">上記の手数料・返金条件を確認し、このイベントでPayPay決済を有効にすることに同意します</span>
            </label>

            <button
              type="button"
              disabled={!agreed || isPending}
              onClick={() => toggle(true)}
              className="w-full h-11 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2"
            >
              {isPending ? <Loader2 size={16} className="animate-spin" /> : "PayPayを有効にする"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
