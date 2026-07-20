"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { jstLocalToUtcIso } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2, Plus, Trash2, Info, Hash, Lock, ChevronDown } from "lucide-react";
import { QRImageUpload } from "@/components/qr-image-upload";
import { StripImageUpload } from "@/components/strip-image-upload";
import { CheersCard } from "@/components/cheers-card";
import { WalletTicketPreview } from "@/components/wallet-ticket-preview";

const PAYMENT_TYPE_INFO = {
  A: { label: "Aタイプ：5日前確定", desc: "予約→カード保存、5日前に自動決済" },
  B: { label: "Bタイプ：即時確定",  desc: "予約時に即時決済" },
  C: { label: "Cタイプ：当日決済",  desc: "事前予約なし。当日タッチ決済またはQR自己決済のみ" },
};

const CUSTOM_SUBTYPE_INFO = {
  V: { label: "バウチャー（引換券）", desc: "1回のみ使用可能なデジタル引換コード。未使用分はイベント終了後に自動返金。" },
  D: { label: "ドリンクチケット", desc: "QR・チケットコードを使わない即時受け渡し用。決済完了画面自体が受け渡しの証跡になります。" },
} as const;
type CustomSubtype = keyof typeof CUSTOM_SUBTYPE_INFO;
type BulkTierInput = { min_quantity: string; unit_price: string };

// フォールバック（DBから取得できなかった場合）
const PRODUCT_TYPE_FALLBACK = [
  { type: "standard", label: "スタンダード", min_amount: 50,  max_amount: 3000,  is_enabled: true },
  { type: "message",  label: "メッセージ",  min_amount: 50,  max_amount: 5000,  is_enabled: true },
  { type: "entrance", label: "エントランス", min_amount: 50,  max_amount: 30000, is_enabled: true },
  { type: "custom",   label: "カスタム",    min_amount: 50,  max_amount: 100000, is_enabled: false },
];

type ProductTypeConfig = { type: string; label: string; min_amount: number; max_amount: number; is_enabled: boolean };
type TargetCandidate = { profile_id: string; display_name: string; avatar_url?: string | null; role: "organizer" | "artist"; status?: string };
type DistTarget = { profile_id: string; ratio: string };

