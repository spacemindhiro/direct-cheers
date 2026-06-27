"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Search,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
} from "lucide-react";

type PiInfo = {
  paymentIntentId: string;
  stripeStatus: string;
  statusLabel: string;
  amount: number;
  currency: string;
  created: number;
  onBehalfOf: string | null;
  organizerName: string | null;
  organizerConnectId: string | null;
  transactionId: string | null;
  transactionStatus: string | null;
  transactionType: string | null;
  eventTitle: string | null;
  isSettled: boolean;
  stripeFee: number | null;
  platformFee: number | null;
  netAmount: number | null;
  settleTransferCount: number;
  settleTransferTotal: number;
};

type RefundResult = {
  success: boolean;
  mode: string;
  refundId?: string;
  totalReversed?: number;
  reversalErrors?: number;
  message: string;
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("ja-JP") + "円";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "オーソリ中") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-[10px] font-black uppercase tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        オーソリ中
      </span>
    );
  }
  if (status === "キャプチャ済み") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 text-[10px] font-black uppercase tracking-widest">
        <CheckCircle2 size={10} />
        キャプチャ済み
      </span>
    );
  }
  if (status === "精算済み") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest">
        <CheckCircle2 size={10} />
        精算済み
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-widest">
      {status}
    </span>
  );
}

