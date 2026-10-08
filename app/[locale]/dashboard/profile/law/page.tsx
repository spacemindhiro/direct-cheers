import { ProfileLegalHeader } from '@/components/legal/profile-legal-header';
import { LawTable } from '@/components/legal/law-document';

// ログイン後に特定商取引法に基づく表記を見返すページ（入口はプロフィールの「規約・同意書」欄）
export default function ProfileLawPage() {
  return (
    <div className="space-y-8 pb-16">
      <ProfileLegalHeader eyebrow="Legal Compliance" title="特定商取引法に基づく表記" />
      <LawTable />
    </div>
  );
}
