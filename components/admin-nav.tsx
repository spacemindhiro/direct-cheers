"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";

const NAV_ITEMS = [
  { href: "/admin/users",          label: "Users" },
  { href: "/admin/connect-review", label: "口座審査" },
  { href: "/admin/documents",      label: "Documents" },
  { href: "/admin/settlements",    label: "Settlements" },
  { href: "/admin/reconcile",      label: "Reconcile" },
  { href: "/admin/sales",          label: "Sales" },
  { href: "/admin/insights",       label: "Insights" },
  { href: "/admin/refunds",        label: "Refunds", danger: true },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-4">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname.includes(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`text-[10px] font-black uppercase tracking-widest transition-colors ${
              "danger" in item
                ? isActive ? "text-red-300" : "text-red-400 hover:text-red-300"
                : isActive ? "text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      <LogoutButton />
    </div>
  );
}
