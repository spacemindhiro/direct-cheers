"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Wifi, WifiOff, Battery, BatteryLow, BatteryMedium, BatteryFull,
  Send, Users, Radio, CheckCircle2, Clock, Plus, Trash2, Calendar, RotateCcw,
  X, LayoutGrid, Pencil, Save,
} from "lucide-react";
import { DISPLAY_TZ } from "@/lib/display-tz";
import { jstLocalToUtcIso, utcIsoToJstLocal, addHoursToLocalDT } from "@/lib/utils";
import { DisplayTimetableGrid } from "@/components/display-timetable-grid";

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
  track_id: string | null;
  start_at: string;
  end_at: string;
  label: string | null;
  qr_config: {
    qr_config_id: string;
    label: string | null;
    product: { name: string; artist: { display_name: string } | null } | null;
  } | null;
};

type DisplayTrack = {
  track_id: string;
  name: string;
  default_qr_config_id: string | null;
  sort_order: number;
  default_qr_config: {
    qr_config_id: string;
    label: string | null;
    image_url: string | null;
    product: { name: string; type: string; artist: { display_name: string } | null } | null;
  } | null;
};

type DisplayDeviceRecord = {
  device_id: string;
  device_name: string | null;
  track_id: string | null;
  last_seen_at: string;
};

