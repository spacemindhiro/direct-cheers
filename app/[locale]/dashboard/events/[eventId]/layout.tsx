import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProxyDraftHiddenFrom } from "@/lib/proxy-draft";

// 代理作成でまだ主催者に送っていない下書きは、主催者からは存在しない扱い。
// このイベント配下の画面（詳細・編集・QR・証跡など）すべてに効かせるため、レイアウトで判定する。
// 判定が済むまで子の画面は描画しない（Suspense 内で判定。外で DB を読むとビルドで弾かれる）
export default function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
      <ProxyDraftGuard params={params}>{children}</ProxyDraftGuard>
    </Suspense>
  );
}

async function ProxyDraftGuard({ params, children }: { params: Promise<{ eventId: string }>; children: React.ReactNode }) {
  const { eventId } = await params;
  const user = await getUser();
  if (user && await isProxyDraftHiddenFrom(createAdminClient(), eventId, user.id)) {
    notFound();
  }
  return <>{children}</>;
}