export function QRCreateForm({
  eventId,
  eventTitle = "",
  eventStartAt,
  eventVenue,
  targets: targetCandidates,
  feeConfig = { stripe_rate: 0.0396, platform_rate: 0.10, net_rate: 0.8604 },
  organizerBalance = 0,
  productTypeConfigs = [],
  userRole = "",
}: {
  eventId: string;
  eventTitle?: string;
  eventStartAt?: string | null;
  eventVenue?: string | null;
  targets: TargetCandidate[];
  feeConfig?: { stripe_rate: number; platform_rate: number; net_rate: number };
  organizerBalance?: number;
  productTypeConfigs?: ProductTypeConfig[];
  userRole?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // DBから取得した定義。取得できなければフォールバック
  const configs = productTypeConfigs.length > 0 ? productTypeConfigs : PRODUCT_TYPE_FALLBACK;
  const enabledConfigs = configs.filter((c) => c.is_enabled);

  const defaultType = enabledConfigs[0]?.type ?? "standard";
  const [productType, setProductType] = useState(defaultType);
  const currentConfig = configs.find((c) => c.type === productType) ?? enabledConfigs[0];

  // スタンダード／メッセージは「宛先が先・配分が後追い」のシンプルレイアウト
  const isSimpleType = productType === "standard" || productType === "message";

  const [priceMode, setPriceMode] = useState<"fixed" | "range">("fixed");
  const [fixedAmount, setFixedAmount] = useState(currentConfig?.min_amount ?? 500);
  const [minAmount, setMinAmount] = useState(currentConfig?.min_amount ?? 500);
  const [maxAmount, setMaxAmount] = useState(currentConfig?.max_amount ?? 3000);
  const [defaultAmount, setDefaultAmount] = useState(currentConfig?.min_amount ?? 500);
  const [amountStep, setAmountStep] = useState<100 | 500 | 1000>(100);
  // デフォルト金額を詳細設定で手動指定するまでは最低金額に自動追従させる
  const [defaultTouched, setDefaultTouched] = useState(false);
  const [showPriceAdvanced, setShowPriceAdvanced] = useState(false);
  const [label, setLabel] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState(targetCandidates[0]?.profile_id ?? "");
  // 同一人物がオーガナイザー兼演者の場合、profile_idだけでは名義を区別できないため
  // 別途roleを保持し、qr_configs.recipient_name_context として送る
  const [recipientRole, setRecipientRole] = useState<"organizer" | "artist">(targetCandidates[0]?.role ?? "artist");
  const [targets, setTargets] = useState<DistTarget[]>(
    targetCandidates[0] ? [{ profile_id: targetCandidates[0].profile_id, ratio: "100" }] : [],
  );
  // 配分を手動編集するまでは宛先変更に追従して「宛先100%」を維持する
  const [distTouched, setDistTouched] = useState(false);
  // entrance タイプ用
  const [paymentType, setPaymentType] = useState<"A" | "B" | "C">("A");
  const [stockLimit, setStockLimit] = useState<string>("");
  // custom タイプ用
  const [customSubtype, setCustomSubtype] = useState<CustomSubtype>("V");
  const [voucherStockLimit, setVoucherStockLimit] = useState<string>("");
  const [trackInventoryC, setTrackInventoryC] = useState(false);
  // ドリンクチケット用（custom かつ payment_type='D'）
  const [drinkQuantitySelectable, setDrinkQuantitySelectable] = useState(true);
  const [drinkTiers, setDrinkTiers] = useState<BulkTierInput[]>([]);
  // ウェルカムチア（entrance×Cタイプ限定）: 合計金額の一部を2階（チア）として切り出す
  const [welcomeCheerEnabled, setWelcomeCheerEnabled] = useState(false);
  const [welcomeCheerAmount, setWelcomeCheerAmount] = useState<string>("");
  const [welcomeCheerCandidates, setWelcomeCheerCandidates] = useState<
    { product_id: string; name: string; artist_name: string | null; artist_avatar: string | null }[]
  >([]);
  const [welcomeCheerSelectedIds, setWelcomeCheerSelectedIds] = useState<string[]>([]);
  const [welcomeCheerCandidatesLoading, setWelcomeCheerCandidatesLoading] = useState(false);
  const [serialScope, setSerialScope] = useState<"event" | "qr" | "artist">("artist");
  const [showAdvanced, setShowAdvanced] = useState(false);
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
    setDefaultAmount(cfg.min_amount);
    setDefaultTouched(false);
  };

  const handleStepChange = (s: 100 | 500 | 1000) => {
    setAmountStep(s);
    const cfgMin = currentConfig?.min_amount ?? 50;
    const cfgMax = currentConfig?.max_amount ?? 3000;
    const snappedMin = Math.max(cfgMin, Math.round(minAmount / s) * s);
    const snappedMax = Math.min(cfgMax, Math.round(maxAmount / s) * s);
    const newMax = snappedMax <= snappedMin ? Math.min(snappedMin + s, cfgMax) : snappedMax;
    setMinAmount(snappedMin);
    setMaxAmount(newMax);
    if (!defaultTouched) {
      setDefaultAmount(snappedMin);
    } else {
      setDefaultAmount((prev) => {
        const snapped = Math.round(prev / s) * s;
        return Math.min(Math.max(snapped, snappedMin), newMax);
      });
    }
  };

  // custom かつ payment_type='V' のとき true
  const isVoucher = productType === "custom" && customSubtype === "V";
  // custom かつ payment_type='D' のとき true
  const isDrinkTicket = productType === "custom" && customSubtype === "D";

  // エントランス・バウチャー・ドリンクチケットはワンプライス固定
  useEffect(() => {
    if (productType === "entrance" || isVoucher || isDrinkTicket) setPriceMode("fixed");
  }, [productType, isVoucher, isDrinkTicket]);

  const addDrinkTier = () => {
    setDrinkTiers((prev) => [...prev, { min_quantity: "", unit_price: "" }]);
  };
  const removeDrinkTier = (i: number) => {
    setDrinkTiers((prev) => prev.filter((_, idx) => idx !== i));
  };
  const updateDrinkTier = (i: number, field: keyof BulkTierInput, value: string) => {
    setDrinkTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  };

  // ウェルカムチア: 金額が変わるたびに、同金額の既存ワンプライスチアQRを候補として取得する
  useEffect(() => {
    if (!(productType === "entrance" && paymentType === "C" && welcomeCheerEnabled)) return;
    const amount = parseAmt(welcomeCheerAmount);
    if (amount <= 0) { setWelcomeCheerCandidates([]); return; }
    const timer = setTimeout(() => {
      setWelcomeCheerCandidatesLoading(true);
      fetch(`/api/events/${eventId}/cheer-products?amount=${amount}`)
        .then((r) => r.json())
        .then((data) => setWelcomeCheerCandidates(data.candidates ?? []))
        .catch(() => setWelcomeCheerCandidates([]))
        .finally(() => setWelcomeCheerCandidatesLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [productType, paymentType, welcomeCheerEnabled, welcomeCheerAmount, eventId]);

  const toggleWelcomeCheerCandidate = (productId: string) => {
    setWelcomeCheerSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  // 対面タッチ決済（Case④）: エントランスCタイプ、またはバウチャー×金額固定のみ対象。
  // レンジ指定は現場で金額を選ぶ画面を挟めないため対象外。
  const touchpayEligible = (productType === "entrance" && paymentType === "C") || (isVoucher && priceMode === "fixed");
  const [touchpayEnabled, setTouchpayEnabled] = useState(false);
  useEffect(() => {
    if (!touchpayEligible) setTouchpayEnabled(false);
  }, [touchpayEligible]);

  // entrance/custom：配分リストが変わったとき、宛先が配分に含まれなくなったら先頭に戻す
  // （スタンダード/メッセージは宛先が先に決まるため対象外）
  useEffect(() => {
    if (isSimpleType) return;
    if (targets.length > 0 && !targets.some((t) => t.profile_id === recipientId)) {
      const fallback = targetCandidates.find((c) => targets.some((t) => t.profile_id === c.profile_id));
      if (fallback) {
        setRecipientId(fallback.profile_id);
        setRecipientRole(fallback.role);
      }
    }
  }, [isSimpleType, targets, recipientId, targetCandidates]);

  // entrance/custom：宛先の選択肢は配分に登録されている人のみ
  const recipientOptions = targetCandidates.filter((c) =>
    targets.some((t) => t.profile_id === c.profile_id)
  );

  const handleRecipientChange = (pid: string, role: "organizer" | "artist") => {
    setRecipientId(pid);
    setRecipientRole(role);
    if (!distTouched) setTargets([{ profile_id: pid, ratio: "100" }]);
  };

  const addTarget = () => {
    setDistTouched(true);
    setTargets((prev) => [...prev, { profile_id: targetCandidates[0]?.profile_id ?? "", ratio: "0" }]);
  };
  const removeTarget = (i: number) => {
    setDistTouched(true);
    setTargets((prev) => prev.filter((_, idx) => idx !== i));
  };
  const updateTarget = (i: number, field: keyof DistTarget, value: string) => {
    setDistTouched(true);
    setTargets((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!label.trim()) { setError("ラベルを入力してください"); return; }
    if (productType !== "entrance" && !isVoucher && !isDrinkTicket && !imageUrl) { setError("QR画像をアップロードしてください"); return; }
    if (!recipientId) { setError("宛先を選択してください"); return; }
    if (targets.length === 0) { setError("配分先を1人以上設定してください"); return; }
    if (!targets.some((t) => t.profile_id === recipientId)) { setError("宛先を配分先に含めてください"); return; }
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
    if (productType === "entrance" && paymentType === "C" && welcomeCheerEnabled) {
      const wcAmount = parseAmt(welcomeCheerAmount);
      if (wcAmount <= 0) { setError("ウェルカムチアの金額を入力してください"); return; }
      if (wcAmount >= fixedAmount) { setError("ウェルカムチアの金額はエントランス料金より低くしてください"); return; }
    }
    let parsedDrinkTiers: { min_quantity: number; unit_price: number }[] = [];
    if (isDrinkTicket && drinkQuantitySelectable && drinkTiers.length > 0) {
      let prevMinQty = 1;
      let prevUnitPrice = fixedAmount;
      for (const t of drinkTiers) {
        const minQty = parseInt(t.min_quantity, 10);
        const unitPrice = parseAmt(t.unit_price);
        if (!Number.isInteger(minQty) || minQty <= prevMinQty) {
          setError("まとめ買い割引の段階は杯数が昇順（2以上）である必要があります");
          return;
        }
        if (!Number.isInteger(unitPrice) || unitPrice <= 0) {
          setError("まとめ買い割引の単価を入力してください");
          return;
        }
        if (unitPrice > prevUnitPrice) {
          setError("まとめ買い割引は杯数が増えるごとに単価を同額以下にしてください");
          return;
        }
        prevMinQty = minQty;
        prevUnitPrice = unitPrice;
      }
      parsedDrinkTiers = drinkTiers.map((t) => ({ min_quantity: parseInt(t.min_quantity, 10), unit_price: parseAmt(t.unit_price) }));
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/qr/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          label: label || undefined,
          image_url: productType !== "entrance" && !isVoucher && !isDrinkTicket ? (imageUrl || undefined) : undefined,
          product_type: productType,
          min_amount: priceMode === "fixed" ? fixedAmount : minAmount,
          max_amount: priceMode === "fixed" ? fixedAmount : maxAmount,
          default_amount: priceMode === "fixed" ? fixedAmount : defaultAmount,
          amount_step: priceMode === "range" ? amountStep : 100,
          touchpay_enabled: touchpayEligible ? touchpayEnabled : false,
          recipient_profile_id: recipientId,
          recipient_name_context: recipientRole,
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
            ...(paymentType === "C" && welcomeCheerEnabled && {
              welcome_cheer_amount: parseAmt(welcomeCheerAmount),
              welcome_cheer_eligible_product_ids: welcomeCheerSelectedIds,
            }),
          }),
          ...(isVoucher && {
            payment_type: customSubtype,
            stock_limit: voucherStockLimit ? Number(voucherStockLimit) : null,
            track_inventory: !!voucherStockLimit,
            strip_image_url: stripImageUrl || undefined,
            bg_color: bgColor,
            fg_color: fgColor,
            label_color: labelColor,
          }),
          ...(isDrinkTicket && {
            payment_type: customSubtype,
            quantity_selectable: drinkQuantitySelectable,
            bulk_pricing: drinkQuantitySelectable && parsedDrinkTiers.length > 0 ? parsedDrinkTiers : null,
          }),
          bypass_validity: bypassValidity,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "エラーが発生しました"); return; }
      router.push(`/dashboard/events/${eventId}`);
    });
  };

  const recipientLabel = (c: TargetCandidate) =>
    `${c.display_name}${c.role === "organizer" ? "（主催者名義）" : "（演者名義）"}`;

  const currentRecipient = targetCandidates.find((c) => c.profile_id === recipientId && c.role === recipientRole);

  // ワンプライスの金額入力（全タイプ共通）
  const fixedPriceInput = (
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
  );

  // 配分設定（行リスト＋合計）
  const distributionBlock = (
    <>
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
                <option key={`${c.profile_id}::${c.role}`} value={c.profile_id}>
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
    </>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">

        {/* 商品タイプタブ */}
        <div className="flex gap-1 bg-slate-950/60 border border-slate-800 rounded-2xl p-1">
          {configs.map((cfg) =>
            cfg.is_enabled ? (
              <button
                key={cfg.type}
                type="button"
                onClick={() => handleTypeChange(cfg)}
                className={`flex-1 py-2.5 px-1 rounded-xl text-[11px] font-black transition-all border ${
                  productType === cfg.type
                    ? "bg-pink-500/20 border-pink-500/50 text-white"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {cfg.label}
              </button>
            ) : (
              <div
                key={cfg.type}
                title="エージェントと企画・承認後に解放"
                className="flex-1 py-2.5 px-1 rounded-xl text-[11px] font-black text-slate-600 flex items-center justify-center gap-1 cursor-not-allowed"
              >
                <Lock size={10} /> {cfg.label}
              </div>
            )
          )}
        </div>

        {/* カスタム：サブタイプ選択（ラベル入力より前） */}
        {productType === "custom" && (
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">カスタムタイプ</label>
            <div className="space-y-2">
              {(Object.entries(CUSTOM_SUBTYPE_INFO) as [CustomSubtype, (typeof CUSTOM_SUBTYPE_INFO)[CustomSubtype]][]).map(([type, info]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCustomSubtype(type)}
                  className={`w-full p-3 rounded-xl text-left transition-all border ${
                    customSubtype === type
                      ? "bg-amber-500/20 border-amber-500/50 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  <p className="text-xs font-black">{info.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{info.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

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

        {isSimpleType ? (
          <>
            {/* 宛先（配分より先に決める。全メンバーから選択） */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                宛先 <span className="text-pink-500">*</span>
              </label>
              <select
                value={`${recipientId}::${recipientRole}`}
                onChange={(e) => {
                  const [pid, role] = e.target.value.split("::");
                  handleRecipientChange(pid, role as "organizer" | "artist");
                }}
                className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 focus:outline-none"
              >
                {targetCandidates.map((c) => (
                  <option key={`${c.profile_id}::${c.role}`} value={`${c.profile_id}::${c.role}`}>
                    {recipientLabel(c)}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-600">
                決済記録上の名義人。主催者が演者を兼ねる場合は名義ごとに選択肢が分かれます。
              </p>
            </div>

            {/* QR画像・カードプレビュー */}
            <QRImageUpload
              eventTitle={eventTitle}
              artistName={currentRecipient?.display_name ?? ""}
              required
              onUploadComplete={setImageUrl}
            />
            {imageUrl && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">カードプレビュー</p>
                <div className="max-w-xs mx-auto opacity-90 pointer-events-none">
                  <CheersCard
                    artistName={currentRecipient?.display_name ?? "Artist"}
                    eventTitle={eventTitle}
                    artistAvatar={currentRecipient?.avatar_url ?? null}
                    imageUrl={imageUrl}
                    amount={priceMode === "fixed" ? fixedAmount : Math.round((minAmount + maxAmount) / 2)}
                    transactionId="PREVIEW"
                    serialNumber={1}
                  />
                </div>
                <p className="text-[9px] text-slate-600 text-center">※ 実際の金額・シリアル番号は異なります</p>
              </div>
            )}

            {/* 価格設定 */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">価格設定</label>

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

              {priceMode === "fixed" ? fixedPriceInput : (
                <div className="space-y-4">
                  {/* 最低金額スライダー */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">最低金額</label>
                      <span className="text-sm font-black text-white">¥{minAmount.toLocaleString()}</span>
                    </div>
                    <input
                      type="range"
                      min={currentConfig?.min_amount ?? 50}
                      max={(currentConfig?.max_amount ?? 3000) - amountStep}
                      step={amountStep}
                      value={minAmount}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setMinAmount(v);
                        let newMax = maxAmount;
                        if (v >= maxAmount) {
                          newMax = Math.min(v + amountStep, currentConfig?.max_amount ?? 3000);
                          setMaxAmount(newMax);
                        }
                        if (!defaultTouched) setDefaultAmount(v);
                        else setDefaultAmount((prev) => Math.min(Math.max(prev, v), newMax));
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
                        let newMin = minAmount;
                        if (v <= minAmount) {
                          newMin = Math.max(v - amountStep, currentConfig?.min_amount ?? 500);
                          setMinAmount(newMin);
                        }
                        if (!defaultTouched) setDefaultAmount(newMin);
                        else setDefaultAmount((prev) => Math.max(Math.min(prev, v), newMin));
                      }}
                      className="w-full accent-pink-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-600 font-bold">
                      <span>¥{(currentConfig?.min_amount ?? 500).toLocaleString()}</span>
                      <span>¥{(currentConfig?.max_amount ?? 3000).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* 詳細設定（スライド単位・デフォルト金額） */}
                  <button
                    type="button"
                    onClick={() => setShowPriceAdvanced((v) => !v)}
                    className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-[0.3em] transition-colors"
                  >
                    <ChevronDown size={12} className={`transition-transform ${showPriceAdvanced ? "rotate-180" : ""}`} />
                    詳細設定
                  </button>
                  {showPriceAdvanced && (
                    <div className="space-y-4 bg-slate-950/30 border border-slate-800 rounded-2xl p-4">
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
                      {/* デフォルト金額スライダー（QR読み取り時の初期表示金額） */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">デフォルト金額</label>
                          <span className="text-sm font-black text-white">¥{defaultAmount.toLocaleString()}</span>
                        </div>
                        <input
                          type="range"
                          min={minAmount}
                          max={maxAmount}
                          step={amountStep}
                          value={defaultAmount}
                          onChange={(e) => {
                            setDefaultAmount(Number(e.target.value));
                            setDefaultTouched(true);
                          }}
                          className="w-full accent-emerald-500"
                        />
                        <p className="text-[10px] text-slate-600">QR読み取り時に最初から表示される金額（未指定なら最低金額）</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 配分設定（宛先100%がデフォルト） */}
            <div className="space-y-3">
              {distributionBlock}
            </div>
          </>
        ) : (
          <>
            {/* 画像・プレビュー（entrance / バウチャー） */}
            {(productType === "entrance" || isVoucher) ? (
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
            ) : isDrinkTicket ? (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl px-4 py-3">
                <p className="text-xs text-slate-400">
                  ドリンクチケットは画像・QRを使用しません。決済完了画面の表示のみで受け渡しを確認します。
                </p>
              </div>
            ) : (
              <>
                <QRImageUpload
                  eventTitle={eventTitle}
                  artistName={currentRecipient?.display_name ?? ""}
                  required
                  onUploadComplete={setImageUrl}
                />
                {imageUrl && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">カードプレビュー</p>
                    <div className="max-w-xs mx-auto opacity-90 pointer-events-none">
                      <CheersCard
                        artistName={currentRecipient?.display_name ?? "Artist"}
                        eventTitle={eventTitle}
                        artistAvatar={currentRecipient?.avatar_url ?? null}
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

                {/* Cタイプのみ: ウェルカムチア（2階建て構造） */}
                {paymentType === "C" && (
                  <div className="space-y-3 bg-pink-500/5 border border-pink-500/20 rounded-xl p-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={welcomeCheerEnabled}
                        onChange={(e) => setWelcomeCheerEnabled(e.target.checked)}
                        className="w-4 h-4 rounded accent-pink-500"
                      />
                      <span className="text-xs text-slate-300 font-bold">ウェルカムチアを含める</span>
                    </label>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      入場料の中から一部を、後で購入者が選んだ演者へのチアとして切り出します（1階＝残りのエントランス取り分／2階＝ウェルカムチア）。
                    </p>
                    {welcomeCheerEnabled && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                          2階（ウェルカムチア）の金額 <span className="text-pink-500">*</span>
                        </label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={fmtAmt(parseAmt(welcomeCheerAmount))}
                          onChange={(e) => setWelcomeCheerAmount(e.target.value)}
                          placeholder="例: 500"
                          className="h-12 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                        <p className="text-[10px] text-slate-500">
                          エントランス料金（¥{fixedAmount.toLocaleString()}）より低い金額にしてください。
                        </p>
                      </div>
                    )}
                    {welcomeCheerEnabled && parseAmt(welcomeCheerAmount) > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                          2階に含める演者
                        </label>
                        <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5">
                          <Info size={10} className="shrink-0 mt-0.5" />
                          ワンプライスで¥{parseAmt(welcomeCheerAmount).toLocaleString()}と金額が完全一致する、演者本人の既存チアQRだけが候補に出ます。新しいQRはここでは作成されません。演者がまだ用意していない場合は候補に出ないので、先に演者へワンプライスのチアQR作成を依頼してください。
                        </p>
                        {welcomeCheerCandidatesLoading ? (
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 py-2">
                            <Loader2 size={12} className="animate-spin" /> 検索中...
                          </div>
                        ) : welcomeCheerCandidates.length === 0 ? (
                          <p className="text-[10px] text-amber-400">
                            ¥{parseAmt(welcomeCheerAmount).toLocaleString()} のワンプライスチアQRがまだありません。演者に先に作成してもらうか、後からこのQRを編集してください。
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {welcomeCheerCandidates.map((c) => (
                              <label
                                key={c.product_id}
                                className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                  welcomeCheerSelectedIds.includes(c.product_id)
                                    ? "bg-pink-500/20 border-pink-500/50"
                                    : "bg-slate-900 border-slate-800 hover:border-slate-700"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={welcomeCheerSelectedIds.includes(c.product_id)}
                                  onChange={() => toggleWelcomeCheerCandidate(c.product_id)}
                                  className="w-4 h-4 rounded accent-pink-500"
                                />
                                <span className="text-xs font-bold text-white">{c.artist_name ?? c.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* バウチャー設定（custom かつ payment_type='V' のとき） */}
            {isVoucher && (
              <div className="space-y-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
                <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Info size={10} /> バウチャー設定
                </p>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                    発行上限数（空欄 = 無制限）
                  </label>
                  <Input
                    type="number"
                    value={voucherStockLimit}
                    onChange={(e) => setVoucherStockLimit(e.target.value)}
                    placeholder="例: 50"
                    min={1}
                    className="h-12 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-amber-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <p className="text-[10px] text-slate-500">
                    購入者はQRコードを1回のみ引換に使用できます。イベント終了後に未消込のバウチャーは自動返金されます。
                  </p>
                </div>
              </div>
            )}

            {/* ドリンクチケット設定（custom かつ payment_type='D' のとき） */}
            {isDrinkTicket && (
              <div className="space-y-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
                <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Info size={10} /> ドリンクチケット設定
                </p>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-300">杯数を指定させる</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">OFFの場合は常に1杯固定になります</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={drinkQuantitySelectable}
                    onClick={() => setDrinkQuantitySelectable((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${drinkQuantitySelectable ? "bg-cyan-500" : "bg-slate-700"}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${drinkQuantitySelectable ? "translate-x-5" : "translate-x-1"}`} />
                  </button>
                </div>

                {drinkQuantitySelectable && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">まとめ買い割引</label>
                      <button
                        type="button"
                        onClick={addDrinkTier}
                        disabled={drinkTiers.length >= 4}
                        className="flex items-center gap-1 text-[10px] font-black text-cyan-400 hover:text-cyan-300 uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus size={12} /> 段階を追加
                      </button>
                    </div>
                    {drinkTiers.length === 0 ? (
                      <p className="text-[10px] text-slate-600">未設定の場合、割引はありません（何杯でも単価固定）</p>
                    ) : (
                      <div className="space-y-2">
                        {drinkTiers.map((tier, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={tier.min_quantity}
                              onChange={(e) => updateDrinkTier(i, "min_quantity", e.target.value)}
                              placeholder="例: 3"
                              min={2}
                              className="w-20 h-11 bg-slate-950/50 border-slate-700 rounded-xl px-3 text-sm text-white text-center focus:border-cyan-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                            />
                            <span className="text-[10px] text-slate-500 font-bold shrink-0">杯以上→1杯¥</span>
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={tier.unit_price}
                              onChange={(e) => updateDrinkTier(i, "unit_price", e.target.value)}
                              placeholder="例: 500"
                              className="flex-1 h-11 bg-slate-950/50 border-slate-700 rounded-xl px-3 text-sm text-white focus:border-cyan-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                            />
                            <button type="button" onClick={() => removeDrinkTier(i)} className="text-slate-600 hover:text-red-400 transition-colors shrink-0">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-slate-600">
                      段階が上がるごとに、通常単価（下記「価格設定」の金額）以下になるよう設定してください。
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 価格設定（エントランス・バウチャーはワンプライス固定） */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">価格設定</label>
              {fixedPriceInput}
            </div>

            {/* 対面タッチ決済（Case④）許可スイッチ */}
            {touchpayEligible && (
              <div className="flex items-center justify-between bg-indigo-500/5 border border-indigo-500/20 rounded-2xl px-4 py-3">
                <div>
                  <p className="text-xs font-black text-indigo-400">対面タッチ決済を許可する</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">親機のカードリーダーでこの商品を選択できるようになります</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={touchpayEnabled}
                  onClick={() => setTouchpayEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${touchpayEnabled ? "bg-indigo-500" : "bg-slate-700"}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${touchpayEnabled ? "translate-x-5" : "translate-x-1"}`} />
                </button>
              </div>
            )}

            {/* 配分設定 */}
            <div className="space-y-3">
              {distributionBlock}

              {/* 宛先（配分に登録されている人から選択） */}
              <div className="space-y-2 pt-2 border-t border-slate-700">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                  宛先 <span className="text-pink-500">*</span>
                </label>
                <p className="text-[10px] text-slate-600">
                  決済記録上の名義人。配分に追加した人の中から選択。オーガナイザーが演者を兼任している場合、
                  「主催者名義」と「演者名義」は別の選択肢として扱われ、明細書表記等に反映される名前が変わります。
                </p>
                {recipientOptions.length === 0 ? (
                  <p className="text-xs text-amber-400 font-bold">配分先を追加してください</p>
                ) : (
                  <select
                    value={`${recipientId}::${recipientRole}`}
                    onChange={(e) => {
                      const [pid, role] = e.target.value.split("::");
                      setRecipientId(pid);
                      setRecipientRole(role as "organizer" | "artist");
                    }}
                    className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 focus:outline-none"
                  >
                    {recipientOptions.map((c) => (
                      <option key={`${c.profile_id}::${c.role}`} value={`${c.profile_id}::${c.role}`}>
                        {recipientLabel(c)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </>
        )}

        {/* 詳細設定（シリアル番号採番単位） */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-[0.3em] transition-colors"
          >
            <ChevronDown size={12} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            詳細設定
          </button>
          {showAdvanced && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <Hash size={11} className="text-pink-500" /> シリアル番号の採番単位
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "artist", label: "アーティスト別", desc: "受取人ごとに #001, #002..." },
                  { value: "event",  label: "イベント通し", desc: "全QR合算で #001, #002..." },
                  { value: "qr",     label: "QRコード別",   desc: "このQR内だけで #001, #002..." },
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
          )}
        </div>

        {/* テスト用バイパス（organizer は使用不可） */}
        {userRole !== "organizer" && <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 rounded-2xl px-4 py-3">
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
        </div>}

        {error && <p className="text-sm text-red-400 font-bold">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={isPending || !label.trim() || (productType !== "entrance" && !isVoucher && !isDrinkTicket && !imageUrl) || !recipientId || Math.abs(totalRatio - 100) > 0.1 || !typeBBalanceOk}
        className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 size={20} className="animate-spin" /> : <>QRを作成 <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
