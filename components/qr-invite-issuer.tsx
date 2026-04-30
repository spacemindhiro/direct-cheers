"use client";

import { useState } from "react";
import { Ticket, Loader2, CheckCircle2, Send } from "lucide-react";
import { Input } from "@/components/ui/input";

type Props = {
  eventId: string;
  qrConfigId: string;
};

export function QRInviteIssuer({ eventId, qrConfigId }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setPending(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch(`/api/events/${eventId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_config_id: qrConfigId, email, name: name || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "エラーが発生しました");
      setSuccess(true);
      setEmail("");
      setName("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
        <Ticket size={11} className="text-indigo-400" /> 招待チケット発行
      </p>

      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5 space-y-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            メールアドレス <span className="text-pink-500">*</span>
          </label>
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="guest@example.com"
            required
            className="h-11 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            名前（任意）
          </label>
          <Input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ゲスト名"
            className="h-11 bg-slate-950/50 border-slate-700 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        {error && <p className="text-xs text-red-400 font-bold">{error}</p>}

        {success && (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 size={15} />
            <p className="text-xs font-black">招待チケットを発行しました</p>
          </div>
        )}

        <button
          type="submit"
          disabled={pending || !email}
          className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          招待を発行する
        </button>
      </form>
    </div>
  );
}
