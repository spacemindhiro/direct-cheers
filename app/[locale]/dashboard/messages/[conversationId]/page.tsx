import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ConversationThread } from './conversation-thread';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { conversationId } = await params;
  return <ConversationThread conversationId={conversationId} />;
}
