"use client";

import { useState, useEffect } from "react";
import { Heart, Save, Loader2, CheckCircle } from "lucide-react";

type Props = {
  qrConfigId: string;
};

type Candidate = { product_id: string; name: string; artist_name: string | null; artist_avatar: string | null };

export function WelcomeCheerEligibleEditor({ qrConfigId }: Props) {
  const [amount, setAmount] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notApplicable, setNotApplicable] = useState(false);

  useEffect(() => {
    fetch(`/api/qr/${qrConfigId}/welcome-cheer-eligible`)
      .then(async (r) => {
        if (!r.ok) { setNotApplicable(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setAmount(data.welcome_cheer_amount ?? null);
        setCandidates(data.candidates ?? []);
        setSelectedIds(data.eligible_product_ids ?? []);
      })
      .catch(() => setNotApplicable(true))
      .finally(() => setLoading(false));
  }, [qrConfigId]);

  const toggle = (productId: string) => {
    setSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/qr/${qrConfigId}/welcome-cheer-eligible`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: selectedIds }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (notApplicable) return null;

  if (loading) {
    return <div className="h-32 bg-slate-900 border border-slate-800 rounded-[2rem] animate-pulse" />;
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden">
      <div className="px-6 pt-6 pb-4 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
          <Heart size={14} className="text-pink-400 fill-current" />
        </div>
        <div>
          <p className="text-sm font-black text-white">ウェルカムチアの対象演者</p>
          <p className="text-[10px] text-slate-500">
            2階（¥{(amount ?? 0).toLocaleString()}）を贈れる演者を、ワンプライスで金額が完全一致する既存チアQRから選びます
          </p>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-3">
        {candidates.length === 0 ? (
          <p className="text-[10px] text-amber-400">
            ¥{(amount ?? 0).toLocaleString()} のワンプライスチアQRがまだありません。演者に作成を依頼してください。
          </p>
        ) : (
          <div className="space-y-1.5">
            {candidates.map((c) => (
              <label
                key={c.product_id}
                className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  selectedIds.includes(c.product_id)
                    ? "bg-pink-500/20 border-pink-500/50"
                    : "bg-slate-800 border-slate-700 hover:border-slate-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.product_id)}
                  onChange={() => toggle(c.product_id)}
                  className="w-4 h-4 rounded accent-pink-500"
                />
                <span className="text-xs font-bold text-white">{c.artist_name ?? c.name}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(236,72,153,0.25)] hover:brightness-110 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            保存
          </button>
          {saved && (
            <div className="flex items-center gap-2 text-green-400 text-xs font-bold">
              <CheckCircle size={14} />
              保存しました
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
