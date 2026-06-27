"use client";

import { useState, type ReactNode } from "react";
import { LayoutGrid, BarChart2 } from "lucide-react";

export function EventDetailTabs({
  overview,
  sales,
}: {
  overview: ReactNode;
  sales: ReactNode | null;
}) {
  const [tab, setTab] = useState<"overview" | "sales">("overview");

  if (!sales) return <>{overview}</>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setTab("overview")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${
            tab === "overview"
              ? "border-pink-500 text-white"
              : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          <LayoutGrid size={14} /> 概要
        </button>
        <button
          type="button"
          onClick={() => setTab("sales")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${
            tab === "sales"
              ? "border-pink-500 text-white"
              : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          <BarChart2 size={14} /> 売上・決済
        </button>
      </div>

      <div className={tab === "overview" ? "space-y-8" : "hidden"}>{overview}</div>
      <div className={tab === "sales" ? "" : "hidden"}>{sales}</div>
    </div>
  );
}
