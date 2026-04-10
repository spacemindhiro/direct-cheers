"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, ArrowRight, Lock } from "lucide-react";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleUpdatePassword = (formData: FormData) => {
    const password = formData.get("password") as string;
    const confirm = formData.get("confirm") as string;

    if (password !== confirm) {
      setError("パスワードが一致しません");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で設定してください");
      return;
    }

    startTransition(async () => {
      setError(null);
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError("パスワードの更新に失敗しました。もう一度お試しください。");
      } else {
        router.push("/dashboard");
      }
    });
  };

  return (
    <div className={cn("w-full space-y-8", className)} {...props}>
      <div className="text-center space-y-2">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">New Password</p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">パスワードを再設定</h1>
        <p className="text-sm text-slate-400">新しいパスワードを入力してください</p>
      </div>

      <form action={handleUpdatePassword} className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Lock size={11} className="text-pink-500" /> New Password
            </label>
            <Input
              name="password"
              type="password"
              placeholder="8文字以上"
              required
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Lock size={11} className="text-pink-500" /> Confirm Password
            </label>
            <Input
              name="confirm"
              type="password"
              placeholder="パスワードを再入力"
              required
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          {error && <p className="text-sm text-red-400 font-bold text-center">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 size={20} className="animate-spin" /> : <>パスワードを更新する <ArrowRight size={18} /></>}
        </button>
      </form>
    </div>
  );
}
