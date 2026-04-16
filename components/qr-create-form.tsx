"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2, Plus, Trash2, Info } from "lucide-react";

const PAYMENT_TYPE_INFO = {
  A: { label: "Aタイプ：5日前確定", desc: "予約→カード保存、5日前に自動決済" },
  B: { label: "Bタイプ：即時確定",  desc: "予約時に即時決済" },
  C: { label: "Cタイプ：当日決済",  desc: "予約→カード保存、チェックイン時に決済" },
};

const PRODUCT_TYPE_RANGES = {
  standard: { min: 500,  max: 5_000,   label: "スタンダード",   desc: "¥500〜¥5,000" },
  message:  { min: 1000, max: 10_000,  label: "メッセージ",     desc: "¥1,000〜¥10,000" },
  entrance: { min: 300,  max: 3_000,   label: "エントランス",   desc: "¥300〜¥3,000" },
  custom:   { min: 500,  max: 100_000, label: "カスタム",       desc: "¥500〜¥100,000" },
};

type TargetCandidate = { profile_id: string; display_name: string; role: "organizer" | "artist" };
type DistTarget = { profile_id: string; ratio: string };

export function QRCreateForm({
  eventId,
  targets: targetCandidates,
}: {
  eventId: string;
  targets: TargetCandidate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [productType, setProductType] = useState<keyof typeof PRODUCT_TYPE_RANGES>("standard");
  const [minAmount, setMinAmount] = useState(PRODUCT_TYPE_RANGES.standard.min);
  const [maxAmount, setMaxAmount] = useState(PRODUCT_TYPE_RANGES.standard.max);
  const [label, setLabel] = useState("");
  const [recipientId, setRecipientId] = useState(targetCandidates[0]?.profile_id ?? "");
  const [targets, setTargets] = useState<DistTarget[]>(
    targetCandidates[0] ? [{ profile_id: targetCandidates[0].profile_id, ratio: "100" }] : [],
  );
  // entrance タイプ用
  const [paymentType, setPaymentType] = useState<"A" | "B" | "C">("A");
  const [stockLimit, setStockLimit] = useState<string>("");
  const [trackInventoryC, setTrackInventoryC] = useState(false);

  const range = PRODUCT_TYPE_RANGES[productType];
  const totalRatio = targets.reduce((sum, t) => sum + (parseFloat(t.ratio) || 0), 0);

  const handleTypeChange = (type: keyof typeof PRODUCT_TYPE_RANGES) => {
    const r = PRODUCT_TYPE_RANGES[type];
    setProductType(type);
    setMinAmount(r.min);
    setMaxAmount(r.max);
  };

  const addTarget = () =>
    setTargets((prev) => [...prev, { profile_id: targetCandidates[0]?.profile_id ?? "", ratio: "0" }]);
  const removeTarget = (i: number) =>
    setTargets((prev) => prev.filter((_, idx) => idx !== i));
  const updateTarget = (i: number, field: keyof DistTarget, value: string) =>
    setTargets((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!recipientId) {
      setError("宛先を選択してください");
      return;
    }
    if (targets.length === 0) {
      setError("配分先を1人以上設定してください");
      return;
    }
    if (Math.abs(totalRatio - 100) > 0.1) {
      setError("配分比率の合計を100%にしてください");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/qr/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          label: label || undefined,
          product_type: productType,
          min_amount: minAmount,
          max_amount: maxAmount,
          recipient_profile_id: recipientId,
          targets: targets.map((t) => ({
            profile_id: t.profile_id,
            distribution_ratio: (parseFloat(t.ratio) || 0) / 100,
          })),
          // entrance タイプ追加フィールド
          ...(productType === "entrance" && {
            payment_type: paymentType,
            stock_limit: stockLimit ? Number(stockLimit) : null,
            track_inventory: paymentType === "C" ? trackInventoryC : true,
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      router.push(`/dashboard/events/${eventId}`);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">

        {/* ラベル */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            ラベル（任意）
          </label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例: DJ ブース用"
            className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        {/* 商品タイプ */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            商品タイプ
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.entries(PRODUCT_TYPE_RANGES) as [keyof typeof PRODUCT_TYPE_RANGES, typeof PRODUCT_TYPE_RANGES[keyof typeof PRODUCT_TYPE_RANGES]][]).map(([type, info]) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={`p-3 rounded-2xl text-left transition-all border ${
                  productType === type
                    ? "bg-pink-500/20 border-pink-500/50 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <p className="text-xs font-black">{info.label}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{info.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* entrance タイプ：決済タイプ・在庫 */}
        {productType === "entrance" && (
          <div className="space-y-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
              <Info size={10} /> 入場チケット設定
            </p>

            {/* 決済タイプ */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                決済タイプ
              </label>
              <div className="space-y-2">
                {(Object.entries(PAYMENT_TYPE_INFO) as [keyof typeof PAYMENT_TYPE_INFO, typeof PAYMENT_TYPE_INFO[keyof typeof PAYMENT_TYPE_INFO]][]).map(([type, info]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPaymentType(type)}
                    className={`w-full p-3 rounded-xl text-left transition-all border ${
                      paymentType === type
                        ? "bg-indigo-500/20 border-indigo-500/50 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    <p className="text-xs font-black">{info.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{info.desc}</p>
                  </button>
                ))}
              </div>
              {paymentType === "B" && (
                <p className="text-[10px] text-amber-400 font-bold flex items-start gap-1.5">
                  <Info size={10} className="shrink-0 mt-0.5" />
                  中止時の返金手数料リスクをオーガナイザーが負担します
                </p>
              )}
            </div>

            {/* 販売上限数 */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                販売上限数（空欄 = 無制限）
              </label>
              <Input
                type="number"
                value={stockLimit}
                onChange={(e) => setStockLimit(e.target.value)}
                placeholder="例: 100"
                min={1}
                className="h-12 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            {/* Cタイプのみ: 在庫管理するか */}
            {paymentType === "C" && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trackInventoryC}
                  onChange={(e) => setTrackInventoryC(e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-500"
                />
                <span className="text-xs text-slate-300 font-bold">
                  Cタイプでも在庫管理する
                </span>
              </label>
            )}
          </div>
        )}

        {/* 金額範囲 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              最低金額
            </label>
            <Input
              type="number"
              value={minAmount}
              onChange={(e) => setMinAmount(Number(e.target.value))}
              min={range.min}
              max={maxAmount}
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              最高金額
            </label>
            <Input
              type="number"
              value={maxAmount}
              onChange={(e) => setMaxAmount(Number(e.target.value))}
              min={minAmount}
              max={range.max}
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {/* 宛先 */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            宛先 <span className="text-pink-500">*</span>
          </label>
          <p className="text-[10px] text-slate-600">決済記録上で「誰への支払いか」を示す名義人</p>
          {targetCandidates.length === 0 ? (
            <p className="text-sm text-amber-400 font-bold">出演者が登録されていません</p>
          ) : (
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 focus:outline-none"
            >
              <option value="" disabled>選択してください</option>
              {targetCandidates.map((c) => (
                <option key={c.profile_id} value={c.profile_id}>
                  {c.display_name}{c.role === "organizer" ? "（主催者）" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 配分設定 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              配分設定（手数料 13.6% 控除後 86.4% を配分）
            </label>
            <button
              type="button"
              onClick={addTarget}
              className="flex items-center gap-1 text-[10px] font-black text-pink-500 hover:text-pink-400 uppercase tracking-widest"
            >
              <Plus size={12} /> 追加
            </button>
          </div>

          <div className="space-y-2">
            {targets.map((t, i) => (
              <div key={i} className="flex items-center gap-3">
                <select
                  value={t.profile_id}
                  onChange={(e) => updateTarget(i, "profile_id", e.target.value)}
                  className="flex-1 h-12 bg-slate-800 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 focus:outline-none"
                >
                  {targetCandidates.map((c) => (
                    <option key={c.profile_id} value={c.profile_id}>
                      {c.display_name}{c.role === "organizer" ? "（主催者）" : ""}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={t.ratio}
                    onChange={(e) => updateTarget(i, "ratio", e.target.value)}
                    min={0}
                    max={100}
                    className="w-20 h-12 bg-slate-800 border-slate-700 rounded-xl px-3 text-sm text-white text-center focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <span className="text-slate-400 text-sm font-bold">%</span>
                </div>
                {targets.length > 1 && (
                  <button type="button" onClick={() => removeTarget(i)} className="text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between text-xs font-bold">
            <span className="text-slate-500">合計</span>
            <span className={Math.abs(totalRatio - 100) < 0.1 ? "text-emerald-400" : "text-red-400"}>
              {totalRatio.toFixed(1)}%
            </span>
          </div>

          {/* 手数料インフォ */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">手数料内訳</p>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Stripe 決済手数料</span><span>3.6%</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>プラットフォーム利用料</span><span>10.0%</span>
            </div>
            <div className="flex justify-between text-xs font-black text-white border-t border-slate-700 pt-1 mt-1">
              <span>アーティスト配分</span><span>86.4%</span>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 font-bold">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={isPending || !recipientId || Math.abs(totalRatio - 100) > 0.1}
        className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 size={20} className="animate-spin" /> : <>QRを作成 <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
