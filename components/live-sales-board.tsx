"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  TrendingUp, Zap, RefreshCw, Wifi, WifiOff,
  ArrowDownToLine, Loader2, MessageSquare, Coins
} from "lucide-react";

type TxItem = {
  transaction_id: string;
  total_gross_amount: number | null;
  created_at: string | null;
  sender_name: string | null;
  sender_comment: string | null;
  product_type: string | null;
  recipient_name: string | null;
  my_net_amount: number | null;
};

type LiveStats = {
  total_gross: number;
  transaction_count: number;
  total_stripe_fee: number;
  total_platform_fee: number;
  total_net: number;
  my_projected_net: number;
  my_distribution_ratio: number | null;
  last_transaction_at: string | null;
  lifecycle_status: string;
  is_live: boolean;
  show_gross: boolean;
  distributions: {
    profile_id: string;
    display_name: string | null;
    role: string;
    projected_net: number;
    ratio: number;
  }[];
  stripe_rate: number;
  platform_rate: number;
  net_rate: number;
  recent_transactions: TxItem[];
  current_page: number;
  total_pages: number;
};

const ROLE_LABEL: Record<string, string> = {
  artist: "アーティスト",
  organizer: "オーガナイザー",
  agent: "エージェント",
  admin: "管理者",
};

const POLL_INTERVAL_LIVE = 5000;
const POLL_INTERVAL_IDLE = 30000;

