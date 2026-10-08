import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { SERVICE_TERMS_COMPONENTS } from '@/components/legal/terms';
import { PublicTermsView } from '@/components/legal/public-terms-view';

async function TermsVersionInner({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  if (!SERVICE_TERMS_COMPONENTS[version]) notFound();
  return <PublicTermsView version={version} />;
}

// 利用規約の特定の版（改定履歴から開く）
export default function TermsVersionPage({ params }: { params: Promise<{ version: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <TermsVersionInner params={params} />
    </Suspense>
  );
}
