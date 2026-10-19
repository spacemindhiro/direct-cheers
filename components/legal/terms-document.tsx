import { SERVICE_TERMS_VERSIONS, latestVersion } from '@/lib/legal-versions';
import { SERVICE_TERMS_COMPONENTS } from '@/components/legal/terms';

// 利用規約の本文（タイトル行＋全条文）。公開ページ /terms と、ログイン後の
// /dashboard/profile/terms の両方で使う。version 省略時は現行版。
// 条文を変えるときは既存の版ファイルを編集せず、新しい版を追加すること（lib/legal-versions.ts 参照）。
// privacyHref: 第1条内のプライバシーポリシーへのリンク先（表示している側の画面に合わせる）
export function TermsDocument({ privacyHref = "/privacy", version }: { privacyHref?: string; version?: string }) {
  const Body = SERVICE_TERMS_COMPONENTS[version ?? latestVersion(SERVICE_TERMS_VERSIONS).version];
  return <Body privacyHref={privacyHref} />;
}
