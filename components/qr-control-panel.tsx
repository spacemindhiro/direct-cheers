"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Wifi, WifiOff, Battery, BatteryLow, BatteryMedium, BatteryFull,
  Send, Users, Radio, CheckCircle2, Clock, Plus, Trash2, Calendar, RotateCcw,
  X, LayoutGrid, Pencil, Save, Nfc, Loader2, Settings, Layers,
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

type QrGroupMember = {
  qr_config_id: string;
  label: string | null;
  image_url: string | null;
  product: { name: string; type: string; artist: { display_name: string } | null } | null;
};

// 名前付きQRグループ。トラックのデフォルト・タイムテーブルのスロット・強制表示の
// いずれにも単一QRと同格で指定できる第一級の存在
type QrGroup = {
  qr_group_id: string;
  name: string;
  members: QrGroupMember[];
};

type DisplaySchedule = {
  schedule_id: string;
  qr_config_id: string | null;
  qr_group_id: string | null;
  track_id: string | null;
  start_at: string;
  end_at: string;
  label: string | null;
  qr_config: {
    qr_config_id: string;
    label: string | null;
    product: { name: string; artist: { display_name: string } | null } | null;
  } | null;
  qr_group: QrGroup | null;
};

type DisplayTrack = {
  track_id: string;
  name: string;
  sort_order: number;
  default_qr_config_id: string | null;
  default_qr_group_id: string | null;
  default_qr_config: {
    qr_config_id: string;
    label: string | null;
    image_url: string | null;
    product: { name: string; type: string; artist: { display_name: string } | null } | null;
  } | null;
  default_qr_group: QrGroup | null;
};

type DisplayDeviceRecord = {
  device_id: string;
  device_name: string | null;
  track_id: string | null;
  last_seen_at: string;
};

// 機材マスタ（イベント横断）。device_idは不変で、名前変更は表示名の更新のみ
type EquipmentDevice = {
  device_id: string;
  display_name: string;
  last_seen_at: string | null;
  owner: { display_name: string } | null;
};

// タブレットホルダー（NFCタグはホルダーに貼る）。current_device_idで機材と紐づく。
// 機材なしのホルダーはNFC単体設置として使い、current_qr_config_idを手動指定する
type BoothHolder = {
  holder_id: string;
  name: string;
  nfc_routing_id: string | null;
  current_device_id: string | null;
  current_qr_config_id: string | null;
  device: { device_id: string; display_name: string } | null;
  event: { title: string } | null;
  qr_config: { label: string | null } | null;
};

type MergedDevice = {
  device_id: string;
  device_name: string;
  battery_level: number | null;
  online: boolean;
  track_id: string | null;
  /** 機材マスタ登録済みか（falseは旧・名前ハッシュID時代の残骸エントリ） */
  in_master: boolean;
};

