import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTermsForRole } from "@/lib/terms-content";
import { TermsAgreementForm } from "@/components/terms-agreement-form";
import { Loader2 } from "lucide-react";
import Link from "next/link";

async function TermsContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("profile_id", user.id)
    .single();

  if (!profile) redirect("/onboarding/profile");

  // pending_terms でない場合はスキップ
  if (profile.status !== "pending_terms") redirect("/dashboard");

  // role が terms 対象外（user など）はスキップ
  const termsGroups = getTermsForRole(profile.role);
  if (termsGroups.length === 0) redirect("/dashboard");

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

      <div className="flex-1 px-6 py-6 max-w-lg mx-auto w-full">
        <div className="space-y-2 mb-8">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
            Terms of Service
          </p>
          <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
            利用規約への同意
          </h1>
          <p className="text-slate-400 text-sm">
            全ての条項を確認し、署名してください
          </p>
        </div>

        <TermsAgreementForm termsGroups={termsGroups} role={profile.role} />
      </div>
    </div>
  );
}

export default function TermsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <Loader2 className="animate-spin text-slate-600" size={32} />
        </div>
      }
    >
      <TermsContent />
    </Suspense>
  );
}
