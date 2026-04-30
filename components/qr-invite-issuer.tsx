"use client";

import { useState } from "react";
import { Ticket, Loader2, Copy, Check, Plus } from "lucide-react";

type Props = {
  eventId: string;
  qrConfigId: string;
};

type IssuedCode = { code: string; url: string };

export function QRInviteIssuer({ eventId, qrConfigId }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<IssuedCode[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleIssue = async () => {
    setPending(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${eventId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_config_id: qrConfigId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "エラーが発生しました");
      setCodes(prev => [{ code: json.code, url: json.url }, ...prev]);
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

        {error && <p className="text-xs text-red-400 font-bold">{error}</p>}

        {codes.length > 0 && (
          <div className="space-y-2">
            {codes.map(({ code, url }) => (
              <div key={code} className="flex items-center gap-2 bg-slate-950/60 border border-slate-700 rounded-xl px-4 py-3">
                <span className="text-sm font-black text-indigo-300 tracking-widest flex-1">{code}</span>
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
