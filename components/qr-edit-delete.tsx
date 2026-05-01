"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Loader2, Check, X, Plus } from "lucide-react";
import { QRImageUpload } from "@/components/qr-image-upload";
import { CheersCard } from "@/components/cheers-card";
import { StripImageUpload } from "@/components/strip-image-upload";
import { WalletTicketPreview } from "@/components/wallet-ticket-preview";

type TargetCandidate = { profile_id: string; display_name: string; role: "organizer" | "artist" };
type DistTarget = { profile_id: string; ratio: string };

export function QREditDelete({
  qrConfigId,
  eventId,
  eventTitle = "",
  eventStartAt,
  eventVenue,
  isEntrance = false,
  currentLabel,
  currentImageUrl,
  currentStripImageUrl,
  currentBgColor = "#0f172a",
  currentFgColor = "#ffffff",
  currentLabelColor = "#94a3b8",
  currentRecipientId,
  currentTargets,
  candidates,
}: {
  qrConfigId: string;
  eventId: string;
  eventTitle?: string;
  eventStartAt?: string | null;
  eventVenue?: string | null;
  isEntrance?: boolean;
  currentLabel: string;
  currentImageUrl?: string | null;
  currentStripImageUrl?: string | null;
  currentBgColor?: string;
  currentFgColor?: string;
  currentLabelColor?: string;
  currentRecipientId: string;
  currentTargets: { profile_id: string; distribution_ratio: number }[];
  candidates: TargetCandidate[];
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
  const [targets, setTargets] = useState<DistTarget[]>(
    currentTargets.map((t) => ({
      profile_id: t.profile_id,
      ratio: (t.distribution_ratio * 100).toFixed(1),
    })),
  );

  const totalRatio = targets.reduce((sum, t) => sum + (parseFloat(t.ratio) || 0), 0);

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
    if (!isEntrance && !imageUrl) {
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
    setError(null);
    startTransition(async () => {
      const body: Record<string, unknown> = {
        label: label.trim() || null,
        recipient_profile_id: recipientId,
        targets: targets.map((t) => ({
          profile_id: t.profile_id,
          distribution_ratio: (parseFloat(t.ratio) || 0) / 100,
        })),
      };
      if (isEntrance) {
        body.strip_image_url = stripImageUrl;
        body.bg_color = bgColor;
        body.fg_color = fgColor;
        body.label_color = labelColor;
      } else {
        body.image_url = imageUrl;
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
    || (!isEntrance && !imageUrl)
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

          {isEntrance ? (
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
          ) : (
            <>
              {/* QR画像 */}
              <QRImageUpload
                currentUrl={imageUrl}
                pathPrefix={qrConfigId}
                eventTitle={eventTitle}
                artistName={candidates.find((c) => c.profile_id === recipientId)?.display_name ?? ""}
                onUploadComplete={setImageUrl}
              />

              {/* カードプレビュー */}
              {imageUrl && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">カードプレビュー</p>
                  <div className="max-w-xs mx-auto opacity-90 pointer-events-none">
                    <CheersCard
                      artistName={candidates.find((c) => c.profile_id === recipientId)?.display_name ?? "Artist"}
                      eventTitle={eventTitle}
                      artistAvatar={null}
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

          {/* 宛先 */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              宛先 <span className="text-pink-500">*</span>
            </label>
            <p className="text-[10px] text-slate-600">決済記録上で「誰への支払いか」を示す名義人</p>
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 focus:outline-none"
            >
              {candidates.map((c) => (
                <option key={c.profile_id} value={c.profile_id}>
                  {c.display_name}{c.role === "organizer" ? "（主催者）" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* 配分設定 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                配分設定
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
                    {candidates.map((c) => (
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
          {isEntrance ? (
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
