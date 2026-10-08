import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { SERVICE_TERMS_COMPONENTS } from '@/components/legal/terms';
import { ProfileTermsView } from '@/components/legal/profile-terms-view';

async function ProfileTermsVersionInner({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  if (!SERVICE_TERMS_COMPONENTS[version]) notFound();
  return <ProfileTermsView version={version} />;
}

// ログイン後に利用規約の特定の版を見るページ（改定履歴から開く）
export default function ProfileTermsVersionPage({ params }: { params: Promise<{ version: string }> }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <ProfileTermsVersionInner params={params} />
    </Suspense>
  );
}
