import { connection } from 'next/server';
import { ConversationThread } from './conversation-thread';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  await connection();
  const { conversationId } = await params;
  return <ConversationThread conversationId={conversationId} />;
}
