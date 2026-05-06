"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Copy, Check, Loader2, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";

const ROLE_OPTIONS: Record<string, { label: string; canInvite: string[] }> = {
  admin: {
    label: "管理者",
    canInvite: ["agent", "organizer", "artist"],
  },
  agent: {
    label: "エージェント",
    canInvite: ["organizer", "artist"],
  },
  organizer: {
    label: "オーガナイザー",
    canInvite: ["artist"],
  },
};

const ROLE_LABELS: Record<string, string> = {
  agent: "エージェント",
  organizer: "オーガナイザー",
  artist: "アーティスト / DJ",
};

export function InviteCreateForm({ myRole }: { myRole: string }) {
  const options = ROLE_OPTIONS[myRole];
  const router = useRouter();
  const [targetRole, setTargetRole] = useState(options?.canInvite[0] ?? "");
  const [targetEmail, setTargetEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!options) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 text-center">
        <p className="text-slate-500 text-sm font-bold">招待を発行する権限がありません。</p>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGeneratedLink(null);
    startTransition(async () => {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_role: targetRole,
          target_email: targetEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      const url = `${window.location.origin}/invite/${data.token}`;
      setGeneratedLink(url);
      setTargetEmail("");
      router.refresh();
    });
  };

  const handleCopy = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit}>
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              招待するロール
            </label>
            <div className="flex flex-wrap gap-2">
              {options.canInvite.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setTargetRole(role)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                    targetRole === role
                      ? "bg-pink-500 text-white shadow-[0_0_20px_rgba(236,72,153,0.3)]"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700"
                  }`}
                >
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              メールアドレス
            </label>
            <Input
              type="email"
              required
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="相手のメールアドレス"
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <p className="text-[10px] text-slate-600 leading-relaxed">
              同じ相手への既存の招待は自動的に無効化されます
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400 font-bold">{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full h-14 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>招待リンクを発行 <ArrowRight size={18} /></>
            )}
          </button>
        </div>
      </form>

      {generatedLink && (
        <div className="bg-slate-900 border border-pink-500/30 rounded-[2rem] p-8 space-y-4">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-pink-500" />
            <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">
              招待リンクが発行されました
            </p>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400 font-mono truncate">{generatedLink}</p>
            <button
              onClick={handleCopy}
              className="shrink-0 w-10 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center justify-center transition-all"
            >
              {copied ? (
                <Check size={16} className="text-emerald-400" />
              ) : (
                <Copy size={16} className="text-slate-400" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-slate-600">
            このリンクを相手に送ってください。有効期限は30日間です。
          </p>
        </div>
      )}
    </div>
  );
}
