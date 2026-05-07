import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheersCard } from "@/components/cheers-card";
import { Loader2, Layers } from "lucide-react";
import Link from "next/link";

async function CollectionContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const userEmail = user.email!;

  const query = `
    transaction_id, total_gross_amount, created_at, sequence_number_in_event,
    product:products!product_id(name, type, artist_id),
    qr_config:qr_configs!qr_config_id(qr_config_id, image_url, recipient_profile_id, event:events!event_id(title))
  `;

  const [{ data: byProfile }, { data: byEmail }] = await Promise.all([
    admin
      .from("transactions")
      .select(query)
      .eq("sender_profile_id", user.id)
      .eq("status", "completed")
      .neq("transaction_type", "invitation")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("transactions")
      .select(query)
      .eq("sender_email", userEmail)
      .eq("status", "completed")
      .neq("transaction_type", "invitation")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  // 重複排除してマージ
  const seen = new Set<string>();
  const cards: any[] = [];
  for (const tx of [...(byProfile ?? []), ...(byEmail ?? [])]) {
    if (!seen.has(tx.transaction_id) && (tx.product as any)?.type !== "entrance") {
      seen.add(tx.transaction_id);
      cards.push(tx);
    }
  }
  cards.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // qr_config_thanks を一括取得
  const qrConfigIds = [...new Set(cards.map((c) => c.qr_config?.qr_config_id).filter(Boolean))];
  const { data: thanksRows } = qrConfigIds.length > 0
    ? await admin.from("qr_config_thanks")
        .select("qr_config_id, thanks_message, thanks_link_url, thanks_media_url, published_at")
        .in("qr_config_id", qrConfigIds)
    : { data: [] };
  const thanksMap = new Map(
    (thanksRows ?? [])
      .filter((t) => t.published_at)
      .map((t) => [t.qr_config_id, t])
  );

  // 宛先名・アーティスト名を一括取得（ウォレットと同様に常に profiles を直接クエリ）
  const recipientIds = [...new Set(cards.map((c) => c.qr_config?.recipient_profile_id).filter(Boolean))];
  const artistIds    = [...new Set(cards.map((c) => (c.product as any)?.artist_id).filter(Boolean))];
  const allProfileIds = [...new Set([...recipientIds, ...artistIds])];
  const { data: profileRows } = allProfileIds.length > 0
    ? await admin.from("profiles").select("profile_id, display_name, avatar_url").in("profile_id", allProfileIds)
    : { data: [] };
  const profileMap = new Map((profileRows ?? []).map((p) => [p.profile_id, p]));

  return (
    <div className="space-y-8 pb-20">
      <div className="space-y-1">
<p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Collection
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          My Cards
        </h1>
        <p className="text-sm text-slate-500">{cards.length} 枚のCheers カード</p>
      </div>

      {cards.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto bg-slate-800 rounded-2xl flex items-center justify-center">
            <Layers size={20} className="text-slate-600" />
          </div>
          <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">
            No cards yet.
          </p>
          <p className="text-slate-700 text-xs">
            イベントでCheersを送るとカードがここに集まります
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {cards.map((tx: any) => {
            const qrConfigId = tx.qr_config?.qr_config_id;
            const thanks = thanksMap.get(qrConfigId) ?? null;
            const recipientProfileId = tx.qr_config?.recipient_profile_id;
            const artistId = (tx.product as any)?.artist_id;
            const recipient = profileMap.get(recipientProfileId);
            const artist    = profileMap.get(artistId);
            const displayName   = recipient?.display_name ?? artist?.display_name ?? "Artist";
            const displayAvatar = recipient?.avatar_url   ?? artist?.avatar_url   ?? null;
            return (
              <div key={tx.transaction_id} className="space-y-2">
                {thanks && (
                  <div className="flex items-center gap-2 px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse shrink-0" />
                    <p className="text-[10px] font-black text-pink-400 uppercase tracking-widest">
                      メッセージが届いています — タップして確認
                    </p>
                  </div>
                )}
                <CheersCard
                  artistName={displayName}
                  eventTitle={(tx.qr_config?.event as any)?.title ?? tx.product?.name ?? ""}
                  artistAvatar={displayAvatar}
                  imageUrl={tx.qr_config?.image_url ?? null}
                  amount={tx.total_gross_amount}
                  transactionId={tx.transaction_id}
                  serialNumber={tx.sequence_number_in_event ?? null}
                  paidAt={tx.created_at}
                  thanks={thanks ? {
                    thanks_message: thanks.thanks_message,
                    thanks_link_url: thanks.thanks_link_url,
                    thanks_media_url: thanks.thanks_media_url,
                  } : null}
                />
                <div className="space-y-2 px-1">
                  <a
                    href={`/api/wallet/pass/${tx.transaction_id}`}
                    className="flex items-center justify-center gap-2 w-full bg-black text-white text-sm font-bold rounded-2xl px-4 py-3 hover:bg-slate-800 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                    Apple Wallet に追加
                  </a>
                  <p className="text-[10px] text-slate-600 text-right">
                    {new Date(tx.created_at).toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CollectionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-pink-500 animate-spin" />
        </div>
      }
    >
      <CollectionContent />
    </Suspense>
  );
}
