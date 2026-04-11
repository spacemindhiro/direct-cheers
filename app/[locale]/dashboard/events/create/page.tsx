import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventCreateForm } from "@/components/event-create-form";
import { Loader2 } from "lucide-react";
import Link from "next/link";

async function EventCreateContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, responsible_agent_id")
    .eq("profile_id", user.id)
    .single();

  if (profile?.role !== "organizer") redirect("/dashboard");
  if (profile?.status !== "active") redirect("/dashboard");

  // コネクション済みアーティストを取得
  const { data: connections } = await supabase
    .from("connections")
    .select("artist_profile_id, artist:profiles!artist_profile_id(display_name)")
    .eq("organizer_profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null);

  const artists = (connections ?? []).map((c) => ({
    profile_id: c.artist_profile_id,
    display_name: (c.artist as any)?.display_name ?? "Unknown",
  }));

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
      <EventCreateForm artists={artists} />
    </div>
  );
}

export default function EventCreatePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>}>
      <EventCreateContent />
    </Suspense>
  );
}
