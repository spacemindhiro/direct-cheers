// チケットの持ち主の条件（PostgREST の or 句）。マイチケット画面とチアリー(AI)の MCP ツールで共用する。
//
// 持ち主の条件が2本立てなのは、ゲスト購入時に holder_profile_id が NULL のまま発行されるため。
// あとから同じメアドで登録しても tickets を埋め直す処理は無く（埋めるのは TouchPay の
// card_fingerprint 経由のRPCのみ）、登録前に買ったチケットは email 側でしか拾えない。
export function ticketOwnershipFilter(userId: string, email: string | null | undefined): string {
  return email
    ? `holder_profile_id.eq.${userId},and(email.eq."${email}",holder_profile_id.is.null)`
    : `holder_profile_id.eq.${userId}`;
}
