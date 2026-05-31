import Link from "next/link";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <img
                src="/logo-emblem.png"
                alt="Direct Cheers"
                className="w-7 h-7 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform"
              />
              <span className="text-lg font-black tracking-tighter text-white uppercase italic">
                Direct Cheers
              </span>
            </Link>
            <span className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em] border border-pink-500/30 px-2 py-1 rounded-lg">
              Admin
            </span>
          </div>
          <Suspense fallback={null}>
            <AdminNav />
          </Suspense>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-6 py-10">
        {children}
      </main>
    </div>
  );
}
