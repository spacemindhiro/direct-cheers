// 確認カードの二度押し対策。1枚のカード（card_id）からは1回しか書き込めない。
// 先に使用済みの印を付けてから書き込み、失敗したら印を外す（もう一度押せるように）。
import type { SupabaseClient } from "@supabase/supabase-js";

export type Claim = { fresh: true } | { fresh: false; resultId: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function claimCard(admin: SupabaseClient, cardId: string, profileId: string, kind: string): Promise<Claim | "invalid"> {
  if (!UUID_RE.test(cardId)) return "invalid";
  const { error } = await admin.from("cheery_card_uses").insert({ card_id: cardId, profile_id: profileId, kind });
  if (!error) return { fresh: true };
  if (error.code !== "23505") throw new Error(error.message);
  const { data } = await admin.from("cheery_card_uses").select("profile_id, kind, result_id").eq("card_id", cardId).maybeSingle();
  // 他人のカード・別の種類のカードの ID は使えない
  if (!data || data.profile_id !== profileId || data.kind !== kind) return "invalid";
  return { fresh: false, resultId: (data.result_id as string | null) ?? null };
}

export async function finishCard(admin: SupabaseClient, cardId: string, resultId: string): Promise<void> {
  await admin.from("cheery_card_uses").update({ result_id: resultId }).eq("card_id", cardId);
}

export async function releaseCard(admin: SupabaseClient, cardId: string): Promise<void> {
  await admin.from("cheery_card_uses").delete().eq("card_id", cardId).is("result_id", null);
}