type MergedDevice = {
  device_id: string;
  device_name: string;
  battery_level: number | null;
  online: boolean;
  track_id: string | null;
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
  eventStartAt,
  qrConfigs,
  siteUrl,
}: {
  eventId: string;
  eventTitle: string;
  eventStartAt: string;
  qrConfigs: QRConfig[];
  siteUrl: string;
}) {
  const [tab, setTab] = useState<"push" | "timetable" | "overview">("push");

  // ── Push tab ──────────────────────────────────────
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [isForcedActive, setIsForcedActive] = useState(false);
  const [targetDeviceId, setTargetDeviceId] = useState<string | null>(null); // null = 全機
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<any>(null);

  // ── トラック・子機（DB） ───────────────────────────
  const [tracks, setTracks] = useState<DisplayTrack[]>([]);
  const [dbDevices, setDbDevices] = useState<DisplayDeviceRecord[]>([]);
  const [newTrackName, setNewTrackName] = useState("");
  const [savingTrack, setSavingTrack] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);

  // ── Timetable tab ─────────────────────────────────
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<DisplaySchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState({ qr_config_id: "", start_at: "", end_at: "", label: "" });
  const [savingSlot, setSavingSlot] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSlot, setEditSlot] = useState({ qr_config_id: "", start_at: "", end_at: "", label: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // ── Overview tab ──────────────────────────────────
  const [allSchedules, setAllSchedules] = useState<DisplaySchedule[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

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
  const fetchSchedules = useCallback(async (trackId: string | null) => {
    setLoadingSchedules(true);
    setScheduleError(null);
    try {
      const url = trackId
        ? `/api/events/${eventId}/display-schedules?track_id=${trackId}`
        : `/api/events/${eventId}/display-schedules`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setSchedules(await res.json());
    } catch (e: any) {
      setScheduleError(e.message);
    } finally {
      setLoadingSchedules(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (tab === "timetable") fetchSchedules(selectedTrackId);
  }, [tab, selectedTrackId, fetchSchedules]);

  // トラック切替時、新規スロットフォームをリセット（デフォルト値は下のeffectで再計算される）
  useEffect(() => {
    setNewSlot({ qr_config_id: "", start_at: "", end_at: "", label: "" });
    setEditingId(null);
  }, [selectedTrackId]);

  // 新規スロットの開始・終了デフォルト値を計算
  // 既存スロットが無ければ開始をパーティ開始日時に、あれば最遅の終了時刻を開始のデフォルトに、
  // 終了は開始の1時間後をデフォルトにする
  useEffect(() => {
    if (tab !== "timetable" || newSlot.start_at) return;
    const defaultStart = schedules.length === 0
      ? utcIsoToJstLocal(eventStartAt)
      : utcIsoToJstLocal(schedules.reduce((latest, s) => (s.end_at > latest ? s.end_at : latest), schedules[0].end_at));
    setNewSlot(s => ({ ...s, start_at: defaultStart, end_at: addHoursToLocalDT(defaultStart, 1) }));
  }, [schedules, tab, eventStartAt, newSlot.start_at]);

  // トラック一覧取得
  const fetchTracks = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/display-tracks`);
      if (res.ok) setTracks(await res.json());
    } catch {}
  }, [eventId]);

  // 子機一覧取得（DB）
  const fetchDbDevices = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/display-devices`);
      if (res.ok) setDbDevices(await res.json());
    } catch {}
  }, [eventId]);

  useEffect(() => {
    fetchTracks();
    fetchDbDevices();
  }, [fetchTracks, fetchDbDevices]);

  // 全体表（overview）用：全トラックのスケジュールを一括取得
  const fetchAllSchedules = useCallback(async () => {
    setLoadingAll(true);
    try {
      const res = await fetch(`/api/events/${eventId}/display-schedules?all=1`);
      if (res.ok) setAllSchedules(await res.json());
    } catch {} finally {
      setLoadingAll(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (tab === "overview") {
      fetchTracks();
      fetchAllSchedules();
    }
  }, [tab, fetchTracks, fetchAllSchedules]);

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
          target_device_id: targetDeviceId,
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
  }, [pushing, siteUrl, targetDeviceId]);

  // 強制モードを解除してタイムテーブルに戻す
  const cancelForced = useCallback(async () => {
    if (!channelRef.current || pushing) return;
    setPushing(true);
    try {
      const result = await channelRef.current.send({
        type: "broadcast",
        event: "qr-switch",
        payload: { target_device_id: targetDeviceId, cancel_forced: true },
      });
      if (result === "ok") {
        setActiveConfigId(null);
        setIsForcedActive(false);
      }
    } finally {
      setPushing(false);
    }
  }, [pushing, targetDeviceId]);

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
          track_id: selectedTrackId,
          start_at: jstLocalToUtcIso(newSlot.start_at),
          end_at:   jstLocalToUtcIso(newSlot.end_at),
          label: newSlot.label || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      // 先に最新スケジュールを取得してから空にする（次のスロットの開始デフォルトに反映される）
      await fetchSchedules(selectedTrackId);
      setNewSlot({ qr_config_id: "", start_at: "", end_at: "", label: "" });
      // 子機に即時反映させる（タイムテーブル変更を通知）
      channelRef.current?.send({ type: "broadcast", event: "schedule-updated", payload: {} });
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
      channelRef.current?.send({ type: "broadcast", event: "schedule-updated", payload: {} });
    } catch {}
  };

  // スロット編集開始
  const startEdit = (s: DisplaySchedule) => {
    setEditingId(s.schedule_id);
    setEditSlot({
      qr_config_id: s.qr_config_id ?? "",
      start_at: utcIsoToJstLocal(s.start_at),
      end_at: utcIsoToJstLocal(s.end_at),
      label: s.label ?? "",
    });
  };

  const cancelEdit = () => setEditingId(null);

  // スロット編集を保存
  const saveEdit = async () => {
    if (!editingId || !editSlot.start_at || !editSlot.end_at) return;
    setSavingEdit(true);
    setScheduleError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/display-schedules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: editingId,
          qr_config_id: editSlot.qr_config_id || null,
          start_at: jstLocalToUtcIso(editSlot.start_at),
          end_at:   jstLocalToUtcIso(editSlot.end_at),
          label: editSlot.label || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingId(null);
      await fetchSchedules(selectedTrackId);
      channelRef.current?.send({ type: "broadcast", event: "schedule-updated", payload: {} });
    } catch (e: any) {
      setScheduleError(e.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // 子機の登録解除（オフラインの古い/重複した端末エントリの削除）
  const removeDevice = useCallback(async (deviceId: string) => {
    try {
      await fetch(`/api/events/${eventId}/display-devices/${deviceId}`, { method: "DELETE" });
      setDbDevices(prev => prev.filter(d => d.device_id !== deviceId));
    } catch {}
  }, [eventId]);

  // 子機のトラック割当変更（コントロールパネルから一括管理）
  const assignTrack = useCallback(async (deviceId: string, trackId: string | null) => {
    try {
      const res = await fetch(`/api/events/${eventId}/display-devices/${deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDbDevices(prev => {
        if (prev.some(d => d.device_id === deviceId)) {
          return prev.map(d => d.device_id === deviceId ? { ...d, track_id: trackId } : d);
        }
        return [...prev, { device_id: deviceId, device_name: null, track_id: trackId, last_seen_at: new Date().toISOString() }];
      });
      channelRef.current?.send({
        type: "broadcast",
        event: "track-assigned",
        payload: { device_id: deviceId, track_id: trackId },
      });
    } catch (e) {
      setTrackError(e instanceof Error ? e.message : String(e));
    }
  }, [eventId]);

  // トラック追加
  const addTrack = async () => {
    if (!newTrackName.trim()) return;
    setSavingTrack(true);
    setTrackError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/display-tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTrackName.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewTrackName("");
      await fetchTracks();
    } catch (e) {
      setTrackError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingTrack(false);
    }
  };

  // トラック削除（紐づく子機・スケジュールは「共通」に戻る）
  const deleteTrack = async (trackId: string) => {
    try {
      await fetch(`/api/events/${eventId}/display-tracks?track_id=${trackId}`, { method: "DELETE" });
      setTracks(prev => prev.filter(t => t.track_id !== trackId));
      setDbDevices(prev => prev.map(d => d.track_id === trackId ? { ...d, track_id: null } : d));
      if (selectedTrackId === trackId) setSelectedTrackId(null);
    } catch {}
  };

  // トラックのデフォルトQR変更
  const updateTrackDefaultQr = async (trackId: string, qrConfigId: string | null) => {
    try {
      await fetch(`/api/events/${eventId}/display-tracks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId, default_qr_config_id: qrConfigId }),
      });
      await fetchTracks();
    } catch {}
  };

  // presence（オンライン）と DB登録済みデバイスをマージ
  const mergedDevices = useMemo<MergedDevice[]>(() => {
    const map = new Map<string, MergedDevice>();
    for (const d of dbDevices) {
      map.set(d.device_id, {
        device_id: d.device_id,
        device_name: d.device_name || d.device_id.slice(0, 8),
        battery_level: null,
        online: false,
        track_id: d.track_id,
      });
    }
    for (const d of devices) {
      const existing = map.get(d.device_id);
      map.set(d.device_id, {
        device_id: d.device_id,
        device_name: d.device_name || existing?.device_name || d.device_id.slice(0, 8),
        battery_level: d.battery_level,
        online: true,
        track_id: existing?.track_id ?? null,
      });
    }
    return Array.from(map.values());
  }, [dbDevices, devices]);

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
            接続中の子機 ({mergedDevices.length})
          </p>
        </div>
        {mergedDevices.length === 0 ? (
          <p className="text-xs text-slate-600 italic font-bold">子機が接続されていません</p>
        ) : (
          <div className="space-y-2">
            {mergedDevices.map((d) => (
              <div key={d.device_id} className="flex items-center justify-between px-4 py-3 bg-slate-800/50 rounded-xl gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${d.online ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
                  <span className="text-sm font-bold text-slate-200 truncate">{d.device_name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.online && (
                    <div className="flex items-center gap-1.5">
                      <BatteryIcon level={d.battery_level} />
                      <span className="text-xs font-mono text-slate-400">
                        {d.battery_level !== null ? `${d.battery_level}%` : "--"}
                      </span>
                    </div>
                  )}
                  <select
                    value={d.track_id ?? ""}
                    onChange={e => assignTrack(d.device_id, e.target.value || null)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">共通</option>
                    {tracks.map(t => (
                      <option key={t.track_id} value={t.track_id}>{t.name}</option>
                    ))}
                  </select>
                  {!d.online && (
                    <button
                      type="button"
                      onClick={() => removeDevice(d.device_id)}
                      className="text-slate-600 hover:text-red-400 transition-colors shrink-0 p-1"
                      title="この端末エントリを削除"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* トラック管理 */}
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">トラック</p>
          {tracks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tracks.map(t => (
                <div key={t.track_id} className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700 rounded-full pl-3 pr-1.5 py-1">
                  <span className="text-xs font-bold text-slate-200">{t.name}</span>
                  <button
                    type="button"
                    onClick={() => deleteTrack(t.track_id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newTrackName}
              onChange={e => setNewTrackName(e.target.value)}
              placeholder="新しいトラック名（例：メインステージ）"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={addTrack}
              disabled={savingTrack || !newTrackName.trim()}
              className="px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 rounded-xl font-black uppercase tracking-widest transition-all disabled:opacity-50"
            >
              <Plus size={12} />
            </button>
          </div>
          {trackError && <p className="text-[10px] text-red-400 font-bold">{trackError}</p>}
        </div>
      </div>

      {/* タブ切り替え */}
      <div className="flex gap-2">
        {(["push", "timetable", "overview"] as const).map(t => (
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
            {t === "push" && <span className="flex items-center justify-center gap-1.5"><Send size={11} /> 手動配信</span>}
            {t === "timetable" && <span className="flex items-center justify-center gap-1.5"><Clock size={11} /> タイムテーブル</span>}
            {t === "overview" && <span className="flex items-center justify-center gap-1.5"><LayoutGrid size={11} /> 全体表</span>}
          </button>
        ))}
      </div>

      {/* ── 手動配信タブ ── */}
      {tab === "push" && (
        <div className="space-y-3">
          {/* 配信先選択 */}
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">配信先</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTargetDeviceId(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border transition-all ${
                  targetDeviceId === null
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                    : "bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-600"
                }`}
              >
                全機
              </button>
              {mergedDevices.map((d) => (
                <button
                  key={d.device_id}
                  type="button"
                  onClick={() => setTargetDeviceId(d.device_id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border transition-all ${
                    targetDeviceId === d.device_id
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                      : "bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-600"
                  }`}
                >
                  {d.device_name}
                </button>
              ))}
            </div>
          </div>

          {/* 強制配信中バナー */}
          {isForcedActive && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 flex items-center justify-between">
              <p className="text-xs font-black text-amber-400">
                強制配信中（{targetDeviceId ? (mergedDevices.find(d => d.device_id === targetDeviceId)?.device_name ?? "選択端末") : "全機"}） — タイムテーブルを無視しています
              </p>
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
            QRを選んで{targetDeviceId ? (mergedDevices.find(d => d.device_id === targetDeviceId)?.device_name ?? "選択端末") : "全台"}にプッシュ（強制）
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

          {/* トラック選択ピル */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedTrackId(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
                selectedTrackId === null
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                  : "bg-slate-900 text-slate-500 border border-slate-800 hover:border-slate-600"
              }`}
            >
              共通
            </button>
            {tracks.map(t => (
              <button
                key={t.track_id}
                type="button"
                onClick={() => setSelectedTrackId(t.track_id)}
                className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
                  selectedTrackId === t.track_id
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                    : "bg-slate-900 text-slate-500 border border-slate-800 hover:border-slate-600"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          {/* 選択中トラックのデフォルトQR */}
          {selectedTrackId && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                このトラックのデフォルトQR（スロット外の時間に表示）
              </label>
              <select
                value={tracks.find(t => t.track_id === selectedTrackId)?.default_qr_config_id ?? ""}
                onChange={e => updateTrackDefaultQr(selectedTrackId, e.target.value || null)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">— 設定なし</option>
                {qrConfigs.map(qc => (
                  <option key={qc.qr_config_id} value={qc.qr_config_id}>
                    {qc.label || qc.product?.name || qc.qr_config_id.slice(0, 8)}
                    {qc.product?.artist ? ` — ${qc.product.artist.display_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

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

                if (editingId === s.schedule_id) {
                  return (
                    <div key={s.schedule_id} className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 space-y-3">
                      <div>
                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">QRコード（省略 = デフォルト）</label>
                        <select
                          value={editSlot.qr_config_id}
                          onChange={e => {
                            const qcId = e.target.value;
                            const qc = qrConfigs.find(q => q.qr_config_id === qcId);
                            setEditSlot(prev => ({ ...prev, qr_config_id: qcId, label: qc ? (qc.label || qc.product?.name || "") : "" }));
                          }}
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

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">開始（JST）</label>
                          <input
                            type="datetime-local"
                            value={editSlot.start_at}
                            onChange={e => setEditSlot(prev => ({ ...prev, start_at: e.target.value }))}
                            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">終了（JST）</label>
                          <input
                            type="datetime-local"
                            value={editSlot.end_at}
                            onChange={e => setEditSlot(prev => ({ ...prev, end_at: e.target.value }))}
                            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">ラベル（任意）</label>
                        <input
                          type="text"
                          placeholder="例：転換・休憩・Aセット"
                          value={editSlot.label}
                          onChange={e => setEditSlot(prev => ({ ...prev, label: e.target.value }))}
                          className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={savingEdit || !editSlot.start_at || !editSlot.end_at}
                          className="flex-1 py-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <Save size={12} /> {savingEdit ? "保存中..." : "保存"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                        >
                          <X size={12} /> キャンセル
                        </button>
                      </div>
                    </div>
                  );
                }

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
                      onClick={() => startEdit(s)}
                      className="text-slate-600 hover:text-indigo-400 transition-colors shrink-0 p-1"
                    >
                      <Pencil size={13} />
                    </button>
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
                onChange={e => {
                  const qcId = e.target.value;
                  const qc = qrConfigs.find(q => q.qr_config_id === qcId);
                  setNewSlot(s => ({ ...s, qr_config_id: qcId, label: qc ? (qc.label || qc.product?.name || "") : "" }));
                }}
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

      {/* ── 全体表タブ ── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            全トラックのタイムテーブルを一覧表示します
          </p>
          {loadingAll ? (
            <p className="text-xs text-slate-600 animate-pulse">読み込み中...</p>
          ) : (
            <DisplayTimetableGrid tracks={tracks} schedules={allSchedules} />
          )}
        </div>
      )}
    </div>
  );
}
