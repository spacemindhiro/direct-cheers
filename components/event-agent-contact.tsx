"use client";

import { Mail } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function EventAgentContact({
  displayName,
  avatarUrl,
  email,
}: {
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 group focus:outline-none"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-6 h-6 rounded-full object-cover border border-slate-700"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <span className="text-slate-500 text-[10px] font-black">
                {displayName[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
          )}
          <span className="text-[11px] text-slate-300 font-bold group-hover:text-white transition-colors underline decoration-dotted decoration-slate-600 underline-offset-2">
            {displayName}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="bg-slate-900 border-slate-700 text-slate-200 p-3 min-w-[14rem]">
        <div className="flex items-center gap-3 pb-2 mb-2 border-b border-slate-800">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-9 h-9 rounded-full object-cover border border-slate-700"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <span className="text-slate-500 text-xs font-black">
                {displayName[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
          )}
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">担当エージェント</p>
            <p className="text-sm font-bold text-white">{displayName}</p>
          </div>
        </div>
        {email ? (
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-2 text-xs text-slate-300 hover:text-pink-400 transition-colors break-all"
          >
            <Mail size={12} className="shrink-0" />
            {email}
          </a>
        ) : (
          <p className="text-xs text-slate-500">連絡先情報がありません</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
