// カードコレクション（本人が送ったチアの全期間）の絞り込み。カードコレクション画面と
// チアリー(AI) の MCP ツールで共用する（画面から切り出したまま）。
/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST のクエリビルダーを画面と同じ書き方で扱うため */

// 以前は sender_profile_id と sender_email で2本引いてJS側で重複排除・絞り込み・
// 再ソートしていた。1本の or にまとめてDB側で完結させる（重複排除も不要になる）。
// 2つ目の or はウェルカムチア（2階、stripe_pi_sequence=1）の未確定分の除外。
// 購入者が演者を確定するまで出さない。確定前に出すとデフォルト（主催者）宛の
// 状態が見えてしまい「後で選べる」という設計意図が崩れる。
// stripe_pi_sequence は NOT NULL DEFAULT 0 なので neq.1 で取りこぼしは出ない。
// products を !inner で select に含めること（商品種別の除外をDB側で効かせるため）。
export function applyCheerCollectionFilters(q: any, userId: string, userEmail: string): any {
  return q
    .eq("status", "completed")
    .neq("transaction_type", "invitation")
    .or(`sender_profile_id.eq.${userId},sender_email.eq."${userEmail}"`)
    .not("product.type", "in", "(entrance,custom)")
    .or("stripe_pi_sequence.neq.1,welcome_cheer_locked_at.not.is.null");
}
