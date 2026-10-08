import Link from 'next/link';
import { SERVICE_TERMS_VERSIONS, latestVersion } from '@/lib/legal-versions';

// 過去の版を表示しているときの案内（現行版へのリンク）。現行版なら何も出さない。
export function TermsVersionNotice({ version, currentHref }: { version: string; currentHref: string }) {
  if (version === latestVersion(SERVICE_TERMS_VERSIONS).version) return null;
  return (
    <div className="px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
      これは過去の版（{version}）です。
      <Link href={currentHref} className="underline underline-offset-2 ml-1 font-bold">現行の利用規約を見る</Link>
    </div>
  );
}
