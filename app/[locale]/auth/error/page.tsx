import { Suspense } from "react";
import Link from "next/link";
import { Clock, MonitorSmartphone, HelpCircle, ArrowRight } from "lucide-react";

type ErrorInfo = {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; href: string };
};

function getErrorInfo(error: string | undefined): ErrorInfo {
  if (error === "otp_expired") {
    return {
      icon: <Clock size={32} className="text-amber-400" />,
      title: "認証リンクの有効期限切れ",
      description:
        "メールの認証リンクの有効期限が切れています。もう一度サインアップするか、招待者にリンクの再発行を依頼してください。",
      action: { label: "サインアップページへ", href: "/auth/sign-up" },
    };
  }
  if (error && (error.includes("PKCE") || error.includes("code verifier"))) {
    return {
      icon: <MonitorSmartphone size={32} className="text-violet-400" />,
      title: "別のブラウザで開かれました",
      description:
        "認証リンクを、サインアップしたブラウザとは別のブラウザで開いたため認証できませんでした。メールのリンクを、はじめにサインアップしたブラウザで開き直してください。",
      action: { label: "ログインページへ", href: "/auth/login" },
    };
  }
  return {
    icon: <HelpCircle size={32} className="text-slate-400" />,
    title: "エラーが発生しました",
    description:
      "認証処理中にエラーが発生しました。しばらく待ってから再度お試しください。",
    action: { label: "トップページへ", href: "/" },
  };
}

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const info = getErrorInfo(params?.error);

  return (
    <div className="w-full max-w-md space-y-8 text-center">
      <div className="flex justify-center">
        <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center border border-slate-700 shadow-lg">
          {info.icon}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Error
        </p>
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
          {info.title}
        </h1>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8">
        <p className="text-slate-400 text-sm leading-relaxed">{info.description}</p>
      </div>

      {info.action && (
        <Link
          href={info.action.href}
          className="inline-flex items-center gap-2 w-full h-14 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] justify-center hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)]"
        >
          {info.action.label} <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="min-h-screen bg-slate-950 font-sans flex flex-col">
      <div className="px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <img
            src="/logo-emblem.png"
            alt="Direct Cheers"
            className="w-7 h-7 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform"
          />
          <span className="text-base font-black tracking-tighter text-white uppercase italic">
            Direct Cheers
          </span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <Suspense
          fallback={
            <div className="w-full max-w-md space-y-4">
              <div className="h-20 w-20 mx-auto bg-slate-900 rounded-full animate-pulse" />
              <div className="h-8 bg-slate-900 rounded-2xl animate-pulse" />
              <div className="h-32 bg-slate-900 rounded-[2.5rem] animate-pulse" />
            </div>
          }
        >
          <ErrorContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
