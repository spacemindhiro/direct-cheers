"use client";

// チアリー(AI) の入口とパネル（requirements.md 9章）。ダッシュボードのレイアウトに1つだけ置く。
// - 入口：ヘッダーの「?」（CheeryOpenButton）と右下の浮きボタン。画面下を使う画面では浮きボタンを出さない
// - スマホは下から出るシート、PC は右側のパネル。後ろを暗くせず、画面を操作しながら読める
// - 会話は端末にだけ保存（アカウントごと）。サーバーには毎回、端末の履歴を送る
// - 答えの「行き先ボタン」「動画カード」は、サーバーが知識集から作った材料だけで出す（AI の書いた URL は使わない）
// パネルには transform を付けない（中で開く動画のモーダル＝position:fixed がパネルの枠に閉じ込められるため）
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ExternalLink, HelpCircle, Loader2, Send, Sparkles, Trash2, X } from "lucide-react";
import { TutorialVideoButton } from "@/components/tutorial-video-button";
import { screenOf, showFloatingButton } from "@/lib/cheery/screen";
import { splitAnswer } from "@/lib/cheery/stream";
import { clearConversation, loadConversation, saveConversation, type CheeryMessage } from "@/lib/cheery/storage";

export const CHEERY_OPEN_EVENT = "cheery:open";
const INPUT_MAX = 2000; // lib/ai/config.ts の入力上限と同じ

const SUGGESTIONS: Record<string, string[]> = {
  user: ["チアの送り方を教えて", "マイチケットはどこ？", "Apple Pay のボタンが出ない"],
  artist: ["出金はいつからできる？", "出演依頼の受け方は？", "自分の残高を教えて"],
  organizer: ["イベントを作る流れは？", "エビデンスの提出期限は？", "当日の準備で必要なことは？"],
  agent: ["承認待ちのイベントは？", "代打の依頼の仕方は？", "担当の主催者の状況を教えて"],
  admin: ["精算待ちのイベントは？", "審査待ちの口座は？", "対応待ちをまとめて"],
};

export function CheeryRoot({ userId, role, hidden }: { userId: string; role: string; hidden?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(CHEERY_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CHEERY_OPEN_EVENT, onOpen);
  }, []);

  if (hidden) return null;
  return (
    <>
      {!open && showFloatingButton(pathname) && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="チアリー(AI)に聞く"
          className="fixed right-5 bottom-[calc(1.25rem_+_env(safe-area-inset-bottom))] z-40 flex items-center gap-2 pl-3 pr-4 h-12 rounded-full bg-gradient-to-r from-pink-600 to-pink-500 text-white shadow-[0_0_24px_rgba(236,72,153,0.35)] hover:brightness-110 transition-all"
        >
          <Sparkles size={18} />
          <span className="text-xs font-black">チアリー(AI)</span>
        </button>
      )}
      {open && <CheeryPanel userId={userId} role={role} screen={screenOf(pathname)} onClose={() => setOpen(false)} />}
    </>
  );
}

