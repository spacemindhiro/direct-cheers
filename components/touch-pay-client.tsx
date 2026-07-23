"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import {
  StripeTerminal,
  TerminalConnectTypes,
  TerminalEventsEnum,
  type ReaderInterface,
} from "@capgo/capacitor-stripe-terminal";
import { Loader2, Bluetooth, CheckCircle, AlertCircle, ArrowLeft, Smartphone, XCircle, Clock, PartyPopper, Tv, Pencil } from "lucide-react";
import Link from "next/link";

type Product = { product_id: string; name: string; min_amount: number };
type DisplayDevice = { device_id: string; device_name: string | null; last_seen_at: string };

const PAIRED_DEVICE_KEY = (eventId: string) => `dc_touchpay_paired_device:${eventId}`;

// カードリーダー(Bluetooth)自体の接続状態。決済の状態(ChargeStatus)とは独立して管理する。
type ReaderStatus = "disconnected" | "discovering" | "connecting" | "connected";

// 決済実行中〜完了までの状態。
//   idle        : 商品・人数選択、charge開始待ち
//   collecting  : collectPaymentMethod() 実行中（客のタップ待ち）。キャンセル可能
//   processing  : confirmPaymentIntent() 〜 サーバー確定API呼び出し中。キャンセル不可
//   declined    : カード拒否。リトライ or キャンセルを選ばせる
//   timeout     : 客が一定時間タップしなかった
//   error       : その他の失敗（通信エラー・サーバーエラー等）
//   success_new : 決済成功・新規客（サインアップQRを子機に表示中。スタッフが明示的に閉じるまで維持）
//   success_repeat: 決済成功・リピーター（3秒後に自動で閉じる）
type ChargeStatus =
  | "idle"
  | "collecting"
  | "processing"
  | "declined"
  | "timeout"
  | "error"
  | "success_new"
  | "success_repeat";

type ChargeResult = { ticket_id: string | null; quantity: number; is_repeat: boolean; customer_name: string | null };

const COLLECT_TIMEOUT_MS = 45_000;
const DISCOVER_TIMEOUT_MS = 30_000;

