import { Suspense } from "react";
import { LinkSetupComplete } from "@/components/link-setup-form";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function LinkSetupCompletePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <div className="max-w-md mx-auto px-6 py-12 space-y-8">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-slate-600" size={28} />
          </div>
        }>
          <LinkSetupComplete />
        </Suspense>
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
