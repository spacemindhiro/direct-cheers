"use client";

import { useState } from "react";
import { Ticket, Loader2, Copy, Check, Plus } from "lucide-react";

type Props = {
  eventId: string;
  qrConfigId: string;
};

type IssuedCode = { code: string; url: string; max_uses: number | null };

export function QRInviteIssuer({ eventId, qrConfigId }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<IssuedCode[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState<string>("");

  const handleIssue = async () => {
    setPending(true);
    setError("");
    const parsedMax = maxUses ? parseInt(maxUses, 10) : null;
    if (parsedMax !== null && (isNaN(parsedMax) || parsedMax < 1)) {
      setError("定員は1以上の整数で入力してください");
      setPending(false);
      return;
    }
    try {
      const res = await fetch(`/api/events/${eventId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_config_id: qrConfigId, max_uses: parsedMax }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "エラーが発生しました");
      setCodes(prev => [{ code: json.code, url: json.url, max_uses: parsedMax }, ...prev]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  const handleCopy = (url: string, code: string) => {
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
        <Ticket size={11} className="text-indigo-400" /> 招待チケット発行
      </p>

      <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5 space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          招待コードを発行してLINEやメールで送ってください。受け取った人がログイン（または新規登録）してコードを使うとチケットが紐づきます。
        </p>

        <div className="flex items-center gap-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] shrink-0">
            定員
          </label>
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={e => setMaxUses(e.target.value)}
            placeholder="空白 = 1人限り"
            className="flex-1 h-9 bg-slate-950/60 border border-slate-700 rounded-lg px-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
          <span className="text-xs text-slate-500 shrink-0">人</span>
        </div>

        {error && <p className="text-xs text-red-400 font-bold">{error}</p>}

        {codes.length > 0 && (
          <div className="space-y-2">
            {codes.map(({ code, url, max_uses }) => (
              <div key={code} className="flex items-center gap-2 bg-slate-950/60 border border-slate-700 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-black text-indigo-300 tracking-widest">{code}</span>
                  <span className="text-[10px] text-slate-600 ml-2">
                    {max_uses ? `定員${max_uses}人` : "1人限り"}
                  </span>
                </div>
                <button
                  onClick={() => handleCopy(url, code)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                >
                  {copiedCode === code ? (
                    <><Check size={13} className="text-emerald-400" /> コピー済み</>
                  ) : (
                    <><Copy size={13} /> リンクをコピー</>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleIssue}
          disabled={pending}
          className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          招待コードを発行する
        </button>
      </div>
    </div>
  );
}
