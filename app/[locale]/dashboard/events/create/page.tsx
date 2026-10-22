import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EventCreateForm } from "@/components/event-create-form";
import { connectedArtists as getConnectedArtists, proxyOrganizerOptions } from "@/lib/events/create-draft";
import { Loader2 } from "lucide-react";

async function EventCreateContent({ searchParams }: { searchParams: Promise<{ organizer?: string }> }) {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, responsible_agent_id")
    .eq("profile_id", user.id)
    .single();

  // ロールは上位互換（agent/adminはorganizerの業務も行える）のため、organizer以上を許可
  // 登録手続きの進捗（status＝口座開設等）は作成できるかどうかに関係しない
  if (!["organizer", "agent", "admin"].includes(profile?.role ?? "")) redirect("/dashboard");

  // エージェント/adminは担当主催者の名義で代理作成できる（審査申請は主催者本人）。範囲はチアリー(AI) と共用（lib/events/create-draft.ts）
  const admin = createAdminClient();
  const organizerOptions = await proxyOrganizerOptions(admin, profile?.role, user.id);
  const { organizer: requestedOrganizer } = await searchParams;
  const proxyOrganizerId = organizerOptions.some((o) => o.profile_id === requestedOrganizer)
    ? requestedOrganizer!
    : null;

  // コネクション済みアーティスト（チアリー(AI) と共用）
  const connectedArtists = await getConnectedArtists(admin, proxyOrganizerId ?? user.id);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
<p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Events</p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          新規イベント作成
        </h1>
        <p className="text-slate-500 text-sm">
          作成後、担当エージェントの承認が必要です
        </p>
      </div>
      <EventCreateForm
        key={proxyOrganizerId ?? "self"}
        connectedArtists={connectedArtists}
        organizerOptions={organizerOptions}
        proxyOrganizerId={proxyOrganizerId}
      />
    </div>
  );
}

export default function EventCreatePage({ searchParams }: { searchParams: Promise<{ organizer?: string }> }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
      <EventCreateContent searchParams={searchParams} />
    </Suspense>
  );
}
