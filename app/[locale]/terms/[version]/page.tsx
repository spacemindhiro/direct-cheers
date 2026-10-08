import { notFound } from 'next/navigation';
import { SERVICE_TERMS_COMPONENTS } from '@/components/legal/terms';
import { PublicTermsView } from '@/components/legal/public-terms-view';

// 版は固定の集合なので、ビルド時に全版を確定させる（一覧に無い版は notFound で 404）
export function generateStaticParams() {
  return Object.keys(SERVICE_TERMS_COMPONENTS).flatMap((version) => [
    { locale: 'ja', version },
    { locale: 'en', version },
  ]);
}

// 利用規約の特定の版（改定履歴から開く）
export default async function TermsVersionPage({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  if (!SERVICE_TERMS_COMPONENTS[version]) notFound();
  return <PublicTermsView version={version} />;
}