// 対面タッチ決済（Case④）。商品・人数の選択はブラウザからでも常に行える。
// Bluetoothカードリーダーとの接続・実際のカード読み取りだけは、Capacitorで
// ネイティブラップされたAndroidアプリ内でないと動作しない（ブラウザからは不可能なため）。
export function TouchPayClient({
  eventId,
  eventTitle,
  products,
  terminalLocationId,
  displayDevices,
}: {
  eventId: string;
  eventTitle: string;
  products: Product[];
  terminalLocationId: string | null;
  displayDevices: DisplayDevice[];
}) {
  const [isNative, setIsNative] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);

  // 決済完了後のサインアップQRを表示する子機のペアリング（この端末＝親機に紐付けてlocalStorageへ永続化）
  const [pairedDeviceId, setPairedDeviceId] = useState<string | null>(null);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  useEffect(() => {
    try {
      setPairedDeviceId(localStorage.getItem(PAIRED_DEVICE_KEY(eventId)));
    } catch { /* localStorage不可の環境は未ペアリング扱い */ }
  }, [eventId]);
  const pairDevice = useCallback((deviceId: string) => {
    try { localStorage.setItem(PAIRED_DEVICE_KEY(eventId), deviceId); } catch { /* ベストエフォート */ }
    setPairedDeviceId(deviceId);
    setShowDevicePicker(false);
  }, [eventId]);
  const pairedDevice = displayDevices.find((d) => d.device_id === pairedDeviceId);

  // リーダー接続状態
  const [readerStatus, setReaderStatus] = useState<ReaderStatus>("disconnected");
  const [readerError, setReaderError] = useState("");
  const [readers, setReaders] = useState<ReaderInterface[]>([]);
  const [connectedReader, setConnectedReader] = useState<ReaderInterface | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  // 初回接続時などにStripeが必須ファームウェア更新を自動配信する。進捗0〜1
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);

  // 決済状態
  const [chargeStatus, setChargeStatus] = useState<ChargeStatus>("idle");
  const [chargeError, setChargeError] = useState("");
  const [result, setResult] = useState<ChargeResult | null>(null);

  const [productId, setProductId] = useState(products[0]?.product_id ?? "");
  const [quantity, setQuantity] = useState(1);

  const lastFailureRef = useRef<{ message: string; code?: string; declineCode?: string } | null>(null);
  const abortReasonRef = useRef<"cancel" | "timeout" | null>(null);
  const collectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedProduct = products.find((p) => p.product_id === productId);
  const isBusy = chargeStatus === "collecting" || chargeStatus === "processing";

  const clearCollectTimeout = useCallback(() => {
    if (collectTimeoutRef.current) {
      clearTimeout(collectTimeoutRef.current);
      collectTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsNative(native);
    if (!native) return; // ブラウザではStripe Terminal SDKのセットアップ自体を行わない

    // リスナーはアンマウント時に必ず解除する。解除しないと画面を出入りするたびに
    // 二重登録され、RequestedConnectionTokenの2回目のsetConnectionTokenが
    // 「do not pending fetchConnectionToken」エラーになる等の実害が出る。
    const subs: Promise<{ remove: () => Promise<void> }>[] = [];

    subs.push(StripeTerminal.addListener(TerminalEventsEnum.RequestedConnectionToken, async () => {
      try {
        const res = await fetch("/api/entrance/terminal/connection-token", { method: "POST" });
        const data = await res.json();
        await StripeTerminal.setConnectionToken({ token: data.secret });
      } catch {
        setReaderError("接続トークンの取得に失敗しました");
      }
    }));

    // collectPaymentMethod()/confirmPaymentIntent()の失敗時に詳細（declineCode等）を
    // 運んでくるイベント。Promiseのreject自体には詳細が乗らないため、ここで拾っておく。
    subs.push(StripeTerminal.addListener(TerminalEventsEnum.Failed, (info) => {
      lastFailureRef.current = info;
    }));

    // 接続時のファームウェア更新。放置するとスタッフには「接続中」が延々続くように
    // 見えるため、進捗を明示する（更新中の電源断はリーダー故障の原因になる）。
    subs.push(StripeTerminal.addListener(TerminalEventsEnum.StartInstallingUpdate, () => {
      setUpdateProgress(0);
    }));
    subs.push(StripeTerminal.addListener(TerminalEventsEnum.ReaderSoftwareUpdateProgress, ({ progress }) => {
      setUpdateProgress(typeof progress === "number" ? progress : null);
    }));
    subs.push(StripeTerminal.addListener(TerminalEventsEnum.FinishInstallingUpdate, () => {
      setUpdateProgress(null);
    }));

    // リーダー検索の結果はこのイベントで受ける。このプラグインのAndroid実装では
    // discoverReaders()がRETURN_CALLBACK型のため、TS型定義に反してPromiseとして
    // 待っても結果が返ってこない（実装確認済みのプラグイン側の型乖離）。
    subs.push(StripeTerminal.addListener(TerminalEventsEnum.DiscoveredReaders, ({ readers: found }) => {
      const list = found ?? [];
      if (list.length === 0) return;
      if (discoverTimerRef.current) {
        clearTimeout(discoverTimerRef.current);
        discoverTimerRef.current = null;
      }
      setReaders(list);
      setReaderStatus((s) => (s === "discovering" ? "disconnected" : s));
    }));

    // リーダーの切断を検知し、UIの「接続済み」表示が実際の状態とズレないようにする。
    // autoReconnectOnUnexpectedDisconnect:true で接続しているため、予期せぬ切断は
    // まず自動再接続が試みられる（Reconnect系イベント）。
    subs.push(StripeTerminal.addListener(TerminalEventsEnum.DisconnectedReader, ({ reason }) => {
      if (!reason) return; // reasonなし = 自前のdisconnectReader()呼び出しへの応答（未使用のため無視）
      setReconnecting(false);
      setConnectedReader(null);
      setReaderStatus("disconnected");
      setReaderError(`リーダーが切断されました（${reason}）`);
    }));
    subs.push(StripeTerminal.addListener(TerminalEventsEnum.UnexpectedReaderDisconnect, () => {
      setReconnecting(true);
      setReaderError("リーダーとの接続が切れました。再接続しています…");
    }));
    subs.push(StripeTerminal.addListener(TerminalEventsEnum.ReaderReconnectSucceeded, ({ reader }) => {
      setReconnecting(false);
      setConnectedReader(reader);
      setReaderStatus("connected");
      setReaderError("");
    }));
    subs.push(StripeTerminal.addListener(TerminalEventsEnum.ReaderReconnectFailed, () => {
      setReconnecting(false);
      setConnectedReader(null);
      setReaderStatus("disconnected");
      setReaderError("リーダーとの再接続に失敗しました。もう一度接続してください");
    }));

    // initializeは再実行しても安全（patches/のプラグイン修正でTokenProviderが
    // 初回インスタンス固定になっている。元実装は再実行でトークン受け渡しが壊れる）。
    // 未初期化状態でのgetConnectedReader()はネイティブ例外でアプリごと落ちるため、
    // 必ずinitialize完了後に呼ぶこと。
    // isTestは「テストモード」ではなく「シミュレータリーダーを使うか」のフラグ
    // （Stripe SDKのisSimulatedに直結。実装確認済み）。test/liveの区別は
    // connection token（サーバーのsecret key）で決まるため、実機では常にfalse。
    StripeTerminal.initialize({ isTest: false })
      .then(async () => {
        setTerminalReady(true);
        // ページの再読み込み等でUI状態が飛んでも、ネイティブ側の接続は生きている。
        // 既存の接続があれば引き継ぎ、二重接続やぐるぐる待ちを防ぐ。
        try {
          const { reader } = await StripeTerminal.getConnectedReader();
          if (reader) {
            setConnectedReader(reader);
            setReaderStatus("connected");
            setReaderError("");
          }
        } catch { /* 未接続なら何もしない */ }
      })
      .catch(() => setReaderError("Stripe Terminalの初期化に失敗しました"));

    return () => {
      subs.forEach((p) => {
        p.then((h) => h.remove()).catch(() => {});
      });
    };
  }, []);

  const discoverAndConnect = useCallback(async () => {
    if (!terminalLocationId) {
      setReaderError("Terminal Locationが未設定です（管理者に確認してください）");
      return;
    }
    setReaderStatus("discovering");
    setReaderError("");
    setReaders([]);

    // リーダーが1台も見つからない場合は何も起きないため、一定時間で検索を
    // 打ち切って再試行を促す（現場でスタッフが固まらないように）。
    if (discoverTimerRef.current) clearTimeout(discoverTimerRef.current);
    discoverTimerRef.current = setTimeout(async () => {
      discoverTimerRef.current = null;
      try { await StripeTerminal.cancelDiscoverReaders(); } catch { /* ベストエフォート */ }
      setReaderStatus("disconnected");
      setReaderError("リーダーが見つかりませんでした。WisePad 3の電源と距離を確認して、もう一度お試しください");
    }, DISCOVER_TIMEOUT_MS);

    try {
      // 結果はPromiseではなくDiscoveredReadersイベントで返る（リスナー登録済み）。
      // awaitしても永遠に解決しないため、呼び出しは投げっぱなしにする。
      void StripeTerminal.discoverReaders({
        type: TerminalConnectTypes.Bluetooth,
        locationId: terminalLocationId,
      });
    } catch (err) {
      if (discoverTimerRef.current) {
        clearTimeout(discoverTimerRef.current);
        discoverTimerRef.current = null;
      }
      setReaderError(err instanceof Error ? err.message : "リーダー検索に失敗しました");
      setReaderStatus("disconnected");
    }
  }, [terminalLocationId]);

  const connectTo = useCallback(async (reader: ReaderInterface) => {
    setReaderStatus("connecting");
    setReaderError("");
    try {
      await StripeTerminal.connectReader({ reader, autoReconnectOnUnexpectedDisconnect: true });
      setConnectedReader(reader);
      setReaderStatus("connected");
    } catch (err) {
      setReaderError(err instanceof Error ? err.message : "リーダー接続に失敗しました");
      setReaderStatus("disconnected");
    }
  }, []);

  // カード拒否かどうかを判定し、対応するエラーメッセージを組み立てる
  const resolveChargeFailure = useCallback((err: unknown): { status: "declined" | "error"; message: string } => {
    const failure = lastFailureRef.current;
    lastFailureRef.current = null;
    if (failure?.declineCode) {
      return { status: "declined", message: "カードが拒否されました。別のカードをお試しください" };
    }
    const message = failure?.message ?? (err instanceof Error ? err.message : "決済に失敗しました");
    return { status: "error", message };
  }, []);

  const startCharge = useCallback(async () => {
    if (!productId || !connectedReader || !pairedDeviceId) return;
    lastFailureRef.current = null;
    abortReasonRef.current = null;
    setChargeError("");
    setChargeStatus("processing");

    try {
      const piRes = await fetch("/api/entrance/terminal/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, quantity, target_device_id: pairedDeviceId }),
      });
      const piData = await piRes.json();
      if (!piRes.ok) throw new Error(piData.error ?? "決済準備に失敗しました");

      setChargeStatus("collecting");
      collectTimeoutRef.current = setTimeout(async () => {
        abortReasonRef.current = "timeout";
        try { await StripeTerminal.cancelCollectPaymentMethod(); } catch { /* ベストエフォート */ }
        setChargeStatus("timeout");
        setChargeError("タイムアウトしました。もう一度お試しください");
      }, COLLECT_TIMEOUT_MS);

      await StripeTerminal.collectPaymentMethod({ paymentIntent: piData.client_secret });
      clearCollectTimeout();
      if (abortReasonRef.current) return; // cancel/timeoutが既にUIを更新済み

      setChargeStatus("processing");
      await StripeTerminal.confirmPaymentIntent();

      const completeRes = await fetch("/api/entrance/terminal/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_intent_id: piData.payment_intent_id }),
      });
      const completeData = await completeRes.json();
      if (!completeRes.ok) throw new Error(completeData.error ?? "決済確定に失敗しました");

      setResult({
        ticket_id: completeData.ticket_id,
        quantity: completeData.quantity,
        is_repeat: completeData.is_repeat,
        customer_name: completeData.customer_name,
      });
      setChargeStatus(completeData.is_repeat ? "success_repeat" : "success_new");
    } catch (err) {
      clearCollectTimeout();
      if (abortReasonRef.current) { abortReasonRef.current = null; return; }
      const { status, message } = resolveChargeFailure(err);
      setChargeStatus(status);
      setChargeError(message);
    }
  }, [productId, connectedReader, quantity, pairedDeviceId, clearCollectTimeout, resolveChargeFailure]);

  // スタッフによる明示的なキャンセル（客のタップ待ち中のみ操作可能）
  const cancelCharge = useCallback(async () => {
    abortReasonRef.current = "cancel";
    clearCollectTimeout();
    try { await StripeTerminal.cancelCollectPaymentMethod(); } catch { /* ベストエフォート */ }
    setChargeStatus("idle");
    setChargeError("");
  }, [clearCollectTimeout]);

  // 決済失敗（拒否・タイムアウト・その他エラー）から金額選択画面へ安全に戻る
  const backToIdle = useCallback(() => {
    setChargeStatus("idle");
    setChargeError("");
  }, []);

  // 新規客: サインアップQRは子機側でタイマー消去しない。スタッフがこのボタンを押した時だけ
  // 子機へ明示的なクリア指示を送り、親機側も次の決済へ戻る。
  const nextCustomer = useCallback(async () => {
    setChargeStatus("idle");
    setResult(null);
    fetch("/api/entrance/terminal/clear-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, target_device_id: pairedDeviceId }),
    }).catch(() => {});
  }, [eventId, pairedDeviceId]);

  // リピーター: スタッフ操作を待たず3秒後に自動で閉じる（子機側は既存の投げ銭演出が自然に終わるため何もしない）
  useEffect(() => {
    if (chargeStatus !== "success_repeat") return;
    const t = setTimeout(() => {
      setChargeStatus("idle");
      setResult(null);
    }, 3000);
    return () => clearTimeout(t);
  }, [chargeStatus]);

  const readerStatusLabel: Record<ReaderStatus, string> = {
    disconnected: "未接続",
    discovering: "検索中",
    connecting: "接続中",
    connected: "接続済み",
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20">
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        <div className="space-y-1">
          <Link href={`/dashboard/events/${eventId}/checkin`} className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors">
            <ArrowLeft size={12} /> 入場スキャナに戻る
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Touch Pay</p>
              <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">タッチ決済</h1>
              <p className="text-slate-500 text-sm">{eventTitle}</p>
            </div>
            {isNative && (
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 shrink-0">
                {readerStatusLabel[readerStatus]}
              </span>
            )}
          </div>
        </div>

        {/* サインアップQR表示先の子機ペアリング。未ペアリングだと全子機に出てしまうため必須。 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3">
          {pairedDevice ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Tv size={14} className="text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">表示先の子機</p>
                  <p className="text-xs font-bold text-white truncate">{pairedDevice.device_name || pairedDevice.device_id.slice(0, 8)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDevicePicker((v) => !v)}
                className="flex items-center gap-1 text-[10px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-widest shrink-0"
              >
                <Pencil size={11} /> 変更
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-400">
              <AlertCircle size={14} className="shrink-0" />
              <p className="text-xs font-bold">サインアップQRを表示する子機を選んでください</p>
            </div>
          )}

          {(showDevicePicker || !pairedDevice) && (
            <div className="mt-3 space-y-1.5">
              {displayDevices.length === 0 ? (
                <p className="text-[10px] text-slate-600">この会場で登録済みの子機がありません。先に子機を起動してください。</p>
              ) : (
                displayDevices.map((d) => (
                  <button
                    key={d.device_id}
                    type="button"
                    onClick={() => pairDevice(d.device_id)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      d.device_id === pairedDeviceId
                        ? "bg-indigo-500/20 border-indigo-500/50 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    <Tv size={13} className="shrink-0" />
                    <span className="text-xs font-bold truncate">{d.device_name || d.device_id.slice(0, 8)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {readerError && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-xs">
            <AlertCircle size={14} className="shrink-0" /> {readerError}
          </div>
        )}

        {products.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 text-center space-y-2">
            <AlertCircle size={24} className="text-amber-400 mx-auto" />
            <p className="text-sm font-black text-white">対面タッチ決済が有効な商品がありません</p>
            <p className="text-xs text-slate-500">QRの設定画面で「対面タッチ決済を許可する」をONにしてください</p>
          </div>
        ) : chargeStatus === "success_new" && result ? (
          <div className="bg-green-500/10 border border-green-500/30 rounded-[2rem] p-6 text-center space-y-3">
            <CheckCircle size={32} className="text-green-400 mx-auto" />
            <p className="text-xl font-black text-white">決済完了！</p>
            <p className="text-base text-slate-200 font-bold leading-relaxed">
              お客様に子機のQRコードを<br />読み取ってもらってください
            </p>
            <p className="text-xs text-slate-500">{result.quantity}名分の入場を確定しました</p>
            <button
              type="button"
              onClick={nextCustomer}
              className="w-full h-14 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all mt-2"
            >
              次の決済へ
            </button>
          </div>
        ) : chargeStatus === "success_repeat" && result ? (
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-[2rem] p-6 text-center space-y-3">
            <PartyPopper size={32} className="text-indigo-300 mx-auto" />
            <p className="text-xl font-black text-white">決済完了！</p>
            <p className="text-lg text-indigo-200 font-black">
              {result.customer_name ?? "お客様"}さん、おかえりなさい！
            </p>
            <p className="text-xs text-slate-500">まもなく次の決済画面に戻ります…</p>
          </div>
        ) : (
          <>
            {/* 商品・人数選択（ブラウザからでも常に選べる。決済処理中は変更不可） */}
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-5">
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">商品</p>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  disabled={isBusy}
                  className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 focus:outline-none disabled:opacity-50"
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
                    disabled={quantity <= 1 || isBusy}
                    className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-white font-black text-lg disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="text-2xl font-black text-white tabular-nums">{quantity}<span className="text-xs text-slate-500 ml-1">名</span></span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                    disabled={quantity >= 20 || isBusy}
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
                {/* ファームウェア更新は画面リロード等でreaderStatusがリセットされても
                    ネイティブ側で継続するため、接続状態に関係なく進捗を最優先で表示する */}
                {updateProgress !== null ? (
                  <div className="space-y-3">
                    <p className="text-sm font-black text-white">リーダーを更新しています…{Math.round(updateProgress * 100)}%</p>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all"
                        style={{ width: `${Math.round(updateProgress * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-amber-400 font-bold">更新中はリーダーの電源を切らないでください（数分かかります）</p>
                  </div>
                ) : readerStatus === "discovering" || readerStatus === "connecting" ? (
                  <Loader2 size={24} className="text-indigo-400 animate-spin mx-auto" />
                ) : readers.length > 0 ? (
                  <div className="space-y-2">
                    {readers.map((r) => (
                      <button
                        key={r.serialNumber}
                        type="button"
                        onClick={() => connectTo(r)}
                        className="w-full h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-bold text-white transition-all flex flex-col items-center justify-center"
                      >
                        <span>{r.serialNumber}</span>
                        {r.label && <span className="text-[10px] text-slate-400 font-normal">{r.label}</span>}
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

            {/* 決済状態別のフィードバック・操作 */}
            {chargeStatus === "collecting" ? (
              <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 text-center space-y-4">
                <Loader2 size={28} className="text-pink-400 animate-spin mx-auto" />
                <p className="text-sm font-black text-white">カードをタッチしてください</p>
                <button
                  type="button"
                  onClick={cancelCharge}
                  className="w-full h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                >
                  キャンセル
                </button>
              </div>
            ) : chargeStatus === "processing" ? (
              <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 text-center space-y-3">
                <Loader2 size={28} className="text-pink-400 animate-spin mx-auto" />
                <p className="text-sm font-black text-white">決済処理中…</p>
              </div>
            ) : chargeStatus === "declined" ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-[2rem] p-6 text-center space-y-4">
                <XCircle size={28} className="text-red-400 mx-auto" />
                <p className="text-sm font-black text-white">{chargeError}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={backToIdle}
                    className="flex-1 h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => { backToIdle(); startCharge(); }}
                    className="flex-1 h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all"
                  >
                    リトライ
                  </button>
                </div>
              </div>
            ) : chargeStatus === "timeout" ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-[2rem] p-6 text-center space-y-4">
                <Clock size={28} className="text-amber-400 mx-auto" />
                <p className="text-sm font-black text-white">{chargeError}</p>
                <button
                  type="button"
                  onClick={backToIdle}
                  className="w-full h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                >
                  戻る
                </button>
              </div>
            ) : chargeStatus === "error" ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-[2rem] p-6 text-center space-y-4">
                <AlertCircle size={28} className="text-red-400 mx-auto" />
                <p className="text-sm font-black text-white">{chargeError}</p>
                <button
                  type="button"
                  onClick={backToIdle}
                  className="w-full h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                >
                  戻る
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startCharge}
                disabled={!productId || !connectedReader || reconnecting || !pairedDeviceId}
                className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.15em] hover:brightness-110 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                カードをタッチして決済
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
