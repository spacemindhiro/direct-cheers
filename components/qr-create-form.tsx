"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { jstLocalToUtcIso } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2, Plus, Trash2, Info, Hash, Lock } from "lucide-react";
import { QRImageUpload } from "@/components/qr-image-upload";
import { StripImageUpload } from "@/components/strip-image-upload";
import { CheersCard } from "@/components/cheers-card";
import { WalletTicketPreview } from "@/components/wallet-ticket-preview";

const PAYMENT_TYPE_INFO = {
  A: { label: "Aタイプ：5日前確定", desc: "予約→カード保存、5日前に自動決済" },
  B: { label: "Bタイプ：即時確定",  desc: "予約時に即時決済" },
  C: { label: "Cタイプ：当日決済",  desc: "予約→カード保存、チェックイン時に決済" },
};

// フォールバック（DBから取得できなかった場合）
const PRODUCT_TYPE_FALLBACK = [
  { type: "standard", label: "スタンダード", min_amount: 500,  max_amount: 3000,  is_enabled: true },
  { type: "message",  label: "メッセージ",  min_amount: 1000, max_amount: 5000,  is_enabled: true },
  { type: "entrance", label: "エントランス", min_amount: 300,  max_amount: 30000, is_enabled: true },
  { type: "custom",   label: "カスタム",    min_amount: 500,  max_amount: 100000, is_enabled: false },
];

type ProductTypeConfig = { type: string; label: string; min_amount: number; max_amount: number; is_enabled: boolean };
type TargetCandidate = { profile_id: string; display_name: string; role: "organizer" | "artist"; status?: string };
type DistTarget = { profile_id: string; ratio: string };

