"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, X } from "lucide-react";

export function StripeRestrictionBanner() {
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleOpen = async () => {
    setLoading(true);
    const res = await fetch("/api/stripe/connect/login-link", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (data.url) {
      window.open(data.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-3">
        <AlertTriangle size={16} className="text-amber-400 shrink-0" />
        <p className="text-xs text-amber-300 flex-1">
          <span className="font-black">Stripeから追加情報の提出が求められています。</span>
          {" "}対応しないと出金などの機能が制限されたままになります。
        </p>
        <button
          onClick={handleOpen}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/30 transition-all disabled:opacity-50 shrink-0"
        >
          {loading
            ? <Loader2 size={11} className="animate-spin" />
            : <ExternalLink size={11} />}
          Stripeダッシュボードを開く
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-600 hover:text-amber-400 transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
