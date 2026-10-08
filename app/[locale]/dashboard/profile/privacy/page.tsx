import { ProfileLegalHeader } from '@/components/legal/profile-legal-header';
import { PrivacySections, PRIVACY_LAST_UPDATED } from '@/components/legal/privacy-document';

// ログイン後にプライバシーポリシーを見返すページ（入口はプロフィールの「規約・同意書」欄）
export default function ProfilePrivacyPage() {
  return (
    <div className="space-y-8 pb-16">
      <ProfileLegalHeader eyebrow="Privacy Policy" title="プライバシーポリシー" />
      <PrivacySections />
      <p className="text-center text-slate-600 text-[10px] font-mono italic">Last Updated: {PRIVACY_LAST_UPDATED}</p>
    </div>
  );
}
