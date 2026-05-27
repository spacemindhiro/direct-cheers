'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Send, Loader2, MessageSquare } from 'lucide-react';

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

export function AdminMessagesPanel({ profileId }: { profileId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading]   = useState(true);
  const [body, setBody]         = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/messages/${profileId}`);
    if (res.ok) {
      const data = await res.json() as { messages: Message[] };
      setMessages(data.messages);
    }
    setLoading(false);
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/messages/${profileId}`, {
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
    <div className="space-y-3">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
        <MessageSquare size={11} className="text-indigo-400" /> メッセージ
      </p>

      <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] overflow-hidden">
        {/* スレッド */}
        <div className="h-72 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={20} className="animate-spin text-slate-600" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-slate-600">まだメッセージはありません</p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.is_from_admin ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  m.is_from_admin
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-slate-800 text-slate-200 rounded-bl-sm'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${m.is_from_admin ? 'text-indigo-300' : 'text-slate-500'}`}>
                    {new Date(m.created_at).toLocaleString('ja-JP', JST_FMT)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* 入力欄 */}
        <div className="border-t border-slate-800 p-3 flex gap-2 items-end">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="メッセージを入力… (⌘+Enter で送信)"
            rows={2}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="button"
            onClick={send}
            disabled={!body.trim() || sending}
            className="w-10 h-10 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center text-white transition-colors shrink-0"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
