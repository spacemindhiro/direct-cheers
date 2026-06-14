import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QRBoardDisplay } from "@/components/qr-board-display";

// 子機（ホーム画面に追加したPWA）からの起動時、redirect()による画面遷移が発生すると
// iOS側がスタンドアロン表示から「戻る/共有/Safariで開く」付きのブラウザUIに切り替わってしまう。
// そのため未ログイン・権限不足でも別画面へは遷移させず、この画面内のメッセージ表示に留める。
function DisplayBlocked({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center px-6 text-center">
      <p className="text-slate-400 text-sm">{message}</p>
    </div>
  );
}

async function DisplayContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("event_id, title")
    .eq("event_id", eventId)
    .single();

  if (!event) notFound();

  const user = await getUser();
  if (!user) return <DisplayBlocked message="ログインが必要です" />;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!["organizer", "agent", "admin"].includes(profile?.role ?? "")) {
    return <DisplayBlocked message="この画面を表示する権限がありません" />;
  }

  return <QRBoardDisplay eventId={eventId} eventTitle={event.title} />;
}

export default function DisplayPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-400 rounded-full animate-spin" />
      </div>
    }>
      <DisplayContent params={params} />
    </Suspense>
  );
}
