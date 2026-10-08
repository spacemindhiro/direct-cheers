import { ProfileLegalHeader } from '@/components/legal/profile-legal-header';
import { TermsDocument } from '@/components/legal/terms-document';

// ログイン後に利用規約を見返すページ（入口はプロフィールの「規約・同意書」欄）
export default function ProfileTermsPage() {
  return (
    <div className="space-y-8 pb-16">
      <ProfileLegalHeader eyebrow="Terms of Service" title="利用規約" />
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] px-6 py-8 text-slate-300">
        <TermsDocument privacyHref="/dashboard/profile/privacy" />
      </div>
    </div>
  );
}