function CheeryPanel({ userId, role, screen, onClose }: { userId: string; role: string; screen?: string; onClose: () => void }) {
  const [messages, setMessages] = useState<CheeryMessage[]>(() => loadConversation(userId));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!busy) saveConversation(userId, messages); }, [userId, messages, busy]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy || text.length > INPUT_MAX) return;
    const history = messages.filter((m) => m.role !== "error").map((m) => ({ role: m.role as "user" | "assistant", text: m.text }));
    const next: CheeryMessage[] = [...messages, { role: "user", text }];
    setMessages([...next, { role: "assistant", text: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/cheery/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: [...history, { role: "user", text }], screen }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setMessages([...next, { role: "error", text: err.error ?? "うまくつながりませんでした。少し時間をおいてもう一度お試しください" }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const { text: shown, refs } = splitAnswer(acc);
        setMessages([...next, { role: "assistant", text: shown, ...(refs?.length ? { refs } : {}) }]);
      }
    } catch {
      setMessages([...next, { role: "error", text: "うまくつながりませんでした。通信の状態を確かめて、もう一度お試しください" }]);
    } finally {
      setBusy(false);
    }
  }, [busy, messages, screen]);

  const reset = () => {
    if (busy) return;
    clearConversation(userId);
    setMessages([]);
  };

  return (
    <section
      role="dialog"
      aria-label="チアリー(AI)"
      className="fixed z-[60] inset-x-0 bottom-0 h-[78dvh] rounded-t-3xl border-t md:inset-x-auto md:right-0 md:top-0 md:h-dvh md:w-[400px] md:rounded-none md:border-t-0 md:border-l border-slate-700 bg-slate-900 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] flex flex-col"
    >
      <header className="flex items-center gap-2 px-4 pt-3 pb-3 md:pt-[calc(0.75rem_+_env(safe-area-inset-top))] border-b border-slate-800">
        <div className="w-8 h-8 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center shrink-0">
          <Sparkles size={15} className="text-pink-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white">チアリー(AI)</p>
          <p className="text-[10px] text-slate-500 truncate">AIの案内係</p>
        </div>
        <Link href="/dashboard/help" className="flex items-center gap-1 h-8 px-2.5 rounded-xl border border-slate-700 text-[10px] font-bold text-slate-300 hover:border-pink-500/50">
          <BookOpen size={12} /> 利用マニュアル
        </Link>
        <button type="button" onClick={reset} disabled={busy || messages.length === 0} aria-label="会話を消す" className="w-8 h-8 rounded-xl border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-40">
          <Trash2 size={13} />
        </button>
        <button type="button" onClick={onClose} aria-label="閉じる" className="w-8 h-8 rounded-xl border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white">
          <X size={15} />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              こんにちは、チアリー(AI)です。Direct Cheers の使い方や、あなたのイベント・出金などの状況について聞いてください。
            </p>
            <div className="flex flex-wrap gap-2">
              {(SUGGESTIONS[role] ?? SUGGESTIONS.user).map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="text-[11px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1.5 hover:bg-indigo-500/20">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => <Bubble key={i} m={m} pending={busy && i === messages.length - 1} onNavigate={onClose} />)}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="border-t border-slate-800 px-3 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] space-y-1.5"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
            rows={2}
            maxLength={INPUT_MAX}
            placeholder="質問を入力（カード番号やパスワードは入力しないでください）"
            className="flex-1 resize-none bg-slate-800 border border-slate-700 focus:border-pink-500/50 rounded-2xl px-3 py-2 text-base md:text-sm text-white placeholder:text-slate-500 outline-none"
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="送る" className="w-10 h-10 rounded-2xl bg-pink-500 text-white flex items-center justify-center disabled:opacity-40 shrink-0">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <div className="flex items-start gap-2 text-[10px] leading-snug text-slate-500">
          <p className="flex-1 min-w-0">AIは間違えることがあります。大事なことは画面やヘルプでも確かめてください</p>
          <span className="tabular-nums shrink-0">{input.length}/{INPUT_MAX}</span>
        </div>
      </form>
    </section>
  );
}

function Bubble({ m, pending, onNavigate }: { m: CheeryMessage; pending: boolean; onNavigate: () => void }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words text-sm text-white bg-pink-500/20 border border-pink-500/30 rounded-2xl rounded-br-md px-3 py-2">{m.text}</p>
      </div>
    );
  }
  if (m.role === "error") {
    return <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">{m.text}</p>;
  }
  return (
    <div className="space-y-2">
      <div className="max-w-[95%] text-sm text-slate-200 bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-md px-3 py-2 whitespace-pre-wrap break-words leading-relaxed">
        {m.text ? <Plain text={m.text} /> : pending ? <Loader2 size={14} className="animate-spin text-slate-500" /> : null}
      </div>
      {m.refs?.map((r) => (
        <div key={r.id} className="max-w-[95%] bg-slate-950/60 border border-slate-800 rounded-2xl px-3 py-2.5 space-y-2">
          <p className="text-[11px] font-black text-slate-300">{r.title}</p>
          <div className="flex flex-wrap items-center gap-2">
            {r.goto && (
              <Link href={r.goto.href} onClick={onNavigate} className="flex items-center gap-1 text-[11px] font-bold text-white bg-pink-500/80 hover:bg-pink-500 rounded-xl px-3 py-1.5">
                <ExternalLink size={11} /> {r.goto.label}
              </Link>
            )}
            {r.help && (
              <Link href={r.help.href} className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-1.5">
                <HelpCircle size={11} /> {r.help.label}
              </Link>
            )}
            {r.video && <TutorialVideoButton youtubeId={r.video.youtubeId} label="動画で見る" />}
          </div>
        </div>
      ))}
    </div>
  );
}

// AI の本文は文字として出す（HTML として解釈しない）。**太字** だけ太字にする
function Plain({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <b key={i} className="text-white">{part.slice(2, -2)}</b> : part,
      )}
    </>
  );
}
