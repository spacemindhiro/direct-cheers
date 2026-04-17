import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheersCard } from "@/components/cheers-card";
import { Loader2, ArrowLeft, Layers } from "lucide-react";
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
    product:products!product_id(name, artist_id, artist:profiles!artist_id(display_name, avatar_url)),
    qr_config:qr_configs!qr_config_id(image_url, event:events!event_id(title))
  `;

  const [{ data: byProfile }, { data: byEmail }] = await Promise.all([
    admin
      .from("transactions")
      .select(query)
      .eq("sender_profile_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("transactions")
      .select(query)
      .eq("sender_email", userEmail)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  // 重複排除してマージ
  const seen = new Set<string>();
  const cards: any[] = [];
  for (const tx of [...(byProfile ?? []), ...(byEmail ?? [])]) {
    if (!seen.has(tx.transaction_id)) {
      seen.add(tx.transaction_id);
      cards.push(tx);
    }
  }
  cards.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-8 pb-20">
      <div className="space-y-1">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors"
        >
          <ArrowLeft size={12} /> ダッシュボードに戻る
        </Link>
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
          {cards.map((tx: any) => (
            <div key={tx.transaction_id} className="space-y-2">
              <CheersCard
                artistName={
                  (tx.product?.artist as any)?.display_name ?? "Artist"
                }
                eventTitle={
                  (tx.qr_config?.event as any)?.title ??
                  tx.product?.name ??
                  ""
                }
                artistAvatar={(tx.product?.artist as any)?.avatar_url ?? null}
                imageUrl={(tx.qr_config as any)?.image_url ?? null}
                amount={tx.total_gross_amount}
                transactionId={tx.transaction_id}
                serialNumber={tx.sequence_number_in_event ?? null}
                paidAt={tx.created_at}
              />
              <p className="text-[10px] text-slate-600 text-right pr-1">
                {new Date(tx.created_at).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          ))}
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
