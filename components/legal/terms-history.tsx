import Link from 'next/link';
import { SERVICE_TERMS_VERSIONS, versionPeriods } from '@/lib/legal-versions';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

// 利用規約の改定履歴（各版の有効期間と本文へのリンク）。
// hrefBase: 版ページの親パス（公開ページは /terms、ログイン後は /dashboard/profile/terms）
export function TermsHistory({ hrefBase, current }: { hrefBase: string; current?: string }) {
  const periods = versionPeriods(SERVICE_TERMS_VERSIONS).slice().reverse();
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-white">改定履歴</h2>
      <ul className="space-y-2">
        {periods.map((p) => (
          <li key={p.version}>
            <Link
              href={`${hrefBase}/${p.version}`}
              className={`block px-4 py-3 rounded-xl border transition-colors ${p.version === current ? 'border-pink-500/40 bg-pink-500/5' : 'border-slate-800 hover:border-slate-700'}`}
            >
              <span className="text-xs font-black text-slate-200">版 {p.version}</span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                {p.effectiveFrom === null
                  ? '施行日：本番反映時に確定（未施行）'
                  : `有効期間：${fmt(p.effectiveFrom)} 〜 ${p.effectiveTo ? fmt(p.effectiveTo) : '現在'}`}
              </span>
              <span className="block text-[11px] text-slate-400 mt-0.5">{p.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
