import { LinkSetupComplete } from "@/components/link-setup-form";
import Link from "next/link";

export default function LinkSetupCompletePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <div className="max-w-md mx-auto px-6 py-12 space-y-8">
        <LinkSetupComplete />
        <div className="flex justify-center">
          <Link
            href="/dashboard"
            className="text-xs font-black text-pink-500 hover:text-pink-400 uppercase tracking-widest transition-colors"
          >
            ダッシュボードへ戻る →
          </Link>
        </div>
      </div>
    </div>
  );
}
