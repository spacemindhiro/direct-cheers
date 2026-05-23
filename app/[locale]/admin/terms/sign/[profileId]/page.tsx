import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { SigningPageClient } from './signing-page-client';

async function SigningPageInner({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  return <SigningPageClient profileId={profileId} />;
}

export default function SigningPage({ params }: { params: Promise<{ profileId: string }> }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <Loader2 className="animate-spin text-slate-600" size={32} />
      </div>
    }>
      <SigningPageInner params={params} />
    </Suspense>
  );
}
