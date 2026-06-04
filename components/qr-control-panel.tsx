"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Wifi, WifiOff, Battery, BatteryLow, BatteryMedium, BatteryFull,
  Send, Users, Radio, CheckCircle2, Clock, Plus, Trash2, Calendar, RotateCcw,
} from "lucide-react";
import { DISPLAY_TZ } from "@/lib/display-tz";
import { jstLocalToUtcIso, utcIsoToJstLocal } from "@/lib/utils";

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

type DisplaySchedule = {
  schedule_id: string;
  qr_config_id: string | null;
  start_at: string;
  end_at: string;
  label: string | null;
  qr_config: {
    qr_config_id: string;
    label: string | null;
    product: { name: string; artist: { display_name: string } | null } | null;
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
  const [tab, setTab] = useState<"push" | "timetable">("push");

  // ── Push tab ──────────────────────────────────────
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [isForcedActive, setIsForcedActive] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<any>(null);

  // ── Timetable tab ─────────────────────────────────
  const [schedules, setSchedules] = useState<DisplaySchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState({ qr_config_id: "", start_at: "", end_at: "", label: "" });
  const [savingSlot, setSavingSlot] = useState(false);

  // Realtime channel setup
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

  // スケジュール取得
  const fetchSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    setScheduleError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/display-schedules`);
      if (!res.ok) throw new Error(await res.text());
      setSchedules(await res.json());
    } catch (e: any) {
      setScheduleError(e.message);
    } finally {
      setLoadingSchedules(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (tab === "timetable") fetchSchedules();
  }, [tab, fetchSchedules]);

  // QRをプッシュ（強制モード）
  const pushQR = useCallback(async (config: QRConfig) => {
    if (!channelRef.current || pushing) return;
    setPushing(true);
    setPushError(null);
    try {
      const result = await channelRef.current.send({
        type: "broadcast",
        event: "qr-switch",
        payload: {
          is_forced: true,
          qr_config_id: config.qr_config_id,
          qr_url: `${siteUrl}/c/${config.qr_config_id}`,
          product_name: config.product?.name ?? "",
          label: config.label || config.product?.name || "",
          artist_name: config.product?.artist?.display_name ?? "",
        },
      });
      if (result === "ok") {
        setActiveConfigId(config.qr_config_id);
        setIsForcedActive(true);
      } else {
        setPushError(`送信失敗: ${result}`);
      }
    } finally {
      setPushing(false);
    }
  }, [pushing, siteUrl]);

  // 強制モードを解除してタイムテーブルに戻す
  const cancelForced = useCallback(async () => {
    if (!channelRef.current || pushing) return;
    setPushing(true);
    try {
      const result = await channelRef.current.send({
        type: "broadcast",
        event: "qr-switch",
        payload: { cancel_forced: true },
      });
      if (result === "ok") {
        setActiveConfigId(null);
        setIsForcedActive(false);
      }
    } finally {
      setPushing(false);
    }
  }, [pushing]);

  // スロット追加
  const addSlot = async () => {
    if (!newSlot.start_at || !newSlot.end_at) return;
    setSavingSlot(true);
    setScheduleError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/display-schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_config_id: newSlot.qr_config_id || null,
          start_at: jstLocalToUtcIso(newSlot.start_at),
          end_at:   jstLocalToUtcIso(newSlot.end_at),
          label: newSlot.label || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewSlot({ qr_config_id: "", start_at: "", end_at: "", label: "" });
      await fetchSchedules();
    } catch (e: any) {
      setScheduleError(e.message);
    } finally {
      setSavingSlot(false);
    }
  };

  // スロット削除
  const deleteSlot = async (scheduleId: string) => {
    try {
      await fetch(`/api/events/${eventId}/display-schedules?schedule_id=${scheduleId}`, { method: "DELETE" });
      setSchedules(s => s.filter(x => x.schedule_id !== scheduleId));
    } catch {}
  };

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
          <p className="text-xs text-slate-600 italic font-bold">子機が接続されていません</p>
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

      {/* タブ切り替え */}
      <div className="flex gap-2">
        {(["push", "timetable"] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              tab === t
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                : "bg-slate-900 text-slate-500 border border-slate-800 hover:border-slate-600"
            }`}
          >
            {t === "push" ? <span className="flex items-center justify-center gap-1.5"><Send size={11} /> 手動配信</span>
                          : <span className="flex items-center justify-center gap-1.5"><Clock size={11} /> タイムテーブル</span>}
          </button>
        ))}
      </div>

      {/* ── 手動配信タブ ── */}
      {tab === "push" && (
        <div className="space-y-3">
          {/* 強制配信中バナー */}
          {isForcedActive && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 flex items-center justify-between">
              <p className="text-xs font-black text-amber-400">強制配信中 — タイムテーブルを無視しています</p>
              <button
                type="button"
                onClick={cancelForced}
                disabled={pushing}
                className="flex items-center gap-1.5 text-[10px] font-black text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500/10 transition-all disabled:opacity-50"
              >
                <RotateCcw size={10} /> タイムテーブルに戻す
              </button>
            </div>
          )}

          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
            QRを選んで全台にプッシュ（強制）
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
                    <div
                      className="w-12 h-12 rounded-xl shrink-0 overflow-hidden border border-slate-700 flex items-center justify-center"
                      style={{ backgroundColor: isEntrance ? config.bg_color : "#0f172a" }}
                    >
                      {(isEntrance ? config.strip_image_url : config.image_url) ? (
                        <img src={(isEntrance ? config.strip_image_url : config.image_url)!} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-slate-600 rounded" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-white truncate">{config.label || config.product?.name || "QR"}</p>
                      {config.product?.artist && (
                        <p className="text-xs text-slate-500 truncate">{config.product.artist.display_name}</p>
                      )}
                    </div>
                    {isActive
                      ? <div className="flex items-center gap-1 shrink-0"><CheckCircle2 size={14} className="text-indigo-400" /><span className="text-[10px] font-black text-indigo-400 uppercase">配信中</span></div>
                      : <Send size={14} className="text-slate-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── タイムテーブルタブ ── */}
      {tab === "timetable" && (
        <div className="space-y-4">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            時間になると子機が自動でQRを切り替えます
          </p>

          {scheduleError && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-xl px-4 py-3 font-bold">{scheduleError}</p>
          )}

          {/* 登録済みスロット一覧 */}
          {loadingSchedules ? (
            <p className="text-xs text-slate-600 animate-pulse">読み込み中...</p>
          ) : schedules.length === 0 ? (
            <p className="text-xs text-slate-600 italic">スケジュールが未登録です</p>
          ) : (
            <div className="space-y-2">
              {schedules.map(s => {
                const qcLabel = s.qr_config?.label ?? s.qr_config?.product?.name ?? "QR";
                const artistName = s.qr_config?.product?.artist?.display_name;
                return (
                  <div key={s.schedule_id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
                    <Calendar size={13} className="text-indigo-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-white">
                        {s.label || qcLabel}
                        {artistName && <span className="text-slate-500 font-normal ml-1.5">— {artistName}</span>}
                      </p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        {new Date(s.start_at).toLocaleString("ja-JP", { timeZone: DISPLAY_TZ, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {" → "}
                        {new Date(s.end_at).toLocaleTimeString("ja-JP", { timeZone: DISPLAY_TZ, hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {!s.qr_config_id && (
                        <p className="text-[10px] text-amber-500/70 mt-0.5">デフォルトQR表示</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteSlot(s.schedule_id)}
                      className="text-slate-600 hover:text-red-400 transition-colors shrink-0 p-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 新規スロット追加フォーム */}
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Plus size={10} /> スロットを追加
            </p>

            {/* QR選択 */}
            <div>
              <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">QRコード（省略 = デフォルト）</label>
              <select
                value={newSlot.qr_config_id}
                onChange={e => setNewSlot(s => ({ ...s, qr_config_id: e.target.value }))}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">— デフォルト（転換・休憩など）</option>
                {qrConfigs.map(qc => (
                  <option key={qc.qr_config_id} value={qc.qr_config_id}>
                    {qc.label || qc.product?.name || qc.qr_config_id.slice(0, 8)}
                    {qc.product?.artist ? ` — ${qc.product.artist.display_name}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* 開始・終了時刻 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">開始（JST）</label>
                <input
                  type="datetime-local"
                  value={newSlot.start_at}
                  onChange={e => setNewSlot(s => ({ ...s, start_at: e.target.value }))}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">終了（JST）</label>
                <input
                  type="datetime-local"
                  value={newSlot.end_at}
                  onChange={e => setNewSlot(s => ({ ...s, end_at: e.target.value }))}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* ラベル（任意） */}
            <div>
              <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">ラベル（任意）</label>
              <input
                type="text"
                placeholder="例：転換・休憩・Aセット"
                value={newSlot.label}
                onChange={e => setNewSlot(s => ({ ...s, label: e.target.value }))}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="button"
              onClick={addSlot}
              disabled={savingSlot || !newSlot.start_at || !newSlot.end_at}
              className="w-full py-3 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus size={12} /> {savingSlot ? "追加中..." : "スロットを追加"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
