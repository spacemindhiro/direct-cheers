"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import {
  StripeTerminal,
  TerminalConnectTypes,
  TerminalEventsEnum,
  type ReaderInterface,
} from "@capgo/capacitor-stripe-terminal";
import { Loader2, Bluetooth, CheckCircle, AlertCircle, ArrowLeft, Smartphone } from "lucide-react";
import Link from "next/link";

type Product = { product_id: string; name: string; min_amount: number };

type ChargePhase = "idle" | "discovering" | "connecting" | "charging" | "done" | "error";

// 対面タッチ決済（Case④）。商品・人数の選択はブラウザからでも常に行える。
// Bluetoothカードリーダーとの接続・実際のカード読み取りだけは、Capacitorで
// ネイティブラップされたAndroidアプリ内でないと動作しない（ブラウザからは不可能なため）。
export function TouchPayClient({
  eventId,
  eventTitle,
  products,
  terminalLocationId,
}: {
  eventId: string;
  eventTitle: string;
  products: Product[];
  terminalLocationId: string | null;
}) {
  const [isNative, setIsNative] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [phase, setPhase] = useState<ChargePhase>("idle");
  const [error, setError] = useState("");
  const [readers, setReaders] = useState<ReaderInterface[]>([]);
  const [connectedReader, setConnectedReader] = useState<ReaderInterface | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [productId, setProductId] = useState(products[0]?.product_id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [result, setResult] = useState<{ ticket_id: string | null; quantity: number } | null>(null);
  const listenersRegistered = useRef(false);

  const selectedProduct = products.find((p) => p.product_id === productId);

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsNative(native);
    if (!native) return; // ブラウザではStripe Terminal SDKのセットアップ自体を行わない

    if (listenersRegistered.current) return;
    listenersRegistered.current = true;

    StripeTerminal.addListener(TerminalEventsEnum.RequestedConnectionToken, async () => {
      try {
        const res = await fetch("/api/entrance/terminal/connection-token", { method: "POST" });
        const data = await res.json();
        await StripeTerminal.setConnectionToken({ token: data.secret });
      } catch {
        setError("接続トークンの取得に失敗しました");
      }
    });

    // リーダーの切断を検知し、UIの「接続済み」表示が実際の状態とズレないようにする。
    // autoReconnectOnUnexpectedDisconnect:true で接続しているため、予期せぬ切断は
    // まず自動再接続が試みられる（Reconnect系イベント）。
    StripeTerminal.addListener(TerminalEventsEnum.DisconnectedReader, ({ reason }) => {
      if (!reason) return; // reasonなし = 自前のdisconnectReader()呼び出しへの応答（未使用のため無視）
      setReconnecting(false);
      setConnectedReader(null);
      setError(`リーダーが切断されました（${reason}）`);
    });
    StripeTerminal.addListener(TerminalEventsEnum.UnexpectedReaderDisconnect, () => {
      setReconnecting(true);
      setError("リーダーとの接続が切れました。再接続しています…");
    });
    StripeTerminal.addListener(TerminalEventsEnum.ReaderReconnectSucceeded, ({ reader }) => {
      setReconnecting(false);
      setConnectedReader(reader);
      setError("");
    });
    StripeTerminal.addListener(TerminalEventsEnum.ReaderReconnectFailed, () => {
      setReconnecting(false);
      setConnectedReader(null);
      setError("リーダーとの再接続に失敗しました。もう一度接続してください");
    });

    const isTest = !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live");

    StripeTerminal.initialize({ isTest })
      .then(() => setTerminalReady(true))
      .catch(() => setError("Stripe Terminalの初期化に失敗しました"));
  }, []);

  const discoverAndConnect = useCallback(async () => {
    if (!terminalLocationId) {
      setError("Terminal Locationが未設定です（管理者に確認してください）");
      return;
    }
    setPhase("discovering");
    setError("");
    try {
      const { readers: found } = await StripeTerminal.discoverReaders({
        type: TerminalConnectTypes.Bluetooth,
        locationId: terminalLocationId,
      });
      setReaders(found);
      setPhase("idle");
      if (found.length === 0) {
        setError("リーダーが見つかりませんでした。電源・ペアリングを確認してください");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "リーダー検索に失敗しました");
      setPhase("idle");
    }
  }, [terminalLocationId]);

  const connectTo = useCallback(async (reader: ReaderInterface) => {
    setPhase("connecting");
    setError("");
    try {
      await StripeTerminal.connectReader({ reader, autoReconnectOnUnexpectedDisconnect: true });
      setConnectedReader(reader);
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "リーダー接続に失敗しました");
      setPhase("idle");
    }
  }, []);

  const startCharge = useCallback(async () => {
    if (!productId || !connectedReader) return;
    setPhase("charging");
    setError("");
    try {
      const piRes = await fetch("/api/entrance/terminal/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, quantity }),
      });
      const piData = await piRes.json();
      if (!piRes.ok) throw new Error(piData.error ?? "決済準備に失敗しました");

      await StripeTerminal.collectPaymentMethod({ paymentIntent: piData.client_secret });
      await StripeTerminal.confirmPaymentIntent();

      const completeRes = await fetch("/api/entrance/terminal/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_intent_id: piData.payment_intent_id }),
      });
      const completeData = await completeRes.json();
      if (!completeRes.ok) throw new Error(completeData.error ?? "決済確定に失敗しました");

      setResult({ ticket_id: completeData.ticket_id, quantity: completeData.quantity });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "決済に失敗しました");
      setPhase("idle");
    }
  }, [productId, connectedReader, quantity]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20">
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        <div className="space-y-1">
          <Link href={`/dashboard/events/${eventId}/checkin`} className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors">
            <ArrowLeft size={12} /> 入場スキャナに戻る
          </Link>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Touch Pay</p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">タッチ決済</h1>
          <p className="text-slate-500 text-sm">{eventTitle}</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-xs">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        {products.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 text-center space-y-2">
            <AlertCircle size={24} className="text-amber-400 mx-auto" />
            <p className="text-sm font-black text-white">対面タッチ決済が有効な商品がありません</p>
            <p className="text-xs text-slate-500">QRの設定画面で「対面タッチ決済を許可する」をONにしてください</p>
          </div>
        ) : phase === "done" && result ? (
          <div className="bg-green-500/10 border border-green-500/30 rounded-[2rem] p-6 text-center space-y-3">
            <CheckCircle size={32} className="text-green-400 mx-auto" />
            <p className="text-lg font-black text-white">決済完了</p>
            <p className="text-sm text-slate-300">{result.quantity}名分の入場を確定しました</p>
            <p className="text-xs text-slate-500">子機にサインアップ用QRを表示しました</p>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="w-full h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all mt-2"
            >
              次のお客様へ
            </button>
          </div>
        ) : (
          <>
            {/* 商品・人数選択（ブラウザからでも常に選べる） */}
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-5">
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">商品</p>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  disabled={phase === "charging"}
                  className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 focus:outline-none"
                >
                  {products.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.name}（¥{p.min_amount.toLocaleString()}）
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">人数</p>
                <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700/50 rounded-2xl px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1 || phase === "charging"}
                    className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-white font-black text-lg disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="text-2xl font-black text-white tabular-nums">{quantity}<span className="text-xs text-slate-500 ml-1">名</span></span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                    disabled={quantity >= 20 || phase === "charging"}
                    className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-white font-black text-lg disabled:opacity-40"
                  >
                    ＋
                  </button>
                </div>
              </div>

              <div className="text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">合計金額</p>
                <p className="text-3xl font-black text-white italic">
                  ¥{((selectedProduct?.min_amount ?? 0) * quantity).toLocaleString()}
                </p>
              </div>
            </div>

            {/* カードリーダー接続（ネイティブアプリでのみ操作可能） */}
            {!isNative ? (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl px-4 py-3 flex items-start gap-2.5">
                <Smartphone size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-amber-400">タッチ決済用アプリで開いてください</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">商品・人数はここで選べますが、カードリーダーとの接続・実際の決済にはネイティブアプリが必要です</p>
                </div>
              </div>
            ) : !connectedReader ? (
              <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 text-center space-y-4">
                <Bluetooth size={28} className="text-indigo-400 mx-auto" />
                <p className="text-sm font-black text-white">カードリーダーに接続</p>
                {phase === "discovering" || phase === "connecting" ? (
                  <Loader2 size={24} className="text-indigo-400 animate-spin mx-auto" />
                ) : readers.length > 0 ? (
                  <div className="space-y-2">
                    {readers.map((r) => (
                      <button
                        key={r.serialNumber}
                        type="button"
                        onClick={() => connectTo(r)}
                        className="w-full h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-bold text-white transition-all"
                      >
                        {r.label || r.serialNumber}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={discoverAndConnect}
                    disabled={!terminalReady}
                    className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {terminalReady ? "リーダーを検索" : "初期化中..."}
                  </button>
                )}
              </div>
            ) : reconnecting ? (
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold bg-amber-500/5 border border-amber-500/20 rounded-2xl px-4 py-3">
                <Loader2 size={14} className="animate-spin" /> リーダーに再接続しています…
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-4 py-3">
                <CheckCircle size={14} /> {connectedReader.label || connectedReader.serialNumber} 接続済み
              </div>
            )}

            <button
              type="button"
              onClick={startCharge}
              disabled={phase === "charging" || !productId || !connectedReader || reconnecting}
              className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.15em] hover:brightness-110 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {phase === "charging" ? <Loader2 size={20} className="animate-spin" /> : "カードをタッチして決済"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
