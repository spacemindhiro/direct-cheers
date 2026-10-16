import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDirectoryProfile, resolveDirectoryViewer } from "@/lib/directory";
import { DirectoryProfileView } from "@/components/directory-profile-view";
import { Loader2, ArrowLeft } from "lucide-react";

async function DirectoryDetailContent({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const viewer = await resolveDirectoryViewer(admin, user.id);
  if (!viewer) redirect("/dashboard");

  const p = await getDirectoryProfile(admin, { viewerRole: viewer.role, profileId });
  if (!p) notFound();

  return (
    <div className="space-y-10">
      <Link href="/dashboard/directory" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-pink-400">
        <ArrowLeft size={14} /> 検索に戻る
      </Link>
      <DirectoryProfileView profile={p} />
    </div>
  );
}

export default function DirectoryDetailPage({ params }: { params: Promise<{ profileId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-600" size={32} />
        </div>
      }
    >
      <DirectoryDetailContent params={params} />
    </Suspense>
  );
}
