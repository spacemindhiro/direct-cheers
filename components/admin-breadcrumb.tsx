import Link from "next/link";
import { Fragment } from "react";

type Crumb = { label: string; href?: string };

export function AdminBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.4em]">
      {crumbs.map((crumb, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-slate-700">/</span>}
          {crumb.href ? (
            <Link href={crumb.href} className="text-slate-500 hover:text-white transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-pink-500">{crumb.label}</span>
          )}
        </Fragment>
      ))}
    </div>
  );
}
