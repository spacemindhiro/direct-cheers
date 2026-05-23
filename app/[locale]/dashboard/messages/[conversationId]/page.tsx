'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import Link from 'next/link';

type Message = {
  message_id: string;
  sender_profile_id: string | null;
  body: string;
  message_type: 'text' | 'system';
  created_at: string;
};

type ThreadData = {
  conversation_id: string;
  context: {
    type: string;
    event_artist: {
      status: string;
      event_id: string;
      event: { title: string; venue: string | null; start_at: string | null } | null;
    } | null;
  } | null;
  other_profile: {
    profile_id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  messages: Message[];
};

function Avatar({ url, name, size = 8 }: { url?: string | null; name?: string | null; size?: number }) {
  const sz = `w-${size} h-${size}`;
  return url ? (
    <img src={url} alt={name ?? ''} className={`${sz} rounded-xl object-cover shrink-0`} />
  ) : (
    <div className={`${sz} rounded-xl bg-slate-700 flex items-center justify-center shrink-0`}>
      <span className="text-[10px] font-black text-slate-400">{(name ?? '?')[0]?.toUpperCase()}</span>
    </div>
  );
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
}

export default function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = use(params);
  const router = useRouter();
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = (smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  };

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      setMyId(user.id);

      const res = await fetch(`/api/messages/${conversationId}`);
      if (!res.ok) { router.push('/dashboard/messages'); return; }
      const data: ThreadData = await res.json();
      setThread(data);
      setLoading(false);

      // Realtime 購読
      const channel = supabase
        .channel(`messages:${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const newMsg = payload.new as Message;
            setThread(prev => prev ? { ...prev, messages: [...prev.messages, newMsg] } : prev);
            setTimeout(() => scrollToBottom(true), 50);
            // 自分以外のメッセージは既読更新
            if (newMsg.sender_profile_id !== user.id) {
              fetch(`/api/messages/${conversationId}`, { method: 'GET' }).catch(() => {});
            }
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!loading) setTimeout(() => scrollToBottom(), 50);
  }, [loading]);

  const sendMessage = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setInput('');
    try {
      await fetch(`/api/messages/${conversationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    );
  }

  if (!thread) return null;

  const other = thread.other_profile;
  const eventInfo = thread.context?.event_artist?.event;
  const eventId = thread.context?.event_artist?.event_id;

  // メッセージを日付でグルーピング
  const grouped: { date: string; messages: Message[] }[] = [];
  for (const m of thread.messages) {
    const date = fmtDate(m.created_at);
    const last = grouped[grouped.length - 1];
    if (last?.date === date) {
      last.messages.push(m);
    } else {
      grouped.push({ date, messages: [m] });
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] max-w-lg mx-auto">

      {/* ヘッダー */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
        <Link
          href="/dashboard/messages"
          className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
        >
          <ArrowLeft size={15} />
        </Link>
        <Avatar url={other?.avatar_url} name={other?.display_name} size={9} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate">{other?.display_name ?? '—'}</p>
          {eventInfo && (
            <Link href={`/dashboard/events/${eventId}`} className="text-[10px] text-indigo-400 hover:text-indigo-300 truncate block">
              {eventInfo.title}
            </Link>
          )}
        </div>
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {grouped.map(({ date, messages }) => (
          <div key={date} className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[10px] text-slate-600 font-bold shrink-0">{date}</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {messages.map(m => {
              const isMe = m.sender_profile_id === myId;
              const isSystem = m.message_type === 'system';

              if (isSystem) {
                return (
                  <div key={m.message_id} className="flex justify-center">
                    <span className="text-[11px] text-slate-500 bg-slate-800/60 rounded-full px-3 py-1">
                      {m.body}
                    </span>
                  </div>
                );
              }

              return (
                <div key={m.message_id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                  {!isMe && (
                    <Avatar url={other?.avatar_url} name={other?.display_name} size={7} />
                  )}
                  <div className={`max-w-[72%] space-y-1 ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div
                      className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        isMe
                          ? 'bg-pink-500 text-white rounded-br-sm'
                          : 'bg-slate-800 text-slate-100 rounded-bl-sm'
                      }`}
                    >
                      {m.body}
                    </div>
                    <span className="text-[10px] text-slate-600">{fmtTime(m.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 入力エリア */}
      <div className="shrink-0 px-4 py-3 bg-slate-950 border-t border-slate-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力…"
            rows={1}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-pink-500/50 outline-none resize-none leading-relaxed max-h-32 overflow-y-auto"
            style={{ height: 'auto' }}
            onInput={e => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 128) + 'px';
            }}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="w-11 h-11 bg-pink-500 hover:bg-pink-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl flex items-center justify-center transition-colors shrink-0"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="text-white" />}
          </button>
        </div>
        <p className="text-[10px] text-slate-700 mt-1.5 text-center">Enter で送信 / Shift+Enter で改行</p>
      </div>
    </div>
  );
}
