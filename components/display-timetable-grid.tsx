"use client";

import { fmtTime } from "@/lib/display-tz";

const PX_PER_HOUR = 80;
const HOUR_MS = 60 * 60 * 1000;
const COLUMN_WIDTH = 140;
const TIME_COLUMN_WIDTH = 56;

type GridTrack = {
  track_id: string;
  name: string;
};

type GridSchedule = {
  schedule_id: string;
  qr_config_id: string | null;
  qr_group_id: string | null;
  track_id: string | null;
  start_at: string;
  end_at: string;
  label: string | null;
  qr_config: {
    label: string | null;
    product: { name: string; artist: { display_name: string } | null } | null;
  } | null;
  qr_group: { name: string } | null;
};

export function DisplayTimetableGrid({
  tracks,
  schedules,
}: {
  tracks: GridTrack[];
  schedules: GridSchedule[];
}) {
  if (schedules.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 text-center">
        <p className="text-xs text-slate-600 italic font-bold">スケジュールが未登録です</p>
      </div>
    );
  }

  const starts = schedules.map(s => new Date(s.start_at).getTime());
  const ends = schedules.map(s => new Date(s.end_at).getTime());
  const rangeStart = Math.floor(Math.min(...starts) / HOUR_MS) * HOUR_MS;
  const rangeEnd = Math.ceil(Math.max(...ends) / HOUR_MS) * HOUR_MS;
  const totalHours = Math.max((rangeEnd - rangeStart) / HOUR_MS, 1);
  const gridHeight = totalHours * PX_PER_HOUR;
  const hourMarks = Array.from({ length: totalHours + 1 }, (_, i) => rangeStart + i * HOUR_MS);

  const columns: { track_id: string | null; name: string }[] = [
    { track_id: null, name: "共通" },
    ...tracks.map(t => ({ track_id: t.track_id, name: t.name })),
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-4 overflow-x-auto">
      <div className="flex" style={{ minWidth: TIME_COLUMN_WIDTH + columns.length * COLUMN_WIDTH }}>
        {/* 時刻軸 */}
        <div className="sticky left-0 z-10 bg-slate-900 shrink-0" style={{ width: TIME_COLUMN_WIDTH }}>
          <div className="h-8" />
          <div className="relative" style={{ height: gridHeight }}>
            {hourMarks.map((t, i) => (
              <div
                key={t}
                className="absolute left-0 right-1 text-[10px] font-mono text-slate-500 -translate-y-1/2"
                style={{ top: i * PX_PER_HOUR }}
              >
                {fmtTime(new Date(t), { hour: "2-digit", minute: "2-digit" })}
              </div>
            ))}
          </div>
        </div>

        {/* トラック列 */}
        {columns.map(col => {
          const colSchedules = schedules.filter(s => (s.track_id ?? null) === col.track_id);
          return (
            <div key={col.track_id ?? "common"} className="shrink-0 border-l border-slate-800 px-1.5" style={{ width: COLUMN_WIDTH }}>
              <div className="h-8 flex items-center justify-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{col.name}</p>
              </div>
              <div className="relative" style={{ height: gridHeight }}>
                {hourMarks.map((t, i) => (
                  <div key={t} className="absolute left-0 right-0 border-t border-slate-800/60" style={{ top: i * PX_PER_HOUR }} />
                ))}
                {colSchedules.map(s => {
                  const top = (new Date(s.start_at).getTime() - rangeStart) / HOUR_MS * PX_PER_HOUR;
                  const height = Math.max(
                    (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / HOUR_MS * PX_PER_HOUR,
                    32
                  );
                  const isDefault = !s.qr_config_id && !s.qr_group_id;
                  const label = s.label || s.qr_group?.name || s.qr_config?.label || s.qr_config?.product?.name || "デフォルト";
                  const artist = s.qr_config?.product?.artist?.display_name;
                  return (
                    <div
                      key={s.schedule_id}
                      className={`absolute left-0.5 right-0.5 rounded-lg p-1.5 overflow-hidden ${
                        isDefault
                          ? "border border-dashed border-slate-600 bg-slate-800/40"
                          : "bg-indigo-500/15 border border-indigo-500/30"
                      }`}
                      style={{ top, height }}
                    >
                      <p className={`text-[10px] font-black truncate ${isDefault ? "text-slate-500" : "text-indigo-300"}`}>
                        {label}
                      </p>
                      {artist && <p className="text-[9px] text-slate-500 truncate">{artist}</p>}
                      <p className="text-[9px] font-mono text-slate-500 mt-0.5">
                        {fmtTime(s.start_at, { hour: "2-digit", minute: "2-digit" })}–{fmtTime(s.end_at, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
