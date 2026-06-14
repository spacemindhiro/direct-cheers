"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wifi, WifiOff, Lock, X, Smartphone, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasskeySetup } from "@/components/passkey-setup";

type QRState = {
  qr_config_id: string;
  qr_url: string;
  product_name: string;
  label?: string;
  artist_name?: string;
};

type QrConfigInfo = {
  qr_config_id: string;
  label: string | null;
  image_url: string | null;
  product: { name: string; type: string; artist: { display_name: string } | null } | null;
} | null;

type DisplaySchedule = {
  schedule_id: string;
  qr_config_id: string | null;
  track_id: string | null;
  start_at: string;
  end_at: string;
  label: string | null;
  qr_config: QrConfigInfo;
};

// タイムテーブルから現在時刻に該当するスロットを返す
function getActiveSchedule(schedules: DisplaySchedule[], now: Date): DisplaySchedule | null {
  return schedules.find(s =>
    new Date(s.start_at) <= now && now < new Date(s.end_at)
  ) ?? null;
}

// qr_config情報からQR表示状態を構築（タイムテーブルスロット・トラックのデフォルトQR共通）
function qrConfigToState(qc: QrConfigInfo, siteUrl: string, overrideLabel?: string | null): QRState | null {
  if (!qc) return null;
  return {
    qr_config_id: qc.qr_config_id,
    qr_url: `${siteUrl}/c/${qc.qr_config_id}`,
    product_name: qc.product?.name ?? "",
    label: overrideLabel ?? qc.label ?? qc.product?.name ?? "",
    artist_name: qc.product?.artist?.display_name ?? "",
  };
}

type FloatingHeart = {
  id: string;
  x: number;       // vw%
  size: number;     // rem
  duration: number; // ms
  delay: number;    // ms
  color: string;
};

type FloatingText = {
  id: string;
  text: string;
  x: number;        // vw%
  y: number;        // vh%
  size: number;     // rem
  duration: number; // ms
  delay: number;    // ms
  color: string;
};

const HEART_COLORS = ["#ff6b9d", "#ff4081", "#f06292", "#e91e63", "#ff8a80", "#ff1744", "#ffd54f", "#ff9e80"];
const CHEER_TEXTS = ["Thank you!", "Cheers!"];
const TEXT_COLORS = ["#ff4081", "#ffd54f", "#ffffff", "#69f0ae", "#40c4ff"];
const SURGE_WINDOW_MS = 10_000;
const SURGE_THRESHOLD = 5;
// チア受信後、約15秒間ハート・テキストを波状に追加し続けて演出を盛り上げる
const CELEBRATION_DURATION_MS = 15_000;
const CELEBRATION_INTERVAL_MS = 650;

