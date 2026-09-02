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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (isMember) {
    return (
      <div className="space-y-3">
        <p className="text-center text-sm text-slate-400">招待を受け取るにはログインが必要です</p>
        <Link
          href={`/auth/login?redirect=/invite/${token}${emailParam}`}
          className="flex w-full h-16 items-center justify-center gap-3 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)]"
        >
          ログインして受け取る <ArrowRight size={18} />
        </Link>
      </div>
    );
  }

  // 未登録者：招待メールのクリック自体を本人確認として扱い、その場で認証まで
  // 完了させる（追加のマジックリンクメールを待たせない）。失敗時のみ通常の
  // ログイン導線にフォールバックする。
  const handleClaim = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/invitations/${token}/claim`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError("自動での受け取りに失敗しました。下記からログインしてお試しください。");
        return;
      }
      router.push(data.redirect);
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-slate-400">招待を受け取るには登録が必要です</p>
      <button
        type="button"
        onClick={handleClaim}
        disabled={isPending}
        className="flex w-full h-16 items-center justify-center gap-3 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 size={20} className="animate-spin" /> : <>登録して受け取る <ArrowRight size={18} /></>}
      </button>
      {error && (
        <div className="space-y-2">
          <p className="text-center text-sm text-red-400 font-bold">{error}</p>
          <Link
            href={`/auth/login?redirect=/invite/${token}${emailParam}`}
            className="flex w-full h-14 items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all"
          >
            ログイン画面から受け取る <ArrowRight size={18} />
          </Link>
        </div>
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
