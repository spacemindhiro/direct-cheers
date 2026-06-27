import { Suspense } from 'react';
import { createClient, getUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ConversationThread } from './conversation-thread';
import { Loader2 } from 'lucide-react';

async function ConversationPageContent({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect('/auth/login');

  const { conversationId } = await params;
  return <ConversationThread conversationId={conversationId} />;
}

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <ConversationPageContent params={params} />
    </Suspense>
  );
}