function formatJPY(n: number) {
  return "¥" + n.toLocaleString("ja-JP");
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

type CheeringToast = { id: number; amount: number; sender: string | null };

export function LiveSalesBoard({ eventId }: { eventId: string }) {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [flashNew, setFlashNew] = useState(false);
  const [toasts, setToasts] = useState<CheeringToast[]>([]);
  const [logTab, setLogTab] = useState<"log" | "message">("log");
  const [logPage, setLogPage] = useState(1);
  const logPageRef = useRef(1);
  const prevCountRef = useRef<number>(0);
  const prevTxIdsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastIdRef = useRef(0);

  const fetch_ = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/live-stats?page=${logPageRef.current}`);
      if (!res.ok) throw new Error("fetch failed");
      const data: LiveStats = await res.json();
      setStats(data);
      setIsConnected(true);
      setLastFetched(new Date());

      if (prevCountRef.current > 0 && data.transaction_count > prevCountRef.current) {
        setFlashNew(true);
        setTimeout(() => setFlashNew(false), 1500);
        // 新着が来たらページ1に戻す
        setLogPage(1);
        logPageRef.current = 1;

        // 新着トランザクションのチャリーントースト
        const newTxs = data.recent_transactions.filter(
          (tx) => tx.transaction_id && !prevTxIdsRef.current.has(tx.transaction_id)
        );
        for (const tx of newTxs.slice(0, 3)) {
          const id = ++toastIdRef.current;
          setToasts((prev) => [...prev, { id, amount: tx.total_gross_amount ?? 0, sender: tx.sender_name }]);
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
        }
      }
      prevCountRef.current = data.transaction_count;
      prevTxIdsRef.current = new Set(data.recent_transactions.map((t) => t.transaction_id));
    } catch {
      setIsConnected(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetch_(false);

    const schedule = () => {
      timerRef.current = setTimeout(async () => {
        await fetch_(true);
        schedule();
      }, stats?.is_live ? POLL_INTERVAL_LIVE : POLL_INTERVAL_IDLE);
    };
    schedule();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const interval = stats?.is_live ? POLL_INTERVAL_LIVE : POLL_INTERVAL_IDLE;
    const schedule = () => {
      timerRef.current = setTimeout(async () => {
        await fetch_(true);
        schedule();
      }, interval);
    };
    schedule();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [stats?.is_live, fetch_]);

  if (loading && !stats) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 flex items-center justify-center">
        <Loader2 size={28} className="text-pink-500 animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-4">
      {/* チャリーントースト */}
      <div className="fixed bottom-6 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 bg-slate-900 border border-pink-500/60 shadow-[0_0_20px_rgba(236,72,153,0.4)] rounded-2xl px-4 py-3 animate-slide-up-fade"
          >
            <Coins size={16} className="text-pink-400 shrink-0" />
            <div>
              <p className="text-xs font-black text-pink-400 leading-none">チャリーン！</p>
              <p className="text-base font-black text-white tabular-nums leading-tight">{formatJPY(t.amount)}</p>
              {t.sender && <p className="text-[10px] text-slate-500">{t.sender}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* メインボード */}
      <div className={`relative bg-slate-900 border rounded-[2rem] overflow-hidden transition-all duration-300 ${
        flashNew
          ? "border-pink-500 shadow-[0_0_40px_rgba(236,72,153,0.3)]"
          : stats.is_live
          ? "border-pink-500/30"
          : "border-slate-800"
      }`}>

        {/* ライブバッジ */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {stats.is_live ? (
            <div className="flex items-center gap-1.5 bg-pink-500/10 border border-pink-500/30 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
              <span className="text-[10px] font-black text-pink-400 uppercase tracking-widest">Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-slate-600" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {stats.lifecycle_status === "settled" ? "精算済み" : "終了"}
              </span>
            </div>
          )}
          <button
            onClick={() => fetch_(true)}
            className="w-7 h-7 flex items-center justify-center text-slate-600 hover:text-white transition-colors"
          >
            {isConnected
              ? <Wifi size={13} />
              : <WifiOff size={13} className="text-red-400" />
            }
          </button>
        </div>

        {/* 自分の着金予定額 */}
        <div className="px-8 pt-8 pb-6 space-y-2">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <ArrowDownToLine size={11} />
            あなたの着金予定
          </p>
          <div className={`transition-all duration-500 ${flashNew ? "scale-105" : "scale-100"}`}>
            <p className="text-6xl sm:text-7xl font-black text-white italic tracking-tighter tabular-nums leading-none">
              {formatJPY(stats.my_projected_net)}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Stripe {(stats.stripe_rate * 100).toFixed(1)}% ＋ プラットフォーム {(stats.platform_rate * 100).toFixed(0)}% 控除後
          </p>
        </div>

        {/* Gross・手数料ブレークダウン */}
        {stats.show_gross && (
          <div className="mx-6 mb-6 bg-slate-800/60 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-indigo-400" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">総売上 Gross</p>
              </div>
              <p className="text-xl font-black text-white tabular-nums">{formatJPY(stats.total_gross)}</p>
            </div>
            <div className="border-t border-slate-700 pt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Stripe手数料（{(stats.stripe_rate * 100).toFixed(1)}%）</span>
                <span className="text-slate-400 tabular-nums">−{formatJPY(stats.total_stripe_fee)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">プラットフォーム手数料（{(stats.platform_rate * 100).toFixed(1)}%）</span>
                <span className="text-slate-400 tabular-nums">−{formatJPY(stats.total_platform_fee)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
                <span className="font-black text-slate-300">配分可能 Net（{(stats.net_rate * 100).toFixed(1)}%）</span>
                <span className="font-black text-emerald-400 tabular-nums">{formatJPY(stats.total_net)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 件数・最終着金 */}
        <div className="grid grid-cols-2 border-t border-slate-800">
          <div className="px-8 py-4 border-r border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cheers数</p>
            <p className="text-2xl font-black text-white tabular-nums mt-1">
              {stats.transaction_count.toLocaleString()}<span className="text-sm text-slate-500 font-bold ml-1">件</span>
            </p>
          </div>
          <div className="px-8 py-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">最終着金</p>
            <p className="text-base font-black text-white mt-1 tabular-nums">
              {formatTime(stats.last_transaction_at)}
            </p>
          </div>
        </div>
      </div>

      {/* 配分先内訳 */}
      {stats.distributions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Zap size={11} className="text-pink-500" /> 配分先内訳
          </p>
          <div className="space-y-2">
            {stats.distributions.map((d) => (
              <div
                key={d.profile_id}
                className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-black text-white">{d.display_name ?? "—"}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {ROLE_LABEL[d.role] ?? d.role} · {Math.round(d.ratio * 100)}%
                  </p>
                </div>
                <p className="text-lg font-black text-emerald-400 tabular-nums">
                  {formatJPY(d.projected_net)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 決済掲示板（タブ切替） */}
      {stats.recent_transactions.length > 0 && (() => {
        const messageTxs = stats.recent_transactions.filter(
          (tx) => tx.product_type === "message" && tx.sender_comment
        );
        const visibleTxs = logTab === "message" ? messageTxs : stats.recent_transactions;
        return (
          <div className="space-y-2">
            {/* タブヘッダー */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setLogTab("log")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                  logTab === "log"
                    ? "bg-pink-500/20 text-pink-400 border border-pink-500/40"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Coins size={10} /> 決済ログ
              </button>
              {messageTxs.length > 0 && (
                <button
                  onClick={() => setLogTab("message")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                    logTab === "message"
                      ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/40"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <MessageSquare size={10} /> メッセージ
                  <span className="bg-indigo-500/30 text-indigo-300 rounded-full px-1.5 py-0.5 text-[9px]">
                    {messageTxs.length}
                  </span>
                </button>
              )}
            </div>

            {/* リスト */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
              {visibleTxs.map((tx, i) => {
                const isMsg = tx.product_type === "message";
                const isNew = i === 0 && flashNew && logTab === "log";
                return (
                  <div
                    key={tx.transaction_id}
                    className={`px-5 py-3 transition-colors duration-700 ${isNew ? "bg-pink-500/10" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {isMsg ? (
                          <MessageSquare size={12} className="text-indigo-400 shrink-0 mt-0.5" />
                        ) : (
                          <Coins size={12} className="text-pink-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-black text-white truncate">
                            {tx.sender_name ?? "ゲスト"}
                            {tx.recipient_name && (
                              <span className="text-slate-500 font-normal"> → {tx.recipient_name}</span>
                            )}
                          </p>
                          {tx.sender_comment && (
                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{tx.sender_comment}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {tx.my_net_amount !== null ? (
                          <>
                            <p className="text-sm font-black text-emerald-400 tabular-nums">
                              {formatJPY(tx.my_net_amount)}
                            </p>
                            <p className="text-[10px] text-slate-500 tabular-nums">
                              投入 {formatJPY(tx.total_gross_amount ?? 0)}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm font-black text-white tabular-nums">
                            {formatJPY(tx.total_gross_amount ?? 0)}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-600 tabular-nums">{formatTime(tx.created_at)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ページネーション */}
            {stats.total_pages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  onClick={() => {
                    const p = Math.max(1, logPage - 1);
                    setLogPage(p);
                    logPageRef.current = p;
                    fetch_(true);
                  }}
                  disabled={logPage <= 1}
                  className="px-3 py-1 text-[10px] font-black text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
                >
                  ← 前へ
                </button>
                <span className="text-[10px] text-slate-500 tabular-nums">
                  {logPage} / {stats.total_pages}
                </span>
                <button
                  onClick={() => {
                    const p = Math.min(stats.total_pages, logPage + 1);
                    setLogPage(p);
                    logPageRef.current = p;
                    fetch_(true);
                  }}
                  disabled={logPage >= stats.total_pages}
                  className="px-3 py-1 text-[10px] font-black text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
                >
                  次へ →
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* 更新時刻 */}
      {lastFetched && (
        <p className="text-center text-[10px] text-slate-700 flex items-center justify-center gap-1.5">
          <RefreshCw size={9} />
          {lastFetched.toLocaleTimeString("ja-JP")} 更新
          {stats.is_live && <span className="text-pink-600">· 5秒ごと自動更新</span>}
        </p>
      )}
    </div>
  );
}
