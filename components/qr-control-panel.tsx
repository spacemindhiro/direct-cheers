"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wifi, WifiOff, Battery, BatteryLow, BatteryMedium, BatteryFull, Send, Users, Radio, CheckCircle2 } from "lucide-react";

type Device = {
  device_id: string;
  device_name: string;
  battery_level: number | null;
  role: "display" | "control";
  joined_at: string;
};

type QRConfig = {
  qr_config_id: string;
  label: string | null;
  image_url: string | null;
  strip_image_url: string | null;
  bg_color: string;
  product: {
    name: string;
    type: string;
    artist: { display_name: string } | null;
  } | null;
};

function BatteryIcon({ level }: { level: number | null }) {
  if (level === null) return <Battery size={12} className="text-slate-500" />;
  if (level <= 20) return <BatteryLow size={12} className="text-red-400" />;
  if (level <= 50) return <BatteryMedium size={12} className="text-amber-400" />;
  return <BatteryFull size={12} className="text-green-400" />;
}

export function QRControlPanel({
  eventId,
  eventTitle,
  qrConfigs,
  siteUrl,
}: {
  eventId: string;
  eventTitle: string;
  qrConfigs: QRConfig[];
  siteUrl: string;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const supabase = createClient();
    const controlId = `ctrl-${crypto.randomUUID().slice(0, 8)}`;

    const channel = supabase.channel(`event-display:${eventId}`, {
      config: { presence: { key: controlId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const all = Object.values(state).flat() as unknown as Device[];
      setDevices(all.filter((d) => d.role === "display"));
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        await channel.track({ role: "control", joined_at: new Date().toISOString() });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnected(false);
      }
    });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  const pushQR = useCallback(async (config: QRConfig) => {
    if (!channelRef.current || pushing) return;
    setPushing(true);
    setPushError(null);
    try {
      const result = await channelRef.current.send({
        type: "broadcast",
        event: "qr-switch",
        payload: {
          qr_config_id: config.qr_config_id,
          qr_url: `${siteUrl}/c/${config.qr_config_id}`,
          product_name: config.product?.name ?? "",
          label: config.label || config.product?.name || "",
          artist_name: config.product?.artist?.display_name ?? "",
        },
      });
      if (result === "ok") {
        setActiveConfigId(config.qr_config_id);
      } else {
        setPushError(`送信失敗: ${result}`);
      }
    } finally {
      setPushing(false);
    }
  }, [pushing, siteUrl]);

  return (
    <div className="space-y-6 pb-20">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Control Panel</p>
          <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-tight">{eventTitle}</h1>
        </div>
        {connected
          ? <div className="flex items-center gap-1.5 text-xs text-green-400 font-bold"><Radio size={12} className="animate-pulse" /> LIVE</div>
          : <div className="flex items-center gap-1.5 text-xs text-red-400 font-bold"><WifiOff size={12} /> 切断中</div>}
      </div>

      {/* 接続デバイス一覧 */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Users size={12} className="text-slate-500" />
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            接続中の子機 ({devices.length})
          </p>
        </div>
        {devices.length === 0 ? (
          <p className="text-xs text-slate-600 italic font-bold">子機が接続されていません<br />子機のブラウザで Display 画面を開いてください</p>
        ) : (
          <div className="space-y-2">
            {devices.map((d, i) => (
              <div key={`${d.device_id}-${i}`} className="flex items-center justify-between px-4 py-3 bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 shrink-0 animate-pulse" />
                  <span className="text-sm font-bold text-slate-200">{d.device_name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <BatteryIcon level={d.battery_level} />
                  <span className="text-xs font-mono text-slate-400">
                    {d.battery_level !== null ? `${d.battery_level}%` : "--"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* QR選択・プッシュ */}
      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
          QRを選んで全台にプッシュ
        </p>
        {pushError && (
          <p className="text-xs text-red-400 font-bold bg-red-500/10 rounded-xl px-4 py-3">{pushError}</p>
        )}
        {qrConfigs.length === 0 ? (
          <p className="text-xs text-slate-600 italic font-bold">このイベントにQRコードがありません</p>
        ) : (
          <div className="space-y-2">
            {qrConfigs.map((config) => {
              const isActive = activeConfigId === config.qr_config_id;
              const isEntrance = config.product?.type === "entrance";
              return (
                <button
                  key={config.qr_config_id}
                  type="button"
                  onClick={() => pushQR(config)}
                  disabled={pushing}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all disabled:opacity-60 ${
                    isActive
                      ? "bg-indigo-500/15 border-indigo-500/40"
                      : "bg-slate-900 border-slate-800 hover:border-slate-600 active:scale-[0.98]"
                  }`}
                >
                  {/* サムネイル */}
                  <div
                    className="w-12 h-12 rounded-xl shrink-0 overflow-hidden border border-slate-700 flex items-center justify-center"
                    style={{ backgroundColor: isEntrance ? config.bg_color : "#0f172a" }}
                  >
                    {(isEntrance ? config.strip_image_url : config.image_url) ? (
                      <img
                        src={(isEntrance ? config.strip_image_url : config.image_url)!}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    ) : (
                      <div className="w-5 h-5 border-2 border-slate-600 rounded" />
                    )}
                  </div>

                  {/* ラベル */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-white truncate">
                      {config.label || config.product?.name || "QR"}
                    </p>
                    {config.product?.artist && (
                      <p className="text-xs text-slate-500 truncate">
                        {config.product.artist.display_name}
                      </p>
                    )}
                  </div>

                  {/* 状態 */}
                  {isActive ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <CheckCircle2 size={14} className="text-indigo-400" />
                      <span className="text-[10px] font-black text-indigo-400 uppercase">配信中</span>
                    </div>
                  ) : (
                    <Send size={14} className="text-slate-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
