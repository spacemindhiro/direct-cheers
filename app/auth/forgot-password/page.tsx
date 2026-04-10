import { ForgotPasswordForm } from "@/components/forgot-password-form";
import Link from "next/link";

export default function Page() {
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
        <div className="w-full max-w-md">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
