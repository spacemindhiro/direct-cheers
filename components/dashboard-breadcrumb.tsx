"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

const LABELS: Record<string, string> = {
  dashboard: "ダッシュボード",
  events: "イベント管理",
  create: "新規作成",
  edit: "編集",
  evidence: "エビデンス提出",
  control: "コントロール",
  display: "ライブ表示",
  checkin: "チェックイン",
  "touch-pay": "対面タッチ決済",
  qr: "QR管理",
  invitations: "招待管理",
  profile: "プロフィール",
  payout: "出金管理",
  collection: "コレクション",
  passkeys: "パスキー",
  account: "アカウント設定",
  admin: "管理",
  "connect-review": "口座審査",
  "connect-return": "口座登録",
  insights: "インサイト",
  reconcile: "照合管理",
  sales: "売上管理",
  settlements: "精算管理",
};

const LOCALES = ["en", "ja"];
const UUID_RE = /^[0-9a-f-]{36}$/i;

function isDynamic(s: string) {
  return UUID_RE.test(s) || (s.length > 24 && !/^[a-z-]+$/.test(s));
}

function dynamicLabel(prev: string): string {
  switch (prev) {
    case "events": return "イベント詳細";
    case "qr": return "QR詳細";
    case "connect-review": return "審査詳細";
    default: return "詳細";
  }
}

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const segments = LOCALES.includes(parts[0]) ? parts.slice(1) : parts;

  if (segments[0] !== "dashboard" || segments.length <= 1) return null;

  const items: { label: string; href: string; isCurrent: boolean }[] = [];
  let path = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = segments[i - 1] ?? "";
    path += "/" + seg;

    // qr は中間セグメントのみスキップ（実ページが無いルーティング上のグルーピングに
    // 過ぎないため。最終セグメントなら表示）
    if (seg === "qr" && i < segments.length - 1) continue;

    const label = isDynamic(seg) ? dynamicLabel(prev) : (LABELS[seg] ?? seg);
    items.push({ label, href: path, isCurrent: i === segments.length - 1 });
  }

  return (
    <nav className="max-w-5xl mx-auto px-6 pt-5 pb-0">
      <ol className="flex items-center flex-wrap gap-1">
        {items.map((item, idx) => (
          <li key={item.href} className="flex items-center gap-1">
            {idx > 0 && (
              <ChevronRight size={12} className="text-slate-700 shrink-0" />
            )}
            {item.isCurrent ? (
              <span className="text-[11px] font-bold text-slate-400 truncate max-w-[160px]">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-[11px] font-bold text-slate-600 hover:text-pink-500 transition-colors truncate max-w-[160px]"
              >
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
