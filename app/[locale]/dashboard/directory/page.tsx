import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowedTypes, resolveDirectoryViewer } from "@/lib/directory";
import { DirectorySearch } from "@/components/directory-search";
import { Loader2 } from "lucide-react";

async function DirectoryContent() {
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const viewer = await resolveDirectoryViewer(admin, user.id);
  if (!viewer) redirect("/dashboard");

  const types = allowedTypes(viewer.role);

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Directory
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          照会
        </h1>
        <p className="text-slate-500 text-sm font-medium">
          {types.includes("organizer")
            ? "アーティスト・オーガナイザーを検索して照会できます"
            : "アーティストを検索して照会できます"}
        </p>
      </div>

      <DirectorySearch types={types} />
    </div>
  );
}

export default function DirectoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-600" size={32} />
        </div>
      }
    >
      <DirectoryContent />
    </Suspense>
  );
}