// スロット・トラックデフォルトの選択UIは「単体QR」と「グループ」を同格の1つの<select>で
// 選ばせるため、value文字列に種別を埋め込んでエンコード/デコードする
function encodeTarget(qrConfigId: string | null | undefined, qrGroupId: string | null | undefined): string {
  if (qrGroupId) return `group:${qrGroupId}`;
  if (qrConfigId) return `single:${qrConfigId}`;
  return "";
}
function decodeTarget(value: string): { qr_config_id: string | null; qr_group_id: string | null } {
  if (value.startsWith("group:")) return { qr_config_id: null, qr_group_id: value.slice(6) };
  if (value.startsWith("single:")) return { qr_config_id: value.slice(7), qr_group_id: null };
  return { qr_config_id: null, qr_group_id: null };
}

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
  // 大分類タブ: 設定(何を/いつ出すか定義)・割り当て(今どこに出すか操作)・全体表(確認)
  const [tab, setTab] = useState<"settings" | "assign" | "overview">("settings");
  // 「設定」タブ内のサブタブ
  const [settingsSubTab, setSettingsSubTab] = useState<"track_group" | "timetable">("track_group");

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

  // ── 機材マスタ・ホルダー ────────────────────────
  const [equipment, setEquipment] = useState<EquipmentDevice[]>([]);
  const [holders, setHolders] = useState<BoothHolder[]>([]);
  const [renamingDeviceId, setRenamingDeviceId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [newHolderName, setNewHolderName] = useState("");
  const [newHolderNfc, setNewHolderNfc] = useState("");
  const [holderSaving, setHolderSaving] = useState(false);
  const [holderError, setHolderError] = useState<string | null>(null);
  const [holderNfcInputs, setHolderNfcInputs] = useState<Record<string, string>>({});

  // ── Timetable tab ─────────────────────────────────
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<DisplaySchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState({ qr_config_id: "", qr_group_id: "", start_at: "", end_at: "", label: "" });
  const [savingSlot, setSavingSlot] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSlot, setEditSlot] = useState({ qr_config_id: "", qr_group_id: "", start_at: "", end_at: "", label: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // ── Overview tab ──────────────────────────────────
  const [allSchedules, setAllSchedules] = useState<DisplaySchedule[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  // ── QRグループ ─────────────────────────────────────
  const [qrGroups, setQrGroups] = useState<QrGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupMemberIds, setEditGroupMemberIds] = useState<string[]>([]);
  const [savingGroupEdit, setSavingGroupEdit] = useState(false);

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

  const onTimetableSubTab = tab === "settings" && settingsSubTab === "timetable";

  useEffect(() => {
    if (onTimetableSubTab) fetchSchedules(selectedTrackId);
  }, [onTimetableSubTab, selectedTrackId, fetchSchedules]);

  // トラック切替時、新規スロットフォームをリセット（デフォルト値は下のeffectで再計算される）
  useEffect(() => {
    setNewSlot({ qr_config_id: "", qr_group_id: "", start_at: "", end_at: "", label: "" });
    setEditingId(null);
  }, [selectedTrackId]);

  // 新規スロットの開始・終了デフォルト値を計算
  // 既存スロットが無ければ開始をパーティ開始日時に、あれば最遅の終了時刻を開始のデフォルトに、
  // 終了は開始の1時間後をデフォルトにする
  useEffect(() => {
    if (!onTimetableSubTab || newSlot.start_at) return;
    const defaultStart = schedules.length === 0
      ? utcIsoToJstLocal(eventStartAt)
      : utcIsoToJstLocal(schedules.reduce((latest, s) => (s.end_at > latest ? s.end_at : latest), schedules[0].end_at));
    setNewSlot(s => ({ ...s, start_at: defaultStart, end_at: addHoursToLocalDT(defaultStart, 1) }));
  }, [schedules, onTimetableSubTab, eventStartAt, newSlot.start_at]);

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

  // QRグループ一覧取得
  const fetchQrGroups = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/qr-groups`);
      if (res.ok) setQrGroups(await res.json());
    } catch {}
  }, [eventId]);

  // 機材マスタ一覧取得（イベント横断）
  const fetchEquipment = useCallback(async () => {
    try {
      const res = await fetch("/api/equipment-devices");
      if (res.ok) setEquipment(await res.json());
    } catch {}
  }, []);

  // ホルダー一覧取得（NFCタグ⇔機材の紐付け）
  const fetchHolders = useCallback(async () => {
    try {
      const res = await fetch("/api/booth-holders");
      if (res.ok) setHolders(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchTracks();
    fetchDbDevices();
    fetchEquipment();
    fetchHolders();
    fetchQrGroups();
  }, [fetchTracks, fetchDbDevices, fetchEquipment, fetchHolders, fetchQrGroups]);

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

  // 機材マスタ・イベント登録（DB）・presence（オンライン）をマージ。
  // 表示名は機材マスタを正とする（名前変更してもIDが不変なので二重表示は起きない）。
  // マスタに無いdevice_idの行は旧・名前ハッシュID時代の残骸（削除可能として表示）。
  const mergedDevices = useMemo<MergedDevice[]>(() => {
    const masterById = new Map(equipment.map(e => [e.device_id, e]));
    const map = new Map<string, MergedDevice>();
    for (const d of dbDevices) {
      const master = masterById.get(d.device_id);
      map.set(d.device_id, {
        device_id: d.device_id,
        device_name: master?.display_name || d.device_name || d.device_id.slice(0, 8),
        battery_level: null,
        online: false,
        track_id: d.track_id,
        in_master: !!master,
      });
    }
    for (const d of devices) {
      const existing = map.get(d.device_id);
      const master = masterById.get(d.device_id);
      map.set(d.device_id, {
        device_id: d.device_id,
        device_name: master?.display_name || d.device_name || existing?.device_name || d.device_id.slice(0, 8),
        battery_level: d.battery_level,
        online: true,
        track_id: existing?.track_id ?? null,
        in_master: !!master,
      });
    }
    // マスタ優先 → 残骸は後ろ、同グループ内は名前順
    return Array.from(map.values()).sort((a, b) => {
      if (a.in_master !== b.in_master) return a.in_master ? -1 : 1;
      return a.device_name.localeCompare(b.device_name, "ja");
    });
  }, [dbDevices, devices, equipment]);

  // QRをプッシュ（強制モード・単一QR）
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
        setActiveGroupId(null);
        setIsForcedActive(true);
        // NFCタグのリダイレクト先は子機側が表示更新時に自己同期する（qr-board-display.tsx）
      } else {
        setPushError(`送信失敗: ${result}`);
      }
    } finally {
      setPushing(false);
    }
  }, [pushing, siteUrl, targetDeviceId]);

  // QRグループをプッシュ（強制モード・一覧表示。子機は一覧タップ→拡大表示のグループモードに入る）
  const pushGroup = useCallback(async (group: QrGroup) => {
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
          qr_group_id: group.qr_group_id,
          group_members: group.members.map((qc) => ({
            qr_config_id: qc.qr_config_id,
            qr_url: `${siteUrl}/c/${qc.qr_config_id}`,
            product_name: qc.product?.name ?? "",
            label: qc.label || qc.product?.name || "",
            artist_name: qc.product?.artist?.display_name ?? "",
            image_url: qc.image_url,
          })),
        },
      });
      if (result === "ok") {
        setActiveGroupId(group.qr_group_id);
        setActiveConfigId(null);
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
        setActiveGroupId(null);
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
          qr_group_id: newSlot.qr_group_id || null,
          track_id: selectedTrackId,
          start_at: jstLocalToUtcIso(newSlot.start_at),
          end_at:   jstLocalToUtcIso(newSlot.end_at),
          label: newSlot.label || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      // 先に最新スケジュールを取得してから空にする（次のスロットの開始デフォルトに反映される）
      await fetchSchedules(selectedTrackId);
      setNewSlot({ qr_config_id: "", qr_group_id: "", start_at: "", end_at: "", label: "" });
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
      qr_group_id: s.qr_group_id ?? "",
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
          qr_group_id: editSlot.qr_group_id || null,
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

  // 機材名の変更（マスタの表示名を更新。IDは不変なので子機・全イベントに波及する）
  const renameEquipment = useCallback(async (deviceId: string) => {
    const trimmed = renameInput.trim();
    if (!trimmed) return;
    setRenameSaving(true);
    setRenameError(null);
    try {
      const res = await fetch(`/api/equipment-devices/${deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenameError(data.error ?? "名前を変更できませんでした");
        return;
      }
      setEquipment(prev => prev.map(e => e.device_id === deviceId ? { ...e, display_name: data.display_name } : e));
      setHolders(prev => prev.map(h => h.current_device_id === deviceId && h.device
        ? { ...h, device: { ...h.device, display_name: data.display_name } }
        : h));
      setRenamingDeviceId(null);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : String(e));
    } finally {
      setRenameSaving(false);
    }
  }, [renameInput]);

  // ホルダー新規作成
  const addHolder = useCallback(async () => {
    const name = newHolderName.trim();
    if (!name) return;
    setHolderSaving(true);
    setHolderError(null);
    try {
      const res = await fetch("/api/booth-holders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, nfc_routing_id: newHolderNfc.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ホルダーを作成できませんでした");
      setNewHolderName("");
      setNewHolderNfc("");
      await fetchHolders();
    } catch (e) {
      setHolderError(e instanceof Error ? e.message : String(e));
    } finally {
      setHolderSaving(false);
    }
  }, [newHolderName, newHolderNfc, fetchHolders]);

  // ホルダーの更新（載せる機材の付け替え・NFCタグ変更・NFC単体設置時の表示先手動指定）
  const patchHolder = useCallback(async (holderId: string, patch: { current_device_id?: string | null; nfc_routing_id?: string | null; current_qr_config_id?: string | null }) => {
    setHolderError(null);
    try {
      const res = await fetch(`/api/booth-holders/${holderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ホルダーを更新できませんでした");
      await fetchHolders();
    } catch (e) {
      setHolderError(e instanceof Error ? e.message : String(e));
    }
  }, [fetchHolders]);

  // ホルダー削除
  const deleteHolder = useCallback(async (holderId: string) => {
    if (!confirm("このホルダーを削除しますか？（NFCタグの紐付けも解除されます）")) return;
    try {
      await fetch(`/api/booth-holders/${holderId}`, { method: "DELETE" });
      setHolders(prev => prev.filter(h => h.holder_id !== holderId));
    } catch {}
  }, []);

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

  // トラックのデフォルト表示（単一QR or 名前付きグループ、どちらか一方）
  const [savingTrackDefault, setSavingTrackDefault] = useState(false);
  const [trackDefaultSaved, setTrackDefaultSaved] = useState(false);
  const [trackDefaultError, setTrackDefaultError] = useState<string | null>(null);

  useEffect(() => {
    setTrackDefaultSaved(false);
    setTrackDefaultError(null);
  }, [selectedTrackId]);

  const saveTrackDefault = async (value: string) => {
    if (!selectedTrackId) return;
    const { qr_config_id, qr_group_id } = decodeTarget(value);
    setSavingTrackDefault(true);
    setTrackDefaultError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/display-tracks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: selectedTrackId, default_qr_config_id: qr_config_id, default_qr_group_id: qr_group_id }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchTracks();
      // 既にこのトラックを表示中の子機へ即時反映させる(手動リロード不要にする)
      channelRef.current?.send({ type: "broadcast", event: "qr-group-updated", payload: {} });
      setTrackDefaultSaved(true);
      setTimeout(() => setTrackDefaultSaved(false), 2500);
    } catch (e) {
      setTrackDefaultError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingTrackDefault(false);
    }
  };

  // QRグループ: 作成
  const toggleNewGroupMember = (qrConfigId: string) => {
    setNewGroupMemberIds(prev =>
      prev.includes(qrConfigId) ? prev.filter(id => id !== qrConfigId) : [...prev, qrConfigId]
    );
  };

  const createGroup = async () => {
    if (!newGroupName.trim() || newGroupMemberIds.length < 2) return;
    setSavingGroup(true);
    setGroupError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/qr-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim(), qr_config_ids: newGroupMemberIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewGroupName("");
      setNewGroupMemberIds([]);
      await fetchQrGroups();
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingGroup(false);
    }
  };

  // QRグループ: 編集開始・メンバー切替・保存
  const startEditGroup = (g: QrGroup) => {
    setEditingGroupId(g.qr_group_id);
    setEditGroupName(g.name);
    setEditGroupMemberIds(g.members.map(m => m.qr_config_id));
    setGroupError(null);
  };

  const cancelEditGroup = () => setEditingGroupId(null);

  const toggleEditGroupMember = (qrConfigId: string) => {
    setEditGroupMemberIds(prev =>
      prev.includes(qrConfigId) ? prev.filter(id => id !== qrConfigId) : [...prev, qrConfigId]
    );
  };

  const saveGroupEdit = async () => {
    if (!editingGroupId || !editGroupName.trim() || editGroupMemberIds.length < 2) return;
    setSavingGroupEdit(true);
    setGroupError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/qr-groups`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_group_id: editingGroupId, name: editGroupName.trim(), qr_config_ids: editGroupMemberIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingGroupId(null);
      await fetchQrGroups();
      await fetchTracks();
      // このグループを参照しているトラック/スロットを表示中の子機へ即時反映
      channelRef.current?.send({ type: "broadcast", event: "qr-group-updated", payload: {} });
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingGroupEdit(false);
    }
  };

  // QRグループ: 削除
  const deleteGroup = async (qrGroupId: string) => {
    try {
      await fetch(`/api/events/${eventId}/qr-groups?qr_group_id=${qrGroupId}`, { method: "DELETE" });
      setQrGroups(prev => prev.filter(g => g.qr_group_id !== qrGroupId));
      await fetchTracks();
      channelRef.current?.send({ type: "broadcast", event: "qr-group-updated", payload: {} });
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

      {/* タブ切り替え（大分類） */}
      <div className="flex gap-2">
        {(["settings", "assign", "overview"] as const).map(t => (
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
            {t === "settings" && <span className="flex items-center justify-center gap-1.5"><Settings size={11} /> 設定</span>}
            {t === "assign" && <span className="flex items-center justify-center gap-1.5"><Send size={11} /> 割り当て</span>}
            {t === "overview" && <span className="flex items-center justify-center gap-1.5"><LayoutGrid size={11} /> 全体表</span>}
          </button>
        ))}
      </div>

      {/* 「設定」タブ内のサブタブ切り替え */}
      {tab === "settings" && (
        <div className="flex gap-2">
          {(["track_group", "timetable"] as const).map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setSettingsSubTab(st)}
              className={`flex-1 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                settingsSubTab === st
                  ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/30"
                  : "bg-slate-950 text-slate-600 border border-slate-800 hover:border-slate-700"
              }`}
            >
              {st === "track_group" && <span className="flex items-center justify-center gap-1.5"><Layers size={10} /> トラック / グループ</span>}
              {st === "timetable" && <span className="flex items-center justify-center gap-1.5"><Clock size={10} /> タイムテーブル</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── 割り当てタブ ── */}
      {tab === "assign" && (
        <div className="space-y-5">
          {/* 接続中の子機一覧＋トラック割り当て＋NFC紐付け */}
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
                  <div key={d.device_id} className="bg-slate-800/50 rounded-xl px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${d.online ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
                        {renamingDeviceId === d.device_id ? (
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <input
                              type="text"
                              value={renameInput}
                              onChange={e => setRenameInput(e.target.value)}
                              className="flex-1 min-w-0 bg-slate-900 border border-indigo-500/50 rounded-lg px-2 py-1 text-sm font-bold text-slate-200 focus:outline-none focus:border-indigo-400"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => renameEquipment(d.device_id)}
                              disabled={renameSaving || !renameInput.trim()}
                              className="p-1.5 text-indigo-300 hover:text-indigo-200 disabled:opacity-40 shrink-0"
                              title="名前を保存"
                            >
                              {renameSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setRenamingDeviceId(null); setRenameError(null); }}
                              className="p-1.5 text-slate-500 hover:text-slate-300 shrink-0"
                              title="キャンセル"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm font-bold text-slate-200 truncate">{d.device_name}</span>
                            {d.in_master ? (
                              <button
                                type="button"
                                onClick={() => { setRenamingDeviceId(d.device_id); setRenameInput(d.device_name); setRenameError(null); }}
                                className="p-1 text-slate-500 hover:text-indigo-300 transition-colors shrink-0"
                                title="機材名を変更"
                              >
                                <Pencil size={12} />
                              </button>
                            ) : (
                              <span className="text-[9px] font-black text-amber-500/80 uppercase tracking-widest shrink-0">旧ID</span>
                            )}
                          </>
                        )}
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
                    {renamingDeviceId === d.device_id && renameError && (
                      <p className="text-xs text-red-400 font-bold">{renameError}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ホルダー管理（NFCタグ⇔機材の紐付け） */}
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Nfc size={12} className="text-slate-500" />
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                タブレットホルダー ({holders.length})
              </p>
            </div>
            <p className="text-[10px] text-slate-600 leading-relaxed">
              NFCタグはホルダーに貼り、ホルダーに「今載せている機材」を割り当てます。タブレットを載せ替えたらここで機材を切り替えてください。
              機材なしのホルダーはNFCタグ単体の設置として使え、表示先QRを直接指定できます。
            </p>
            {holders.length > 0 && (
              <div className="space-y-2">
                {holders.map((h) => {
                  const nfcValue = holderNfcInputs[h.holder_id] ?? h.nfc_routing_id ?? "";
                  const nfcDirty = nfcValue.trim() !== (h.nfc_routing_id ?? "");
                  return (
                    <div key={h.holder_id} className="bg-slate-800/50 rounded-xl px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-200 truncate">{h.name}</p>
                          {h.qr_config?.label && (
                            <p className="text-[10px] text-slate-500 truncate">表示中: {h.qr_config.label}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={h.current_device_id ?? ""}
                            onChange={e => patchHolder(h.holder_id, { current_device_id: e.target.value || null })}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 max-w-[10rem]"
                          >
                            <option value="">機材なし</option>
                            {equipment.map(eq => (
                              <option key={eq.device_id} value={eq.device_id}>{eq.display_name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => deleteHolder(h.holder_id)}
                            className="text-slate-600 hover:text-red-400 transition-colors shrink-0 p-1"
                            title="このホルダーを削除"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
                        <Nfc size={13} className="text-slate-500 shrink-0" />
                        <input
                          type="text"
                          value={nfcValue}
                          onChange={e => setHolderNfcInputs(prev => ({ ...prev, [h.holder_id]: e.target.value }))}
                          placeholder="NFCタグID（例: nfc_001）"
                          className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => patchHolder(h.holder_id, { nfc_routing_id: nfcValue.trim() || null })}
                          disabled={!nfcDirty}
                          className="flex items-center gap-1 px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        >
                          <Save size={12} />
                          保存
                        </button>
                      </div>
                      {/* NFC単体設置（機材なし）: 表示先QRを手動指定。機材が載っている間は子機の表示に自動追従 */}
                      {!h.current_device_id && (
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
                          <Send size={13} className="text-slate-500 shrink-0" />
                          <select
                            value={h.current_qr_config_id ?? ""}
                            onChange={e => patchHolder(h.holder_id, { current_qr_config_id: e.target.value || null })}
                            className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          >
                            <option value="">表示先QRを指定（NFC単体設置用）</option>
                            {qrConfigs.map(qc => (
                              <option key={qc.qr_config_id} value={qc.qr_config_id}>
                                {qc.label || qc.product?.name || qc.qr_config_id.slice(0, 8)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* ホルダー追加 */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newHolderName}
                onChange={e => setNewHolderName(e.target.value)}
                placeholder="ホルダー名（例: ホルダーA）"
                className="flex-1 min-w-0 bg-slate-950/50 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="text"
                value={newHolderNfc}
                onChange={e => setNewHolderNfc(e.target.value)}
                placeholder="NFCタグID（任意）"
                className="flex-1 min-w-0 bg-slate-950/50 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={addHolder}
                disabled={holderSaving || !newHolderName.trim()}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {holderSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                追加
              </button>
            </div>
            {holderError && <p className="text-xs text-red-400 font-bold">{holderError}</p>}
          </div>

          {/* 手動配信 */}
          <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-1.5">
            <Send size={11} /> 手動配信（強制表示）
          </p>
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

          {/* QRグループの強制配信 */}
          {qrGroups.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">グループを配信</p>
              {qrGroups.map((g) => {
                const isActive = activeGroupId === g.qr_group_id;
                return (
                  <button
                    key={g.qr_group_id}
                    type="button"
                    onClick={() => pushGroup(g)}
                    disabled={pushing}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all disabled:opacity-60 ${
                      isActive
                        ? "bg-indigo-500/15 border-indigo-500/40"
                        : "bg-slate-900 border-slate-800 hover:border-slate-600 active:scale-[0.98]"
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl shrink-0 bg-slate-800 border border-slate-700 flex items-center justify-center">
                      <LayoutGrid size={18} className="text-indigo-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-white truncate">{g.name}</p>
                      <p className="text-xs text-slate-500">{g.members.length}件のQR</p>
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
        </div>
      )}

      {/* ── 設定タブ：トラック / グループ サブタブ ── */}
      {tab === "settings" && settingsSubTab === "track_group" && (
        <div className="space-y-4">
          {/* トラック管理 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
              トラック管理（イベント内のステージ・ブースなどの区分）
            </label>
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

          {/* QRグループ管理 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
              QRグループ管理（名前を付けて複数QRをまとめる。スロット・デフォルト・強制配信のどこでも選べる）
            </label>

            {qrGroups.length > 0 && (
              <div className="space-y-2">
                {qrGroups.map(g => (
                  editingGroupId === g.qr_group_id ? (
                    <div key={g.qr_group_id} className="bg-slate-800/60 border border-indigo-500/40 rounded-xl p-3 space-y-2">
                      <input
                        type="text"
                        value={editGroupName}
                        onChange={e => setEditGroupName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {qrConfigs.map(qc => {
                          const idx = editGroupMemberIds.indexOf(qc.qr_config_id);
                          const checked = idx !== -1;
                          return (
                            <label key={qc.qr_config_id} className="flex items-center gap-2 bg-slate-900/60 border border-slate-700/60 rounded-lg px-2.5 py-1.5 cursor-pointer">
                              <input type="checkbox" checked={checked} onChange={() => toggleEditGroupMember(qc.qr_config_id)} className="accent-indigo-500" />
                              {checked && <span className="text-[10px] font-mono text-indigo-400 w-4 text-center shrink-0">{idx + 1}</span>}
                              <span className="text-xs text-white flex-1 truncate">
                                {qc.label || qc.product?.name || qc.qr_config_id.slice(0, 8)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={saveGroupEdit} disabled={savingGroupEdit || !editGroupName.trim() || editGroupMemberIds.length < 2}
                          className="flex-1 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 rounded-lg font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50">
                          {savingGroupEdit ? "保存中..." : "保存"}
                        </button>
                        <button type="button" onClick={cancelEditGroup}
                          className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 rounded-lg font-black text-xs uppercase tracking-widest transition-all">
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={g.qr_group_id} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2">
                      <LayoutGrid size={14} className="text-indigo-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{g.name}</p>
                        <p className="text-[10px] text-slate-500">{g.members.length}件のQR</p>
                      </div>
                      <button type="button" onClick={() => startEditGroup(g)} className="text-slate-500 hover:text-indigo-400 transition-colors p-1"><Pencil size={13} /></button>
                      <button type="button" onClick={() => deleteGroup(g.qr_group_id)} className="text-slate-500 hover:text-red-400 transition-colors p-1"><Trash2 size={13} /></button>
                    </div>
                  )
                ))}
              </div>
            )}

            <div className="border-t border-slate-800 pt-3 space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Plus size={10} /> 新しいグループを作成</p>
              <input
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="グループ名（例：物販ブース）"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {qrConfigs.map(qc => {
                  const idx = newGroupMemberIds.indexOf(qc.qr_config_id);
                  const checked = idx !== -1;
                  return (
                    <label key={qc.qr_config_id} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggleNewGroupMember(qc.qr_config_id)} className="accent-indigo-500" />
                      {checked && <span className="text-[10px] font-mono text-indigo-400 w-4 text-center shrink-0">{idx + 1}</span>}
                      <span className="text-xs text-white flex-1 truncate">
                        {qc.label || qc.product?.name || qc.qr_config_id.slice(0, 8)}
                        {qc.product?.artist ? ` — ${qc.product.artist.display_name}` : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-600">チェックした順番がそのままグループ内の並び順になります（2件以上必要）</p>
              {groupError && <p className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2 font-bold">{groupError}</p>}
              <button
                type="button"
                onClick={createGroup}
                disabled={savingGroup || !newGroupName.trim() || newGroupMemberIds.length < 2}
                className="w-full px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50"
              >
                {savingGroup ? "作成中..." : "グループを作成"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 設定タブ：タイムテーブル サブタブ ── */}
      {tab === "settings" && settingsSubTab === "timetable" && (
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

          {/* 選択中トラックのデフォルト表示（スロット外の時間に表示。単体QR or グループのどちらか一方） */}
          {selectedTrackId && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                このトラックのデフォルト表示（スロット外の時間）
              </label>
              <select
                value={encodeTarget(
                  tracks.find(t => t.track_id === selectedTrackId)?.default_qr_config_id,
                  tracks.find(t => t.track_id === selectedTrackId)?.default_qr_group_id
                )}
                onChange={e => saveTrackDefault(e.target.value)}
                disabled={savingTrackDefault}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                <option value="">— 設定なし</option>
                <optgroup label="単体QR">
                  {qrConfigs.map(qc => (
                    <option key={qc.qr_config_id} value={`single:${qc.qr_config_id}`}>
                      {qc.label || qc.product?.name || qc.qr_config_id.slice(0, 8)}
                      {qc.product?.artist ? ` — ${qc.product.artist.display_name}` : ""}
                    </option>
                  ))}
                </optgroup>
                {qrGroups.length > 0 && (
                  <optgroup label="グループ（客が選ぶ一覧表示）">
                    {qrGroups.map(g => (
                      <option key={g.qr_group_id} value={`group:${g.qr_group_id}`}>
                        {g.name}（{g.members.length}件）
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {trackDefaultError && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2 font-bold">{trackDefaultError}</p>
              )}
              {trackDefaultSaved && (
                <p className="text-xs text-emerald-400 font-bold flex items-center gap-1.5"><CheckCircle2 size={14} /> 保存しました・子機に反映済み</p>
              )}
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
                const qcLabel = s.qr_group?.name ?? s.qr_config?.label ?? s.qr_config?.product?.name ?? "QR";
                const artistName = s.qr_config?.product?.artist?.display_name;

                if (editingId === s.schedule_id) {
                  return (
                    <div key={s.schedule_id} className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 space-y-3">
                      <div>
                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">QRコード / グループ（省略 = デフォルト）</label>
                        <select
                          value={encodeTarget(editSlot.qr_config_id, editSlot.qr_group_id)}
                          onChange={e => {
                            const { qr_config_id, qr_group_id } = decodeTarget(e.target.value);
                            const qc = qr_config_id ? qrConfigs.find(q => q.qr_config_id === qr_config_id) : null;
                            const g = qr_group_id ? qrGroups.find(x => x.qr_group_id === qr_group_id) : null;
                            setEditSlot(prev => ({
                              ...prev,
                              qr_config_id: qr_config_id ?? "",
                              qr_group_id: qr_group_id ?? "",
                              label: qc ? (qc.label || qc.product?.name || "") : g ? g.name : "",
                            }));
                          }}
                          className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">— デフォルト（転換・休憩など）</option>
                          <optgroup label="単体QR">
                            {qrConfigs.map(qc => (
                              <option key={qc.qr_config_id} value={`single:${qc.qr_config_id}`}>
                                {qc.label || qc.product?.name || qc.qr_config_id.slice(0, 8)}
                                {qc.product?.artist ? ` — ${qc.product.artist.display_name}` : ""}
                              </option>
                            ))}
                          </optgroup>
                          {qrGroups.length > 0 && (
                            <optgroup label="グループ">
                              {qrGroups.map(g => (
                                <option key={g.qr_group_id} value={`group:${g.qr_group_id}`}>
                                  {g.name}（{g.members.length}件）
                                </option>
                              ))}
                            </optgroup>
                          )}
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
                      {!s.qr_config_id && !s.qr_group_id && (
                        <p className="text-[10px] text-amber-500/70 mt-0.5">デフォルトQR表示</p>
                      )}
                      {s.qr_group_id && (
                        <p className="text-[10px] text-indigo-400/70 mt-0.5">グループ（一覧表示）</p>
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

            {/* QR / グループ選択 */}
            <div>
              <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">QRコード / グループ（省略 = デフォルト）</label>
              <select
                value={encodeTarget(newSlot.qr_config_id, newSlot.qr_group_id)}
                onChange={e => {
                  const { qr_config_id, qr_group_id } = decodeTarget(e.target.value);
                  const qc = qr_config_id ? qrConfigs.find(q => q.qr_config_id === qr_config_id) : null;
                  const g = qr_group_id ? qrGroups.find(x => x.qr_group_id === qr_group_id) : null;
                  setNewSlot(s => ({
                    ...s,
                    qr_config_id: qr_config_id ?? "",
                    qr_group_id: qr_group_id ?? "",
                    label: qc ? (qc.label || qc.product?.name || "") : g ? g.name : "",
                  }));
                }}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">— デフォルト（転換・休憩など）</option>
                <optgroup label="単体QR">
                  {qrConfigs.map(qc => (
                    <option key={qc.qr_config_id} value={`single:${qc.qr_config_id}`}>
                      {qc.label || qc.product?.name || qc.qr_config_id.slice(0, 8)}
                      {qc.product?.artist ? ` — ${qc.product.artist.display_name}` : ""}
                    </option>
                  ))}
                </optgroup>
                {qrGroups.length > 0 && (
                  <optgroup label="グループ">
                    {qrGroups.map(g => (
                      <option key={g.qr_group_id} value={`group:${g.qr_group_id}`}>
                        {g.name}（{g.members.length}件）
                      </option>
                    ))}
                  </optgroup>
                )}
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
          {/* 子機のトラック割り当て状況 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              子機の割り当て状況 ({mergedDevices.length})
            </p>
            {mergedDevices.length === 0 ? (
              <p className="text-xs text-slate-600 italic font-bold">子機が接続されていません</p>
            ) : (
              <div className="space-y-1.5">
                {mergedDevices.map((d) => (
                  <div key={d.device_id} className="flex items-center justify-between gap-3 bg-slate-800/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.online ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
                      <span className="text-xs font-bold text-slate-200 truncate">{d.device_name}</span>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">
                      {d.track_id ? (tracks.find(t => t.track_id === d.track_id)?.name ?? "?") : "共通"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

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
