'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, Loader2, MessageSquare } from 'lucide-react';

type Message = {
  id: string;
  body: string;
  is_from_admin: boolean;
  created_at: string;
};

const JST_FMT: Intl.DateTimeFormatOptions = {
  month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
  timeZone: 'Asia/Tokyo',
};

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading]   = useState(true);
  const [body, setBody]         = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin-messages');
    if (res.ok) {
      const data = await res.json() as { messages: Message[] };
      setMessages(data.messages);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (res.ok) {
        const data = await res.json() as { message: Message };
        setMessages((prev) => [...prev, data.message]);
        setBody('');
      }
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-8">

      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Direct Cheers</p>
          <h1 className="text-xl font-black text-white">管理者メッセージ</h1>
        </div>
      </div>

      {/* スレッド */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden">
        <div className="h-[60vh] overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-slate-600" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <MessageSquare size={32} className="text-slate-700" />
              <p className="text-sm text-slate-600">管理者からのメッセージはまだありません</p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.is_from_admin ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  m.is_from_admin
                    ? 'bg-slate-800 text-slate-200 rounded-tl-sm'
                    : 'bg-indigo-600 text-white rounded-tr-sm'
                }`}>
                  {m.is_from_admin && (
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">
                      Direct Cheers 管理者
                    </p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                  <p className={`text-[10px] mt-1.5 ${m.is_from_admin ? 'text-slate-500' : 'text-indigo-300'}`}>
                    {new Date(m.created_at).toLocaleString('ja-JP', JST_FMT)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* 入力欄 */}
        <div className="border-t border-slate-800 p-4 flex gap-3 items-end">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="返信を入力… (⌘+Enter で送信)"
            rows={2}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="button"
            onClick={send}
            disabled={!body.trim() || sending}
            className="w-11 h-11 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center text-white transition-colors shrink-0"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

    </div>
  );
}
