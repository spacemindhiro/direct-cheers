import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProxyDraftHiddenFrom } from "@/lib/proxy-draft";

// 代理作成でまだ主催者に送っていない下書きは、主催者からは存在しない扱い。
// このイベント配下の画面（詳細・編集・QR・証跡など）すべてに効かせるため、レイアウトで判定する
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await getUser();
  if (user && await isProxyDraftHiddenFrom(createAdminClient(), eventId, user.id)) {
    notFound();
  }
  return <>{children}</>;
}
