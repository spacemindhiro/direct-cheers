import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { DocumentClient } from './document-client';

async function DocumentPageInner({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return <DocumentClient documentId={documentId} />;
}

export default function DocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <DocumentPageInner params={params} />
    </Suspense>
  );
}
