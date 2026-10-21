"use client";

// ヘッダーの「?」。ヘルプとチアリー(AI) の共通の入口（パネルの中から利用マニュアルも開ける）
import { HelpCircle } from "lucide-react";
import { CHEERY_OPEN_EVENT } from "./cheery-root";

export function CheeryOpenButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CHEERY_OPEN_EVENT))}
      className="w-9 h-9 bg-slate-800 border border-slate-700 hover:border-pink-500/50 rounded-2xl flex items-center justify-center transition-all"
      title="ヘルプ・チアリー(AI)"
      aria-label="ヘルプ・チアリー(AI)"
    >
      <HelpCircle size={16} className="text-slate-400 hover:text-pink-500 transition-colors" />
    </button>
  );
}
