import { ProfileLegalHeader } from '@/components/legal/profile-legal-header';
import { TermsDocument } from '@/components/legal/terms-document';
import { TermsHistory } from '@/components/legal/terms-history';
import { TermsVersionNotice } from '@/components/legal/terms-version-notice';

// ログイン後に利用規約を見返すページ（入口はプロフィールの「規約・同意書」欄）。
// version 指定で過去の版を表示する（/dashboard/profile/terms/[version] から使う）
export function ProfileTermsView({ version }: { version?: string }) {
  return (
    <div className="space-y-8 pb-16">
      <ProfileLegalHeader eyebrow="Terms of Service" title="利用規約" />
      {version && <TermsVersionNotice version={version} currentHref="/dashboard/profile/terms" />}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] px-6 py-8 text-slate-300">
        <TermsDocument version={version} privacyHref="/dashboard/profile/privacy" />
      </div>
      <TermsHistory hrefBase="/dashboard/profile/terms" current={version} />
    </div>
  );
}
