"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Loader2, Check, X, Plus } from "lucide-react";
import { QRImageUpload } from "@/components/qr-image-upload";
import { CheersCard } from "@/components/cheers-card";
import { StripImageUpload } from "@/components/strip-image-upload";
import { WalletTicketPreview } from "@/components/wallet-ticket-preview";

type TargetCandidate = { profile_id: string; display_name: string; avatar_url?: string | null; role: "organizer" | "artist"; status?: string };
type DistTarget = { profile_id: string; ratio: string };
type BulkTierInput = { min_quantity: string; unit_price: string };

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  A: "Aタイプ：5日前確定",
  B: "Bタイプ：即時確定",
  C: "Cタイプ：当日決済",
  V: "バウチャー（引換券）",
  D: "ドリンクチケット",
};

export function QREditDelete({
  qrConfigId,
  eventId,
  eventTitle = "",
  eventStartAt,
  eventVenue,
  isEntrance = false,
  isVoucher = false,
  isDrinkTicket = false,
  currentQuantitySelectable = true,
  currentBulkPricing = null,
  currentAutoCheckin = false,
  currentLabel,
  currentImageUrl,
  currentStripImageUrl,
  currentBgColor = "#0f172a",
  currentFgColor = "#ffffff",
  currentLabelColor = "#94a3b8",
  currentRecipientId,
  currentRecipientRole = "artist",
  currentTargets,
  hasTransactions = false,
  candidates,
  currentAmountStep = 100,
  currentDefaultAmount,
  currentTouchpayEnabled = false,
  productTypeLabel = "",
  productName = "",
  isRange = false,
  minAmount = 0,
  maxAmount = 0,
  paymentType = null,
  stockLimit = null,
  trackInventory = true,
  soldCount = 0,
  serialScopeLabel = "イベント通し",
  serialScopeInherited = false,
}: {
  qrConfigId: string;
  eventId: string;
  eventTitle?: string;
  eventStartAt?: string | null;
  eventVenue?: string | null;
  isEntrance?: boolean;
  isVoucher?: boolean;
  isDrinkTicket?: boolean;
  currentQuantitySelectable?: boolean;
  currentBulkPricing?: { min_quantity: number; unit_price: number }[] | null;
  currentAutoCheckin?: boolean;
  currentLabel: string;
  currentImageUrl?: string | null;
  currentStripImageUrl?: string | null;
  currentBgColor?: string;
  currentFgColor?: string;
  currentLabelColor?: string;
  currentRecipientId: string;
  currentRecipientRole?: "organizer" | "artist";
  currentTargets: { profile_id: string; distribution_ratio: number }[];
  hasTransactions?: boolean;
  candidates: TargetCandidate[];
  currentAmountStep?: 100 | 500 | 1000;
  currentDefaultAmount?: number;
  currentTouchpayEnabled?: boolean;
  productTypeLabel?: string;
  productName?: string;
  isRange?: boolean;
  minAmount?: number;
  maxAmount?: number;
  paymentType?: "A" | "B" | "C" | "V" | "D" | null;
  stockLimit?: number | null;
  trackInventory?: boolean;
  soldCount?: number;
  serialScopeLabel?: string;
  serialScopeInherited?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState(currentLabel);
  const [imageUrl, setImageUrl] = useState<string | null>(currentImageUrl ?? null);
  const [stripImageUrl, setStripImageUrl] = useState<string | null>(currentStripImageUrl ?? null);
  const [bgColor, setBgColor] = useState(currentBgColor);
  const [fgColor, setFgColor] = useState(currentFgColor);
  const [labelColor, setLabelColor] = useState(currentLabelColor);
  const [recipientId, setRecipientId] = useState(currentRecipientId);
  // 同一人物がオーガナイザー兼演者の場合、profile_idだけでは名義を区別できないため
  // 別途roleを保持し、qr_configs.recipient_name_context として送る
  const [recipientRole, setRecipientRole] = useState<"organizer" | "artist">(currentRecipientRole);
  const [amountStep, setAmountStep] = useState<100 | 500 | 1000>(currentAmountStep);
  const [defaultAmount, setDefaultAmount] = useState(currentDefaultAmount ?? minAmount);
  const [touchpayEnabled, setTouchpayEnabled] = useState(currentTouchpayEnabled);

  // 商品項目（商品情報があるQRのみ編集可）
  const [prodName, setProdName] = useState(productName);
  const [editMin, setEditMin] = useState(String(minAmount));
  const [editMax, setEditMax] = useState(String(maxAmount));
  const [editFixed, setEditFixed] = useState(String(minAmount));
  const [editStock, setEditStock] = useState(stockLimit != null ? String(stockLimit) : "");
  const [editTrackInv, setEditTrackInv] = useState(trackInventory);

  // ドリンクチケット（custom かつ payment_type='D'）
  const [drinkQuantitySelectable, setDrinkQuantitySelectable] = useState(currentQuantitySelectable);
  const [drinkTiers, setDrinkTiers] = useState<BulkTierInput[]>(
    (currentBulkPricing ?? []).map((t) => ({ min_quantity: String(t.min_quantity), unit_price: String(t.unit_price) })),
  );
  const addDrinkTier = () => setDrinkTiers((prev) => [...prev, { min_quantity: "", unit_price: "" }]);
  const removeDrinkTier = (i: number) => setDrinkTiers((prev) => prev.filter((_, idx) => idx !== i));
  const updateDrinkTier = (i: number, field: keyof BulkTierInput, value: string) =>
    setDrinkTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));

  // エントランス×Cタイプ: 決済完了と同時に入場確定（QRスキャン省略）
  const [autoCheckin, setAutoCheckin] = useState(currentAutoCheckin);

  // 対面タッチ決済（Case④）: エントランスCタイプ、バウチャー×金額固定、
  // またはドリンクチケット×杯数指定オフ（常に数量1固定）のみ対象
  const touchpayEligible = (isEntrance && paymentType === "C") || (isVoucher && !isRange) || (isDrinkTicket && !drinkQuantitySelectable);
  const [targets, setTargets] = useState<DistTarget[]>(
    currentTargets.map((t) => ({
      profile_id: t.profile_id,
      ratio: (t.distribution_ratio * 100).toFixed(1),
    })),
  );

  const totalRatio = targets.reduce((sum, t) => sum + (parseFloat(t.ratio) || 0), 0);

  // 宛先の選択肢は配分に登録されている人のみ
  const recipientOptions = candidates.filter((c) =>
    targets.some((t) => t.profile_id === c.profile_id)
  );

  const addTarget = () =>
    setTargets((prev) => [...prev, { profile_id: candidates[0]?.profile_id ?? "", ratio: "0" }]);
  const removeTarget = (i: number) =>
    setTargets((prev) => prev.filter((_, idx) => idx !== i));
  const updateTarget = (i: number, field: keyof DistTarget, value: string) =>
    setTargets((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));

  const handleSave = () => {
    if (!label.trim()) {
      setError("ラベルを入力してください");
      return;
    }
    if (!isEntrance && !isVoucher && !isDrinkTicket && !imageUrl) {
      setError("QR画像をアップロードしてください");
      return;
    }
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
    // 商品項目のバリデーション
    let newMin = minAmount;
    let newMax = maxAmount;
    if (productTypeLabel) {
      if (!prodName.trim()) {
        setError("商品名を入力してください");
        return;
      }
      if (isRange) {
        newMin = parseInt(editMin, 10);
        newMax = parseInt(editMax, 10);
      } else {
        newMin = newMax = parseInt(editFixed, 10);
      }
      if (!Number.isInteger(newMin) || !Number.isInteger(newMax) || newMin <= 0) {
        setError("金額を正しく入力してください");
        return;
      }
      if (newMin > newMax) {
        setError("最低金額が最高金額を上回っています");
        return;
      }
      if ((isEntrance || isVoucher) && editStock.trim() !== "") {
        const stock = parseInt(editStock, 10);
        if (!Number.isInteger(stock) || stock < 1) {
          setError("在庫上限を正しく入力してください");
          return;
        }
        if (stock < soldCount) {
          setError(`在庫上限は販売済み数（${soldCount}件）以上にしてください`);
          return;
        }
      }
    }
    let parsedDrinkTiers: { min_quantity: number; unit_price: number }[] = [];
    if (isDrinkTicket && drinkQuantitySelectable && drinkTiers.length > 0) {
      let prevMinQty = 1;
      let prevUnitPrice = newMax;
      for (const t of drinkTiers) {
        const minQty = parseInt(t.min_quantity, 10);
        const unitPrice = parseInt(t.unit_price.replace(/,/g, ""), 10);
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
      parsedDrinkTiers = drinkTiers.map((t) => ({ min_quantity: parseInt(t.min_quantity, 10), unit_price: parseInt(t.unit_price.replace(/,/g, ""), 10) }));
    }
    setError(null);
    startTransition(async () => {
      const body: Record<string, unknown> = {
        label: label.trim() || null,
        recipient_profile_id: recipientId,
        recipient_name_context: recipientRole,
      };
      if (!hasTransactions) {
        body.targets = targets.map((t) => ({
          profile_id: t.profile_id,
          distribution_ratio: (parseFloat(t.ratio) || 0) / 100,
        }));
      }
      if (isEntrance || isVoucher) {
        body.strip_image_url = stripImageUrl;
        body.bg_color = bgColor;
        body.fg_color = fgColor;
        body.label_color = labelColor;
      } else if (!isDrinkTicket) {
        body.image_url = imageUrl;
        body.amount_step = amountStep;
        // レンジが変わった場合はデフォルト金額を新しい範囲内にクランプして送る
        if (isRange) body.default_amount = Math.min(Math.max(defaultAmount, newMin), newMax);
      }
      if (touchpayEligible) body.touchpay_enabled = touchpayEnabled;
      if (productTypeLabel) {
        body.product_name = prodName.trim();
        body.min_amount = newMin;
        body.max_amount = newMax;
        if (isEntrance || isVoucher) {
          body.stock_limit = editStock.trim() === "" ? null : parseInt(editStock, 10);
        }
        if (isEntrance) body.track_inventory = editTrackInv;
        if (isDrinkTicket) {
          body.quantity_selectable = drinkQuantitySelectable;
          body.bulk_pricing = drinkQuantitySelectable && parsedDrinkTiers.length > 0 ? parsedDrinkTiers : null;
        }
        if (isEntrance && paymentType === "C") body.auto_checkin = autoCheckin;
      }

      const res = await fetch(`/api/qr/${qrConfigId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const handleCancel = () => {
    setEditing(false);
    setLabel(currentLabel);
    setImageUrl(currentImageUrl ?? null);
    setStripImageUrl(currentStripImageUrl ?? null);
    setBgColor(currentBgColor);
    setFgColor(currentFgColor);
    setLabelColor(currentLabelColor);
    setRecipientId(currentRecipientId);
    setRecipientRole(currentRecipientRole);
    setDefaultAmount(currentDefaultAmount ?? minAmount);
    setTouchpayEnabled(currentTouchpayEnabled);
    setProdName(productName);
    setEditMin(String(minAmount));
    setEditMax(String(maxAmount));
    setEditFixed(String(minAmount));
    setEditStock(stockLimit != null ? String(stockLimit) : "");
    setEditTrackInv(trackInventory);
    setDrinkQuantitySelectable(currentQuantitySelectable);
    setDrinkTiers((currentBulkPricing ?? []).map((t) => ({ min_quantity: String(t.min_quantity), unit_price: String(t.unit_price) })));
    setAutoCheckin(currentAutoCheckin);
    setTargets(
      currentTargets.map((t) => ({
        profile_id: t.profile_id,
        ratio: (t.distribution_ratio * 100).toFixed(1),
      })),
    );
    setError(null);
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

  const candidateName = (id: string) =>
    candidates.find((c) => c.profile_id === id)?.display_name ?? id;

  const isSaveDisabled = isPending
    || !label.trim()
    || (!isEntrance && !isVoucher && !isDrinkTicket && !imageUrl)
    || Math.abs(totalRatio - 100) > 0.1;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">QR 管理</p>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs font-black text-pink-500 hover:text-pink-400 transition-colors"
          >
            <Pencil size={12} /> 設定を編集
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-5">
          {/* ラベル */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              ラベル <span className="text-pink-500">*</span>
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例: DJ ブース用"
              className="h-12 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          {/* 商品名 */}
          {productTypeLabel && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                商品名 <span className="text-pink-500">*</span>
              </label>
              <Input
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="例: 前売りチケット / 会場ドリンク"
                className="h-12 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <p className="text-[10px] text-slate-600">購入ページやWalletチケットに表示される名前です</p>
            </div>
          )}

          {/* 金額設定 */}
          {productTypeLabel && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">金額設定</label>
              {isRange ? (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "最低金額", value: editMin, onChange: setEditMin },
                    { label: "最高金額", value: editMax, onChange: setEditMax },
                  ].map(({ label: amtLabel, value, onChange }) => (
                    <div key={amtLabel} className="space-y-1.5">
                      <p className="text-[10px] text-slate-500">{amtLabel}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-sm font-bold">¥</span>
                        <Input
                          type="number"
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                          min={1}
                          className="h-12 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-sm font-bold">¥</span>
                  <Input
                    type="number"
                    value={editFixed}
                    onChange={(e) => setEditFixed(e.target.value)}
                    min={1}
                    className="h-12 w-40 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <span className="text-xs text-slate-500 font-bold">固定</span>
                </div>
              )}
              <p className="text-[10px] text-slate-600">変更は今後の決済にのみ適用されます。過去の決済金額は変わりません。</p>
            </div>
          )}

          {/* 在庫設定（エントランス・バウチャーのみ） */}
          {productTypeLabel && (isEntrance || isVoucher) && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">在庫上限</label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={editStock}
                  onChange={(e) => setEditStock(e.target.value)}
                  min={Math.max(soldCount, 1)}
                  placeholder="無制限"
                  className="h-12 w-40 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <span className="text-xs text-slate-500 font-bold">件（空欄で無制限）</span>
              </div>
              {soldCount > 0 && (
                <p className="text-[10px] text-slate-600">販売済み {soldCount}件。それ未満には設定できません。</p>
              )}
              {isEntrance && (
                <div className="flex items-center justify-between bg-slate-800/50 rounded-2xl px-4 py-3 mt-2">
                  <div>
                    <p className="text-xs font-black text-slate-300">在庫管理</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">OFFにすると在庫上限に関係なく販売を続けます</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editTrackInv}
                    onClick={() => setEditTrackInv((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${editTrackInv ? "bg-emerald-500" : "bg-slate-700"}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${editTrackInv ? "translate-x-5" : "translate-x-1"}`} />
                  </button>
                </div>
              )}
              {isEntrance && paymentType === "C" && (
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center justify-between bg-slate-800/50 rounded-2xl px-4 py-3">
                    <div>
                      <p className="text-xs font-black text-slate-300">決済完了と同時に入場確定にする</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">ONにすると入場QRスキャンを省略します</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoCheckin}
                      onClick={() => setAutoCheckin((v) => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${autoCheckin ? "bg-emerald-500" : "bg-slate-700"}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${autoCheckin ? "translate-x-5" : "translate-x-1"}`} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {(isEntrance || isVoucher) ? (
            <>
              {/* ストリップ画像 */}
              <StripImageUpload
                currentUrl={stripImageUrl}
                pathPrefix={qrConfigId}
                onUploadComplete={setStripImageUrl}
              />

              {/* カラーピッカー */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">券面カラー</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "背景色", value: bgColor, onChange: setBgColor },
                    { label: "文字色", value: fgColor, onChange: setFgColor },
                    { label: "ラベル色", value: labelColor, onChange: setLabelColor },
                  ].map(({ label: colorLabel, value, onChange }) => (
                    <div key={colorLabel} className="space-y-1.5">
                      <p className="text-[10px] text-slate-500">{colorLabel}</p>
                      <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2 border border-slate-700">
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                        />
                        <span className="text-xs font-mono text-slate-400">{value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Wallet プレビュー */}
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">チケットプレビュー</p>
                <WalletTicketPreview
                  eventTitle={eventTitle}
                  productName={label.trim() || "入場チケット"}
                  startAt={eventStartAt ?? null}
                  venue={eventVenue ?? null}
                  stripImageUrl={stripImageUrl}
                  bgColor={bgColor}
                  fgColor={fgColor}
                  labelColor={labelColor}
                />
              </div>
            </>
          ) : isDrinkTicket ? (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl px-4 py-3">
              <p className="text-xs text-slate-400">
                ドリンクチケットは画像・QRを使用しません。決済完了画面の表示のみで受け渡しを確認します。
              </p>
            </div>
          ) : (
            <>
              {/* QR画像 */}
              <QRImageUpload
                currentUrl={imageUrl}
                pathPrefix={qrConfigId}
                eventTitle={eventTitle}
                artistName={candidates.find((c) => c.profile_id === recipientId && c.role === recipientRole)?.display_name ?? ""}
                onUploadComplete={setImageUrl}
              />

              {/* カードプレビュー */}
              {imageUrl && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">カードプレビュー</p>
                  <div className="max-w-xs mx-auto opacity-90 pointer-events-none">
                    <CheersCard
                      artistName={candidates.find((c) => c.profile_id === recipientId && c.role === recipientRole)?.display_name ?? "Artist"}
                      eventTitle={eventTitle}
                      artistAvatar={candidates.find((c) => c.profile_id === recipientId && c.role === recipientRole)?.avatar_url ?? null}
                      imageUrl={imageUrl}
                      amount={1000}
                      transactionId="PREVIEW"
                      serialNumber={1}
                    />
                  </div>
                  <p className="text-[9px] text-slate-600 text-center">※ 実際の金額・シリアル番号は異なります</p>
                </div>
              )}
            </>
          )}

          {/* ドリンクチケット設定（custom かつ payment_type='D' のとき） */}
          {isDrinkTicket && (
            <div className="space-y-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
              <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">ドリンクチケット設定</p>

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
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-600">
                    段階が上がるごとに、通常単価（上記「金額設定」）以下になるよう設定してください。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* スライド単位（レンジ指定の非 entrance・非 custom のみ） */}
          {!isEntrance && !isVoucher && isRange && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">スライド単位</label>
              <div className="grid grid-cols-3 gap-2">
                {([100, 500, 1000] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setAmountStep(s)}
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
          )}

          {/* デフォルト金額（レンジ指定の非 entrance・非 custom のみ） */}
          {!isEntrance && !isVoucher && isRange && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">デフォルト金額</label>
                <span className="text-sm font-black text-white">¥{defaultAmount.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min={parseInt(editMin, 10) || minAmount}
                max={parseInt(editMax, 10) || maxAmount}
                step={amountStep}
                value={defaultAmount}
                onChange={(e) => setDefaultAmount(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <p className="text-[10px] text-slate-600">QR読み取り時に最初から表示される金額</p>
            </div>
          )}

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

          {/* 宛先 */}
          <div className="space-y-2">
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
                    {c.display_name}{c.role === "organizer" ? "（主催者名義）" : "（演者名義）"}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 配分設定 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                配分設定
              </label>
              {!hasTransactions && (
                <button
                  type="button"
                  onClick={addTarget}
                  className="flex items-center gap-1 text-[10px] font-black text-pink-500 hover:text-pink-400 uppercase tracking-widest"
                >
                  <Plus size={12} /> 追加
                </button>
              )}
            </div>

            {hasTransactions ? (
              <>
                <p className="text-[10px] text-amber-400 font-bold leading-relaxed">
                  決済が発生しているため配分は変更できません。配分を変更したい場合は新しいQRコードを作成してください。
                </p>
                <div className="space-y-2">
                  {targets.map((t, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 bg-slate-800/50 rounded-xl">
                      <span className="text-sm text-slate-300">{candidateName(t.profile_id)}</span>
                      <span className="text-sm font-bold text-slate-400">{t.ratio}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-2">
                {targets.map((t, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <select
                      value={t.profile_id}
                      onChange={(e) => updateTarget(i, "profile_id", e.target.value)}
                      className="flex-1 h-12 bg-slate-800 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 focus:outline-none"
                    >
                      {candidates.map((c) => (
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
                      <button
                        type="button"
                        onClick={() => removeTarget(i)}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-500">合計</span>
              <span className={Math.abs(totalRatio - 100) < 0.1 ? "text-emerald-400" : "text-red-400"}>
                {totalRatio.toFixed(1)}%
              </span>
            </div>
          </div>

          {error && <p className="text-xs text-red-400 font-bold">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaveDisabled}
              className="flex-1 h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <><Check size={14} /> 保存</>}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="h-12 px-5 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-black text-slate-400 transition-all disabled:opacity-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 商品タイプ・価格情報 */}
          {productTypeLabel && (
            <div className="px-4 py-3 bg-slate-800/50 rounded-xl space-y-1.5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">商品情報</p>
              {productName && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">商品名</span>
                  <span className="font-bold text-slate-200">{productName}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">タイプ</span>
                <span className="font-bold text-slate-200">{productTypeLabel}</span>
              </div>
              {paymentType && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">決済タイプ</span>
                  <span className="font-bold text-slate-200">{PAYMENT_TYPE_LABELS[paymentType] ?? paymentType}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">金額</span>
                <span className="font-bold text-slate-200">
                  {isRange
                    ? `¥${minAmount.toLocaleString("ja-JP")} 〜 ¥${maxAmount.toLocaleString("ja-JP")}`
                    : `¥${minAmount.toLocaleString("ja-JP")} 固定`}
                </span>
              </div>
              {isRange && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">スライド単位</span>
                  <span className="font-bold text-slate-200">¥{currentAmountStep.toLocaleString("ja-JP")}</span>
                </div>
              )}
              {isRange && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">デフォルト金額</span>
                  <span className="font-bold text-slate-200">¥{(currentDefaultAmount ?? minAmount).toLocaleString("ja-JP")}</span>
                </div>
              )}
              {(isEntrance || isVoucher) && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">在庫上限</span>
                  <span className="font-bold text-slate-200">
                    {stockLimit != null ? `${stockLimit.toLocaleString("ja-JP")}件` : "無制限"}
                  </span>
                </div>
              )}
              {isEntrance && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">在庫管理</span>
                  <span className="font-bold text-slate-200">{trackInventory ? "ON" : "OFF"}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">SEQ採番単位</span>
                <span className="font-bold text-slate-200">
                  {serialScopeLabel}{serialScopeInherited ? "（イベント設定を継承）" : ""}
                </span>
              </div>
              {touchpayEligible && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">対面タッチ決済</span>
                  <span className={`font-bold ${currentTouchpayEnabled ? "text-emerald-400" : "text-slate-500"}`}>
                    {currentTouchpayEnabled ? "許可" : "不許可"}
                  </span>
                </div>
              )}
              {isEntrance && paymentType === "C" && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">決済で即入場確定</span>
                  <span className={`font-bold ${currentAutoCheckin ? "text-emerald-400" : "text-slate-500"}`}>
                    {currentAutoCheckin ? "ON（QRスキャン省略）" : "OFF"}
                  </span>
                </div>
              )}
              {isDrinkTicket && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">杯数指定</span>
                  <span className="font-bold text-slate-200">{currentQuantitySelectable ? "ON" : "OFF（1杯固定）"}</span>
                </div>
              )}
              {isDrinkTicket && currentQuantitySelectable && (currentBulkPricing?.length ?? 0) > 0 && (
                <div className="text-xs space-y-1">
                  <span className="text-slate-400">まとめ買い割引</span>
                  <div className="space-y-0.5">
                    {currentBulkPricing!.map((t) => (
                      <div key={t.min_quantity} className="flex items-center justify-between pl-3">
                        <span className="text-slate-500">{t.min_quantity}杯以上</span>
                        <span className="font-bold text-slate-200">¥{t.unit_price.toLocaleString("ja-JP")}/杯</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(isEntrance || isVoucher) ? (
            <>
              {currentStripImageUrl && (
                <img
                  src={currentStripImageUrl}
                  alt="strip image"
                  className="w-full rounded-xl object-cover border border-slate-700"
                  style={{ aspectRatio: String(1125 / 294) }}
                />
              )}
              <div className="flex gap-2">
                {[
                  { label: "背景色", value: currentBgColor },
                  { label: "文字色", value: currentFgColor },
                  { label: "ラベル色", value: currentLabelColor },
                ].map(({ label: colorLabel, value }) => (
                  <div key={colorLabel} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/50 rounded-xl text-xs">
                    <span
                      className="w-3 h-3 rounded-full border border-slate-600 inline-block shrink-0"
                      style={{ backgroundColor: value }}
                    />
                    <span className="text-slate-500">{colorLabel}</span>
                    <span className="text-slate-400 font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            currentImageUrl && (
              <img
                src={currentImageUrl}
                alt="QR image"
                className="w-20 h-20 rounded-xl object-cover border border-slate-700"
              />
            )
          )}
          <div className="px-4 py-3 bg-slate-800/50 rounded-xl text-xs">
            <span className="font-black text-slate-400">宛先: </span>
            <span className="text-slate-200">{candidateName(currentRecipientId)}</span>
          </div>
          <div className="px-4 py-3 bg-slate-800/50 rounded-xl space-y-1.5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">配分</p>
            {currentTargets.map((t) => (
              <div key={t.profile_id} className="flex justify-between text-xs">
                <span className="text-slate-300">{candidateName(t.profile_id)}</span>
                <span className="text-slate-400 font-bold">{(t.distribution_ratio * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          {error && <p className="text-xs text-red-400 font-bold">{error}</p>}
        </div>
      )}

      {!editing && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="flex items-center gap-2 w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-sm font-bold text-red-400 transition-all disabled:opacity-50"
        >
          <Trash2 size={14} className="shrink-0" />
          このQRコードを削除
        </button>
      )}
    </div>
  );
}