export function QRCreateForm({
  eventId,
  eventTitle = "",
  eventStartAt,
  eventVenue,
  targets: targetCandidates,
  feeConfig = { stripe_rate: 0.0396, platform_rate: 0.10, net_rate: 0.8604, paypay_rate: 0.04378, paypay_net_rate: 0.85622 },
  paypayEnabled = false,
  organizerBalance = 0,
  productTypeConfigs = [],
}: {
  eventId: string;
  eventTitle?: string;
  eventStartAt?: string | null;
  eventVenue?: string | null;
  targets: TargetCandidate[];
  feeConfig?: { stripe_rate: number; platform_rate: number; net_rate: number; paypay_rate?: number; paypay_net_rate?: number };
  paypayEnabled?: boolean;
  organizerBalance?: number;
  productTypeConfigs?: ProductTypeConfig[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // DBから取得した定義。取得できなければフォールバック
  const configs = productTypeConfigs.length > 0 ? productTypeConfigs : PRODUCT_TYPE_FALLBACK;
  const enabledConfigs = configs.filter((c) => c.is_enabled);
  const disabledConfigs = configs.filter((c) => !c.is_enabled);

  const defaultType = enabledConfigs[0]?.type ?? "standard";
  const [productType, setProductType] = useState(defaultType);
  const currentConfig = configs.find((c) => c.type === productType) ?? enabledConfigs[0];

  const [priceMode, setPriceMode] = useState<"fixed" | "range">("fixed");
  const [fixedAmount, setFixedAmount] = useState(currentConfig?.min_amount ?? 500);
  const [minAmount, setMinAmount] = useState(currentConfig?.min_amount ?? 500);
  const [maxAmount, setMaxAmount] = useState(currentConfig?.max_amount ?? 3000);
  const [amountStep, setAmountStep] = useState<100 | 500 | 1000>(100);
  const [label, setLabel] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState(targetCandidates[0]?.profile_id ?? "");
  const [targets, setTargets] = useState<DistTarget[]>(
    targetCandidates[0] ? [{ profile_id: targetCandidates[0].profile_id, ratio: "100" }] : [],
  );
  // entrance タイプ用
  const [paymentType, setPaymentType] = useState<"A" | "B" | "C">("A");
  const [stockLimit, setStockLimit] = useState<string>("");
  const [trackInventoryC, setTrackInventoryC] = useState(false);
  const [serialScope, setSerialScope] = useState<"event" | "qr" | "artist">("event");
  // 前売り販売期間（A/B タイプ必須）
  const [salesStartAt, setSalesStartAt] = useState("");
  const [salesEndAt, setSalesEndAt] = useState("");
  // テスト用有効期間バイパス
  const [bypassValidity, setBypassValidity] = useState(false);
  // entrance タイプ用ビジュアル
  const [stripImageUrl, setStripImageUrl] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState("#0f172a");
  const [fgColor, setFgColor] = useState("#ffffff");
  const [labelColor, setLabelColor] = useState("#94a3b8");

  const totalRatio = targets.reduce((sum, t) => sum + (parseFloat(t.ratio) || 0), 0);

  const fmtAmt = (n: number) => (n === 0 ? "" : n.toLocaleString("ja-JP"));
  const parseAmt = (v: string) => {
    const n = parseInt(v.replace(/,/g, ""), 10);
    return isNaN(n) ? 0 : n;
  };

  // タイプB 残高チェック
  const needsReserve = productType === "entrance" && paymentType === "B" && !!stockLimit;
  const effectiveMax = priceMode === "fixed" ? fixedAmount : maxAmount;
  const typeBReserveRequired = needsReserve
    ? Math.ceil(effectiveMax * Number(stockLimit) * feeConfig.stripe_rate)
    : 0;
  const typeBBalanceOk = !needsReserve || organizerBalance >= typeBReserveRequired;

  const handleTypeChange = (cfg: ProductTypeConfig) => {
    setProductType(cfg.type);
    setFixedAmount(cfg.min_amount);
    setMinAmount(cfg.min_amount);
    setMaxAmount(cfg.max_amount);
  };

  const handleStepChange = (s: 100 | 500 | 1000) => {
    setAmountStep(s);
    const cfgMin = currentConfig?.min_amount ?? 500;
    const cfgMax = currentConfig?.max_amount ?? 3000;
    const snappedMin = Math.max(cfgMin, Math.round(minAmount / s) * s);
    const snappedMax = Math.min(cfgMax, Math.round(maxAmount / s) * s);
    setMinAmount(snappedMin);
    setMaxAmount(snappedMax <= snappedMin ? Math.min(snappedMin + s, cfgMax) : snappedMax);
  };

  // エントランスはワンプライス固定
  useEffect(() => {
    if (productType === "entrance") setPriceMode("fixed");
  }, [productType]);

  // 配分リストが変わったとき、宛先が配分に含まれなくなったら先頭に戻す
  useEffect(() => {
    if (targets.length > 0 && !targets.some((t) => t.profile_id === recipientId)) {
      setRecipientId(targets[0].profile_id);
    }
  }, [targets, recipientId]);

  // 宛先の選択肢は配分に登録されている人のみ
  const recipientOptions = targetCandidates.filter((c) =>
    targets.some((t) => t.profile_id === c.profile_id)
  );

  const addTarget = () =>
    setTargets((prev) => [...prev, { profile_id: targetCandidates[0]?.profile_id ?? "", ratio: "0" }]);
  const removeTarget = (i: number) =>
    setTargets((prev) => prev.filter((_, idx) => idx !== i));
  const updateTarget = (i: number, field: keyof DistTarget, value: string) =>
    setTargets((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!label.trim()) { setError("ラベルを入力してください"); return; }
    if (productType !== "entrance" && !imageUrl) { setError("QR画像をアップロードしてください"); return; }
    if (!recipientId) { setError("宛先を選択してください"); return; }
    if (targets.length === 0) { setError("配分先を1人以上設定してください"); return; }
    if (Math.abs(totalRatio - 100) > 0.1) { setError("配分比率の合計を100%にしてください"); return; }
    if (productType === "entrance" && (paymentType === "A" || paymentType === "B")) {
      if (!salesStartAt || !salesEndAt) {
        setError("前売り（A/Bタイプ）は販売開始・終了日時を入力してください");
        return;
      }
      if (salesEndAt <= salesStartAt) {
        setError("販売終了日時は開始日時より後にしてください");
        return;
      }
    }
    if (!typeBBalanceOk) {
      setError(`タイプBを利用するには残高が ¥${typeBReserveRequired.toLocaleString()} 以上必要です（現在: ¥${organizerBalance.toLocaleString()}）`);
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
          image_url: productType !== "entrance" ? (imageUrl || undefined) : undefined,
          product_type: productType,
          min_amount: priceMode === "fixed" ? fixedAmount : minAmount,
          max_amount: priceMode === "fixed" ? fixedAmount : maxAmount,
          amount_step: priceMode === "range" ? amountStep : 100,
          recipient_profile_id: recipientId,
          targets: targets.map((t) => ({
            profile_id: t.profile_id,
            distribution_ratio: (parseFloat(t.ratio) || 0) / 100,
          })),
          serial_scope: serialScope,
          ...(productType === "entrance" && {
            payment_type: paymentType,
            stock_limit: stockLimit ? Number(stockLimit) : null,
            track_inventory: paymentType === "C" ? trackInventoryC : true,
            ...((paymentType === "A" || paymentType === "B") && salesStartAt && salesEndAt && {
              sales_start_at: jstLocalToUtcIso(salesStartAt),
              sales_end_at: jstLocalToUtcIso(salesEndAt),
            }),
            strip_image_url: stripImageUrl || undefined,
            bg_color: bgColor,
            fg_color: fgColor,
            label_color: labelColor,
          }),
          bypass_validity: bypassValidity,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "エラーが発生しました"); return; }
      router.push(`/dashboard/events/${eventId}`);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">

        {/* 商品タイプ（先頭） */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">商品タイプ</label>
          <div className="grid grid-cols-2 gap-2">
            {enabledConfigs.map((cfg) => (
              <button
                key={cfg.type}
                type="button"
                onClick={() => handleTypeChange(cfg)}
                className={`p-3 rounded-2xl text-left transition-all border ${
                  productType === cfg.type
                    ? "bg-pink-500/20 border-pink-500/50 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <p className="text-xs font-black">{cfg.label}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  ¥{cfg.min_amount.toLocaleString()}〜¥{cfg.max_amount.toLocaleString()}
                </p>
              </button>
            ))}
            {/* 無効タイプ（カスタム等）はロック表示 */}
            {disabledConfigs.map((cfg) => (
              <div key={cfg.type} className="p-3 rounded-2xl border border-slate-700 bg-slate-800/50 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-1.5">
                  <Lock size={10} className="text-slate-500" />
                  <p className="text-xs font-black text-slate-500">{cfg.label}</p>
                </div>
                <p className="text-[10px] text-slate-600 mt-0.5">エージェントと企画・承認後に解放</p>
              </div>
            ))}
          </div>
        </div>

        {/* ラベル */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">ラベル <span className="text-pink-500">*</span></label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例: DJ ブース用"
            className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        {/* 画像・プレビュー（タイプ別） */}
        {productType === "entrance" ? (
          <div className="space-y-6">
            <StripImageUpload onUploadComplete={setStripImageUrl} />

            {/* カラー設定 */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">チケットカラー</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { label: "背景色", value: bgColor, set: setBgColor },
                  { label: "テキスト色", value: fgColor, set: setFgColor },
                  { label: "ラベル色", value: labelColor, set: setLabelColor },
                ] as const).map(({ label: lbl, value, set }) => (
                  <label key={lbl} className="flex flex-col items-center gap-1.5 cursor-pointer">
                    <div className="relative w-10 h-10 rounded-xl border border-slate-600 overflow-hidden">
                      <div className="w-full h-full" style={{ backgroundColor: value }} />
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <span className="text-[8px] text-slate-500 font-bold">{lbl}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Walletプレビュー */}
            <WalletTicketPreview
              eventTitle={eventTitle}
              productName={label || "チケット"}
              startAt={eventStartAt}
              venue={eventVenue}
              stripImageUrl={stripImageUrl}
              bgColor={bgColor}
              fgColor={fgColor}
              labelColor={labelColor}
            />
          </div>
        ) : (
          <>
            <QRImageUpload
              eventTitle={eventTitle}
              artistName={targetCandidates.find((c) => c.profile_id === recipientId)?.display_name ?? ""}
              required
              onUploadComplete={setImageUrl}
            />
            {imageUrl && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">カードプレビュー</p>
                <div className="max-w-xs mx-auto opacity-90 pointer-events-none">
                  <CheersCard
                    artistName={targetCandidates.find((c) => c.profile_id === recipientId)?.display_name ?? "Artist"}
                    eventTitle={eventTitle}
                    artistAvatar={null}
                    imageUrl={imageUrl}
                    amount={priceMode === "fixed" ? fixedAmount : Math.round((minAmount + maxAmount) / 2)}
                    transactionId="PREVIEW"
                    serialNumber={1}
                  />
                </div>
                <p className="text-[9px] text-slate-600 text-center">※ 実際の金額・シリアル番号は異なります</p>
              </div>
            )}
          </>
        )}

        {/* entrance タイプ：決済タイプ・在庫・販売期間 */}
        {productType === "entrance" && (
          <div className="space-y-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
              <Info size={10} /> 入場チケット設定
            </p>

            {/* 決済タイプ */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">決済タイプ</label>
              <div className="space-y-2">
                {(Object.entries(PAYMENT_TYPE_INFO) as [keyof typeof PAYMENT_TYPE_INFO, (typeof PAYMENT_TYPE_INFO)[keyof typeof PAYMENT_TYPE_INFO]][]).map(([type, info]) => (
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

            {/* 前売り販売期間（A/B 必須） */}
            {(paymentType === "A" || paymentType === "B") && (
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                  前売り販売期間 <span className="text-pink-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">販売開始</p>
                    <input
                      type="datetime-local"
                      required
                      value={salesStartAt}
                      onChange={(e) => setSalesStartAt(e.target.value)}
                      className="block w-full min-h-[3rem] bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">販売終了</p>
                    <input
                      type="datetime-local"
                      required
                      value={salesEndAt}
                      min={salesStartAt || undefined}
                      onChange={(e) => setSalesEndAt(e.target.value)}
                      className="block w-full min-h-[3rem] bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 販売上限数 */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                {paymentType === "B" ? "販売上限数 *" : "販売上限数（空欄 = 無制限）"}
              </label>
              <Input
                type="number"
                value={stockLimit}
                onChange={(e) => setStockLimit(e.target.value)}
                placeholder="例: 100"
                min={1}
                required={paymentType === "B"}
                className="h-12 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {paymentType === "B" && (
                <p className="text-[10px] text-slate-500">タイプBは手数料リスク算出のため販売上限数が必須です</p>
              )}
            </div>

            {/* タイプB 残高チェック */}
            {paymentType === "B" && stockLimit && (
              <div className={`rounded-xl p-3 border ${typeBBalanceOk ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/10 border-red-500/30"}`}>
                <p className={`text-[10px] font-black uppercase tracking-widest ${typeBBalanceOk ? "text-emerald-400" : "text-red-400"}`}>
                  中止時手数料準備金
                </p>
                <p className="text-xs font-bold text-slate-300 mt-1">
                  必要額: ¥{typeBReserveRequired.toLocaleString()}　／　現在残高: ¥{organizerBalance.toLocaleString()}
                </p>
                {!typeBBalanceOk && (
                  <p className="text-[10px] text-red-400 mt-1">
                    残高不足のためタイプBは利用できません。残高を増やしてから再試行してください。
                  </p>
                )}
              </div>
            )}

            {/* Cタイプのみ: 在庫管理するか */}
            {paymentType === "C" && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trackInventoryC}
                  onChange={(e) => setTrackInventoryC(e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-500"
                />
                <span className="text-xs text-slate-300 font-bold">Cタイプでも在庫管理する</span>
              </label>
            )}
          </div>
        )}

        {/* 価格モード（エントランスはワンプライス固定） */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">価格設定</label>

          {productType !== "entrance" && (
            <div className="grid grid-cols-2 gap-2">
              {(["fixed", "range"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPriceMode(mode)}
                  className={`p-3 rounded-2xl text-left transition-all border ${
                    priceMode === mode
                      ? "bg-pink-500/20 border-pink-500/50 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  <p className="text-xs font-black">{mode === "fixed" ? "ワンプライス" : "レンジ"}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {mode === "fixed" ? "金額を1つに固定" : "最低〜最高を指定"}
                  </p>
                </button>
              ))}
            </div>
          )}

          {priceMode === "fixed" ? (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">金額</label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold pointer-events-none">¥</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={fmtAmt(fixedAmount)}
                  onChange={(e) => setFixedAmount(parseAmt(e.target.value))}
                  className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl pl-9 pr-5 text-sm text-white focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <p className="text-[10px] text-slate-600">
                ¥{(currentConfig?.min_amount ?? 1).toLocaleString()} 〜 ¥{(currentConfig?.max_amount ?? 100000).toLocaleString()} の範囲で設定
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* スライド単位 */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">スライド単位</label>
                <div className="grid grid-cols-3 gap-2">
                  {([100, 500, 1000] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleStepChange(s)}
                      className={`py-2 rounded-xl text-center text-xs font-black transition-all border ${
                        amountStep === s
                          ? "bg-pink-500/20 border-pink-500/50 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      ¥{s.toLocaleString()}単位
                    </button>
                  ))}
                </div>
              </div>
              {/* 最低金額スライダー */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">最低金額</label>
                  <span className="text-sm font-black text-white">¥{minAmount.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={currentConfig?.min_amount ?? 500}
                  max={(currentConfig?.max_amount ?? 3000) - amountStep}
                  step={amountStep}
                  value={minAmount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMinAmount(v);
                    if (v >= maxAmount) setMaxAmount(Math.min(v + amountStep, currentConfig?.max_amount ?? 3000));
                  }}
                  className="w-full accent-pink-500"
                />
              </div>
              {/* 最高金額スライダー */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">最高金額</label>
                  <span className="text-sm font-black text-white">¥{maxAmount.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={(currentConfig?.min_amount ?? 500) + amountStep}
                  max={currentConfig?.max_amount ?? 3000}
                  step={amountStep}
                  value={maxAmount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMaxAmount(v);
                    if (v <= minAmount) setMinAmount(Math.max(v - amountStep, currentConfig?.min_amount ?? 500));
                  }}
                  className="w-full accent-pink-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600 font-bold">
                  <span>¥{(currentConfig?.min_amount ?? 500).toLocaleString()}</span>
                  <span>¥{(currentConfig?.max_amount ?? 3000).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 配分設定 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              配分設定（手数料 {parseFloat(((feeConfig.stripe_rate + feeConfig.platform_rate) * 100).toFixed(3))}% 控除後 {parseFloat((feeConfig.net_rate * 100).toFixed(3))}% を配分）
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
                      {c.display_name}{c.role === "organizer" ? "（主催者）" : c.status === "pending" ? "（交渉中）" : ""}
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

          {/* シリアル番号採番単位 */}
          <div className="space-y-2 pt-2 border-t border-slate-700">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Hash size={11} className="text-pink-500" /> シリアル番号の採番単位
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "event",  label: "イベント通し", desc: "全QR合算で #001, #002..." },
                { value: "qr",     label: "QRコード別",   desc: "このQR内だけで #001, #002..." },
                { value: "artist", label: "アーティスト別", desc: "受取人ごとに #001, #002..." },
              ] as const).map((s) => (
                <button key={s.value} type="button" onClick={() => setSerialScope(s.value)}
                  className={`p-3 rounded-2xl text-left transition-all border space-y-0.5 ${
                    serialScope === s.value
                      ? "bg-pink-500/10 border-pink-500/40 text-pink-400"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                  }`}>
                  <p className="text-[10px] font-black uppercase tracking-wider">{s.label}</p>
                  <p className="text-[9px] font-medium text-slate-500 normal-case">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 宛先 */}
          <div className="space-y-2 pt-2 border-t border-slate-700">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              宛先 <span className="text-pink-500">*</span>
            </label>
            <p className="text-[10px] text-slate-600">決済記録上の名義人。配分に追加した人の中から選択。</p>
            {recipientOptions.length === 0 ? (
              <p className="text-xs text-amber-400 font-bold">配分先を追加してください</p>
            ) : (
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 focus:outline-none"
              >
                {recipientOptions.map((c) => (
                  <option key={c.profile_id} value={c.profile_id}>
                    {c.display_name}{c.role === "organizer" ? "（主催者）" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 手数料インフォ */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">手数料内訳</p>
            {paypayEnabled ? (
              <>
                <p className="text-[10px] text-slate-500 mb-1">カード払い</p>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>決済手数料（Stripe）</span><span>{parseFloat((feeConfig.stripe_rate * 100).toFixed(3))}%</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>プラットフォーム利用料</span><span>{parseFloat((feeConfig.platform_rate * 100).toFixed(3))}%</span>
                </div>
                <div className="flex justify-between text-xs font-black text-white border-t border-slate-700 pt-1 mt-1">
                  <span>アーティスト配分</span><span>{parseFloat((feeConfig.net_rate * 100).toFixed(3))}%</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 mb-1">PayPay払い</p>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>決済手数料（PayPay）</span><span>{parseFloat(((feeConfig.paypay_rate ?? 0.04378) * 100).toFixed(3))}%</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>プラットフォーム利用料</span><span>{parseFloat((feeConfig.platform_rate * 100).toFixed(3))}%</span>
                </div>
                <div className="flex justify-between text-xs font-black text-white border-t border-slate-700 pt-1 mt-1">
                  <span>アーティスト配分</span><span>{parseFloat(((feeConfig.paypay_net_rate ?? 0.85622) * 100).toFixed(3))}%</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Stripe 決済手数料</span><span>{parseFloat((feeConfig.stripe_rate * 100).toFixed(3))}%</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>プラットフォーム利用料</span><span>{parseFloat((feeConfig.platform_rate * 100).toFixed(3))}%</span>
                </div>
                <div className="flex justify-between text-xs font-black text-white border-t border-slate-700 pt-1 mt-1">
                  <span>アーティスト配分</span><span>{parseFloat((feeConfig.net_rate * 100).toFixed(3))}%</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* テスト用バイパス */}
        <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 rounded-2xl px-4 py-3">
          <div>
            <p className="text-xs font-black text-amber-400">テスト用：有効期間バイパス</p>
            <p className="text-[10px] text-slate-500 mt-0.5">ONにするとイベント時間外でも決済可能になります</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={bypassValidity}
            onClick={() => setBypassValidity((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${bypassValidity ? "bg-amber-500" : "bg-slate-700"}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${bypassValidity ? "translate-x-5" : "translate-x-1"}`} />
          </button>
        </div>

        {error && <p className="text-sm text-red-400 font-bold">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={isPending || !label.trim() || (productType !== "entrance" && !imageUrl) || !recipientId || Math.abs(totalRatio - 100) > 0.1 || !typeBBalanceOk}
        className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 size={20} className="animate-spin" /> : <>QRを作成 <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
