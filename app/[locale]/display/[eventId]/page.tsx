import { Suspense } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QRBoardDisplay } from "@/components/qr-board-display";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://direct-cheers.com";

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string; eventId: string }> }
): Promise<Metadata> {
  const { eventId } = await params;
  // 相対URLだとNext.jsがVercel Preview環境でcrossorigin="use-credentials"を付与し、
  // iOSのmanifest取得がCORSエラーで失敗してstandalone判定が外れるため絶対URLにする。
  // ただしNEXT_PUBLIC_SITE_URL固定値（本番ドメイン）を使うと、stg等の別オリジンで
  // 開いた場合にmanifestのscope/start_urlが本番オリジンに解決され、ドキュメントの
  // オリジンと一致しない＝iOSが「スコープ外」と判定しブラウザUIを強制表示する。
  // そのため常にリクエスト自身のオリジン（host ヘッダー）で絶対URLを組み立てる。
  const h = await headers();
  const host = h.get("host") ?? new URL(siteUrl).host;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;
  return {
    manifest: `${origin}/api/manifest/display/${eventId}`,
    // appleWebApp/otherはNext.jsのメタデータマージで「同名キーがあれば置換」のため、
    // ルートlayout.tsxの値に依存せずこのページでも明示し、iOSのスタンドアロン判定漏れを防ぐ
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Direct Cheers",
    },
    other: {
      "apple-mobile-web-app-capable": "yes",
    },
  };
}

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
