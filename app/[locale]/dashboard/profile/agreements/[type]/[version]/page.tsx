import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AgreementClient } from './agreement-client';

async function AgreementPageInner({ params }: { params: Promise<{ type: string; version: string }> }) {
  const { type, version } = await params;
  return <AgreementClient type={type} version={version} />;
}

export default function AgreementPage({ params }: { params: Promise<{ type: string; version: string }> }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <AgreementPageInner params={params} />
    </Suspense>
  );
}
