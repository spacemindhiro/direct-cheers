"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

export function InviteLoginPrompt({
  token,
  targetEmail,
  isMember,
}: {
  token: string;
  targetEmail?: string;
  isMember: boolean;
}) {
  const emailParam = targetEmail ? `&email=${encodeURIComponent(targetEmail)}` : "";
  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-slate-400">
        招待を受け取るには{isMember ? "ログイン" : "新規登録"}が必要です
      </p>
      {isMember ? (
        <Link
          href={`/auth/login?redirect=/invite/${token}${emailParam}`}
          className="flex w-full h-16 items-center justify-center gap-3 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)]"
        >
          ログインして受け取る <ArrowRight size={18} />
        </Link>
      ) : (
        <Link
          href={`/auth/login?redirect=/invite/${token}${emailParam}`}
          className="flex w-full h-16 items-center justify-center gap-3 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)]"
        >
          登録して受け取る <ArrowRight size={18} />
        </Link>
      )}
    </div>
  );
}

export function InviteAutoAccept({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/invitations/${token}/accept`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          const messages: Record<string, string> = {
            invalid_token: "招待リンクが無効または期限切れです。",
            self_accept: "自分が発行した招待リンクは使用できません。",
            email_mismatch: "この招待は別のメールアドレス宛てです。",
            wrong_recipient: "この招待は別のユーザー宛てです。",
          };
          setError(messages[data.error] ?? "エラーが発生しました。");
        } else {
          router.push("/dashboard");
        }
      })
      .catch(() => setError("エラーが発生しました。"));
  }, [token, router]);

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-center text-sm text-red-400 font-bold">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <Loader2 size={32} className="animate-spin text-pink-500" />
      <p className="text-slate-400 text-sm">招待を受け取っています…</p>
    </div>
  );
}

export function InviteAcceptButton({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleAccept = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        const messages: Record<string, string> = {
          invalid_token: "招待リンクが無効または期限切れです。",
          self_accept: "自分が発行した招待リンクは使用できません。",
          email_mismatch: "この招待は別のメールアドレス宛てです。",
          wrong_recipient: "この招待は別のユーザー宛てです。",
        };
        setError(messages[data.error] ?? "エラーが発生しました。");
        return;
      }

      setDone(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    });
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <CheckCircle2 size={40} className="text-green-500" />
        <p className="text-white font-bold">招待を受け取りました！</p>
        <p className="text-slate-400 text-sm">ダッシュボードへ移動します…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-center text-sm text-red-400 font-bold">{error}</p>
      )}
      <button
        onClick={handleAccept}
        disabled={isPending}
        className="flex w-full h-16 items-center justify-center gap-3 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <>
            招待を受け取る <ArrowRight size={18} />
          </>
        )}
      </button>
    </div>
  );
}