export function RefundClient() {
  const [piInput, setPiInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [piInfo, setPiInfo] = useState<PiInfo | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [refundType, setRefundType] = useState<"FULL_PENALTY" | "COMPASSIONATE" | "">("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<RefundResult | null>(null);

  // キャプチャ前（オーソリ中）= 全額ノーダメージでキャンセル可能
  const isPreCapture = piInfo?.stripeStatus === "requires_capture";
  // キャプチャ後・settle前 = Stripe手数料は既確定で戻らない。organizer 未受取につき回収不要
  const isCapturedPreSettle =
    piInfo?.stripeStatus === "succeeded" && (piInfo?.settleTransferCount ?? 0) === 0;
  // キャプチャ後・settle後 = settle_transfer が存在。モード選択による逆転が必要
  const isCapturedPostSettle =
    piInfo?.stripeStatus === "succeeded" && (piInfo?.settleTransferCount ?? 0) > 0;

  const modeReady = isPreCapture || refundType !== "";
  const canExecute = piInfo !== null && reason.trim().length >= 5 && modeReady && confirmed;

  async function handleSearch() {
    if (!piInput.trim().startsWith("pi_")) {
      setSearchError("PaymentIntent IDは pi_ から始まる必要があります");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setPiInfo(null);
    setResult(null);
    setRefundType("");
    setReason("");
    setConfirmed(false);

    try {
      const res = await fetch(`/api/admin/refund?pi=${encodeURIComponent(piInput.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "検索に失敗しました");
      } else {
        setPiInfo(data);
      }
    } catch {
      setSearchError("ネットワークエラーが発生しました");
    } finally {
      setSearching(false);
    }
  }

  async function handleExecute() {
    if (!piInfo) return;
    setExecuting(true);
    setShowDialog(false);

    try {
      const body: Record<string, string> = {
        paymentIntentId: piInfo.paymentIntentId,
        reason: reason.trim(),
      };
      if (isCapturedPreSettle || isCapturedPostSettle) body.refundType = refundType;

      const res = await fetch("/api/admin/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ success: false, mode: "", message: data.error ?? "返金に失敗しました" });
      } else {
        setResult(data);
        setPiInfo(null);
        setPiInput("");
        setRefundType("");
        setReason("");
        setConfirmed(false);
      }
    } catch {
      setResult({ success: false, mode: "", message: "ネットワークエラーが発生しました" });
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* 返金完了 / エラー結果 */}
      {result && (
        <div
          className={`rounded-2xl p-5 border ${
            result.success
              ? "bg-emerald-950/40 border-emerald-500/30"
              : "bg-red-950/40 border-red-500/30"
          }`}
        >
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-black text-sm text-white">{result.success ? "返金完了" : "返金失敗"}</p>
              <p className="text-xs text-slate-300 mt-1">{result.message}</p>
              {result.refundId && (
                <p className="text-[10px] font-mono text-slate-500 mt-2">
                  Refund ID: {result.refundId}
                </p>
              )}
              {result.totalReversed !== undefined && (
                <p className="text-[10px] text-slate-400 mt-1">
                  回収額: {fmt(result.totalReversed)}
                  {(result.reversalErrors ?? 0) > 0 && (
                    <span className="ml-2 text-amber-400">（逆転失敗: {result.reversalErrors}件）</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setResult(null)}
            className="mt-3 text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            <RotateCcw size={10} /> 別の返金を実行する
          </button>
        </div>
      )}

      {/* ① PI 検索エリア */}
      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
          Step 1 — 対象決済の検索
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={piInput}
            onChange={(e) => setPiInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !searching && handleSearch()}
            placeholder="pi_3Txxxxxxxxxxxxxx"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/20 transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !piInput.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest transition-colors"
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            検索
          </button>
        </div>
        {searchError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <XCircle size={13} /> {searchError}
          </p>
        )}
      </div>

      {/* 検索結果 */}
      {piInfo && (
        <>
          {/* 決済詳細カード */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  決済詳細
                </p>
                <p className="font-mono text-xs text-slate-400">{piInfo.paymentIntentId}</p>
              </div>
              <StatusBadge status={piInfo.statusLabel} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">取引日時</p>
                <p className="text-sm font-black text-white">
                  {new Date(piInfo.created * 1000).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">Gross（税込）</p>
                <p className="text-sm font-black text-white">{fmt(piInfo.amount)}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">Stripe手数料</p>
                <p className="text-sm font-black text-slate-300">{fmt(piInfo.stripeFee)}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">プラットフォーム手数料</p>
                <p className="text-sm font-black text-slate-300">{fmt(piInfo.platformFee)}</p>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">オーガナイザー</p>
                <p className="text-sm font-bold text-white">
                  {piInfo.organizerName ?? "—"}
                </p>
                {piInfo.organizerConnectId && (
                  <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                    {piInfo.organizerConnectId}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">イベント</p>
                <p className="text-sm font-bold text-white truncate">{piInfo.eventTitle ?? "—"}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">プラン</p>
                <p className="text-sm font-bold text-slate-300">{piInfo.transactionType ?? "—"}</p>
              </div>
            </div>

            {piInfo.settleTransferCount > 0 && (
              <div className="bg-slate-800/50 rounded-xl px-4 py-3">
                <p className="text-[10px] text-slate-400">
                  精算済み: settle_transfer {piInfo.settleTransferCount}件 /
                  合計{fmt(piInfo.settleTransferTotal)}
                  {piInfo.settleTransferTotal > 0 && " を送金済み（返金時に逆転対象）"}
                </p>
              </div>
            )}
          </div>

          {/* ② 返金実行フォーム */}
          <div className="space-y-6">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Step 2 — 返金実行
            </p>

            {/* オーソリ中: 安全通知のみ、モード選択不要 */}
            {isPreCapture && (
              <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <ShieldAlert size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-black text-emerald-300">自動：オーソリ取消モード</p>
                    <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                      この決済はまだキャプチャされていません。返金を実行すると客のカード利用枠が解放され、プラットフォーム・オーガナイザー共に残高移動は発生しません。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* キャプチャ済み（settle前・settle後共通）: モード選択必須 */}
            {(isCapturedPreSettle || isCapturedPostSettle) && (
              <div className="space-y-3">
                {isCapturedPreSettle && (
                  <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl px-4 py-3">
                    <p className="text-[10px] text-amber-300 font-bold">
                      ⚠ キャプチャ済み・settle前 — Stripe手数料（約4%）は返金されません
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      オーガナイザーへの送金は未実施のため transfer 逆転は不要ですが、Stripe手数料の扱いをモードで決定してください。
                    </p>
                  </div>
                )}
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  返金モードを選択（必須）
                </p>
                <RadioGroup
                  value={refundType}
                  onValueChange={(v) => setRefundType(v as "FULL_PENALTY" | "COMPASSIONATE")}
                  className="space-y-3"
                >
                  {/* FULL_PENALTY */}
                  <label
                    className={`flex items-start gap-4 bg-slate-900 border rounded-2xl p-4 cursor-pointer transition-colors ${
                      refundType === "FULL_PENALTY"
                        ? "border-red-500/40 bg-red-950/20"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <RadioGroupItem value="FULL_PENALTY" id="mode-full" className="mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-black text-white">通常モード</span>
                        <span className="text-[9px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                          FULL_PENALTY
                        </span>
                      </div>
                      {isCapturedPreSettle ? (
                        <p className="text-xs text-slate-400 leading-relaxed">
                          規約通り処理します。客へ全額返金。Stripe手数料（約4%）は将来の精算時にオーガナイザーの取り分から控除します。
                          <span className="text-red-300 font-bold"> 精算担当への申し送りが必要です。</span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 leading-relaxed">
                          規約通り処理します。客へ全額返金後、オーガナイザーの口座からプラットフォームの手数料10%を含む全額を強制徴収します。プラットフォームの利益は守られます。
                        </p>
                      )}
                      {piInfo && isCapturedPreSettle && piInfo.stripeFee != null && (
                        <p className="text-[10px] text-red-300 mt-2 font-bold">
                          将来控除予定: {fmt(piInfo.stripeFee)}（Stripe手数料相当）
                        </p>
                      )}
                      {piInfo && isCapturedPostSettle && (
                        <p className="text-[10px] text-red-300 mt-2 font-bold">
                          回収見込み:{" "}
                          {fmt(
                            piInfo.settleTransferTotal > 0
                              ? Math.floor(
                                  piInfo.settleTransferTotal *
                                    Math.min(piInfo.amount / piInfo.settleTransferTotal, 1)
                                )
                              : 0
                          )}
                          （settle_transfer 全額逆転）
                        </p>
                      )}
                    </div>
                  </label>

                  {/* COMPASSIONATE */}
                  <label
                    className={`flex items-start gap-4 bg-slate-900 border rounded-2xl p-4 cursor-pointer transition-colors ${
                      refundType === "COMPASSIONATE"
                        ? "border-amber-500/40 bg-amber-950/20"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <RadioGroupItem
                      value="COMPASSIONATE"
                      id="mode-compassionate"
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-black text-white">人情モード</span>
                        <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                          COMPASSIONATE
                        </span>
                      </div>
                      {isCapturedPreSettle ? (
                        <p className="text-xs text-slate-400 leading-relaxed">
                          特例対応として処理します。客へ全額返金。Stripe手数料（約4%）は
                          <strong className="text-amber-300">プラットフォームが損失として吸収</strong>
                          します。オーガナイザーへの追加請求は一切ありません。
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 leading-relaxed">
                          特例対応（泣き入り）として処理します。プラットフォーム手数料10%の没収は免除しますが、Stripeに持っていかれる
                          <strong className="text-amber-300">
                            【Stripe手数料相当額（約4%）】
                          </strong>
                          はオーガナイザーの口座から確実に強制徴収し、プラットフォームの損益を0円（無傷）に保ちます。
                        </p>
                      )}
                      {piInfo && isCapturedPreSettle && piInfo.stripeFee != null && (
                        <p className="text-[10px] text-amber-300 mt-2 font-bold">
                          プラットフォーム損失: {fmt(piInfo.stripeFee)}（回収なし）
                        </p>
                      )}
                      {piInfo?.stripeFee != null && isCapturedPostSettle && (
                        <p className="text-[10px] text-amber-300 mt-2 font-bold">
                          回収見込み: {fmt(piInfo.stripeFee)}（Stripe手数料相当のみ）
                        </p>
                      )}
                    </div>
                  </label>
                </RadioGroup>
              </div>
            )}

            {/* 理由入力 */}
            <div className="space-y-2">
              <label
                htmlFor="reason"
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest"
              >
                返金理由（必須・5文字以上）
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例: イベント中止による全額返金 / 規約違反による強制BAN / オーガナイザー申請によるオーソリ誤操作"
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/20 transition-colors resize-none"
              />
              {reason.trim().length > 0 && reason.trim().length < 5 && (
                <p className="text-[10px] text-red-400">5文字以上入力してください</p>
              )}
            </div>

            {/* 確認チェックボックス */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 accent-red-500 cursor-pointer"
              />
              <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors leading-relaxed">
                上記のリスクと回収ロジックを理解しました。この操作は取り消せません。
                {isCapturedPostSettle && (
                  <span className="text-red-400 font-bold">
                    オーガナイザーの口座から強制回収が実行されます。
                  </span>
                )}
                {isCapturedPreSettle && refundType === "FULL_PENALTY" && (
                  <span className="text-amber-400 font-bold">
                    将来の精算時にStripe手数料を控除します。精算担当への申し送りを忘れずに。
                  </span>
                )}
              </span>
            </label>

            {/* 実行ボタン */}
            <button
              onClick={() => setShowDialog(true)}
              disabled={!canExecute || executing}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
                canExecute && !executing
                  ? refundType === "FULL_PENALTY"
                    ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/40"
                    : refundType === "COMPASSIONATE"
                    ? "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/40"
                    : "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/40"
                  : "bg-slate-800 text-slate-600 cursor-not-allowed"
              }`}
            >
              {executing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ShieldAlert size={16} />
              )}
              {executing
                ? "処理中..."
                : isPreCapture
                ? "オーソリを取り消す"
                : "返金を実行する"}
              {!executing && <ArrowRight size={14} />}
            </button>
          </div>
        </>
      )}

      {/* 最終確認ダイアログ */}
      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-white">
              <AlertTriangle size={18} className="text-red-400" />
              最終確認
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 space-y-2">
              <span className="block">
                本当に返金（
                {isPreCapture
                  ? "オーソリ取消"
                  : isCapturedPreSettle
                  ? `${refundType === "FULL_PENALTY" ? "通常モード：将来精算時に控除" : "人情モード：損失吸収"}`
                  : `${refundType === "FULL_PENALTY" ? "通常モード：全額強制回収" : "人情モード：Stripe手数料のみ回収"}`}
                ）を実行してよろしいですか？
              </span>
              {piInfo && (
                <span className="block font-mono text-xs text-slate-500">
                  PI: {piInfo.paymentIntentId}
                  <br />
                  金額: {fmt(piInfo.amount)}
                </span>
              )}
              <span className="block text-red-400 font-bold text-xs">
                この操作は取り消せません。
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white">
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecute}
              className={
                refundType === "COMPASSIONATE"
                  ? "bg-amber-600 hover:bg-amber-500 text-white"
                  : "bg-red-600 hover:bg-red-500 text-white"
              }
            >
              実行する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
