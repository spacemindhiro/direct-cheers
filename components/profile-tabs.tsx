"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserCircle, BarChart2 } from "lucide-react";

// プロフィールと統計を行き来するタブ。統計はヘッダーのアイコンから外し、ここに集約した
// （スマホ幅でヘッダーがロゴと重なるため）。URL はどちらも従来どおり。
const TABS = [
  { href: "/dashboard/profile", label: "プロフィール", icon: UserCircle },
  { href: "/dashboard/statistics", label: "統計", icon: BarChart2 },
];

export function ProfileTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-1">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname.includes(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex items-center justify-center gap-2 text-[11px] font-bold rounded-xl py-2 transition-colors ${
              active ? "bg-pink-500 text-white" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
