"use client";

import { useState, useEffect } from "react";
import { Gift, Save, Eye, EyeOff, Loader2, CheckCircle, Link, Image, MessageSquare } from "lucide-react";

type Props = {
  eventId: string;
};

type ThanksState = {
  thanks_message: string;
  thanks_link_url: string;
  thanks_media_url: string;
  published_at: string | null;
};

export function EventThanksEditor({ eventId }: Props) {
  const [state, setState] = useState<ThanksState>({
    thanks_message: "",
    thanks_link_url: "",
    thanks_media_url: "",
    published_at: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // 既存の特典データを取得（管理者APIで直接取得）
    fetch(`/api/events/${eventId}/thanks/manage`)
      .then((r) => r.json())
      .then((data) => {
        if (data.thanks) {
          setState({
            thanks_message: data.thanks.thanks_message ?? "",
            thanks_link_url: data.thanks.thanks_link_url ?? "",
            thanks_media_url: data.thanks.thanks_media_url ?? "",
            published_at: data.thanks.published_at ?? null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventId]);

  const handleSave = async (publish?: boolean) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/events/${eventId}/thanks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thanks_message: state.thanks_message || null,
          thanks_link_url: state.thanks_link_url || null,
          thanks_media_url: state.thanks_media_url || null,
          publish: publish ?? (state.published_at !== null),
        }),
      });
      if (res.ok) {
        setSaved(true);
        if (publish !== undefined) {
          setState((prev) => ({
            ...prev,
            published_at: publish ? new Date().toISOString() : null,
          }));
        }
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const isPublished = state.published_at !== null;
  const hasContent = state.thanks_message || state.thanks_link_url || state.thanks_media_url;

  if (loading) {
    return (
      <div className="h-40 bg-slate-900 border border-slate-800 rounded-[2rem] animate-pulse" />
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden">
      {/* ヘッダー */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
            <Gift size={14} className="text-pink-400" />
          </div>
          <div>
            <p className="text-sm font-black text-white">サンクス特典</p>
            <p className="text-[10px] text-slate-500">購入者だけに届く特別なお返し</p>
          </div>
        </div>
        {/* 公開ステータス */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
          isPublished
            ? "bg-green-500/10 border-green-500/30 text-green-400"
            : "bg-slate-800 border-slate-700 text-slate-500"
        }`}>
          {isPublished ? (
            <><Eye size={10} /> 公開中</>
          ) : (
            <><EyeOff size={10} /> 下書き</>
          )}
        </div>
      </div>

      <div className="px-6 pb-6 space-y-4">
        {/* メッセージ */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <MessageSquare size={10} /> メッセージ
          </label>
          <textarea
            value={state.thanks_message}
            onChange={(e) => setState((prev) => ({ ...prev, thanks_message: e.target.value }))}
            placeholder="ファンへのメッセージを入力（例：ありがとう！次のライブでまた会おうね）"
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 focus:border-pink-500/50 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 resize-none outline-none transition-colors"
          />
        </div>

        {/* リンクURL */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <Link size={10} /> 特典リンク URL
          </label>
          <input
            type="url"
            value={state.thanks_link_url}
            onChange={(e) => setState((prev) => ({ ...prev, thanks_link_url: e.target.value }))}
            placeholder="https://example.com/special-content"
            className="w-full bg-slate-800 border border-slate-700 focus:border-pink-500/50 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
          />
          <p className="text-[10px] text-slate-600">限定動画・音源・ダウンロードページなど</p>
        </div>

        {/* メディアURL */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <Image size={10} /> 画像 URL
          </label>
          <input
            type="url"
            value={state.thanks_media_url}
            onChange={(e) => setState((prev) => ({ ...prev, thanks_media_url: e.target.value }))}
            placeholder="https://example.com/image.jpg"
            className="w-full bg-slate-800 border border-slate-700 focus:border-pink-500/50 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
          />
          <p className="text-[10px] text-slate-600">カード裏面に表示するサンクス画像</p>
        </div>

        {/* アクションボタン */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || !hasContent}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            下書き保存
          </button>

          {!isPublished ? (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving || !hasContent}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(236,72,153,0.25)] hover:brightness-110 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
              公開する
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-500/20 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />}
              非公開にする
            </button>
          )}
        </div>

        {saved && (
          <div className="flex items-center gap-2 text-green-400 text-xs font-bold">
            <CheckCircle size={14} />
            保存しました
          </div>
        )}
      </div>
    </div>
  );
}