const STORAGE_KEY   = (id: string) => `qr-display:${id}`;
const DEVICE_ID_KEY  = "qr-display-device-id";
const DEVICE_NAME_KEY = "qr-display-device-name";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// 文字列からUUID形式の決定論的なIDを生成する。
// 端末名（?device_name=で固定されることが多い）が分かっている場合はこれを使い、
// localStorageが端末再起動で消える環境でも同じ端末名なら同じdevice_idになるようにする。
function hashToUuid(input: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1000193, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
    h3 = Math.imul(h3 ^ c, 0xc2b2ae35);
    h4 = Math.imul(h4 ^ c, 0x27d4eb2f);
  }
  const hex32 = [h1, h2, h3, h4].map(n => (n >>> 0).toString(16).padStart(8, "0")).join("");
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20, 32)}`;
}

function getOrCreateDeviceId(deviceName?: string) {
  if (deviceName) return hashToUuid(deviceName);
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id = generateUUID(); localStorage.setItem(DEVICE_ID_KEY, id); }
  return id;
}

function detectDeviceType(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android" : "Androidタブ";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "端末";
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
  const searchParams = useSearchParams();
  const [qrState, setQrState] = useState<QRState | null>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY(eventId)); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });
  const [flash, setFlash] = useState(false);
  const [connected, setConnected] = useState(false);

  // タイムテーブル
  const [schedules, setSchedules] = useState<DisplaySchedule[]>([]);
  const [isForcedOverride, setIsForcedOverride] = useState(false);
  const [, setDefaultQrState] = useState<QRState | null>(null);
  const schedulesRef = useRef<DisplaySchedule[]>([]);
  const isForcedRef  = useRef(false);
  const trackIdRef   = useRef<string | null>(null);
  const defaultQrStateRef = useRef<QRState | null>(null);
  const siteUrlRef   = useRef(typeof window !== "undefined" ? window.location.origin : "");
  const [deviceName, setDeviceName] = useState(() => {
    try {
      // ?device_name=DJ-01 のようなURLパラメーターで端末名を指定・上書き保存
      const urlName = searchParams.get("device_name");
      if (urlName) {
        localStorage.setItem(DEVICE_NAME_KEY, urlName);
        return urlName;
      }
      const stored = localStorage.getItem(DEVICE_NAME_KEY);
      if (stored) return stored;
      const type = detectDeviceType();
      const name = `${type}-${getOrCreateDeviceId().slice(0, 4).toUpperCase()}`;
      localStorage.setItem(DEVICE_NAME_KEY, name);
      return name;
    } catch { return "端末-????"; }
  });

  // ロック解除モーダル
  const [showUnlock, setShowUnlock] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);

  // 端末名（識別名）設定
  const [nameInput, setNameInput] = useState(deviceName);
  const [nameSaved, setNameSaved] = useState(false);

  // チア演出
  const [cheerCount, setCheerCount] = useState(0);
  const [hearts, setHearts]         = useState<FloatingHeart[]>([]);
  const [texts, setTexts]           = useState<FloatingText[]>([]);
  const [surgeGlow, setSurgeGlow]   = useState(false);
  const [counterPulse, setCounterPulse] = useState(false);
  const recentCheersRef    = useRef<number[]>([]);
  const surgeTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counterPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrationEndRef  = useRef<number>(0);
  const celebrationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSurgeRef         = useRef(false);
  const pendingCheerCountRef = useRef(0);
  const lastRealtimeRef    = useRef<number>(0);    // last Realtime cheer timestamp
  const lastPolledCountRef = useRef<number>(0);    // server count at last poll

  const [qrSize, setQrSize] = useState(320);

  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const holdTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef   = useRef<number>(0);

  // ハート生成
  const spawnHearts = useCallback((isSurge: boolean) => {
    const count = isSurge ? 55 : 16;
    const newHearts: FloatingHeart[] = Array.from({ length: count }, (_, i) => ({
      id: `${Date.now()}-${i}-${Math.random()}`,
      x: 3 + Math.random() * 94,
      size: isSurge ? 5 + Math.random() * 5 : 3 + Math.random() * 3,
      duration: isSurge ? 1800 + Math.random() * 1200 : 2600 + Math.random() * 1800,
      delay: isSurge ? Math.random() * 700 : Math.random() * 300,
      color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
    }));
    setHearts((prev) => [...prev, ...newHearts]);
    const maxDuration = Math.max(...newHearts.map((h) => h.duration + h.delay)) + 500;
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => !newHearts.some((nh) => nh.id === h.id)));
    }, maxDuration);
  }, []);

  // 「Thank you! / Cheers!」テキストポップ生成
  const spawnTexts = useCallback((isSurge: boolean) => {
    const count = isSurge ? 4 : 2;
    const newTexts: FloatingText[] = Array.from({ length: count }, (_, i) => ({
      id: `${Date.now()}-t${i}-${Math.random()}`,
      text: CHEER_TEXTS[Math.floor(Math.random() * CHEER_TEXTS.length)],
      x: 10 + Math.random() * 80,
      y: 18 + Math.random() * 45,
      size: 2.2 + Math.random() * 1.8,
      duration: 1500 + Math.random() * 700,
      delay: Math.random() * 400,
      color: TEXT_COLORS[Math.floor(Math.random() * TEXT_COLORS.length)],
    }));
    setTexts((prev) => [...prev, ...newTexts]);
    const maxDuration = Math.max(...newTexts.map((t) => t.duration + t.delay)) + 300;
    setTimeout(() => {
      setTexts((prev) => prev.filter((t) => !newTexts.some((nt) => nt.id === t.id)));
    }, maxDuration);
  }, []);

  // チア受信ハンドラ
  const onCheerNew = useCallback((fromRealtime = true) => {
    const now = Date.now();
    if (fromRealtime) lastRealtimeRef.current = now;
    recentCheersRef.current = [
      ...recentCheersRef.current.filter((t) => now - t < SURGE_WINDOW_MS),
      now,
    ];
    const isSurge = recentCheersRef.current.length >= SURGE_THRESHOLD;
    isSurgeRef.current = isSurge;

    pendingCheerCountRef.current += 1;
    spawnHearts(isSurge);
    spawnTexts(isSurge);

    if (isSurge) {
      setSurgeGlow(true);
      if (surgeTimerRef.current) clearTimeout(surgeTimerRef.current);
      surgeTimerRef.current = setTimeout(() => setSurgeGlow(false), 3000);
    }

    // 約15秒間、波状にハート・テキストを追加し続けて演出を盛り上げ、
    // 終了タイミングでまとめて「キラーン」カウントアップする
    celebrationEndRef.current = now + CELEBRATION_DURATION_MS;
    if (!celebrationTimerRef.current) {
      celebrationTimerRef.current = setInterval(() => {
        if (Date.now() >= celebrationEndRef.current) {
          if (celebrationTimerRef.current) clearInterval(celebrationTimerRef.current);
          celebrationTimerRef.current = null;
          if (pendingCheerCountRef.current > 0) {
            setCheerCount((c) => c + pendingCheerCountRef.current);
            pendingCheerCountRef.current = 0;
            setCounterPulse(true);
            if (counterPulseTimerRef.current) clearTimeout(counterPulseTimerRef.current);
            counterPulseTimerRef.current = setTimeout(() => setCounterPulse(false), 700);
          }
          return;
        }
        spawnHearts(isSurgeRef.current);
        spawnTexts(isSurgeRef.current);
      }, CELEBRATION_INTERVAL_MS);
    }
  }, [spawnHearts, spawnTexts]);

  // タイムテーブルの現在スロットを適用（スロット外/転換スロットはトラックのデフォルトQRへ）
  const applySchedule = useCallback((scheds: DisplaySchedule[]) => {
    if (isForcedRef.current) return;
    const now = new Date();
    const active = getActiveSchedule(scheds, now);
    const next = active?.qr_config
      ? qrConfigToState(active.qr_config, siteUrlRef.current, active.label ?? active.qr_config.label ?? active.qr_config.product?.name ?? "")
      : null;
    if (next) {
      setQrState(prev => {
        if (prev?.qr_config_id === next.qr_config_id) return prev;
        setFlash(true);
        setTimeout(() => setFlash(false), 350);
        try { localStorage.setItem(STORAGE_KEY(eventId), JSON.stringify(next)); } catch {}
        return next;
      });
    } else {
      // スロット外 or 転換スロット → トラックのデフォルトQRに戻す
      setQrState(prev => {
        const def = defaultQrStateRef.current;
        if (!def || prev?.qr_config_id === def.qr_config_id) return prev;
        setFlash(true);
        setTimeout(() => setFlash(false), 350);
        try { localStorage.setItem(STORAGE_KEY(eventId), JSON.stringify(def)); } catch {}
        return def;
      });
    }
  }, [eventId]);

  // 割り当てられたトラックのタイムテーブルを取得
  const fetchSchedules = useCallback((trackId: string | null) => {
    const url = trackId
      ? `/api/events/${eventId}/display-schedules?track_id=${trackId}`
      : `/api/events/${eventId}/display-schedules`;
    return fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then((data: DisplaySchedule[]) => {
        schedulesRef.current = data;
        setSchedules(data);
        applySchedule(data);
      })
      .catch(() => {});
  }, [eventId, applySchedule]);

  // 子機を自己登録し、割り当てトラック・トラックのデフォルトQRを取得
  const registerDevice = useCallback(() => {
    return fetch(`/api/events/${eventId}/display-devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: getOrCreateDeviceId(deviceName), device_name: deviceName }),
    })
      .then(r => r.ok ? r.json() : { track_id: null, default_qr_config: null })
      .then((data: { track_id: string | null; default_qr_config: QrConfigInfo }) => {
        trackIdRef.current = data.track_id;
        const def = qrConfigToState(data.default_qr_config, siteUrlRef.current);
        defaultQrStateRef.current = def;
        setDefaultQrState(def);
        return data.track_id;
      })
      .catch(() => trackIdRef.current);
  }, [eventId, deviceName]);

  // 端末名（識別名）を変更し、localStorageとサーバーに反映
  const updateDeviceName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === deviceName) return;
    try { localStorage.setItem(DEVICE_NAME_KEY, trimmed); } catch {}
    setDeviceName(trimmed);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
    fetch(`/api/events/${eventId}/display-devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: getOrCreateDeviceId(trimmed), device_name: trimmed }),
    }).catch(() => {});
  }, [eventId, deviceName]);

  // 初回: 自己登録 → タイムテーブル取得 + タイマーで定期再取得（30秒間隔）
  // ※ schedulesRef の再評価だけでは新規登録されたスケジュールを検知できないため、
  //    毎回サーバーから最新のタイムテーブルを取得して適用する
  useEffect(() => {
    registerDevice().then((trackId) => fetchSchedules(trackId));

    const timer = setInterval(() => fetchSchedules(trackIdRef.current), 30_000);
    return () => clearInterval(timer);
  }, [registerDevice, fetchSchedules]);

  // PWAキオスクモード: OS/ブラウザのバックナビゲーションをブロック
  useEffect(() => {
    history.pushState(null, '', window.location.href);
    const block = () => history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', block);
    return () => window.removeEventListener('popstate', block);
  }, []);

  // 画面サイズに応じてQRサイズを動的計算
  useEffect(() => {
    const calc = () => {
      const size = Math.max(160, Math.min(600, Math.floor(Math.min(window.innerWidth * 0.82, window.innerHeight - 200))));
      setQrSize(size);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // QRコード描画
  useEffect(() => {
    if (!qrState?.qr_url || !canvasRef.current) return;
    let targetUrl = qrState.qr_url;
    try {
      const url = new URL(qrState.qr_url);
      url.searchParams.set("device", deviceName);
      targetUrl = url.toString();
    } catch {}
    import("qrcode").then(({ default: QRCode }) => {
      QRCode.toCanvas(canvasRef.current!, targetUrl, {
        width: qrSize,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(() => {});
    });
  }, [qrState?.qr_url, qrSize, deviceName]);

  // 初期チア数取得 + ポーリングフォールバック（Realtimeが届かない場合の保険）
  useEffect(() => {
    const fetchCount = (isInitial: boolean) =>
      fetch(`/api/events/${eventId}/display-stats`)
        .then((r) => r.ok ? r.json() : null)
        .then((d: { count: number } | null) => {
          if (d?.count == null) return;
          const serverCount = d.count;
          if (isInitial) {
            setCheerCount(serverCount);
            lastPolledCountRef.current = serverCount;
            return;
          }
          const diff = serverCount - lastPolledCountRef.current;
          lastPolledCountRef.current = serverCount;
          if (diff <= 0) return;

          // Realtimeが直近10秒以内に届いていれば重複防止でスキップ
          const realtimeLag = Date.now() - lastRealtimeRef.current;
          if (realtimeLag < 10_000) {
            // Realtimeは動いている → カウントだけ補正
            setCheerCount((cur) => Math.max(cur, serverCount));
          } else {
            // Realtimeが止まっている → ポーリングでハートを出す（最大5件）
            for (let i = 0; i < Math.min(diff, 5); i++) {
              setTimeout(() => onCheerNew(false), i * 300);
            }
          }
        })
        .catch(() => {});

    fetchCount(true);
    const interval = setInterval(() => fetchCount(false), 15_000);
    return () => clearInterval(interval);
  }, [eventId, onCheerNew]);

  // Supabase Realtime
  useEffect(() => {
    const supabase = createClient();
    const deviceId = getOrCreateDeviceId(deviceName);

    const channel = supabase.channel(`event-display:${eventId}`, {
      config: { presence: { key: deviceId } },
    });

    channel.on("broadcast", { event: "qr-switch" }, ({ payload }) => {
      const { target_device_id, is_forced, cancel_forced, ...qrData } = payload as QRState & { target_device_id?: string | null; is_forced?: boolean; cancel_forced?: boolean };
      // target_device_id指定時、自分宛てでなければ無視（端末別の強制表示・解除）
      if (target_device_id != null && target_device_id !== deviceId) return;
      if (cancel_forced) {
        // 強制モード解除 → タイムテーブルに戻す
        isForcedRef.current = false;
        setIsForcedOverride(false);
        const active = getActiveSchedule(schedulesRef.current, new Date());
        const next = active?.qr_config
          ? qrConfigToState(active.qr_config, siteUrlRef.current, active.label ?? active.qr_config.label ?? active.qr_config.product?.name ?? "")
          : defaultQrStateRef.current;
        setQrState(next);
        if (next) {
          try { localStorage.setItem(STORAGE_KEY(eventId), JSON.stringify(next)); } catch {}
        }
        setFlash(true);
        setTimeout(() => setFlash(false), 350);
        return;
      }
      // 通常の強制切り替え
      if (is_forced) {
        isForcedRef.current = true;
        setIsForcedOverride(true);
      }
      setQrState(qrData);
      try { localStorage.setItem(STORAGE_KEY(eventId), JSON.stringify(qrData)); } catch {}
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
    });

    channel.on("broadcast", { event: "cheer-new" }, () => {
      onCheerNew();
    });

    // コントロールパネルからトラック割当が変更された → 再登録してタイムテーブルを更新
    channel.on("broadcast", { event: "track-assigned" }, ({ payload }) => {
      const { device_id: targetDeviceId } = payload as { device_id: string; track_id: string | null };
      if (targetDeviceId !== deviceId) return;
      registerDevice().then((trackId) => fetchSchedules(trackId));
    });

    // コントロールパネルでタイムテーブルが追加・削除された → 即座に最新スケジュールを取得して反映
    channel.on("broadcast", { event: "schedule-updated" }, () => {
      fetchSchedules(trackIdRef.current);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        const battery = await getBatteryLevel();
        channel.track({ role: "display", device_id: deviceId, device_name: deviceName, battery_level: battery, joined_at: new Date().toISOString() });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnected(false);
        setChannelError(`接続エラー: ${status}`);
      }
    });

    const timer = setInterval(async () => {
      const battery = await getBatteryLevel();
      channel.track({ role: "display", device_id: deviceId, device_name: deviceName, battery_level: battery });
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(timer);
      if (surgeTimerRef.current) clearTimeout(surgeTimerRef.current);
      if (counterPulseTimerRef.current) clearTimeout(counterPulseTimerRef.current);
      if (celebrationTimerRef.current) clearInterval(celebrationTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [eventId, deviceName, onCheerNew, registerDevice, fetchSchedules]);

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

  const closeUnlock = () => setShowUnlock(false);

  const handleUnlockSuccess = () => {
    router.push(`/dashboard/events/${eventId}`);
  };

  return (
    <>
      {/* ハートアニメーション用キーフレーム */}
      <style>{`
        @keyframes heartFloat {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          70%  { opacity: 0.8; }
          100% { transform: translateY(-78vh) scale(0.15); opacity: 0; }
        }
        @keyframes surgeBreath {
          0%, 100% { opacity: 0.15; }
          50%       { opacity: 0.35; }
        }
        @keyframes textPop {
          0%   { transform: scale(0.4) translateY(10px) rotate(-6deg); opacity: 0; }
          30%  { transform: scale(1.15) translateY(0) rotate(3deg); opacity: 1; }
          70%  { transform: scale(1) rotate(-2deg); opacity: 1; }
          100% { transform: scale(0.9) translateY(-40px) rotate(0deg); opacity: 0; }
        }
        @keyframes counterPop {
          0%   { transform: scale(1); }
          35%  { transform: scale(1.7); }
          65%  { transform: scale(0.9); }
          100% { transform: scale(1); }
        }
        @keyframes sparkleFlash {
          0%   { transform: scale(0.2) rotate(-20deg); opacity: 0; }
          40%  { transform: scale(1.4) rotate(15deg); opacity: 1; }
          100% { transform: scale(0.4) rotate(35deg); opacity: 0; }
        }
      `}</style>

      <div
        className="fixed inset-0 flex flex-col items-center justify-center select-none bg-slate-950"
        style={{ overscrollBehavior: "none" }}
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

        {/* サージグロー */}
        {surgeGlow && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, rgba(255,64,129,0.3) 0%, transparent 70%)",
              animation: "surgeBreath 0.8s ease-in-out infinite",
            }}
          />
        )}

        {/* 浮遊ハート */}
        {hearts.map((h) => (
          <div
            key={h.id}
            className="absolute pointer-events-none"
            style={{
              left: `${h.x}%`,
              bottom: "8%",
              fontSize: `${h.size}rem`,
              color: h.color,
              lineHeight: 1,
              animation: `heartFloat ${h.duration}ms ease-out ${h.delay}ms both`,
              textShadow: surgeGlow ? `0 0 12px ${h.color}` : "none",
            }}
          >
            ♥
          </div>
        ))}

        {/* 浮遊テキスト（Thank you! / Cheers!） */}
        {texts.map((t) => (
          <div
            key={t.id}
            className="absolute pointer-events-none font-black italic uppercase tracking-tight"
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              fontSize: `${t.size}rem`,
              color: t.color,
              lineHeight: 1,
              textShadow: `0 0 16px ${t.color}, 0 2px 8px rgba(0,0,0,0.6)`,
              animation: `textPop ${t.duration}ms ease-out ${t.delay}ms both`,
            }}
          >
            {t.text}
          </div>
        ))}

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
        <div className="absolute top-4 right-4 z-10 pointer-events-none flex items-center gap-2">
          {isForcedOverride && (
            <span className="text-[9px] font-black text-amber-400/70 uppercase tracking-widest">MANUAL</span>
          )}
          {schedules.length > 0 && !isForcedOverride && (
            <span className="text-[9px] font-black text-indigo-400/60 uppercase tracking-widest">AUTO</span>
          )}
          {connected
            ? <Wifi size={14} className="text-green-400/50" />
            : <WifiOff size={14} className="text-red-400/50" />}
        </div>

        {/* チア数カウンター */}
        {cheerCount > 0 && (
          <div className="absolute top-4 left-4 z-10 pointer-events-none flex items-center gap-3">
            <span
              style={{
                color: "#ff6b9d", fontSize: "4.6rem", lineHeight: 1, display: "inline-block",
                textShadow: "0 0 10px #ff6b9d",
                animation: counterPulse ? "counterPop 0.6s ease-out" : undefined,
              }}
            >♥</span>
            <span className="relative font-black tabular-nums"
              style={{ color: "#ff6b9d", fontSize: "3rem", textShadow: surgeGlow ? "0 0 8px #ff6b9d" : "none" }}>
              {cheerCount.toLocaleString()}
              {counterPulse && (
                <Sparkles
                  size={40}
                  className="absolute -top-4 -right-9 text-yellow-300"
                  style={{ animation: "sparkleFlash 0.7s ease-out", filter: "drop-shadow(0 0 6px #ffd54f)" }}
                />
              )}
            </span>
          </div>
        )}

        {/* 端末名表示（常時・画面端） */}
        <div className="absolute bottom-3 right-3 z-10 pointer-events-none">
          <span className="text-[9px] font-mono text-slate-700 tracking-wider">{deviceName}</span>
        </div>

        {/* QR表示 */}
        {qrState ? (
          <div className="relative flex flex-col items-center gap-4 px-4 py-6 w-full pointer-events-none">
            <p className="text-4xl font-black text-white uppercase tracking-tight text-center leading-tight">
              {qrState.label || qrState.product_name}
            </p>
            <p className="text-base font-bold text-slate-400 text-center">
              {qrState.artist_name ? <><span className="text-pink-400">宛先：</span>{qrState.artist_name}</> : eventTitle}
            </p>
            <div className="p-5 pb-3 bg-white rounded-3xl shadow-2xl flex flex-col items-center gap-1.5">
              <canvas ref={canvasRef} />
              <div className="flex items-center gap-1.5 pt-1">
                <img src="/logo-emblem.png" alt="" className="h-4 w-auto" />
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">Direct Cheers</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 font-mono uppercase tracking-widest">
              {qrState.qr_config_id.slice(0, 8)}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center px-8 pointer-events-none">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
              {channelError
                ? <WifiOff size={24} className="text-red-400" />
                : <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-400 rounded-full animate-spin" />}
            </div>
            {channelError
              ? <p className="text-red-400 font-bold text-sm">{channelError}</p>
              : <p className="text-slate-400 font-bold text-sm">親機からの指示を待機中</p>}
            <p className="text-slate-600 text-xs">{eventTitle}</p>
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

              {/* 端末名（識別名）設定 */}
              <div className="space-y-2 pb-4 border-b border-slate-700">
                <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                  <Smartphone size={12} /> 端末名（識別名）
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="例: DJ-01"
                    className="flex-1 h-10 px-3 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm font-bold focus:outline-none focus:border-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={() => updateDeviceName(nameInput)}
                    disabled={!nameInput.trim() || nameInput.trim() === deviceName}
                    className="h-10 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black text-sm transition-all"
                  >
                    保存
                  </button>
                </div>
                {nameSaved && <p className="text-xs text-emerald-400 font-bold">保存しました</p>}
              </div>

              <PasskeySetup
                mode="authenticate"
                buttonLabel="パスキーで解除"
                onSuccess={handleUnlockSuccess}
              />

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
    </>
  );
}
