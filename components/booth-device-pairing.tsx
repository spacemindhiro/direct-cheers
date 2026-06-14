"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, ScanLine, Link2 } from "lucide-react";
import { DISPLAY_TZ } from "@/lib/display-tz";

type BoothDevice = {
  device_code: string;
  nfc_routing_id: string | null;
  current_event_id: string | null;
  current_qr_config_id: string | null;
  updated_at: string;
  event: { title: string } | null;
  qr_config: { label: string | null } | null;
};

export function BoothDevicePairing() {
  const [devices, setDevices] = useState<BoothDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deviceCode, setDeviceCode] = useState("");
  const [nfcRoutingId, setNfcRoutingId] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/booth-devices");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
      setDevices(data as BoothDevice[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleSubmit = async () => {
    if (!deviceCode.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/booth-devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_code: deviceCode.trim(),
          nfc_routing_id: nfcRoutingId.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "登録に失敗しました");
      setDeviceCode("");
      setNfcRoutingId("");
      await fetchDevices();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 登録フォーム */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Link2 size={14} className="text-pink-500" /> 子機 ⇔ NFCタグ ペアリング登録
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400">子機デバイス（device_code）</label>
            <input
              type="text"
              list="booth-device-codes"
              value={deviceCode}
              onChange={(e) => setDeviceCode(e.target.value)}
              placeholder="例: booth_001"
              className="w-full h-10 bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-pink-500"
            />
            <datalist id="booth-device-codes">
              {devices.map((d) => (
                <option key={d.device_code} value={d.device_code} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400">NFCタグID（nfc_routing_id）</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nfcRoutingId}
                onChange={(e) => setNfcRoutingId(e.target.value)}
                placeholder="例: nfc_001"
                className="flex-1 h-10 bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-pink-500"
              />
              <button
                type="button"
                onClick={() => console.log("QR/NFCから読み取る")}
                className="shrink-0 h-10 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-white transition-all"
              >
                <ScanLine size={14} /> QR/NFCから読み取る
              </button>
            </div>
          </div>
        </div>

        {error && <p className="text-xs font-bold text-red-400">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !deviceCode.trim()}
          className="flex items-center gap-1.5 h-10 px-5 bg-pink-500 hover:bg-pink-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-black text-white uppercase tracking-widest transition-all"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          登録
        </button>
      </div>

      {/* 一覧 */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-4 overflow-x-auto">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
          ペアリング済み一覧 ({devices.length})
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-slate-600" />
          </div>
        ) : devices.length === 0 ? (
          <p className="text-sm text-slate-600 font-bold italic text-center py-8">
            まだペアリングされた機材はありません
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                <th className="py-2 pr-4">子機（device_code）</th>
                <th className="py-2 pr-4">NFCタグID</th>
                <th className="py-2 pr-4">現在のイベント</th>
                <th className="py-2 pr-4">現在のQR</th>
                <th className="py-2 pr-4">更新時刻</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.device_code} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-2.5 pr-4 font-bold text-white whitespace-nowrap">{d.device_code}</td>
                  <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">{d.nfc_routing_id ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">{d.event?.title ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">{d.qr_config?.label ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-slate-500 whitespace-nowrap">
                    {new Date(d.updated_at).toLocaleString("ja-JP", { timeZone: DISPLAY_TZ })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
