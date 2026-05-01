"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wifi, WifiOff, Lock, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { PasskeySetup } from "@/components/passkey-setup";

type QRState = {
  qr_config_id: string;
  qr_url: string;
  product_name: string;
  label?: string;
  artist_name?: string;
};

const STORAGE_KEY = (id: string) => `qr-display:${id}`;
const DEVICE_ID_KEY = "qr-display-device-id";
const DEVICE_NAME_KEY = "qr-display-device-name";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // 旧Safari (iPad Air 2等) 向けフォールバック
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id = generateUUID(); localStorage.setItem(DEVICE_ID_KEY, id); }
  return id;
}

async function getBatteryLevel(): Promise<number | null> {
  try {
    if ("getBattery" in navigator) {
      const b = await (navigator as any).getBattery();
      return Math.round(b.level * 100);
    }
  } catch {}
  return null;
}

export function QRBoardDisplay({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  const router = useRouter();
  const [qrState, setQrState] = useState<QRState | null>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY(eventId)); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });
  const [flash, setFlash] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deviceName] = useState(() => {
    const stored = localStorage.getItem(DEVICE_NAME_KEY);
    if (stored) return stored;
    const name = `端末-${getOrCreateDeviceId().slice(0, 4).toUpperCase()}`;
    localStorage.setItem(DEVICE_NAME_KEY, name);
    return name;
  });

  // ロック解除モーダル
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockEmail, setUnlockEmail] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0〜100

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number>(0);

  // QRコード描画
  useEffect(() => {
    if (!qrState?.qr_url || !canvasRef.current) return;
    import("qrcode").then(({ default: QRCode }) => {
      QRCode.toCanvas(canvasRef.current!, qrState.qr_url, {
        width: 320,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(() => {});
    });
  }, [qrState?.qr_url]);

  // Supabase Realtime
  useEffect(() => {
    const supabase = createClient();
    const deviceId = getOrCreateDeviceId();

    // ログイン中のメールを取得（ロック解除用）
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUnlockEmail(session?.user?.email ?? "");
    });

    const channel = supabase.channel(`event-display:${eventId}`, {
      config: { presence: { key: deviceId } },
    });

    channel.on("broadcast", { event: "qr-switch" }, ({ payload }) => {
      const next = payload as QRState;
      setQrState(next);
      try { localStorage.setItem(STORAGE_KEY(eventId), JSON.stringify(next)); } catch {}
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        const battery = await getBatteryLevel();
        channel.track({ role: "display", device_id: deviceId, device_name: deviceName, battery_level: battery, joined_at: new Date().toISOString() });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnected(false);
      }
    });

    const timer = setInterval(async () => {
      const battery = await getBatteryLevel();
      channel.track({ role: "display", device_id: deviceId, device_name: deviceName, battery_level: battery });
    }, 5 * 60 * 1000);

    return () => { clearInterval(timer); supabase.removeChannel(channel); };
  }, [eventId, deviceName]);

  // 長押し検出（3秒でロック解除モーダル表示）
  const HOLD_DURATION = 3000;

  const handleHoldStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (showUnlock) return;
    holdStartRef.current = Date.now();
    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      setHoldProgress(Math.min(100, (elapsed / HOLD_DURATION) * 100));
    }, 30);
    holdTimerRef.current = setTimeout(() => {
      clearInterval(holdIntervalRef.current!);
      setHoldProgress(0);
      setShowUnlock(true);
    }, HOLD_DURATION);
  };

  const handleHoldEnd = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    setHoldProgress(0);
  };

  const closeUnlock = () => {
    setShowUnlock(false);
    setUnlockError(null);
    setUnlockPassword("");
  };

  const handleUnlockSuccess = () => {
    router.push(`/dashboard/events/${eventId}`);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword) return;
    setUnlockError(null);
    setUnlocking(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: unlockEmail,
        password: unlockPassword,
      });
      if (error) {
        // 失敗したらモーダルを閉じてQR表示に戻す
        closeUnlock();
      } else {
        router.push(`/dashboard/events/${eventId}`);
      }
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center select-none bg-slate-950"
      onTouchStart={handleHoldStart}
      onTouchEnd={handleHoldEnd}
      onMouseDown={handleHoldStart}
      onMouseUp={handleHoldEnd}
      onMouseLeave={handleHoldEnd}
    >
      {/* フラッシュ演出 */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-150"
        style={{ backgroundColor: "#ffffff", opacity: flash ? 0.6 : 0 }}
      />

      {/* 長押しプログレス */}
      {holdProgress > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-800/30">
          <div
            className="h-full bg-indigo-500 transition-none"
            style={{ width: `${holdProgress}%` }}
          />
        </div>
      )}

      {/* 接続インジケーター */}
      <div className="absolute top-4 right-4 z-10 pointer-events-none">
        {connected
          ? <Wifi size={14} className="text-green-400/50" />
          : <WifiOff size={14} className="text-red-400/50" />}
      </div>

      {/* QR表示 */}
      {qrState ? (
        <div className="relative flex flex-col items-center gap-6 px-8 py-10 w-full max-w-sm pointer-events-none">
          <p className="text-3xl font-black text-white uppercase tracking-tight text-center leading-tight">
            {qrState.artist_name || eventTitle}
          </p>
          <p className="text-base font-bold text-slate-400 text-center">
            {qrState.label || qrState.product_name}
          </p>
          <div className="p-5 bg-white rounded-3xl shadow-2xl">
            <canvas ref={canvasRef} />
          </div>
          <p className="text-xs text-slate-600 font-mono uppercase tracking-widest">
            {qrState.qr_config_id.slice(0, 8)}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-center px-8 pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-400 rounded-full animate-spin" />
          </div>
          <p className="text-slate-400 font-bold text-sm">親機からの指示を待機中</p>
          <p className="text-slate-600 text-xs">{eventTitle}</p>
          <p className="text-slate-700 text-[10px] font-mono mt-6">{deviceName}</p>
        </div>
      )}

      {/* ロック解除モーダル */}
      {showUnlock && (
        <div className="absolute inset-0 bg-black/80 flex items-end justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-xs space-y-4">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-indigo-400" />
              <p className="text-sm font-black text-white">ロック解除</p>
            </div>

            {/* パスキー */}
            <PasskeySetup
              email={unlockEmail}
              mode="authenticate"
              buttonLabel="パスキーで解除"
              onSuccess={handleUnlockSuccess}
            />

            {/* パスワード */}
            <form onSubmit={handleUnlock} className="space-y-2">
              <input
                type="email"
                value={unlockEmail}
                onChange={(e) => setUnlockEmail(e.target.value)}
                placeholder="メールアドレス"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-500"
              />
              <input
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="パスワード"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!unlockPassword || unlocking}
                className="w-full h-11 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-black text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {unlocking ? <Loader2 size={16} className="animate-spin" /> : "パスワードで解除"}
              </button>
            </form>

            {/* キャンセル（大きく・目立つ） */}
            <button
              type="button"
              onClick={closeUnlock}
              className="w-full h-12 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2"
            >
              <X size={14} /> キャンセル（QR表示に戻る）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
