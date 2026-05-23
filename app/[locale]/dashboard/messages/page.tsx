'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, Loader2, ChevronRight } from 'lucide-react';

type Conversation = {
  conversation_id: string;
  type: string;
  updated_at: string;
  event_title: string | null;
  event_id: string | null;
  other_profile: {
    profile_id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  last_message: {
    body: string;
    sender_profile_id: string | null;
    message_type: string;
    created_at: string;
  } | null;
  unread_count: number;
};

function Avatar({ url, name, size = 10 }: { url?: string | null; name?: string | null; size?: number }) {
  const sz = `w-${size} h-${size}`;
  return url ? (
    <img src={url} alt={name ?? ''} className={`${sz} rounded-2xl object-cover shrink-0`} />
  ) : (
    <div className={`${sz} rounded-2xl bg-slate-700 flex items-center justify-center shrink-0`}>
      <span className="text-xs font-black text-slate-400">{(name ?? '?')[0]?.toUpperCase()}</span>
    </div>
  );
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  if (diffDays < 7) return d.toLocaleDateString('ja-JP', { weekday: 'short' });
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/messages')
      .then(r => r.json())
      .then(data => setConversations(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 pb-20">
      <div>
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Messages</p>
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">メッセージ</h1>
      </div>

      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <MessageCircle size={36} className="text-slate-700" />
          <p className="text-sm text-slate-500">メッセージはまだありません</p>
          <p className="text-xs text-slate-600">出演依頼を送ると会話が始まります</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(conv => {
            const last = conv.last_message;
            const preview = last
              ? last.message_type === 'system'
                ? last.body
                : last.body.length > 40 ? last.body.slice(0, 40) + '…' : last.body
              : 'メッセージを送ってみましょう';

            return (
              <Link
                key={conv.conversation_id}
                href={`/dashboard/messages/${conv.conversation_id}`}
                className="flex items-center gap-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-[1.5rem] px-4 py-3.5 transition-colors"
              >
                <Avatar url={conv.other_profile?.avatar_url} name={conv.other_profile?.display_name} size={11} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-black text-white truncate">
                      {conv.other_profile?.display_name ?? '—'}
                    </p>
                    {last && (
                      <p className="text-[10px] text-slate-600 shrink-0">{fmtTime(last.created_at)}</p>
                    )}
                  </div>
                  {conv.event_title && (
                    <p className="text-[10px] text-indigo-400 font-bold truncate">{conv.event_title}</p>
                  )}
                  <p className={`text-xs truncate mt-0.5 ${conv.unread_count > 0 ? 'text-white font-bold' : 'text-slate-500'}`}>
                    {preview}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {conv.unread_count > 0 && (
                    <span className="min-w-[18px] h-[18px] bg-pink-500 rounded-full flex items-center justify-center text-[10px] font-black text-white px-1">
                      {conv.unread_count}
                    </span>
                  )}
                  <ChevronRight size={14} className="text-slate-600" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
